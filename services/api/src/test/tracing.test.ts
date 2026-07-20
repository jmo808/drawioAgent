import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AgentProxy } from '../services/agent-proxy.js';
import { trace, propagation } from '@opentelemetry/api';

describe('API Tracing', () => {
  beforeAll(() => {
    const mockPropagator = {
      inject: (context: any, carrier: any, setter: any) => {
        setter.set(carrier, 'traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
      },
      extract: (context: any, carrier: any, getter: any) => context,
      fields: () => ['traceparent']
    };
    propagation.setGlobalPropagator(mockPropagator);
  });

  it('should create agent.proxy span and propagate context headers', async () => {
    const mockSpan = {
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      spanContext: () => ({ 
        traceId: '0af7651916cd43dd8448eb211c80319c',
        spanId: 'b7ad6b7169203331',
        traceFlags: 1
      })
    };

    const mockTracer = {
      startActiveSpan: vi.fn((name, callback) => {
        return callback(mockSpan);
      })
    };

    const getTracerSpy = vi.spyOn(trace, 'getTracer').mockReturnValue(mockTracer as any);

    const originalFetch = global.fetch;
    let sentHeaders: any = {};
    global.fetch = async (url: any, options: any) => {
      sentHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => ({ done: true, value: undefined }),
            releaseLock: () => {}
          })
        }
      } as any;
    };

    try {
      const agentProxy = new AgentProxy();
      await agentProxy.sendChatMessage(
        { message: 'hello', sessionId: 'session-123' },
        { 'X-Request-ID': 'req-id-abc' },
        () => {}
      );

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('agent.proxy', expect.any(Function));
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('request.id', 'req-id-abc');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('http.status_code', 200);
      expect(mockSpan.end).toHaveBeenCalled();

      expect(sentHeaders['traceparent']).toBeDefined();
      expect(sentHeaders['traceparent']).toContain('0af7651916cd43dd8448eb211c80319c');
    } finally {
      global.fetch = originalFetch;
      getTracerSpy.mockRestore();
    }
  });
});
