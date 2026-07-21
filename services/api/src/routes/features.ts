import { FastifyInstance } from 'fastify';

/**
 * Registers features discovery endpoint.
 */
export async function featuresRoutes(app: FastifyInstance) {
  const handler = async (req: any, reply: any) => {
    const collaborationEnabled = process.env.COLLABORATION_ENABLED === 'true';
    return {
      collaboration: collaborationEnabled
    };
  };
  app.get('/api/features', handler);
  app.get('/api/v1/features', handler);
}
