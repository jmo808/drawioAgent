import { FastifyInstance } from 'fastify';
import { validateWebSocketMessage, isChatMessage } from '@drawio-agent/shared';
import type { ChatMessage } from '@drawio-agent/shared';
import { AgentProxy } from '../services/agent-proxy.js';
import { TokenBucketLimiter } from '../services/rate-limiter.js';
import { SessionManager, SessionMember } from '../services/session-manager.js';
import crypto from 'crypto';
import { ws_connections_active, ws_messages_total } from '../plugins/metrics.js';

const agentProxy = new AgentProxy();

/**
 * Registers the WebSocket chat route.
 */
interface SessionCreatePayload {
  displayName?: string;
}

interface SessionJoinPayload {
  sessionId: string;
  displayName?: string;
}

interface SessionLeavePayload {
  sessionId: string;
}

interface DiagramBroadcastPayload {
  diagramXml: string;
}

export async function chatRoutes(app: FastifyInstance) {
  const sessionManager = app.valkey ? new SessionManager(app.valkey) : null;
  const activeSessionsOnServer = new Map<string, number>();

  if (sessionManager && app.pubsubManager) {
    const pubsub = app.pubsubManager;
    const intervalId = setInterval(async () => {
      for (const collabId of activeSessionsOnServer.keys()) {
        try {
          const expired = await sessionManager.cleanExpiredMembers(collabId);
          for (const deadConnId of expired) {
            await pubsub.publishEvent(collabId, {
              type: 'member_left',
              payload: { connId: deadConnId },
              timestamp: new Date().toISOString(),
            });
          }
        } catch (err) {
          app.log.error({ err, collabId }, 'Error checking/cleaning expired session members');
        }
      }
    }, 60 * 1000);

    app.addHook('onClose', async () => {
      clearInterval(intervalId);
    });
  }

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
        timestamp: new Date().toISOString(), requestId: req.id
      }));
      socket.close();
      return;
    }

    req.log.info({ sessionId, classification }, 'New WebSocket connection established');
    ws_connections_active.inc();

    const valkey = app.valkey;
    const pubsubManager = app.pubsubManager;

    const trackCollabSession = (collabId: string) => {
      activeSessionsOnServer.set(collabId, (activeSessionsOnServer.get(collabId) || 0) + 1);
    };

    const untrackCollabSession = (collabId: string) => {
      const count = activeSessionsOnServer.get(collabId) || 0;
      if (count <= 1) {
        activeSessionsOnServer.delete(collabId);
      } else {
        activeSessionsOnServer.set(collabId, count - 1);
      }
    };

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

    const wsLimit = Number(process.env.RATE_LIMIT_MAX_TOKENS) || 30;

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
        timestamp: new Date().toISOString(), requestId: req.id
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
                timestamp: new Date().toISOString(), requestId: req.id
              };
              await valkey.lpush(`session:${collabSessionId}:chat`, JSON.stringify(chatEntry));
              await valkey.ltrim(`session:${collabSessionId}:chat`, 0, 499);
            }

            await pubsubManager.publishEvent(collabSessionId, {
              type: agentEvent.type,
              payload: agentEvent.payload,
              id: request.clientMsgId,
              timestamp: new Date().toISOString(), requestId: req.id
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
          timestamp: new Date().toISOString(), requestId: req.id
        });
      } finally {
        // Release lock
        await sessionManager.releaseLock(collabSessionId, request.connId);

        // Broadcast ai_unlocked to the session
        await pubsubManager.publishEvent(collabSessionId, {
          type: 'ai_unlocked',
          timestamp: new Date().toISOString(), requestId: req.id
        });

        // Process next in queue
        processQueue(collabSessionId);
      }
    };

    socket.on('message', async (message) => {
      try {
        const dataStr = message.toString();
        let parsed: any;
        
        try {
          parsed = JSON.parse(dataStr);
        } catch (err: unknown) {
          req.log.warn({ error: err }, 'Malformed WebSocket message received (not JSON)');
          ws_messages_total.labels('unknown', 'error').inc();
          socket.send(JSON.stringify({
            type: 'error',
            payload: { code: 'BAD_REQUEST', message: 'Message is not valid JSON' },
            timestamp: new Date().toISOString(), requestId: req.id
          }));
          return;
        }

        if (!validateWebSocketMessage(parsed)) {
          req.log.warn({ parsed }, 'WebSocket message fails validation schema');
          ws_messages_total.labels(parsed?.type || 'unknown', 'error').inc();
          socket.send(JSON.stringify({
            type: 'error',
            payload: { code: 'BAD_REQUEST', message: 'Message does not match WebSocketMessage schema' },
            timestamp: new Date().toISOString(), requestId: req.id
          }));
          return;
        }

        // Ephemeral presence messages (like cursor_move) do NOT consume token bucket rate limits
        if (parsed.type !== 'cursor_move') {
          const apiKey = query.apiKey || req.ip;
          const allowed = await app.wsRateLimiter.consume(apiKey, wsLimit);
          if (!allowed) {
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
              timestamp: new Date().toISOString(), requestId: req.id
            }));
            return;
          }
        }

        ws_messages_total.labels(parsed.type, 'success').inc();

        if (parsed.type === 'session_create') {
          if (!sessionManager || !pubsubManager) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: 'Collaboration service is disabled' },
              timestamp: new Date().toISOString(), requestId: req.id
            }));
            return;
          }
          const payload = parsed.payload as SessionCreatePayload;
          displayName = payload.displayName || 'anonymous';
          const { sessionId: newSessionId, shortCode } = await sessionManager.createSession(displayName);
          
          await sessionManager.joinSession(newSessionId, connId, displayName);
          
          await pubsubManager.unsubscribeFromSession(sessionId, connId);
          await pubsubManager.subscribeToSession(newSessionId, socket, connId);
          
          trackCollabSession(newSessionId);
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
            timestamp: new Date().toISOString(), requestId: req.id
          }));

        } else if (parsed.type === 'session_join') {
          if (!sessionManager || !pubsubManager || !valkey) {
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: 'Collaboration service is disabled' },
              timestamp: new Date().toISOString(), requestId: req.id
            }));
            return;
          }
          const payload = parsed.payload as unknown as SessionJoinPayload;
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
            await pubsubManager.subscribeToSession(state.sessionId, socket, connId);
            
            if (activeCollabSessionId) {
              untrackCollabSession(activeCollabSessionId);
            }
            trackCollabSession(state.sessionId);
            activeCollabSessionId = state.sessionId;

            const membersMapped = state.members.map((m: SessionMember) => ({
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
              timestamp: new Date().toISOString(), requestId: req.id
            }));

            await pubsubManager.publishEvent(state.sessionId, {
              type: 'member_joined',
              payload: { connId, displayName },
              senderConnId: connId,
              timestamp: new Date().toISOString(), requestId: req.id
            });

          } catch (joinErr: unknown) {
            const errMsg = joinErr instanceof Error ? joinErr.message : 'Unknown error';
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'NOT_FOUND', message: errMsg },
              timestamp: new Date().toISOString(), requestId: req.id
            }));
          }

        } else if (parsed.type === 'session_leave') {
          if (!sessionManager || !pubsubManager) return;
          const payload = parsed.payload as unknown as SessionLeavePayload;
          const collabSessionId = payload.sessionId;

          const emptied = await sessionManager.leaveSession(collabSessionId, connId);
          if (!emptied) {
            await pubsubManager.publishEvent(collabSessionId, {
              type: 'member_left',
              payload: { connId },
              senderConnId: connId,
              timestamp: new Date().toISOString(), requestId: req.id
            });
          }
          await pubsubManager.unsubscribeFromSession(collabSessionId, connId);
          await pubsubManager.subscribeToSession(sessionId, socket, connId);
          
          if (activeCollabSessionId) {
            untrackCollabSession(activeCollabSessionId);
          }
          activeCollabSessionId = null;

        } else if (parsed.type === 'chat_message') {
          const clientMsgId = parsed.id;
          if (!isChatMessage(parsed.payload)) {
            req.log.warn({ sessionId }, 'Invalid chat message payload structure');
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'BAD_REQUEST', message: 'Invalid chat message payload' },
              timestamp: new Date().toISOString(), requestId: req.id
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
              diagramXml: chatPayload.diagramXml || undefined,
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
                timestamp: new Date().toISOString(), requestId: req.id
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
                  diagramXml: chatPayload.diagramXml || undefined,
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
                    timestamp: new Date().toISOString(), requestId: req.id
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
                timestamp: new Date().toISOString(), requestId: req.id
              }));
            }
          }

        } else if (parsed.type === 'cursor_move') {
          const targetSessionId = activeCollabSessionId || sessionId;
          if (pubsubManager && parsed.payload) {
            pubsubManager.publishEvent(targetSessionId, {
              type: 'cursor_move',
              payload: {
                ...parsed.payload,
                connId,
                displayName
              },
              senderConnId: connId,
              timestamp: new Date().toISOString(), requestId: req.id
            }).catch(err => {
              req.log.error({ err, sessionId: targetSessionId }, 'Failed to broadcast cursor move');
            });
          }
        } else if (parsed.type === 'diagram_broadcast') {
          req.log.info({ sessionId: activeCollabSessionId || sessionId, classification }, 'Broadcasting diagram update from client');
          const targetSessionId = activeCollabSessionId || sessionId;
          if (pubsubManager && parsed.payload && typeof parsed.payload.diagramXml === 'string') {
            const broadcastPayload = parsed.payload as unknown as DiagramBroadcastPayload;
            pubsubManager.broadcastDiagramUpdate(
              targetSessionId,
              broadcastPayload.diagramXml,
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
          timestamp: new Date().toISOString(), requestId: req.id
        }));
      }
    });

    socket.on('close', async () => {
      ws_connections_active.dec();
      abortController.abort();
      req.log.info({ sessionId: activeCollabSessionId || sessionId }, 'WebSocket connection closed');
      
      const targetSessionId = activeCollabSessionId || sessionId;

      if (pubsubManager && valkey) {
        await pubsubManager.unsubscribeFromSession(targetSessionId, connId);
        
        if (activeCollabSessionId && sessionManager) {
          const collabId = activeCollabSessionId;
          untrackCollabSession(collabId);
          // Temporary disconnect flow
          const memberRaw = await valkey.hget(`session:${collabId}:members`, connId);
          if (memberRaw) {
            const member = JSON.parse(memberRaw) as SessionMember;
            member.disconnected = true;
            await valkey.hset(`session:${collabId}:members`, connId, JSON.stringify(member));
            
            // Broadcast member update
            await pubsubManager.publishEvent(collabId, {
              type: 'member_joined',
              payload: member as unknown as Record<string, unknown>,
              senderConnId: connId,
              timestamp: new Date().toISOString(), requestId: req.id
            });

            // Set Valkey TTL heartbeat (5 minutes) instead of local setTimeout
            await valkey.set(`session:${collabId}:member:${connId}:heartbeat`, '1', 'EX', 300);
          }
        }
      }
    });
  });
}
