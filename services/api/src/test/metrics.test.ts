import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import client from 'prom-client';

describe('Metrics', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    await buildApp(app);
    await app.ready();
    client.register.resetMetrics(); // Reset metrics instead of clearing registry
  });

  afterAll(async () => {
    await app.close();
    client.register.resetMetrics();
  });

  it('should expose /metrics endpoint in Prometheus format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/metrics'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/plain/);
    expect(response.payload).toContain('http_request_duration_seconds');
  });

  it('should record http_request_duration_seconds for API calls', async () => {
    client.register.resetMetrics();
    
    // Send a request to trigger metrics
    await app.inject({
      method: 'GET',
      url: '/health'
    });

    const metricsStr = await client.register.metrics();
    expect(metricsStr).toContain('http_request_duration_seconds_count{method="GET",route="/health",status_code="200"} 1');
  });

  it('should exclude /metrics from duration metrics', async () => {
    client.register.resetMetrics();
    
    await app.inject({
      method: 'GET',
      url: '/metrics'
    });

    const metricsStr = await client.register.metrics();
    expect(metricsStr).not.toContain('route="/metrics"');
  });
});
