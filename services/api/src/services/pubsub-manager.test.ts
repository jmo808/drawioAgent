import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PubSubManager } from './pubsub-manager.js';
import Redis from 'ioredis';

// Simple in-memory mock of Redis client to avoid network dependencies
class InMemoryRedisMock {
  store: Record<string, unknown> = {};
  subscriptions = new Set<string>();
  publishedMessages: { channel: string, message: string }[] = [];
  listeners: Record<string, Array<(channel: string, message: string) => void>> = {};
  lists: Record<string, string[]> = {};

  async set(key: string, val: string): Promise<'OK'> {
    this.store[key] = val;
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const val = this.store[key];
    if (typeof val === 'string') return val;
    return null;
  }

  async lpush(key: string, ...vals: string[]): Promise<number> {
    if (!this.lists[key]) this.lists[key] = [];
    // LPUSH prepends values. In redis, `LPUSH k v1 v2` results in `v2 v1`.
    for (const val of vals) {
      this.lists[key].unshift(val);
    }
    return this.lists[key].length;
  }

  async ltrim(key: string, start: number, stop: number): Promise<'OK'> {
    if (!this.lists[key]) return 'OK';
    const s = start < 0 ? this.lists[key].length + start : start;
    const e = stop < 0 ? this.lists[key].length + stop : stop;
    this.lists[key] = this.lists[key].slice(s, e + 1);
    return 'OK';
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.lists[key]) return [];
    const s = start < 0 ? this.lists[key].length + start : start;
    const e = stop < 0 ? this.lists[key].length + stop : stop;
    return this.lists[key].slice(s, e + 1);
  }

  // We will link the publisher to the subscriber in the test setup
  linkedSubscriber?: InMemoryRedisMock;

  async publish(channel: string, message: string): Promise<number> {
    this.publishedMessages.push({ channel, message });
    const sub = this.linkedSubscriber;
    if (sub && sub.subscriptions.has(channel)) {
      if (sub.listeners['message']) {
        for (const listener of sub.listeners['message']) {
          listener(channel, message);
        }
      }
    }
    return 1;
  }

  async subscribe(channel: string): Promise<number> {
    this.subscriptions.add(channel);
    return 1;
  }

  async unsubscribe(channel: string): Promise<number> {
    this.subscriptions.delete(channel);
    return 1;
  }

  on(event: string, listener: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }
}

describe('PubSubManager Service', () => {
  let mockRedis: InMemoryRedisMock;
  let mockSubscriber: InMemoryRedisMock;
  let pubsubManager: PubSubManager;

  beforeEach(() => {
    mockRedis = new InMemoryRedisMock();
    mockSubscriber = new InMemoryRedisMock();
    mockRedis.linkedSubscriber = mockSubscriber;
    pubsubManager = new PubSubManager(
      mockRedis as unknown as Redis,
      mockSubscriber as unknown as Redis
    );
  });

  it('should subscribe to session channel on first join and unsubscribe on last leave', async () => {
    const mockSocket1 = { send: vi.fn() };
    const mockSocket2 = { send: vi.fn() };

    // First user joins
    await pubsubManager.subscribeToSession('sess-1', mockSocket1 as any, 'conn-1');
    expect(mockSubscriber.subscriptions.has('session:sess-1:events')).toBe(true);

    // Second user joins same session
    await pubsubManager.subscribeToSession('sess-1', mockSocket2 as any, 'conn-2');
    // Still subscribed, shouldn't subscribe again (implementation detail, but conceptually correct)
    expect(mockSubscriber.subscriptions.has('session:sess-1:events')).toBe(true);

    // First user leaves
    pubsubManager.unsubscribeFromSession('sess-1', 'conn-1');
    // Still one user left, so still subscribed
    expect(mockSubscriber.subscriptions.has('session:sess-1:events')).toBe(true);

    // Second user leaves
    pubsubManager.unsubscribeFromSession('sess-1', 'conn-2');
    // No one left, should be unsubscribed
    expect(mockSubscriber.subscriptions.has('session:sess-1:events')).toBe(false);
  });

  it('should publish diagram update and persist to valkey', async () => {
    await pubsubManager.broadcastDiagramUpdate('sess-1', '<xml/>', 'conn-1', 'Alice');

    // Check persistence
    expect(mockRedis.store['session:sess-1:diagram']).toBe('<xml/>');

    // Check published message
    expect(mockRedis.publishedMessages.length).toBe(1);
    expect(mockRedis.publishedMessages[0].channel).toBe('session:sess-1:events');
    const msg = JSON.parse(mockRedis.publishedMessages[0].message);
    expect(msg.type).toBe('diagram_broadcast');
    expect(msg.payload.diagramXml).toBe('<xml/>');
    expect(msg.senderConnId).toBe('conn-1');
    expect(msg.senderName).toBe('Alice');
  });

  it('should forward received broadcast to session members except sender', async () => {
    const mockSocket1 = { send: vi.fn(), readyState: 1 /* OPEN */ };
    const mockSocket2 = { send: vi.fn(), readyState: 1 /* OPEN */ };
    const mockSocket3 = { send: vi.fn(), readyState: 1 /* OPEN */ };

    await pubsubManager.subscribeToSession('sess-1', mockSocket1 as any, 'conn-1');
    await pubsubManager.subscribeToSession('sess-1', mockSocket2 as any, 'conn-2');
    await pubsubManager.subscribeToSession('sess-2', mockSocket3 as any, 'conn-3');

    // conn-1 broadcasts
    await pubsubManager.broadcastDiagramUpdate('sess-1', '<xml/>', 'conn-1', 'Alice');

    // conn-1 shouldn't receive their own broadcast
    expect(mockSocket1.send).not.toHaveBeenCalled();

    // conn-2 should receive it (same session)
    expect(mockSocket2.send).toHaveBeenCalledTimes(1);
    const sentMsg = JSON.parse((mockSocket2.send as any).mock.calls[0][0]);
    expect(sentMsg.type).toBe('diagram_broadcast');
    expect(sentMsg.payload.diagramXml).toBe('<xml/>');

    // conn-3 shouldn't receive it (different session)
    expect(mockSocket3.send).not.toHaveBeenCalled();
  });

  it('should push chat message and cap at 500', async () => {
    // Fill with 500 items
    for (let i = 0; i < 500; i++) {
      await pubsubManager.broadcastChatMessage('sess-2', `msg${i}`, 'conn-1', 'Alice');
    }

    expect(mockRedis.lists['session:sess-2:chat'].length).toBe(500);

    // Add 10 more
    for (let i = 0; i < 10; i++) {
      await pubsubManager.broadcastChatMessage('sess-2', `newmsg${i}`, 'conn-1', 'Alice');
    }

    // Should still be 500 due to LTRIM
    expect(mockRedis.lists['session:sess-2:chat'].length).toBe(500);

    // The most recent one (last added) should be at index 0 because of LPUSH
    const mostRecent = JSON.parse(mockRedis.lists['session:sess-2:chat'][0]);
    expect(mostRecent.message).toBe('newmsg9');
  });

  it('should broadcast chat message to event channel', async () => {
    await pubsubManager.broadcastChatMessage('sess-3', 'hello', 'conn-1', 'Alice');
    expect(mockRedis.publishedMessages.length).toBe(1);
    expect(mockRedis.publishedMessages[0].channel).toBe('session:sess-3:events');
    
    const msg = JSON.parse(mockRedis.publishedMessages[0].message);
    expect(msg.type).toBe('chat_message');
    expect(msg.payload.text).toBe('hello');
    expect(msg.senderConnId).toBe('conn-1');
    expect(msg.senderName).toBe('Alice');
  });

  it('should return chat history in chronological order', async () => {
    await pubsubManager.broadcastChatMessage('sess-4', 'msg1', 'conn-1', 'Alice');
    await pubsubManager.broadcastChatMessage('sess-4', 'msg2', 'conn-1', 'Alice');
    await pubsubManager.broadcastChatMessage('sess-4', 'msg3', 'conn-1', 'Alice');

    const history = await pubsubManager.getChatHistory('sess-4');
    expect(history.length).toBe(3);
    expect(history[0].message).toBe('msg1');
    expect(history[1].message).toBe('msg2');
    expect(history[2].message).toBe('msg3');
  });
});
