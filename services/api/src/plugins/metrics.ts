import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import client from 'prom-client';

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: [number, number];
  }
}

export interface MetricsPluginOptions {}

export const http_request_duration_seconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

export const ws_connections_active = new client.Gauge({
  name: 'ws_connections_active',
  help: 'Number of active WebSocket connections'
});

export const ws_messages_total = new client.Counter({
  name: 'ws_messages_total',
  help: 'Total number of WebSocket messages received',
  labelNames: ['type', 'status']
});

export const agent_proxy_duration_seconds = new client.Histogram({
  name: 'agent_proxy_duration_seconds',
  help: 'Duration of agent proxy HTTP requests in seconds',
  labelNames: ['status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
});

const metrics: FastifyPluginAsync<MetricsPluginOptions> = async (fastify: FastifyInstance, options) => {
  // Collect default metrics only if not already collected
  if (!client.register.getSingleMetric('process_cpu_user_seconds_total')) {
    client.collectDefaultMetrics();
  }

  // Hook to record HTTP request duration
  fastify.addHook('onRequest', async (request, reply) => {
    // Exclude /metrics from metrics tracking
    if (request.routeOptions.url === '/metrics') {
      return;
    }
    request.startTime = process.hrtime();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = request.startTime;
    if (!startTime) return;
    
    const diff = process.hrtime(startTime);
    const duration = diff[0] + diff[1] * 1e-9;
    
    const route = request.routeOptions.url || 'unknown';
    http_request_duration_seconds.labels(request.method, route, reply.statusCode.toString()).observe(duration);
  });

  // Expose metrics route
  fastify.get('/metrics', {
    config: {
      auth: false // Explicitly disable auth if any global auth middleware checks this
    }
  }, async (request, reply) => {
    reply.header('Content-Type', client.register.contentType);
    return client.register.metrics();
  });
};

export const metricsPlugin = fp(metrics, {
  name: 'metrics'
});
