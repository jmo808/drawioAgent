import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { buildApp } from '../app.js';

// Mock authPlugin to be a no-op
vi.mock('./auth.js', () => {
  return {
    authPlugin: fp(async (fastify: any) => {
      fastify.addHook('preHandler', async (request: any, reply: any) => {
        // Mock request.user
        request.user = { sub: 'mock-user' };
      });
    })
  };
});

// Mock ioredis using hoisted variables
const hoisted = vi.hoisted(() => {
  const mockRedisInstance: any = {
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn(),
    expire: vi.fn(),
    status: 'ready',
    defineCommand: vi.fn().mockImplementation((name, options) => {
      const redisStore = new Map<string, { count: number; resetTime: number }>();
      mockRedisInstance[name] = vi.fn().mockImplementation(async (key, ...args) => {
        const now = Date.now();
        let record = redisStore.get(key);
        if (!record || now > record.resetTime) {
          record = { count: 1, resetTime: now + 60000 };
          redisStore.set(key, record);
        } else {
          record.count++;
        }
        // Returns the response structure expected by @fastify/rate-limit RedisStore
        // The callback/promise in RedisStore expects an object with { current, ttl } or similar, or it resolves.
        // Wait, let's check what the redis lua script returns.
        // Actually, the redis lua script for @fastify/rate-limit returns:
        // [currentRequests, timeToResetMs]
        // But the store wrapper expects it, let's return { current: record.count, ttl: record.resetTime - now }
        // Or if it's called via ioredis, does the lua script return an array?
        // Yes, the lua script execution in ioredis returns array of numbers: [count, pttl]
        return [record.count, record.resetTime - now];
      });
    }),
  };
  const constructorMock = vi.fn();
  class MockRedis {
    constructor(...args: any[]) {
      constructorMock(...args);
      return mockRedisInstance;
    }
  }
  
  return {
    mockRedisConstructor: constructorMock,
    mockRedisInstance,
    MockRedisClass: MockRedis,
  };
});

vi.mock('ioredis', () => {
  return {
    default: hoisted.MockRedisClass,
    Redis: hoisted.MockRedisClass,
  };
});

const { mockRedisConstructor, mockRedisInstance } = hoisted;

describe('Rate Limiting Plugin', () => {
  let app: any;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.API_KEY = 'super-secret-key';
  });

  afterEach(async () => {
    delete process.env.API_KEY;
    delete process.env.VALKEY_HOST;
    delete process.env.VALKEY_PORT;
    delete process.env.VALKEY_PASSWORD;
    if (app) {
      await app.close();
    }
  });

  it('should use in-memory rate limiting when VALKEY_HOST is not set', async () => {
    app = Fastify();
    await buildApp(app);
    
    app.get('/test-rate-limit', async () => ({ ok: true }));

    // Verify it doesn't construct Redis
    expect(mockRedisConstructor).not.toHaveBeenCalled();

    // Verify rate limiting headers on HTTP response
    const res = await app.inject({
      method: 'GET',
      url: '/test-rate-limit',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('should use Valkey store when VALKEY_HOST is set', async () => {
    process.env.VALKEY_HOST = 'localhost';
    app = Fastify();
    await buildApp(app);

    // Verify it constructs Redis client
    expect(mockRedisConstructor).toHaveBeenCalled();
  });

  it('should exclude /health, /ready, /metrics from rate limiting', async () => {
    app = Fastify();
    await buildApp(app);

    // Bypassed routes should not return 429 even when hit > 60 times
    for (let i = 0; i < 65; i++) {
      const resHealth = await app.inject({
        method: 'GET',
        url: '/health'
      });
      expect(resHealth.statusCode).toBe(200);
    }
  });

  it('should return 429 and Retry-After when limit is exceeded', async () => {
    app = Fastify();
    await buildApp(app);
    app.get('/test-rate-limit-exceeded', async () => ({ ok: true }));

    // Inject 60 requests to hit the limit
    for (let i = 0; i < 60; i++) {
      await app.inject({
        method: 'GET',
        url: '/test-rate-limit-exceeded',
      });
    }

    const limitRes = await app.inject({
      method: 'GET',
      url: '/test-rate-limit-exceeded',
    });

    expect(limitRes.statusCode).toBe(429);
    expect(limitRes.json().message).toBe('Rate limit exceeded');
    expect(limitRes.headers['retry-after']).toBeDefined();
  });

  it('should track rate limits per API key', async () => {
    app = Fastify();
    await buildApp(app);
    app.get('/test-per-key', async () => ({ ok: true }));

    // Hit the limit for key A
    for (let i = 0; i < 60; i++) {
      await app.inject({
        method: 'GET',
        url: '/test-per-key',
        headers: { 'x-api-key': 'key-A' }
      });
    }

    const resA = await app.inject({
      method: 'GET',
      url: '/test-per-key',
      headers: { 'x-api-key': 'key-A' }
    });
    expect(resA.statusCode).toBe(429);

    // Key B should still be allowed
    const resB = await app.inject({
      method: 'GET',
      url: '/test-per-key',
      headers: { 'x-api-key': 'key-B' }
    });
    expect(resB.statusCode).toBe(200);
  });

  it('should enforce 30/min limit for WebSocket messages using wsRateLimiter', async () => {
    app = Fastify();
    await buildApp(app);

    // Test in-memory limiter
    const limiter = app.wsRateLimiter;
    const clientKey = 'client-1';

    for (let i = 0; i < 30; i++) {
      const allowed = await limiter.consume(clientKey);
      expect(allowed).toBe(true);
    }

    const blocked = await limiter.consume(clientKey);
    expect(blocked).toBe(false);
  });

  it('should use Redis wsRateLimiter when VALKEY_HOST is set', async () => {
    process.env.VALKEY_HOST = 'localhost';
    app = Fastify();
    await buildApp(app);

    const limiter = app.wsRateLimiter;
    const clientKey = 'client-redis';

    mockRedisInstance.incr.mockResolvedValueOnce(1);
    mockRedisInstance.incr.mockResolvedValueOnce(31);

    const first = await limiter.consume(clientKey);
    expect(first).toBe(true);
    expect(mockRedisInstance.incr).toHaveBeenCalledWith('rl:ws:client-redis');
    expect(mockRedisInstance.expire).toHaveBeenCalledWith('rl:ws:client-redis', 60);

    const second = await limiter.consume(clientKey);
    expect(second).toBe(false);
  });
});
