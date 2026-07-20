import { trace, context, propagation } from '@opentelemetry/api';
import { agent_proxy_duration_seconds } from '../plugins/metrics.js';

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
    const tracer = trace.getTracer('drawio-agent-api');
    return tracer.startActiveSpan('agent.proxy', async (span) => {
      const url = `${this.agentUrl}/api/v1/chat`;
      const startTime = process.hrtime();
      let statusCode = '0';
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      const requestId = headers['X-Request-ID'];
      if (requestId) {
        span.setAttribute('request.id', requestId);
      }

      // Propagate context
      const propagatedHeaders: Record<string, string> = {};
      propagation.inject(context.active(), propagatedHeaders);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            ...headers,
            ...propagatedHeaders
          },
          body: JSON.stringify(req),
          signal
        });

        statusCode = response.status.toString();
        span.setAttribute('http.status_code', response.status);

        if (!response.ok) {
          throw new Error(`Agent service returned HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Agent service returned empty response body');
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
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
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message }); // 2 is SpanStatusCode.ERROR
        statusCode = error.message.match(/HTTP (\d+)/)?.[1] || '500';
        throw err;
      } finally {
        span.end();
        reader?.releaseLock();
        const diff = process.hrtime(startTime);
        const duration = diff[0] + diff[1] * 1e-9;
        agent_proxy_duration_seconds.labels(statusCode).observe(duration);
      }
    });
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
