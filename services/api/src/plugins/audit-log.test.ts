import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { WebSocket } from 'ws';
import { AddressInfo } from 'net';

describe('Security Audit Logging', () => {
  let app: ReturnType<typeof Fastify>;
  let loggedEvents: Record<string, unknown>[] = [];

  beforeEach(async () => {
    process.env.API_KEY = 'super-secret-key';
    loggedEvents = [];

    // Create fastify with a custom stream logger to capture pino logs
    app = Fastify({
      requestIdHeader: 'x-request-id',
      logger: {
        level: 'info',
        stream: {
          write: (msg: string) => {
            try {
              loggedEvents.push(JSON.parse(msg) as Record<string, unknown>);
            } catch {}
          }
        }
      }
    });

    await buildApp(app);

    app.get('/test-secure', async () => {
      return { secure: true };
    });
  });

  afterEach(async () => {
    delete process.env.API_KEY;
    delete process.env.RATE_LIMIT_MAX_TOKENS;
    delete process.env.RATE_LIMIT_REFILL_RATE;
    if (app) {
      await app.close();
    }
  });

  it('should log auth_success audit event with correct details and correlation ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        'x-api-key': 'super-secret-key',
        'x-request-id': 'req-id-123'
      }
    });

    expect(res.statusCode).toBe(200);

    const auditLogs = loggedEvents.filter(log => log.audit === true && log.eventType === 'auth_success');
    expect(auditLogs.length).toBe(1);
    const audit = auditLogs[0];
    expect(audit.userIdentity).toBe('apikey-client');
    expect(audit.requestId).toBe('req-id-123');
    expect(audit.clientIp).toBeDefined();
  });

  it('should log auth_failure audit event with client IP and reason on failure', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        'x-api-key': 'wrong-key',
        'x-request-id': 'req-id-456'
      }
    });

    expect(res.statusCode).toBe(403);

    const auditLogs = loggedEvents.filter(log => log.audit === true && log.eventType === 'auth_failure');
    expect(auditLogs.length).toBe(1);
    const audit = auditLogs[0];
    expect(audit.requestId).toBe('req-id-456');
    expect(audit.clientIp).toBeDefined();
    expect(typeof audit.details === 'object' && audit.details !== null && (audit.details as Record<string, string>).reason).toContain('Invalid API key');
  });

  it('should log rate_limit_violation audit event and reject message when limit is exceeded', async () => {
    // Set low rate limit params
    process.env.RATE_LIMIT_MAX_TOKENS = '1';
    process.env.RATE_LIMIT_REFILL_RATE = '0';

    // Start listening to allow websocket connection
    await app.listen({ port: 0 });
    const address = app.server.address() as AddressInfo;
    const wsUrl = `ws://localhost:${address.port}/api/v1/ws/chat?apiKey=super-secret-key`;

    const ws = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        const msg1 = JSON.stringify({
          type: 'chat_message',
          payload: { text: 'message 1' },
          timestamp: new Date().toISOString()
        });
        const msg2 = JSON.stringify({
          type: 'chat_message',
          payload: { text: 'message 2' },
          timestamp: new Date().toISOString()
        });
        // First message consumes the 1 token
        ws.send(msg1);
        // Second message violates the rate limit
        ws.send(msg2);
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.payload && msg.payload.code === 'RATE_LIMIT_EXCEEDED') {
            ws.close();
            resolve();
          }
        } catch {}
      });

      ws.on('error', (err) => {
        reject(err);
      });

      // Timeout safety
      setTimeout(() => {
        ws.close();
        reject(new Error('Rate limit test timed out'));
      }, 5000);
    });

    const auditLogs = loggedEvents.filter(log => log.audit === true && log.eventType === 'rate_limit_violation');
    expect(auditLogs.length).toBe(1);
    const audit = auditLogs[0];
    expect(audit.clientIp).toBeDefined();
    expect(typeof audit.details === 'object' && audit.details !== null && (audit.details as Record<string, string>).sessionId).toBeDefined();
  });
});
