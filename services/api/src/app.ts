import { FastifyInstance } from 'fastify';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';

/**
 * Builds and configures the Fastify application instance.
 * @param app Fastify instance to configure.
 */
export async function buildApp(app: FastifyInstance) {
  // Register authentication middleware
  await app.register(authPlugin, { bypassRoutes: ['/health', '/ready'] });

  // Register health check routes
  await app.register(healthRoutes);
}
