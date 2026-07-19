import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

import { PubSubManager } from '../services/pubsub-manager.js';

declare module 'fastify' {
  interface FastifyInstance {
    valkey: Redis | null;
    valkeySubscriber: Redis | null;
    pubsubManager: PubSubManager | null;
  }
}

/**
 * Valkey client Fastify plugin to manage Valkey connections.
 */
export const valkeyPlugin = fp(async (fastify: FastifyInstance) => {
  const isCollaborationEnabled = process.env.COLLABORATION_ENABLED === 'true';

  if (!isCollaborationEnabled) {
    fastify.decorate('valkey', null);
    fastify.decorate('valkeySubscriber', null);
    fastify.decorate('pubsubManager', null);
    fastify.log.info('Collaboration mode is disabled; Valkey client is not initialized.');
    return;
  }

  const host = process.env.VALKEY_HOST || 'localhost';
  const port = parseInt(process.env.VALKEY_PORT || '6379', 10);
  const password = process.env.VALKEY_PASSWORD;

  fastify.log.info({ host, port }, 'Initializing Valkey client connections...');

  const valkeyClient = new Redis({
    host,
    port,
    password,
    maxRetriesPerRequest: null, // needed for pub/sub or queueing commands when connection is down
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  const valkeySubscriberClient = new Redis({
    host,
    port,
    password,
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  valkeyClient.on('error', (err) => {
    fastify.log.error({ err }, 'Valkey standard client error');
  });

  valkeySubscriberClient.on('error', (err) => {
    fastify.log.error({ err }, 'Valkey subscriber client error');
  });

  const pubsubManager = new PubSubManager(valkeyClient, valkeySubscriberClient);

  fastify.decorate('valkey', valkeyClient);
  fastify.decorate('valkeySubscriber', valkeySubscriberClient);
  fastify.decorate('pubsubManager', pubsubManager);

  fastify.addHook('onClose', async (instance) => {
    fastify.log.info('Closing Valkey client connections...');
    if (instance.valkey) {
      await instance.valkey.quit();
    }
    if (instance.valkeySubscriber) {
      await instance.valkeySubscriber.quit();
    }
  });
});
