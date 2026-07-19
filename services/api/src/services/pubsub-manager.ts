import { Redis } from 'ioredis';
import { WebSocket } from 'ws';
import { WebSocketMessage } from '@drawio-agent/shared';

export class PubSubManager {
  private valkey: Redis;
  private subscriber: Redis;
  
  // Map of sessionId -> connId -> WebSocket
  private sessionSockets: Map<string, Map<string, WebSocket>> = new Map();

  constructor(valkeyClient: Redis, subscriberClient: Redis) {
    this.valkey = valkeyClient;
    this.subscriber = subscriberClient;

    // Listen for incoming pub/sub messages
    this.subscriber.on('message', this.handleMessage.bind(this));
  }

  private handleMessage(channel: string, message: string) {
    const match = channel.match(/^session:(.+):events$/);
    if (!match) return;
    
    const sessionId = match[1];
    const sockets = this.sessionSockets.get(sessionId);
    
    if (!sockets) return;

    try {
      const parsed = JSON.parse(message);
      // parsed should have senderConnId so we can skip sending back to the sender
      const senderConnId = parsed.senderConnId;
      
      const payloadStr = JSON.stringify(parsed);

      for (const [connId, socket] of sockets.entries()) {
        if (connId !== senderConnId && socket.readyState === WebSocket.OPEN) {
          socket.send(payloadStr);
        }
      }
    } catch (err) {
      console.error('Failed to parse incoming pub/sub message', err);
    }
  }

  /**
   * Subscribe a WebSocket connection to a session's event channel.
   * If this is the first connection for the session on this node, subscribes via Valkey.
   */
  public async subscribeToSession(sessionId: string, socket: WebSocket, connId: string): Promise<void> {
    let sockets = this.sessionSockets.get(sessionId);
    if (!sockets) {
      sockets = new Map();
      this.sessionSockets.set(sessionId, sockets);
      // Subscribe to the channel in Valkey
      await this.subscriber.subscribe(`session:${sessionId}:events`);
    }
    sockets.set(connId, socket);
  }

  /**
   * Unsubscribe a WebSocket connection from a session.
   * If this was the last connection for the session on this node, unsubscribes via Valkey.
   */
  public async unsubscribeFromSession(sessionId: string, connId: string): Promise<void> {
    const sockets = this.sessionSockets.get(sessionId);
    if (sockets) {
      sockets.delete(connId);
      if (sockets.size === 0) {
        this.sessionSockets.delete(sessionId);
        await this.subscriber.unsubscribe(`session:${sessionId}:events`);
      }
    }
  }

  /**
   * Broadcasts a diagram update to all session members and persists it.
   */
  public async broadcastDiagramUpdate(sessionId: string, xml: string, senderConnId: string, senderName: string): Promise<void> {
    // 1. Persist the diagram
    await this.valkey.set(`session:${sessionId}:diagram`, xml);

    // 2. Publish to the event channel
    const message = {
      type: 'diagram_broadcast',
      payload: {
        diagramXml: xml,
      },
      senderConnId,
      senderName,
      timestamp: new Date().toISOString(),
    };

    await this.valkey.publish(`session:${sessionId}:events`, JSON.stringify(message));
  }

  /**
   * Broadcasts a chat message to all session members and persists it in history.
   */
  public async broadcastChatMessage(sessionId: string, message: string, senderConnId: string, senderName: string): Promise<void> {
    const timestamp = new Date().toISOString();
    
    // 1. Persist the chat message
    const chatEntry = {
      message,
      senderConnId,
      senderName,
      timestamp
    };
    
    const key = `session:${sessionId}:chat`;
    await this.valkey.lpush(key, JSON.stringify(chatEntry));
    // Keep only the last 500 messages (0 to 499)
    await this.valkey.ltrim(key, 0, 499);

    // 2. Publish to the event channel
    const eventMessage = {
      type: 'chat_message',
      payload: {
        text: message,
      },
      senderConnId,
      senderName,
      timestamp,
    };

    await this.valkey.publish(`session:${sessionId}:events`, JSON.stringify(eventMessage));
  }

  /**
   * Retrieves the chat history for a session (up to 500 messages).
   * Messages are returned in chronological order (oldest first).
   */
  public async getChatHistory(sessionId: string): Promise<any[]> {
    const key = `session:${sessionId}:chat`;
    const messages = await this.valkey.lrange(key, 0, -1);
    
    // LRANGE returns messages starting from index 0 (the most recent because of LPUSH)
    // We want to return them in chronological order, so we reverse the array
    return messages.map((msg: string) => JSON.parse(msg)).reverse();
  }

  /**
   * Publishes a generic event message to the session's pub/sub channel.
   */
  public async publishEvent(sessionId: string, event: any): Promise<void> {
    await this.valkey.publish(`session:${sessionId}:events`, JSON.stringify(event));
  }
}
