import { FastifyInstance } from 'fastify';
import { request } from 'undici';

/**
 * Registers health check and readiness check endpoints.
 */
export async function healthRoutes(app: FastifyInstance) {
  // Simple health check endpoint for Liveness probe
  app.get('/health', async (req, reply) => {
    return { status: 'ok' };
  });

  // Readiness check endpoint validating Agent reachability
  app.get('/ready', async (req, reply) => {
    const agentUrl = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
    try {
      const res = await request(`${agentUrl}/health`, {
        method: 'GET',
        headersTimeout: 2000,
        bodyTimeout: 2000
      });
      
      if (res.statusCode === 200) {
        return { status: 'ready' };
      }
      
      reply.code(503);
      return { status: 'not ready', error: `Agent returned status code ${res.statusCode}` };
    } catch (err: any) {
      reply.code(503);
      return { status: 'not ready', error: err.message };
    }
  });
}
