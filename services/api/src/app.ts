import { FastifyInstance } from 'fastify';
import { websocketPlugin } from './plugins/websocket.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';

/**
 * Builds and configures the Fastify application instance.
 * @param app Fastify instance to configure.
 */
export async function buildApp(app: FastifyInstance) {
  // Register WebSocket plugin
  await app.register(websocketPlugin);

  // Register authentication middleware
  await app.register(authPlugin, { bypassRoutes: ['/health', '/ready'] });

  // Register health check routes
  await app.register(healthRoutes);

  // Register WebSocket chat routes
  await app.register(chatRoutes);
}
