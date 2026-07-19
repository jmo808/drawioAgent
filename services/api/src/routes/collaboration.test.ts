import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { WebSocket } from 'ws';
import { AddressInfo } from 'net';
import { MockAgent, setGlobalDispatcher } from 'undici';

const hoisted = vi.hoisted(() => {
  class InMemoryRedisMock {
    public store: Record<string, any> = {};
    public status = 'ready';

    private static listeners: Record<string, any[]> = {};
    private static subscriptions: Record<string, InMemoryRedisMock[]> = {};

    on(event: string, handler: any) {
      if (event === 'connect' || event === 'ready') {
        setTimeout(() => handler(), 0);
      }
      if (event === 'message') {
        if (!InMemoryRedisMock.listeners['message']) {
          InMemoryRedisMock.listeners['message'] = [];
        }
        InMemoryRedisMock.listeners['message'].push(handler);
      }
      return this;
    }

    async ping(): Promise<string> {
      return 'PONG';
    }

    async quit(): Promise<void> {}

    async get(key: string): Promise<string | null> {
      const val = this.store[key];
      if (typeof val === 'string') return val;
      return null;
    }

    async set(key: string, val: string, ...options: any[]): Promise<'OK' | null> {
      const nx = options.includes('NX');
      if (nx && key in this.store) {
        return null;
      }
      this.store[key] = val;
      return 'OK';
    }

    async eval(script: string, numkeys: number, ...args: string[]): Promise<any> {
      if (script.includes('redis.call') && numkeys === 1) {
        const key = args[0];
        const owner = args[1];
        if (this.store[key] === owner) {
          delete this.store[key];
          return 1;
        }
        return 0;
      }
      return 0;
    }

    async del(key: string): Promise<number> {
      let deleted = 0;
      if (key in this.store) {
        delete this.store[key];
        deleted = 1;
      }
      if (key.endsWith('*')) {
        const prefix = key.slice(0, -1);
        for (const k of Object.keys(this.store)) {
          if (k.startsWith(prefix)) {
            delete this.store[k];
            deleted++;
          }
        }
      }
      return deleted;
    }

    async exists(key: string): Promise<number> {
      return key in this.store ? 1 : 0;
    }

    async expire(key: string, seconds: number): Promise<number> {
      return key in this.store ? 1 : 0;
    }

    async hset(key: string, fieldOrObject: string | Record<string, any>, value?: string): Promise<number> {
      if (!this.store[key]) {
        this.store[key] = {};
      }
      if (typeof fieldOrObject === 'object') {
        for (const [k, v] of Object.entries(fieldOrObject)) {
          this.store[key][k] = String(v);
        }
      } else if (value !== undefined) {
        this.store[key][fieldOrObject] = String(value);
      }
      return 1;
    }

    async hdel(key: string, field: string): Promise<number> {
      if (this.store[key] && this.store[key][field]) {
        delete this.store[key][field];
        return 1;
      }
      return 0;
    }

    async hget(key: string, field: string): Promise<string | null> {
      return this.store[key] && this.store[key][field] ? this.store[key][field] : null;
    }

    async hgetall(key: string): Promise<Record<string, string>> {
      return this.store[key] || {};
    }

    async hlen(key: string): Promise<number> {
      return this.store[key] ? Object.keys(this.store[key]).length : 0;
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
      if (!this.store[key]) {
        this.store[key] = [];
      }
      this.store[key].unshift(...values);
      return this.store[key].length;
    }

    async rpush(key: string, ...values: string[]): Promise<number> {
      if (!this.store[key]) {
        this.store[key] = [];
      }
      this.store[key].push(...values);
      return this.store[key].length;
    }

    async lpop(key: string): Promise<string | null> {
      if (!this.store[key] || this.store[key].length === 0) return null;
      return this.store[key].shift();
    }

    async ltrim(key: string, start: number, end: number): Promise<'OK'> {
      if (this.store[key]) {
        const list = this.store[key];
        const actualEnd = end < 0 ? list.length + end + 1 : end + 1;
        this.store[key] = list.slice(start, actualEnd);
      }
      return 'OK';
    }

    async lrange(key: string, start: number, end: number): Promise<string[]> {
      if (!this.store[key]) return [];
      const list = this.store[key];
      const actualEnd = end < 0 ? list.length + end + 1 : end + 1;
      return list.slice(start, actualEnd);
    }

    async publish(channel: string, message: string): Promise<number> {
      const subs = InMemoryRedisMock.subscriptions[channel];
      if (subs) {
        const handlers = InMemoryRedisMock.listeners['message'];
        if (handlers) {
          for (const handler of handlers) {
            // Trigger asynchronous call to simulate real event loop microtasks
            setTimeout(() => handler(channel, message), 0);
          }
        }
      }
      return 1;
    }

    async subscribe(channel: string): Promise<void> {
      if (!InMemoryRedisMock.subscriptions[channel]) {
        InMemoryRedisMock.subscriptions[channel] = [];
      }
      InMemoryRedisMock.subscriptions[channel].push(this);
    }

    async unsubscribe(channel: string): Promise<void> {
      if (InMemoryRedisMock.subscriptions[channel]) {
        InMemoryRedisMock.subscriptions[channel] = InMemoryRedisMock.subscriptions[channel].filter(sub => sub !== this);
      }
    }

    static clearSubscriptions() {
      InMemoryRedisMock.listeners = {};
      InMemoryRedisMock.subscriptions = {};
    }

    multi() {
      const chain: any = {};
      const operations: Array<() => Promise<any>> = [];

      chain.hset = (key: string, fieldOrObject: string | Record<string, any>, value?: string) => {
        operations.push(() => this.hset(key, fieldOrObject, value));
        return chain;
      };
      chain.set = (key: string, val: string) => {
        operations.push(() => this.set(key, val));
        return chain;
      };
      chain.expire = (key: string, seconds: number) => {
        operations.push(() => this.expire(key, seconds));
        return chain;
      };
      chain.del = (key: string) => {
        operations.push(() => this.del(key));
        return chain;
      };
      chain.exec = async () => {
        const results = [];
        for (const op of operations) {
          results.push(await op());
        }
        return results;
      };

      return chain;
    }
  }

  return {
    mockRedisInstance: new InMemoryRedisMock(),
    InMemoryRedisMock,
  };
});

vi.mock('ioredis', () => {
  class MockRedis {
    constructor() {
      return hoisted.mockRedisInstance;
    }
  }
  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

describe('Collaboration & Queue Routing in WebSockets', () => {
  let app: any;
  let url: string;
  let mockAgent: MockAgent;

  beforeEach(async () => {
    process.env.API_KEY = 'super-secret-key';
    process.env.AGENT_SERVICE_URL = 'http://localhost:8000';
    process.env.COLLABORATION_ENABLED = 'true';

    // Clear the mock store & subscriptions
    hoisted.mockRedisInstance.store = {};
    hoisted.InMemoryRedisMock.clearSubscriptions();

    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    mockAgent.enableNetConnect(/(localhost|127\.0\.0\.1)/);
    setGlobalDispatcher(mockAgent);

    app = Fastify();
    await buildApp(app);
    await app.listen({ port: 0 });
    const address = app.server.address() as AddressInfo;
    url = `ws://localhost:${address.port}/api/v1/ws/chat`;
  });

  afterEach(async () => {
    delete process.env.COLLABORATION_ENABLED;
    await app.close();
    mockAgent.assertNoPendingInterceptors();
  });

  it('should support session_create and return session_state', async () => {
    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'session_create',
          payload: { displayName: 'Alice' },
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        expect(msg.type).toBe('session_state');
        expect(msg.payload.sessionId).toBeDefined();
        expect(msg.payload.shortCode).toBeDefined();
        expect(msg.payload.members.length).toBe(1);
        expect(msg.payload.members[0].displayName).toBe('Alice');
        ws.close();
        resolve();
      });

      ws.on('error', (err) => reject(err));
    });
  });

  it('should support session_join and session_leave', async () => {
    // Manually setup a session in mocked Valkey
    const sessionId = 'session-123';
    await hoisted.mockRedisInstance.hset('session:session-123:meta', {
      creator: 'Alice',
      created_at: new Date().toISOString(),
      short_code: 'code12',
    });
    await hoisted.mockRedisInstance.set('session:session-123:diagram', 'diagram-xml');

    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'session_join',
          payload: { sessionId: 'session-123', displayName: 'Bob' },
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'session_state') {
          expect(msg.payload.sessionId).toBe('session-123');
          expect(msg.payload.diagramXml).toBe('diagram-xml');
          expect(msg.payload.members.some((m: any) => m.displayName === 'Bob')).toBe(true);

          // Now send session_leave
          ws.send(JSON.stringify({
            type: 'session_leave',
            payload: { sessionId: 'session-123' },
            timestamp: new Date().toISOString()
          }));

          setTimeout(() => {
            ws.close();
            resolve();
          }, 50);
        }
      });

      ws.on('error', (err) => reject(err));
    });
  });

  it('should queue chat messages when AI lock is held and execute sequentially', async () => {
    const sessionId = 'session-999';
    await hoisted.mockRedisInstance.hset('session:session-999:meta', {
      creator: 'Alice',
      created_at: new Date().toISOString(),
      short_code: 'code99',
    });

    const client = mockAgent.get('http://localhost:8000');

    client.intercept({
      path: '/api/v1/chat',
      method: 'POST',
      body: (value) => JSON.parse(value).message === 'Alice prompt'
    }).reply(200, 'event: chat_message\ndata: {"text":"Response to Alice"}\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    }).delay(100);

    client.intercept({
      path: '/api/v1/chat',
      method: 'POST',
      body: (value) => JSON.parse(value).message === 'Bob prompt'
    }).reply(200, 'event: chat_message\ndata: {"text":"Response to Bob"}\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    });

    const wsAlice = new WebSocket(`${url}?apiKey=super-secret-key`);
    const wsBob = new WebSocket(`${url}?apiKey=super-secret-key`);

    await new Promise<void>((resolve, reject) => {
      let aliceStateReceived = false;
      let bobStateReceived = false;

      wsAlice.on('open', () => {
        wsAlice.send(JSON.stringify({
          type: 'session_join',
          payload: { sessionId: 'session-999', displayName: 'Alice' },
          timestamp: new Date().toISOString()
        }));
      });

      wsBob.on('open', () => {
        wsBob.send(JSON.stringify({
          type: 'session_join',
          payload: { sessionId: 'session-999', displayName: 'Bob' },
          timestamp: new Date().toISOString()
        }));
      });

      let bobQueuedNotificationReceived = false;

      const handleBobMsg = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'session_state') {
          bobStateReceived = true;
          triggerMessages();
        }
        if (msg.type === 'chat_message' && msg.payload.text?.includes('queued')) {
          bobQueuedNotificationReceived = true;
        }
      };

      const handleAliceMsg = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'session_state') {
          aliceStateReceived = true;
          triggerMessages();
        }
      };

      wsAlice.on('message', handleAliceMsg);
      wsBob.on('message', handleBobMsg);

      const triggerMessages = () => {
        if (!aliceStateReceived || !bobStateReceived) return;
        aliceStateReceived = false;
        bobStateReceived = false;

        wsAlice.send(JSON.stringify({
          type: 'chat_message',
          payload: { text: 'Alice prompt' },
          id: 'msg-alice',
          timestamp: new Date().toISOString()
        }));

        setTimeout(() => {
          wsBob.send(JSON.stringify({
            type: 'chat_message',
            payload: { text: 'Bob prompt' },
            id: 'msg-bob',
            timestamp: new Date().toISOString()
          }));
        }, 10);
      };

      wsBob.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'chat_message' && msg.payload.text === 'Response to Bob') {
          expect(bobQueuedNotificationReceived).toBe(true);
          wsAlice.close();
          wsBob.close();
          resolve();
        }
      });

      wsAlice.on('error', reject);
      wsBob.on('error', reject);
    });
  });

  it('should set member to disconnected on connection close', async () => {
    const sessionId = 'session-888';
    await hoisted.mockRedisInstance.hset('session:session-888:meta', {
      creator: 'Alice',
      created_at: new Date().toISOString(),
      short_code: 'code88',
    });

    const ws = new WebSocket(`${url}?apiKey=super-secret-key`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'session_join',
          payload: { sessionId: 'session-888', displayName: 'Alice' },
          timestamp: new Date().toISOString()
        }));
      });

      ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'session_state') {
          const connId = msg.payload.members[0].connId;
          ws.close();

          setTimeout(async () => {
            const memberRaw = await hoisted.mockRedisInstance.hget('session:session-888:members', connId);
            expect(memberRaw).toBeDefined();
            const member = JSON.parse(memberRaw);
            expect(member.disconnected).toBe(true);
            resolve();
          }, 100);
        }
      });

      ws.on('error', reject);
    });
  });
});
