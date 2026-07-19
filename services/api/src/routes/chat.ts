import { FastifyInstance } from 'fastify';
import { validateWebSocketMessage } from '@drawio-agent/shared';
import type { ChatMessage } from '@drawio-agent/shared';
import { AgentProxy } from '../services/agent-proxy.js';
import { TokenBucketLimiter } from '../services/rate-limiter.js';
import crypto from 'crypto';

const agentProxy = new AgentProxy();

/**
 * Registers the WebSocket chat route.
 */
export async function chatRoutes(app: FastifyInstance) {
  app.get('/api/v1/ws/chat', { websocket: true }, (socket, req) => {
    const sessionId = crypto.randomUUID();
    
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

    const limitMax = Number(process.env.RATE_LIMIT_MAX_TOKENS) || 10;
    const limitRefill = Number(process.env.RATE_LIMIT_REFILL_RATE) || 2;
    const limiter = new TokenBucketLimiter(limitMax, limitRefill);

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
        let parsed: unknown;
        
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

        if (parsed.type === 'chat_message') {
          const clientMsgId = parsed.id;
          req.log.info({ parsed, sessionId, classification }, 'Proxying chat message to agent');
          
          try {
            const chatPayload = parsed.payload as unknown as ChatMessage;
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
              }
            );
          } catch (agentErr: unknown) {
            req.log.error({ error: agentErr, sessionId }, 'Error during agent proxying');
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: 'Agent service is temporarily unavailable' },
              id: clientMsgId,
              timestamp: new Date().toISOString()
            }));
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

    socket.on('close', () => {
      req.log.info({ sessionId }, 'WebSocket connection closed');
    });
  });
}
