import { FastifyInstance } from 'fastify';

/**
 * Registers features discovery endpoint.
 */
export async function featuresRoutes(app: FastifyInstance) {
  app.get('/api/features', async (req, reply) => {
    const collaborationEnabled = process.env.COLLABORATION_ENABLED === 'true';
    return {
      collaboration: collaborationEnabled
    };
  });
}
