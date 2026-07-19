import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { WebSocket } from 'ws';

describe('Security Audit Logging', () => {
  let app: any;
  let loggedEvents: any[] = [];

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
              loggedEvents.push(JSON.parse(msg));
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
    expect(audit.details.reason).toContain('Invalid API key');
  });

  it('should log rate_limit_violation audit event and reject message when limit is exceeded', async () => {
    // Set low rate limit params
    process.env.RATE_LIMIT_MAX_TOKENS = '1';
    process.env.RATE_LIMIT_REFILL_RATE = '0';

    // Start listening to allow websocket connection
    await app.listen({ port: 0 });
    const address = app.server.address() as any;
    const wsUrl = `ws://localhost:${address.port}/api/v1/ws/chat?apiKey=super-secret-key`;

    const ws = new WebSocket(wsUrl);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // First message consumes the 1 token
        ws.send('message 1');
        // Second message violates the rate limit
        ws.send('message 2');
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Malformed JSON (since we sent 'message 1' which is not JSON) will trigger a BAD_REQUEST
        // or a RATE_LIMIT_EXCEEDED
        if (msg.payload && msg.payload.code === 'RATE_LIMIT_EXCEEDED') {
          ws.close();
          resolve();
        }
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
    expect(audit.details.sessionId).toBeDefined();
  });
});
