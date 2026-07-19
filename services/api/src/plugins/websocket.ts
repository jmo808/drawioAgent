import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import fastifyWebsocket from '@fastify/websocket';

/**
 * Registers the Fastify WebSocket plugin.
 */
export const websocketPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(fastifyWebsocket, {
    options: {
      clientTracking: true
    }
  });
});
