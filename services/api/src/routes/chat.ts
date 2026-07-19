import { FastifyInstance } from 'fastify';
import { validateWebSocketMessage, isChatMessage } from '@drawio-agent/shared';
import type { ChatMessage } from '@drawio-agent/shared';
import { AgentProxy } from '../services/agent-proxy.js';
import { TokenBucketLimiter } from '../services/rate-limiter.js';
import { SessionManager } from '../services/session-manager.js';
import crypto from 'crypto';

const agentProxy = new AgentProxy();

/**
 * Registers the WebSocket chat route.
 */
export async function chatRoutes(app: FastifyInstance) {
  const sessionManager = app.valkey ? new SessionManager(app.valkey) : null;

  app.get('/api/v1/ws/chat', { websocket: true }, (socket, req) => {
    const sessionId = crypto.randomUUID();
    const connId = crypto.randomUUID();
    const abortController = new AbortController();
    
    const query = req.query as { apiKey?: string; classification?: string };
    const classification = query.classification || 'public';
    const allowedClassifications = ['public', 'internal', 'confidential', 'restricted'];
    
    if (!allowedClassifications.includes(classification)) {
      req.log.warn({ classification, sessionId }, 'Invalid classification level');
      socket.send(JSON.stringify({
        type: 'error',
        payload: { code: 'BAD_REQUEST', message: `Invalid classification level: ${classification}. Allowed values: public, internal, confidential, restricted.` },
        timestamp: new Date().toISOString()
      }));
      socket.close();
      return;
    }

    req.log.info({ sessionId, classification }, 'New WebSocket connection established');

    const valkey = app.valkey;
    const pubsubManager = app.pubsubManager;

    // Keep track of the active collaboration session ID for this connection
    let activeCollabSessionId: string | null = null;
    let displayName = 'anonymous';

    if (pubsubManager) {
      pubsubManager.subscribeToSession(sessionId, socket as any, connId).catch(err => {
        req.log.error({ err, sessionId, connId }, 'Failed to subscribe to pubsub manager');
      });

      // Send chat history to the newly connected client
      pubsubManager.getChatHistory(sessionId).then(history => {
        for (const entry of history) {
          socket.send(JSON.stringify({
            type: 'chat_message',
            payload: {
              text: entry.message
            },
            timestamp: entry.timestamp
          }));
        }
      }).catch(err => {
        req.log.error({ err, sessionId }, 'Failed to get chat history');
      });
    }

    const limitMax = Number(process.env.RATE_LIMIT_MAX_TOKENS) || 10;
    const limitRefill = Number(process.env.RATE_LIMIT_REFILL_RATE) || 2;
    const limiter = new TokenBucketLimiter(limitMax, limitRefill);

    const processQueue = async (collabSessionId: string) => {
      if (!sessionManager || !pubsubManager || !valkey) {
        return;
      }
      const queueKey = `session:${collabSessionId}:queue`;
      const lockKey = `session:${collabSessionId}:lock`;

      // Check if lock is held. If yes, the active worker will trigger next processQueue on release.
      const isLocked = await valkey.exists(lockKey);
      if (isLocked) {
        return;
      }

      // Try to pop the next request
      const nextRequestRaw = await valkey.lpop(queueKey);
      if (!nextRequestRaw) return;

      const request = JSON.parse(nextRequestRaw);

      // Verify connection is still active and in the session
      const memberRaw = await valkey.hget(`session:${collabSessionId}:members`, request.connId);
      if (!memberRaw) {
        // Member left session permanently, skip and process next
        processQueue(collabSessionId);
        return;
      }
      const member = JSON.parse(memberRaw);
      if (member.disconnected) {
        // Member is temporarily disconnected, skip and process next
        processQueue(collabSessionId);
        return;
      }

      // Acquire lock for this request's connection
      const acquired = await sessionManager.acquireLock(collabSessionId, request.connId);
      if (!acquired) {
        // Put it back to the front of the queue
        await valkey.lpush(queueKey, nextRequestRaw);
        return;
      }

      // Broadcast ai_locked to the session
      await pubsubManager.publishEvent(collabSessionId, {
        type: 'ai_locked',
        payload: { displayName: request.displayName },
        timestamp: new Date().toISOString()
      });

      try {
        await agentProxy.sendChatMessage(
          {
            message: request.text,
            diagramXml: request.diagramXml,
            sessionId: collabSessionId,
            classification: request.classification
          },
          {
            'X-Request-ID': req.id,
            'X-User-Identity': request.displayName
          },
          async (agentEvent) => {
            // Relays/broadcasts agent events to the session's pub/sub channel
            if (agentEvent.type === 'diagram_update') {
              const payload = agentEvent.payload as any;
              if (payload.xml) {
                await valkey.set(`session:${collabSessionId}:diagram`, payload.xml);
              }
            }
            if (agentEvent.type === 'chat_message') {
              const payload = agentEvent.payload as any;
              const chatEntry = {
                message: payload.text,
                senderConnId: 'agent',
                senderName: 'Agent',
                timestamp: new Date().toISOString()
              };
              await valkey.lpush(`session:${collabSessionId}:chat`, JSON.stringify(chatEntry));
              await valkey.ltrim(`session:${collabSessionId}:chat`, 0, 499);
            }

            await pubsubManager.publishEvent(collabSessionId, {
              type: agentEvent.type,
              payload: agentEvent.payload,
              id: request.clientMsgId,
              timestamp: new Date().toISOString()
            });
          },
          abortController.signal
        );
      } catch (agentErr: unknown) {
        req.log.error({ error: agentErr, sessionId: collabSessionId }, 'Error during agent queue processing');
        await pubsubManager.publishEvent(collabSessionId, {
          type: 'error',
          payload: { code: 'SERVICE_UNAVAILABLE', message: 'Agent service is temporarily unavailable' },
          id: request.clientMsgId,
          timestamp: new Date().toISOString()
        });
      } finally {
        // Release lock
        await sessionManager.releaseLock(collabSessionId, request.connId);

        // Broadcast ai_unlocked to the session
        await pubsubManager.publishEvent(collabSessionId, {
          type: 'ai_unlocked',
          timestamp: new Date().toISOString()
        });

        // Process next in queue
        processQueue(collabSessionId);
      }
    };

    socket.on('message', async (message) => {
      try {
        if (!limiter.consume()) {
          req.log.warn({
            audit: true,
            eventType: 'rate_limit_violation',
            requestId: req.id,
            clientIp: req.ip,
            timestamp: new Date().toISOString(),
            details: { sessionId }
          }, 'Rate limit exceeded');

          socket.send(JSON.stringify({
            type: 'error',
            payload: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' },
            timestamp: new Date().toISOString()
          }));
          return;
        }

        const dataStr = message.toString();
        let parsed: any;
        
        try {
          parsed = JSON.parse(dataStr);
        } catch (err: unknown) {
          req.log.warn({ error: err }, 'Malformed WebSocket message received (not JSON)');
          socket.send(JSON.stringify({
            type: 'error',
            payload: { code: 'BAD_REQUEST', message: 'Message is not valid JSON' },
            timestamp: new Date().toISOString()
          }));
          return;
        }

        if (!validateWebSocketMessage(parsed)) {
          req.log.warn({ parsed }, 'WebSocket message fails validation schema');
          socket.send(JSON.stringify({
            type: 'error',
            payload: { code: 'BAD_REQUEST', message: 'Message does not match WebSocketMessage schema' },
            timestamp: new Date().toISOString()
          }));
          return;
        }

        if (parsed.type === 'session_create') {
          if (!sessionManager || !pubsubManager) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: 'Collaboration service is disabled' },
              timestamp: new Date().toISOString()
            }));
            return;
          }
          const payload = parsed.payload as any;
          displayName = payload.displayName || 'anonymous';
          const { sessionId: newSessionId, shortCode } = await sessionManager.createSession(displayName);
          
          await sessionManager.joinSession(newSessionId, connId, displayName);
          
          await pubsubManager.unsubscribeFromSession(sessionId, connId);
          await pubsubManager.subscribeToSession(newSessionId, socket as any, connId);
          
          activeCollabSessionId = newSessionId;

          socket.send(JSON.stringify({
            type: 'session_state',
            payload: {
              sessionId: newSessionId,
              shortCode,
              diagramXml: '',
              members: [{ connId, displayName }],
              chatHistory: []
            },
            timestamp: new Date().toISOString()
          }));

        } else if (parsed.type === 'session_join') {
          if (!sessionManager || !pubsubManager || !valkey) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: 'Collaboration service is disabled' },
              timestamp: new Date().toISOString()
            }));
            return;
          }
          const payload = parsed.payload as any;
          displayName = payload.displayName || 'anonymous';
          const targetSessionId = payload.sessionId;

          try {
            // Reconnect flow: remove any existing disconnected member with same displayName
            const tempState = await sessionManager.getSessionState(targetSessionId).catch(() => null);
            if (tempState) {
              for (const m of tempState.members) {
                if (m.name === displayName && m.disconnected) {
                  await valkey.hdel(`session:${tempState.sessionId}:members`, m.connId);
                }
              }
            }

            const state = await sessionManager.joinSession(targetSessionId, connId, displayName);
            const oldSession = activeCollabSessionId || sessionId;
            await pubsubManager.unsubscribeFromSession(oldSession, connId);
            await pubsubManager.subscribeToSession(state.sessionId, socket as any, connId);
            
            activeCollabSessionId = state.sessionId;

            const membersMapped = state.members.map((m: any) => ({
              connId: m.connId,
              displayName: m.name,
              disconnected: m.disconnected
            }));

            socket.send(JSON.stringify({
              type: 'session_state',
              payload: {
                sessionId: state.sessionId,
                shortCode: state.shortCode,
                diagramXml: state.diagramXml,
                members: membersMapped,
                chatHistory: state.chatHistory
              },
              timestamp: new Date().toISOString()
            }));

            await pubsubManager.publishEvent(state.sessionId, {
              type: 'member_joined',
              payload: { connId, displayName },
              senderConnId: connId,
              timestamp: new Date().toISOString()
            });

          } catch (joinErr: any) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'NOT_FOUND', message: joinErr.message },
              timestamp: new Date().toISOString()
            }));
          }

        } else if (parsed.type === 'session_leave') {
          if (!sessionManager || !pubsubManager) return;
          const payload = parsed.payload as any;
          const collabSessionId = payload.sessionId;

          const emptied = await sessionManager.leaveSession(collabSessionId, connId);
          if (!emptied) {
            await pubsubManager.publishEvent(collabSessionId, {
              type: 'member_left',
              payload: { connId },
              senderConnId: connId,
              timestamp: new Date().toISOString()
            });
          }
          await pubsubManager.unsubscribeFromSession(collabSessionId, connId);
          await pubsubManager.subscribeToSession(sessionId, socket as any, connId);
          
          activeCollabSessionId = null;

        } else if (parsed.type === 'chat_message') {
          const clientMsgId = parsed.id;
          if (!isChatMessage(parsed.payload)) {
            req.log.warn({ sessionId }, 'Invalid chat message payload structure');
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'BAD_REQUEST', message: 'Invalid chat message payload' },
              timestamp: new Date().toISOString()
            }));
            return;
          }

          const chatPayload: ChatMessage = parsed.payload;

          if (activeCollabSessionId) {
            if (!pubsubManager || !sessionManager || !valkey) return;

            // Broadcast the user message to other members first
            await pubsubManager.broadcastChatMessage(
              activeCollabSessionId,
              chatPayload.text,
              connId,
              displayName
            );

            // Queue the AI request in Valkey
            const queueKey = `session:${activeCollabSessionId}:queue`;
            const requestPayload = {
              connId,
              displayName,
              text: chatPayload.text,
              diagramXml: chatPayload.diagramXml,
              classification,
              clientMsgId
            };
            await valkey.rpush(queueKey, JSON.stringify(requestPayload));

            // Notify user if request is queued
            const isLocked = await valkey.exists(`session:${activeCollabSessionId}:lock`);
            if (isLocked) {
              socket.send(JSON.stringify({
                type: 'chat_message',
                payload: {
                  text: 'Your request has been queued. AI is currently working on another request.'
                },
                timestamp: new Date().toISOString()
              }));
            }

            // Trigger queue processor
            await processQueue(activeCollabSessionId);

          } else {
            // Single-user mode
            req.log.info({ type: parsed.type, id: parsed.id, sessionId, classification }, 'Proxying chat message to agent');
            try {
              if (pubsubManager) {
                pubsubManager.broadcastChatMessage(
                  sessionId,
                  chatPayload.text,
                  connId,
                  (req.user?.sub as string) || 'anonymous'
                ).catch(err => {
                  req.log.error({ err, sessionId }, 'Failed to broadcast chat message');
                });
              }

              await agentProxy.sendChatMessage(
                {
                  message: chatPayload.text,
                  diagramXml: chatPayload.diagramXml,
                  sessionId,
                  classification
                },
                {
                  'X-Request-ID': req.id,
                  'X-User-Identity': (req.user?.sub as string) || 'anonymous'
                },
                (agentEvent) => {
                  req.log.info({ event: agentEvent, sessionId }, 'Relaying agent event to client');
                  socket.send(JSON.stringify({
                    type: agentEvent.type,
                    payload: agentEvent.payload,
                    id: clientMsgId,
                    timestamp: new Date().toISOString()
                  }));
                },
                abortController.signal
              );
            } catch (agentErr: unknown) {
              if (abortController.signal.aborted) return;
              req.log.error({ error: agentErr, sessionId }, 'Error during agent proxying');
              socket.send(JSON.stringify({
                type: 'error',
                payload: { code: 'SERVICE_UNAVAILABLE', message: 'Agent service is temporarily unavailable' },
                id: clientMsgId,
                timestamp: new Date().toISOString()
              }));
            }
          }

        } else if (parsed.type === 'diagram_broadcast') {
          req.log.info({ sessionId: activeCollabSessionId || sessionId, classification }, 'Broadcasting diagram update from client');
          const targetSessionId = activeCollabSessionId || sessionId;
          if (pubsubManager && parsed.payload && typeof parsed.payload.diagramXml === 'string') {
            pubsubManager.broadcastDiagramUpdate(
              targetSessionId,
              parsed.payload.diagramXml,
              connId,
              displayName
            ).catch(err => {
              req.log.error({ err, sessionId: targetSessionId }, 'Failed to broadcast diagram update');
            });
          }
        }
      } catch (handlerErr: unknown) {
        req.log.error({ error: handlerErr }, 'Error in WebSocket message handler');
        socket.send(JSON.stringify({
          type: 'error',
          payload: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
          timestamp: new Date().toISOString()
        }));
      }
    });

    socket.on('close', async () => {
      abortController.abort();
      req.log.info({ sessionId: activeCollabSessionId || sessionId }, 'WebSocket connection closed');
      
      const targetSessionId = activeCollabSessionId || sessionId;

      if (pubsubManager && valkey) {
        await pubsubManager.unsubscribeFromSession(targetSessionId, connId);
        
        if (activeCollabSessionId && sessionManager) {
          const collabId = activeCollabSessionId;
          // Temporary disconnect flow
          const memberRaw = await valkey.hget(`session:${collabId}:members`, connId);
          if (memberRaw) {
            const member = JSON.parse(memberRaw);
            member.disconnected = true;
            await valkey.hset(`session:${collabId}:members`, connId, JSON.stringify(member));
            
            // Broadcast member update
            await pubsubManager.publishEvent(collabId, {
              type: 'member_joined',
              payload: member,
              senderConnId: connId,
              timestamp: new Date().toISOString()
            });

            // Start 5-minute cleanup timer
            setTimeout(async () => {
              const currentMemberRaw = await valkey.hget(`session:${collabId}:members`, connId);
              if (currentMemberRaw) {
                const currentMember = JSON.parse(currentMemberRaw);
                if (currentMember.disconnected) {
                  const emptied = await sessionManager.leaveSession(collabId, connId);
                  if (!emptied) {
                    await pubsubManager.publishEvent(collabId, {
                      type: 'member_left',
                      payload: { connId },
                      senderConnId: connId,
                      timestamp: new Date().toISOString()
                    });
                  }
                }
              }
            }, 5 * 60 * 1000);
          }
        }
      }
    });
  });
}
