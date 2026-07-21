import Fastify, { FastifyInstance } from 'fastify';
import { websocketPlugin } from './plugins/websocket.js';
import { authPlugin } from './plugins/auth.js';
import { valkeyPlugin } from './plugins/valkey.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { featuresRoutes } from './routes/features.js';
import { chatRoutes } from './routes/chat.js';
import { metricsPlugin } from './plugins/metrics.js';

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

  // Register metrics plugin
  await app.register(metricsPlugin);

  // Register WebSocket plugin
  await app.register(websocketPlugin);

  // Register Valkey plugin
  await app.register(valkeyPlugin);

  // Register Rate Limiting plugin
  await app.register(rateLimitPlugin);

  // Register authentication middleware
  await app.register(authPlugin, { bypassRoutes: ['/health', '/ready', '/metrics', '/api/features', '/api/v1/health', '/api/v1/ready', '/api/v1/metrics', '/api/v1/features'] });

  // Register health check routes
  await app.register(healthRoutes);

  // Register features discovery routes
  await app.register(featuresRoutes);

  // Register WebSocket chat routes
  await app.register(chatRoutes);
}

