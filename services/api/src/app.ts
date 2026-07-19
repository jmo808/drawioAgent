import Fastify, { FastifyInstance } from 'fastify';
import { websocketPlugin } from './plugins/websocket.js';
import { authPlugin } from './plugins/auth.js';
import { valkeyPlugin } from './plugins/valkey.js';
import { healthRoutes } from './routes/health.js';
import { featuresRoutes } from './routes/features.js';
import { chatRoutes } from './routes/chat.js';

/**
 * Builds and configures the Fastify application instance.
 * @param app Fastify instance to configure.
 */
export async function buildApp(app: FastifyInstance) {
  // Add X-API-Version global header hook
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-API-Version', '1.0.0');
    if (request.id) {
      reply.header('x-request-id', request.id);
    }
    return payload;
  });

  // Register WebSocket plugin
  await app.register(websocketPlugin);

  // Register Valkey plugin
  await app.register(valkeyPlugin);

  // Register authentication middleware
  await app.register(authPlugin, { bypassRoutes: ['/health', '/ready', '/metrics', '/api/features'] });

  // Register health check routes
  await app.register(healthRoutes);

  // Register features discovery routes
  await app.register(featuresRoutes);

  // Register WebSocket chat routes
  await app.register(chatRoutes);
}

