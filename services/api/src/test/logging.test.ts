import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import crypto from 'crypto';
import { AgentProxy } from '../services/agent-proxy.js';

describe('Logging and Correlation IDs', () => {
  let server: any;
  let loggedLines: any[] = [];
  const logStream = {
    write: (msg: string) => {
      try {
        loggedLines.push(JSON.parse(msg));
      } catch (e) {
        // ignore invalid JSON for tests
      }
    }
  };

  beforeEach(async () => {
    loggedLines = [];
    server = Fastify({
      requestIdHeader: 'x-request-id',
      logger: {
        stream: logStream,
        level: 'info'
      }
    });
    // Ensure we are overriding genReqId to mock UUID if we want, or we can just assert it's a valid uuid.
    // We will let the app configuration handle genReqId by wrapping the server creation if needed.
    // Wait, `buildApp` configures the routes, but `server.ts` configures Fastify instantiation.
    // Since `app.ts` just adds plugins, we should probably simulate how `server.ts` does it.
    
    // Actually, in `server.ts`, we instantiate Fastify. For testing `app.ts` modifications, we need
    // to instantiate Fastify similarly.
  });

  afterEach(async () => {
    if (server) await server.close();
  });

  it('generates a UUID v4 X-Request-ID when not present in request', async () => {
    server = Fastify({
      requestIdHeader: 'x-request-id',
      genReqId: () => crypto.randomUUID()
    });
    await buildApp(server);
    
    const response = await server.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const reqId = response.headers['x-request-id'];
    expect(reqId).toBeDefined();
    // basic UUID v4 regex
    expect(reqId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('preserves X-Request-ID when already present in request', async () => {
    server = Fastify({
      requestIdHeader: 'x-request-id',
      genReqId: () => crypto.randomUUID()
    });
    await buildApp(server);

    const presetId = '12345678-1234-4234-8234-1234567890ab';
    const response = await server.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': presetId
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toBe(presetId);
  });

  it('outputs valid JSON logs with timestamp, level, message, requestId', async () => {
    // Mimic the production logger config from server.ts
    server = Fastify({
      requestIdHeader: 'x-request-id',
      genReqId: () => crypto.randomUUID(),
      requestIdLogLabel: 'requestId',
      logger: {
        stream: logStream,
        level: 'info',
        timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
        messageKey: 'message',
        formatters: {
          level: (label: string) => ({ level: label })
        },
        serializers: {
          req: (request) => {
            return {
              method: request.method,
              url: request.url,
            };
          }
        }
      }
    });
    await buildApp(server);

    await server.inject({
      method: 'GET',
      url: '/health'
    });

    const requestLogs = loggedLines.filter(log => log.req || log.res);
    expect(requestLogs.length).toBeGreaterThan(0);
    
    for (const log of requestLogs) {
      expect(log).toHaveProperty('timestamp');
      expect(log).toHaveProperty('level');
      expect(log).toHaveProperty('message');
      expect(log).toHaveProperty('requestId');
    }
  });

  it('propagates request ID to Python agent in proxy requests', async () => {
    // Mock the global fetch to track headers sent to agent
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
      body: {
        getReader: () => ({ 
          read: async () => ({ done: true }),
          releaseLock: () => {} 
        })
      }
    });
    global.fetch = fetchMock;

    const proxy = new AgentProxy();
    const reqId = 'aabbccdd-1234-4234-8234-1234567890ab';
    
    await proxy.sendChatMessage(
      { message: 'hello', sessionId: 'test-session' },
      { 'X-Request-ID': reqId, 'X-User-Identity': 'test-user' },
      () => {},
      new AbortController().signal
    );

    // Expect fetch to have been called with the correct headers
    expect(fetchMock).toHaveBeenCalled();
    const fetchArgs = fetchMock.mock.calls[0];
    expect(fetchArgs[1].headers).toHaveProperty('X-Request-ID', reqId);
  });
});
