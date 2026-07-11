import { FastifyInstance } from 'fastify';
import { healthRoutes } from './routes/health.js';

/**
 * Builds and configures the Fastify application instance.
 * @param app Fastify instance to configure.
 */
export async function buildApp(app: FastifyInstance) {
  // Register health check routes
  await app.register(healthRoutes);
}
