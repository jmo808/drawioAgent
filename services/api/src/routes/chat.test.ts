import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { WebSocket } from 'ws';
import { AddressInfo } from 'net';
import { MockAgent, setGlobalDispatcher } from 'undici';

describe('WebSocket /ws/chat Endpoint', () => {
  let app: any;
  let url: string;
  let mockAgent: MockAgent;

  beforeEach(async () => {
    process.env.API_KEY = 'super-secret-key';
    process.env.AGENT_SERVICE_URL = 'http://localhost:8000';
    
    // Set up undici mock agent
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    // Allow connecting to the local fastify server (random port)
    mockAgent.enableNetConnect(/(localhost|127\.0\.0\.1)/);
    setGlobalDispatcher(mockAgent);

    app = Fastify();
    await buildApp(app);
    await app.listen({ port: 0 });
    const address = app.server.address() as AddressInfo;
    url = `ws://localhost:${address.port}/ws/chat`;
  });

  afterEach(async () => {
    await app.close();
    mockAgent.assertNoPendingInterceptors();
  });

  it('should reject connection without API key', async () => {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.close();
        reject(new Error('Connection should have been rejected'));
      });
      ws.on('unexpected-response', (req, res) => {
        expect(res.statusCode).toBe(401);
        resolve();
      });
      ws.on('error', () => {
        resolve();
      });
    });
  });

  it('should accept connection with valid API key in query param', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should reject malformed JSON messages', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send('not-json');
      });
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('error');
        expect(msg.payload.code).toBe('BAD_REQUEST');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should reject messages failing schema validation', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'invalid_type',
          payload: {},
          timestamp: new Date().toISOString()
        }));
      });
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('error');
        expect(msg.payload.code).toBe('BAD_REQUEST');
        expect(msg.payload.message).toContain('schema');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should proxy chat_message to agent and relay SSE events to client', async () => {
    const client = mockAgent.get('http://localhost:8000');

    client.intercept({
      path: '/api/chat',
      method: 'POST',
      body: (value) => {
        const parsed = JSON.parse(value);
        return parsed.message === 'draw flowchart' && parsed.diagramXml === undefined && typeof parsed.sessionId === 'string';
      },
    }).reply(200, 'event: tool_progress\ndata: {"toolName":"test-tool"}\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    });

    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'chat_message',
          payload: { text: 'draw flowchart' },
          id: 'client-msg-456',
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('tool_progress');
        expect(msg.id).toBe('client-msg-456');
        expect(msg.payload.toolName).toBe('test-tool');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should return service unavailable error frame when agent is down', async () => {
    const client = mockAgent.get('http://localhost:8000');

    client.intercept({
      path: '/api/chat',
      method: 'POST'
    }).replyWithError(new Error('Connection refused'));

    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'chat_message',
          payload: { text: 'hello' },
          id: 'client-msg-789',
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('error');
        expect(msg.id).toBe('client-msg-789');
        expect(msg.payload.code).toBe('SERVICE_UNAVAILABLE');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('should reject connection with invalid data classification level', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key&classification=ultra-secret`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // Wait for connection close/error frame
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('error');
        expect(msg.payload.code).toBe('BAD_REQUEST');
        expect(msg.payload.message).toContain('classification');
      });
      ws.on('close', () => {
        resolve();
      });
      ws.on('error', () => {
        resolve();
      });
    });
  });

  it('should accept data classification level and forward it to agent', async () => {
    const client = mockAgent.get('http://localhost:8000');

    client.intercept({
      path: '/api/chat',
      method: 'POST',
      body: (value) => {
        const parsed = JSON.parse(value);
        return parsed.classification === 'confidential' && parsed.sessionId !== undefined;
      },
    }).reply(200, 'event: tool_progress\ndata: {"toolName":"test-tool"}\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    });

    const ws = new WebSocket(`${url}?apiKey=super-secret-key&classification=confidential`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'chat_message',
          payload: { text: 'hello' },
          id: 'client-msg-456',
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('tool_progress');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  });
});
