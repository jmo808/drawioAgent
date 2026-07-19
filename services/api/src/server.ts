import Fastify from 'fastify';
import { buildApp } from './app.js';

import crypto from 'crypto';

const server = Fastify({
  requestIdHeader: 'x-request-id',
  genReqId: () => crypto.randomUUID(),
  requestIdLogLabel: 'requestId',
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    messageKey: 'message',
    formatters: {
      level: (label: string) => ({ level: label })
    }
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
