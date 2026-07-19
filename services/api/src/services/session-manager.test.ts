import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from './session-manager.js';
import Redis from 'ioredis';

// Simple in-memory mock of Redis client to avoid network dependencies
class InMemoryRedisMock {
  public store: Record<string, any> = {};

  async get(key: string): Promise<string | null> {
    const val = this.store[key];
    if (typeof val === 'string') return val;
    return null;
  }

  async set(key: string, val: string): Promise<'OK'> {
    this.store[key] = val;
    return 'OK';
  }

  async del(key: string): Promise<number> {
    let deleted = 0;
    if (key in this.store) {
      delete this.store[key];
      deleted = 1;
    }
    // Handle wildcard delete for session cleanup
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

  async ltrim(key: string, start: number, end: number): Promise<'OK'> {
    if (this.store[key]) {
      // Simplistic trim handling
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

describe('SessionManager Service', () => {
  let mockRedis: InMemoryRedisMock;
  let sessionManager: SessionManager;

  beforeEach(() => {
    mockRedis = new InMemoryRedisMock();
    sessionManager = new SessionManager(mockRedis as unknown as Redis, {
      maxMembers: 3,
      ttlHours: 1,
    });
  });

  it('should generate UUID + 6-char short code when creating a session', async () => {
    const { sessionId, shortCode } = await sessionManager.createSession('Alice');

    expect(sessionId).toBeDefined();
    expect(sessionId.length).toBe(36); // UUID length
    expect(shortCode).toBeDefined();
    expect(shortCode.length).toBe(6); // nanoid(6) length

    // Check Valkey storage
    const shortCodeMapping = await mockRedis.get(`shortcode:${shortCode}`);
    expect(shortCodeMapping).toBe(sessionId);

    const meta = await mockRedis.hgetall(`session:${sessionId}:meta`);
    expect(meta.creator).toBe('Alice');
    expect(meta.short_code).toBe(shortCode);
  });

  it('should join a session by UUID and add member', async () => {
    const { sessionId } = await sessionManager.createSession('Alice');
    
    // Bob joins by UUID
    const res = await sessionManager.joinSession(sessionId, 'conn-bob', 'Bob');
    
    expect(res.sessionId).toBe(sessionId);
    expect(res.members.length).toBe(1); // Wait, should creator be joined automatically?
    // Let's assume creator joins automatically on create, or separately. Let's make joinSession verify members.
    const members = await mockRedis.hgetall(`session:${sessionId}:members`);
    expect(members['conn-bob']).toBeDefined();
    const bobObj = JSON.parse(members['conn-bob']);
    expect(bobObj.name).toBe('Bob');
  });

  it('should resolve short code and join session', async () => {
    const { sessionId, shortCode } = await sessionManager.createSession('Alice');

    // Bob joins by short code
    const res = await sessionManager.joinSession(shortCode, 'conn-bob', 'Bob');

    expect(res.sessionId).toBe(sessionId);
    const members = await mockRedis.hgetall(`session:${sessionId}:members`);
    expect(members['conn-bob']).toBeDefined();
  });

  it('should reject join when session is at max capacity', async () => {
    const { sessionId } = await sessionManager.createSession('Alice');

    await sessionManager.joinSession(sessionId, 'conn-1', 'User 1');
    await sessionManager.joinSession(sessionId, 'conn-2', 'User 2');
    await sessionManager.joinSession(sessionId, 'conn-3', 'User 3');

    // 4th member should be rejected (maxMembers is set to 3 in beforeEach)
    await expect(sessionManager.joinSession(sessionId, 'conn-4', 'User 4'))
      .rejects.toThrow('Session is full (max 3 members)');
  });

  it('should return session state (diagram, chat, members) upon joining', async () => {
    const { sessionId } = await sessionManager.createSession('Alice');
    await mockRedis.set(`session:${sessionId}:diagram`, '<xml>diagram</xml>');
    await mockRedis.lpush(`session:${sessionId}:chat`, JSON.stringify({ text: 'Hello', senderName: 'Alice' }));

    const res = await sessionManager.joinSession(sessionId, 'conn-bob', 'Bob');
    expect(res.diagramXml).toBe('<xml>diagram</xml>');
    expect(res.chatHistory.length).toBe(1);
    expect(res.chatHistory[0].text).toBe('Hello');
  });

  it('should remove member on leave', async () => {
    const { sessionId } = await sessionManager.createSession('Alice');
    await sessionManager.joinSession(sessionId, 'conn-bob', 'Bob');
    await sessionManager.joinSession(sessionId, 'conn-charlie', 'Charlie');

    const empty = await sessionManager.leaveSession(sessionId, 'conn-bob');
    expect(empty).toBe(false);

    const members = await mockRedis.hgetall(`session:${sessionId}:members`);
    expect(members['conn-bob']).toBeUndefined();
    expect(members['conn-charlie']).toBeDefined();
  });

  it('should delete all session keys when the last member leaves', async () => {
    const { sessionId, shortCode } = await sessionManager.createSession('Alice');
    await sessionManager.joinSession(sessionId, 'conn-bob', 'Bob');

    // Bob leaves (the only member)
    const empty = await sessionManager.leaveSession(sessionId, 'conn-bob');
    expect(empty).toBe(true);

    // Verify all keys are deleted
    expect(await mockRedis.get(`shortcode:${shortCode}`)).toBeNull();
    expect(await mockRedis.hgetall(`session:${sessionId}:meta`)).toEqual({});
    expect(await mockRedis.hgetall(`session:${sessionId}:members`)).toEqual({});
  });
});
