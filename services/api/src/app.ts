import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
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
  await app.register(authPlugin, { bypassRoutes: ['/health', '/ready', '/metrics'] });

  // Register health check routes
  await app.register(healthRoutes);

  // Register WebSocket chat routes
  await app.register(chatRoutes);
}

// Start the server if this file is run directly or outside tests
const isMain = import.meta.url.startsWith('file:') &&
  (process.argv[1]?.endsWith('app.ts') || process.argv[1]?.endsWith('app.js') || process.argv[1]?.endsWith('app'));

if (isMain || !process.env.VITEST) {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    }
  });

  const start = async () => {
    try {
      await buildApp(server);
      const port = Number(process.env.PORT) || 3000;
      const host = process.env.HOST || '0.0.0.0';

      const closeGracefully = async (signal: string) => {
        server.log.info(`Received ${signal}. Gracefully shutting down Fastify server...`);
        await server.close();
        server.log.info('Fastify server shut down successfully.');
        process.exit(0);
      };

      process.on('SIGTERM', () => closeGracefully('SIGTERM'));
      process.on('SIGINT', () => closeGracefully('SIGINT'));

      await server.listen({ port, host });
    } catch (err) {
      server.log.error(err);
      process.exit(1);
    }
  };

  start();
}

