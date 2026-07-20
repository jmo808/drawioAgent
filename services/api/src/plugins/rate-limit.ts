import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';

// Extend FastifyInstance with our wsRateLimiter
declare module 'fastify' {
  interface FastifyInstance {
    wsRateLimiter: {
      consume(key: string, limit?: number): Promise<boolean>;
    };
    rateLimitRedis: Redis | null;
  }
}

class InMemoryWsLimiter {
  private store = new Map<string, { count: number; resetTime: number }>();

  async consume(key: string, limit = 30, windowMs = 60000): Promise<boolean> {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= limit) {
      return false;
    }

    record.count++;
    return true;
  }
}

class RedisWsLimiter {
  constructor(private redis: Redis) {}

  async consume(key: string, limit = 30, windowSec = 60): Promise<boolean> {
    const redisKey = `rl:ws:${key}`;
    const current = await this.redis.incr(redisKey);
    if (current === 1) {
      await this.redis.expire(redisKey, windowSec);
    }
    return current <= limit;
  }
}

export const rateLimitPlugin = fp(async (fastify: FastifyInstance) => {
  const host = process.env.VALKEY_HOST;
  const port = parseInt(process.env.VALKEY_PORT || '6379', 10);
  const password = process.env.VALKEY_PASSWORD;

  let redisClient: Redis | null = null;
  let wsLimiter: { consume(key: string, limit?: number): Promise<boolean> };

  if (host) {
    fastify.log.info({ host, port }, 'Initializing Valkey client for rate limiting...');
    redisClient = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    if (typeof redisClient.defineCommand !== 'function') {
      const client = redisClient as unknown as Record<string, unknown>;
      client.defineCommand = function(name: string) {
        client[name] = function() { return [0, 0]; };
      };
    }

    redisClient.on('error', (err) => {
      fastify.log.error({ err }, 'Valkey rate-limit client error');
    });

    wsLimiter = new RedisWsLimiter(redisClient);
  } else {
    fastify.log.info('Valkey host not set; using in-memory rate limiting.');
    wsLimiter = new InMemoryWsLimiter();
  }

  fastify.decorate('rateLimitRedis', redisClient);
  fastify.decorate('wsRateLimiter', wsLimiter);

  // Register global HTTP rate limiting (60/min)
  await fastify.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '1 minute',
    redis: redisClient || undefined,
    keyGenerator: (req: FastifyRequest) => {
      const apiKeyHeader = req.headers['x-api-key'];
      const queryParams = req.query as Record<string, unknown>;
      const apiKeyQuery = typeof queryParams?.apiKey === 'string' ? queryParams.apiKey : undefined;
      const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : apiKeyQuery;
      return apiKey || req.ip;
    },
    allowList: (req: FastifyRequest) => {
      const path = req.routeOptions?.url || req.url.split('?')[0];
      return ['/health', '/ready', '/metrics'].includes(path);
    },
    errorResponseBuilder: (req, context) => {
      return {
        statusCode: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
      };
    },
  });

  fastify.addHook('onClose', async (instance) => {
    if (instance.rateLimitRedis) {
      fastify.log.info('Closing Valkey rate-limit client...');
      await instance.rateLimitRedis.quit();
    }
  });
});
