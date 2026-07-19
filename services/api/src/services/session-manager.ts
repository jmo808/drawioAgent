import { Redis } from 'ioredis';
import crypto from 'crypto';

export interface SessionMember {
  connId: string;
  name: string;
  joinedAt: string;
  lastSeen: number;
  disconnected?: boolean;
}

export interface SessionState {
  sessionId: string;
  shortCode: string;
  members: SessionMember[];
  chatHistory: any[];
  diagramXml: string | null;
}

export interface SessionConfig {
  maxMembers?: number;
  ttlHours?: number;
}

/**
 * Service to manage real-time multi-user collaboration sessions in Valkey.
 */
export class SessionManager {
  private readonly valkey: Redis;
  private readonly maxMembers: number;
  private readonly ttlSeconds: number;

  constructor(valkey: Redis, config?: SessionConfig) {
    this.valkey = valkey;
    this.maxMembers = config?.maxMembers || 10;
    const ttlHours = config?.ttlHours || 24;
    this.ttlSeconds = ttlHours * 60 * 60;
  }

  /**
   * Generates a random 6-character alphanumeric short code.
   */
  private generateShortCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  /**
   * Creates a new collaboration session.
   */
  async createSession(creatorDisplayName: string): Promise<{ sessionId: string; shortCode: string }> {
    const sessionId = crypto.randomUUID();
    const shortCode = this.generateShortCode();

    const pipeline = this.valkey.multi();
    
    // Set short code mapping
    pipeline.set(`shortcode:${shortCode}`, sessionId);
    pipeline.expire(`shortcode:${shortCode}`, this.ttlSeconds);

    // Set metadata hash
    pipeline.hset(`session:${sessionId}:meta`, {
      creator: creatorDisplayName,
      created_at: new Date().toISOString(),
      short_code: shortCode,
      title: 'Collaborative Diagram',
    });
    pipeline.expire(`session:${sessionId}:meta`, this.ttlSeconds);

    // Initialize empty diagram XML placeholder
    pipeline.set(`session:${sessionId}:diagram`, '');
    pipeline.expire(`session:${sessionId}:diagram`, this.ttlSeconds);

    await pipeline.exec();

    return { sessionId, shortCode };
  }

  /**
   * Adds a member to a session and returns the session state.
   */
  async joinSession(
    sessionIdOrCode: string,
    connId: string,
    displayName: string
  ): Promise<SessionState> {
    let sessionId = sessionIdOrCode;
    let shortCode = '';

    // If it's a 6-character code, resolve it
    if (sessionIdOrCode.length === 6) {
      const resolved = await this.valkey.get(`shortcode:${sessionIdOrCode}`);
      if (!resolved) {
        throw new Error(`Session code '${sessionIdOrCode}' not found`);
      }
      sessionId = resolved;
      shortCode = sessionIdOrCode;
    }

    // Verify session meta exists
    const meta = await this.valkey.hgetall(`session:${sessionId}:meta`);
    if (!meta || Object.keys(meta).length === 0) {
      throw new Error(`Session '${sessionId}' not found`);
    }
    shortCode = meta.short_code;

    // Check capacity
    const currentMemberCount = await this.valkey.hlen(`session:${sessionId}:members`);
    if (currentMemberCount >= this.maxMembers) {
      throw new Error(`Session is full (max ${this.maxMembers} members)`);
    }

    // Add/Update member in members hash
    const memberObj: SessionMember = {
      connId,
      name: displayName,
      joinedAt: new Date().toISOString(),
      lastSeen: Date.now(),
    };
    await this.valkey.hset(`session:${sessionId}:members`, connId, JSON.stringify(memberObj));

    // Refresh TTL on all keys
    await this.refreshTTL(sessionId, shortCode);

    // Fetch and return the state
    return await this.getSessionState(sessionId, shortCode);
  }

  /**
   * Removes a member from the session. If the session becomes empty, all keys are deleted.
   * @returns True if the session was emptied and deleted, false otherwise.
   */
  async leaveSession(sessionId: string, connId: string): Promise<boolean> {
    await this.valkey.hdel(`session:${sessionId}:members`, connId);
    
    // Check if session is empty
    const remainingCount = await this.valkey.hlen(`session:${sessionId}:members`);
    if (remainingCount === 0) {
      // Get metadata to retrieve short code
      const meta = await this.valkey.hgetall(`session:${sessionId}:meta`);
      const shortCode = meta?.short_code;

      const pipeline = this.valkey.multi();
      pipeline.del(`session:${sessionId}:meta`);
      pipeline.del(`session:${sessionId}:members`);
      pipeline.del(`session:${sessionId}:chat`);
      pipeline.del(`session:${sessionId}:diagram`);
      pipeline.del(`session:${sessionId}:lock`);
      if (shortCode) {
        pipeline.del(`shortcode:${shortCode}`);
      }
      await pipeline.exec();
      return true;
    }

    return false;
  }

  /**
   * Refreshes the session TTL across all keys.
   */
  async refreshTTL(sessionId: string, shortCode?: string): Promise<void> {
    let resolvedShortCode = shortCode;
    if (!resolvedShortCode) {
      const meta = await this.valkey.hgetall(`session:${sessionId}:meta`);
      resolvedShortCode = meta?.short_code;
    }

    const pipeline = this.valkey.multi();
    pipeline.expire(`session:${sessionId}:meta`, this.ttlSeconds);
    pipeline.expire(`session:${sessionId}:members`, this.ttlSeconds);
    pipeline.expire(`session:${sessionId}:chat`, this.ttlSeconds);
    pipeline.expire(`session:${sessionId}:diagram`, this.ttlSeconds);
    pipeline.expire(`session:${sessionId}:lock`, this.ttlSeconds);
    if (resolvedShortCode) {
      pipeline.expire(`shortcode:${resolvedShortCode}`, this.ttlSeconds);
    }
    await pipeline.exec();
  }

  /**
   * Retrieves the current state of the session.
   */
  async getSessionState(sessionId: string, shortCode?: string): Promise<SessionState> {
    let resolvedShortCode = shortCode;
    if (!resolvedShortCode) {
      const meta = await this.valkey.hgetall(`session:${sessionId}:meta`);
      resolvedShortCode = meta?.short_code || '';
    }

    // Get diagram XML
    const diagramXml = await this.valkey.get(`session:${sessionId}:diagram`);

    // Get members
    const membersRaw = await this.valkey.hgetall(`session:${sessionId}:members`);
    const members: SessionMember[] = [];
    for (const raw of Object.values(membersRaw)) {
      try {
        members.push(JSON.parse(raw));
      } catch (err) {
        // Skip malformed entries
      }
    }

    // Get chat history (capped at 500 in plan/spec, fetched as list)
    const chatRaw = await this.valkey.lrange(`session:${sessionId}:chat`, 0, -1);
    const chatHistory = chatRaw.map((raw) => {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return raw;
      }
    });

    return {
      sessionId,
      shortCode: resolvedShortCode,
      members,
      chatHistory,
      diagramXml: diagramXml || null,
    };
  }

  /**
   * Acquires the AI serialization lock for a session.
   * Returns true if lock acquired, false if already held.
   */
  async acquireLock(sessionId: string, connId: string): Promise<boolean> {
    const result = await this.valkey.set(`session:${sessionId}:lock`, connId, 'EX', 60, 'NX');
    return result === 'OK';
  }

  /**
   * Releases the AI serialization lock if and only if it is held by the caller connection.
   * Returns true if successfully released, false otherwise.
   */
  async releaseLock(sessionId: string, connId: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.valkey.eval(script, 1, `session:${sessionId}:lock`, connId);
    return result === 1 || result === '1';
  }
}
