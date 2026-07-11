import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export interface AuthPluginOptions {
  bypassRoutes?: string[];
}

const authPluginCallback: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify: FastifyInstance,
  options
) => {
  const bypassRoutes = options.bypassRoutes || ['/health', '/ready'];

  fastify.addHook('preHandler', async (request, reply) => {
    // Bypass authentication for defined routes
    const path = request.routeOptions?.url || request.url.split('?')[0];
    if (bypassRoutes.includes(path)) {
      return;
    }

    const expectedKey = process.env.API_KEY;
    if (!expectedKey) {
      request.log.warn('API_KEY environment variable is not set. All secure requests will fail.');
      reply.code(403).send({ error: 'Forbidden', message: 'Server auth misconfigured' });
      return;
    }

    // Read API key from headers or query parameters
    const apiKeyHeader = request.headers['x-api-key'];
    const apiKeyQuery = (request.query as Record<string, string>)?.apiKey;
    const providedKey = apiKeyHeader || apiKeyQuery;

    if (!providedKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'API key is missing' });
      return;
    }

    if (providedKey !== expectedKey) {
      reply.code(403).send({ error: 'Forbidden', message: 'Invalid API key' });
      return;
    }
  });
};

/**
 * Fastify plugin enforcing API key authentication.
 * Checks for API key in either X-API-Key header or apiKey query parameter.
 */
export const authPlugin = fp(authPluginCallback, {
  name: 'auth-plugin'
});
