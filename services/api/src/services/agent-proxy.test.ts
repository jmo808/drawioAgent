import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentProxy } from './agent-proxy.js';
import { MockAgent, setGlobalDispatcher } from 'undici';

describe('AgentProxy service', () => {
  let mockAgent: MockAgent;
  let proxy: AgentProxy;

  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    
    process.env.AGENT_SERVICE_URL = 'http://localhost:8000';
    proxy = new AgentProxy();
  });

  afterEach(() => {
    mockAgent.assertNoPendingInterceptors();
  });

  it('should post message and parse SSE stream events correctly', async () => {
    const client = mockAgent.get('http://localhost:8000');
    
    // Simulate a SSE response stream
    const sseChunks = [
      'event: tool_progress\ndata: {"toolName":"init_diagram","step":1,"totalSteps":2}\n\n',
      'event: diagram_update\ndata: {"xml":"<mxfile></mxfile>"}\n\n'
    ];
    
    client.intercept({
      path: '/api/chat',
      method: 'POST',
      body: JSON.stringify({
        message: 'draw a circle',
        diagramXml: '<mxfile></mxfile>',
        sessionId: 'session-123'
      })
    }).reply(200, sseChunks.join(''), {
      headers: { 'content-type': 'text/event-stream' }
    });

    const events: any[] = [];
    await proxy.sendChatMessage(
      {
        message: 'draw a circle',
        diagramXml: '<mxfile></mxfile>',
        sessionId: 'session-123'
      },
      {},
      (event) => {
        events.push(event);
      }
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool_progress',
      payload: { toolName: 'init_diagram', step: 1, totalSteps: 2 }
    });
    expect(events[1]).toEqual({
      type: 'diagram_update',
      payload: { xml: '<mxfile></mxfile>' }
    });
  });

  it('should handle service unavailability by throwing/returning error', async () => {
    const client = mockAgent.get('http://localhost:8000');
    client.intercept({
      path: '/api/chat',
      method: 'POST'
    }).replyWithError(new Error('Connection refused'));

    await expect(
      proxy.sendChatMessage(
        { message: 'hello', sessionId: 'session-123' },
        {},
        () => {}
      )
    ).rejects.toThrow('fetch failed');
  });
});
