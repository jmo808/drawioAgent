import Redis from 'ioredis';
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
}
