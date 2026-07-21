import './tracing.js';
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

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  process.exit(1);
});

const start = async () => {
  try {
    await buildApp(server);
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || '0.0.0.0';

    const closeGracefully = async (signal: string) => {
      console.log(`Received ${signal}. Gracefully shutting down Fastify server...`);
      await server.close();
      console.log('Fastify server shut down successfully.');
      process.exit(0);
    };

    process.on('SIGTERM', () => closeGracefully('SIGTERM'));
    process.on('SIGINT', () => closeGracefully('SIGINT'));

    console.log(`Starting API server on ${host}:${port}...`);
    await server.listen({ port, host });
    console.log(`API server listening on ${host}:${port}`);
  } catch (err) {
    console.error('Failed to start API server:', err);
    process.exit(1);
  }
};

start();
