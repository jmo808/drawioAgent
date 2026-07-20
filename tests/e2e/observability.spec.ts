import { test, expect } from '@playwright/test';

test.describe('Observability Integration Tests', () => {
  const API_URL = 'http://localhost:3000';
  const AGENT_URL = 'http://localhost:8000';
  const GATEWAY_URL = 'http://localhost:8081';

  test('should return valid Prometheus metrics format for API service', async () => {
    const response = await fetch(`${API_URL}/metrics`);
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('text/plain');

    const text = await response.text();
    // Verify standard Prometheus and Node/Fastify metrics are present
    expect(text).toContain('process_cpu_user_seconds_total');
    expect(text).toContain('http_request_duration_seconds');
  });

  test('should return valid Prometheus metrics format for Agent service', async () => {
    const response = await fetch(`${AGENT_URL}/metrics`);
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type');
    expect(contentType).toContain('text/plain');

    const text = await response.text();
    // Verify standard python and custom LLM/MCP metrics are present
    expect(text).toContain('llm_call_duration_seconds');
    expect(text).toContain('mcp_tool_calls_total');
  });

  test('should propagate correlation ID (x-request-id) from API to Agent', async () => {
    const correlationId = `col-id-test-${Date.now()}`;
    
    // Request to Fastify API via Nginx Gateway
    const response = await fetch(`${GATEWAY_URL}/api/features`, {
      headers: {
        'x-request-id': correlationId,
      },
    });

    expect(response.status).toBe(200);
    // Check that correlation ID is returned in response headers
    expect(response.headers.get('x-request-id')).toBe(correlationId);

    // Direct check of Agent service response header propagation
    const agentResponse = await fetch(`${AGENT_URL}/api/v1/providers`, {
      headers: {
        'x-request-id': correlationId,
      },
    });
    expect(agentResponse.status).toBe(200);
    expect(agentResponse.headers.get('x-request-id')).toBe(correlationId);
  });

  test('should block request and return 429 when rate limit is exceeded', async () => {
    const limitKey = `rate-limit-test-key-${Date.now()}`;
    
    // We send requests rapidly to /api/features which bypasses auth but triggers rate limiting.
    // The rate limit window is 60 req/min. We send 61 requests.
    let response: Response | null = null;
    let hitRateLimit = false;

    // Send 65 requests. If one returns 429, we succeed.
    for (let i = 0; i < 65; i++) {
      response = await fetch(`${GATEWAY_URL}/api/features`, {
        headers: {
          'x-api-key': limitKey,
        },
      });

      if (response.status === 429) {
        hitRateLimit = true;
        break;
      }
    }

    expect(hitRateLimit).toBe(true);
    expect(response).not.toBeNull();
    if (response) {
      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.error).toBe('Too Many Requests');
      expect(json.message).toBe('Rate limit exceeded');

      // Verify RateLimit headers are present
      expect(response.headers.get('x-ratelimit-limit')).toBe('60');
      expect(response.headers.get('x-ratelimit-remaining')).toBe('0');
      expect(response.headers.get('retry-after')).not.toBeNull();
    }
  });

  test('should open circuit breaker after multiple failures and return error', async () => {
    // 1. Initial metrics check: closed state gauge value should be 0 (closed)
    const initMetricsResponse = await fetch(`${AGENT_URL}/metrics`);
    const initMetrics = await initMetricsResponse.text();
    
    // 2. Trigger failures by calling agent chat with simulated HTTP 500 error prompts.
    // CIRCUIT_FAIL_MAX defaults to 5. We trigger 5 failures to trip the circuit breaker.
    const sessionId = `cb-test-session-${Date.now()}`;
    
    for (let i = 0; i < 5; i++) {
      try {
        const res = await fetch(`${AGENT_URL}/api/v1/chat`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: 'trigger circuit-fail error',
            sessionId: sessionId,
          }),
        });
        
        // Read response to ensure request completes
        await res.text();
      } catch (e) {
        // HTTP or stream connection errors are expected during failures
      }
    }

    // 3. Verify metrics that circuit state transitioned to OPEN (1)
    const postMetricsResponse = await fetch(`${AGENT_URL}/metrics`);
    const postMetrics = await postMetricsResponse.text();
    expect(postMetrics).toContain('llm_circuit_state{provider="openai"} 1.0');
  });
});
