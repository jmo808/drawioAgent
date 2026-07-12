import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';


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
    
    // Safely cast query parameters and check apiKey
    const queryParams = request.query as Record<string, unknown>;
    const apiKeyQuery = typeof queryParams?.apiKey === 'string' ? queryParams.apiKey : undefined;
    
    // Note: Query parameter authentication is supported primarily as a fallback
    // for WebSocket upgrades where custom headers are not supported by browser clients.
    const providedKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : apiKeyQuery;

    if (!providedKey) {
      reply.code(401).send({ error: 'Unauthorized', message: 'API key is missing' });
      return;
    }

    const expectedBuffer = Buffer.from(expectedKey);
    const providedBuffer = Buffer.from(providedKey);

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
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
