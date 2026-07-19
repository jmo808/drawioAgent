import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { request } from 'undici';

// Mock ioredis using hoisted variables to prevent reference errors during Vitest hoisting
const hoisted = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
    status: 'ready',
  };
  const constructorMock = vi.fn();
  class MockRedis {
    constructor(...args: any[]) {
      constructorMock(...args);
      // Return the mock instance so methods like .on and .ping can be called on it
      return instance;
    }
  }
  return {
    mockRedisConstructor: constructorMock,
    mockRedisInstance: instance,
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

// Mock undici request for health checks
vi.mock('undici', async () => {
  const actual = await vi.importActual<typeof import('undici')>('undici');
  return {
    ...actual,
    request: vi.fn().mockResolvedValue({
      statusCode: 200,
      body: {},
    }),
  };
});

describe('Valkey Fastify Plugin', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    delete process.env.COLLABORATION_ENABLED;
    delete process.env.VALKEY_HOST;
    delete process.env.VALKEY_PORT;
    delete process.env.VALKEY_PASSWORD;
    if (app) {
      await app.close();
    }
  });

  it('should not connect to Valkey when COLLABORATION_ENABLED is false/unset', async () => {
    process.env.COLLABORATION_ENABLED = 'false';
    app = Fastify();
    await buildApp(app);

    expect(mockRedisConstructor).not.toHaveBeenCalled();
    expect(app.hasDecorator('valkey')).toBe(true);
    expect(app.valkey).toBeNull();
  });

  it('should connect to Valkey using env vars when COLLABORATION_ENABLED is true', async () => {
    process.env.COLLABORATION_ENABLED = 'true';
    process.env.VALKEY_HOST = 'my-valkey-host';
    process.env.VALKEY_PORT = '6379';
    process.env.VALKEY_PASSWORD = 'secret-pass';

    mockRedisInstance.ping.mockResolvedValue('PONG');

    app = Fastify();
    await buildApp(app);

    expect(mockRedisConstructor).toHaveBeenCalled();
    // It should construct at least two connections: one standard client and one subscriber
    const constructorCalls = mockRedisConstructor.mock.calls;
    expect(constructorCalls.length).toBeGreaterThanOrEqual(2);
    
    // Check config passed to the first call
    const firstCallConfig = constructorCalls[0][0] as any;
    expect(firstCallConfig.host).toBe('my-valkey-host');
    expect(firstCallConfig.port).toBe(6379);
    expect(firstCallConfig.password).toBe('secret-pass');

    expect(app.hasDecorator('valkey')).toBe(true);
    expect(app.valkey).toBe(mockRedisInstance);
  });

  it('should include Valkey check in /ready endpoint when collaboration is enabled', async () => {
    process.env.COLLABORATION_ENABLED = 'true';
    mockRedisInstance.ping.mockResolvedValue('PONG');

    app = Fastify();
    await buildApp(app);

    const res = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
    expect(mockRedisInstance.ping).toHaveBeenCalled();
  });

  it('should fail /ready check if Valkey ping fails', async () => {
    process.env.COLLABORATION_ENABLED = 'true';
    mockRedisInstance.ping.mockRejectedValue(new Error('Connection timed out'));

    app = Fastify();
    await buildApp(app);

    const res = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().status).toBe('not ready');
    expect(res.json().error).toContain('Valkey check failed');
  });
});
