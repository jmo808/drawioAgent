import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { WebSocket } from 'ws';
import { AddressInfo } from 'net';

describe('WebSocket /ws/chat Endpoint', () => {
  let app: any;
  let url: string;

  beforeEach(async () => {
    process.env.API_KEY = 'super-secret-key';
    app = Fastify();
    await buildApp(app);
    await app.listen({ port: 0 });
    const address = app.server.address() as AddressInfo;
    url = `ws://localhost:${address.port}/ws/chat`;
  });

  afterEach(async () => {
    await app.close();
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

  it('should handle round-trip of valid chat_message envelope', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'chat_message',
          payload: {
            text: 'create a flowchart'
          },
          id: 'test-id-123',
          timestamp: new Date().toISOString()
        }));
      });
      
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('tool_progress');
        expect(msg.id).toBe('test-id-123');
        expect(msg.payload.toolName).toBe('placeholder');
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
});
