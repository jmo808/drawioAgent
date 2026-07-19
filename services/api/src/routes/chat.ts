import { FastifyInstance } from 'fastify';
import { validateWebSocketMessage } from '@drawio-agent/shared';
import { AgentProxy } from '../services/agent-proxy.js';
import crypto from 'crypto';

const agentProxy = new AgentProxy();

/**
 * Registers the WebSocket chat route.
 */
export async function chatRoutes(app: FastifyInstance) {
  app.get('/ws/chat', { websocket: true }, (socket, req) => {
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

    socket.on('message', async (message) => {
      try {
        const dataStr = message.toString();
        let parsed: any;
        
        try {
          parsed = JSON.parse(dataStr);
        } catch (err: any) {
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
            await agentProxy.sendChatMessage(
              {
                message: parsed.payload.text,
                diagramXml: parsed.payload.diagramXml,
                sessionId,
                classification
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
          } catch (agentErr: any) {
            req.log.error({ error: agentErr, sessionId }, 'Error during agent proxying');
            socket.send(JSON.stringify({
              type: 'error',
              payload: { code: 'SERVICE_UNAVAILABLE', message: agentErr.message },
              id: clientMsgId,
              timestamp: new Date().toISOString()
            }));
          }
        }
      } catch (handlerErr: any) {
        req.log.error({ error: handlerErr }, 'Error in WebSocket message handler');
        socket.send(JSON.stringify({
          type: 'error',
          payload: { code: 'INTERNAL_SERVER_ERROR', message: handlerErr.message },
          timestamp: new Date().toISOString()
        }));
      }
    });

    socket.on('close', () => {
      req.log.info({ sessionId }, 'WebSocket connection closed');
    });
  });
}
