export interface ChatRequest {
  message: string;
  diagramXml?: string;
  sessionId: string;
  classification?: string;
}

export interface AgentEvent {
  type: string;
  payload: unknown;
}

export class AgentProxy {
  private readonly agentUrl: string;

  constructor() {
    this.agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
  }

  /**
   * Sends a chat message to the Python agent and streams the response events.
   */
  async sendChatMessage(
    req: ChatRequest,
    headers: { 'X-Request-ID'?: string; 'X-User-Identity'?: string },
    onEvent: (event: AgentEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const url = `${this.agentUrl}/api/v1/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        ...headers
      },
      body: JSON.stringify(req),
      signal
    });

    if (!response.ok) {
      throw new Error(`Agent service returned HTTP ${response.status}: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Agent service returned empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process completed events separated by double newlines
        let eventBoundary = buffer.indexOf('\n\n');
        while (eventBoundary !== -1) {
          const eventChunk = buffer.substring(0, eventBoundary);
          buffer = buffer.substring(eventBoundary + 2);

          this.parseAndEmitEvent(eventChunk, onEvent);
          eventBoundary = buffer.indexOf('\n\n');
        }
      }

      // Process any remaining data in the buffer
      if (buffer.trim()) {
        this.parseAndEmitEvent(buffer, onEvent);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseAndEmitEvent(chunk: string, onEvent: (event: AgentEvent) => void) {
    const lines = chunk.split('\n');
    let eventType = '';
    let dataStr = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        dataStr += line.substring(5).trim();
      }
    }

    if (eventType && dataStr) {
      try {
        const payload = JSON.parse(dataStr);
        onEvent({ type: eventType, payload });
      } catch (err) {
        // Ignore parsing errors of individual malformed lines
      }
    }
  }
}
