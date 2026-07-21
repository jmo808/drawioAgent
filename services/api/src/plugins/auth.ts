import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';
import { verifyJwt } from './jwt-auth.js';

export interface AuthPluginOptions {
  bypassRoutes?: string[];
}

const authPluginCallback: FastifyPluginAsync<AuthPluginOptions> = async (
  fastify: FastifyInstance,
  options
) => {
  const bypassRoutes = options.bypassRoutes || ['/health', '/ready', '/metrics'];
  const provider = (process.env.AUTH_PROVIDER || 'apikey').toLowerCase();
  const expectedApiKey = process.env.API_KEY;
  const jwksUri = process.env.AUTH_JWKS_URI;
  const issuer = process.env.AUTH_ISSUER;
  const audience = process.env.AUTH_AUDIENCE;

  // Startup validation warnings
  if (provider === 'apikey' && !expectedApiKey) {
    fastify.log.warn('API_KEY environment variable is not set. All secure requests will fail.');
  } else if (provider === 'oidc') {
    if (!jwksUri || !issuer || !audience) {
      fastify.log.warn('OIDC environment variables (AUTH_JWKS_URI, AUTH_ISSUER, AUTH_AUDIENCE) are not fully configured.');
    }
  } else if (provider === 'both') {
    if (!expectedApiKey) {
      fastify.log.warn('API_KEY environment variable is not set for "both" mode.');
    }
    if (!jwksUri || !issuer || !audience) {
      fastify.log.warn('OIDC environment variables are not fully configured for "both" mode.');
    }
  } else if (provider !== 'apikey' && provider !== 'oidc' && provider !== 'both') {
    fastify.log.error(`Unsupported auth provider configured at startup: ${provider}`);
  }

  fastify.addHook('preHandler', async (request, reply) => {
    // Bypass authentication for defined routes
    const path = request.routeOptions?.url || request.url.split('?')[0];
    if (bypassRoutes.some(route => path === route || path.endsWith(route))) {
      return;
    }

    // Extract potential credentials
    const authHeader = request.headers['authorization'];
    const bearerToken =
      authHeader && authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.substring(7)
        : undefined;

    const apiKeyHeader = request.headers['x-api-key'];
    const queryParams = request.query as Record<string, unknown>;
    const apiKeyQuery = typeof queryParams?.apiKey === 'string' ? queryParams.apiKey : undefined;
    const providedApiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : apiKeyQuery;

    // Helper: validate API key
    const validateApiKey = (key: string): boolean => {
      if (!expectedApiKey) return false;
      const expectedBuffer = Buffer.from(expectedApiKey);
      const providedBuffer = Buffer.from(key);
      return (
        expectedBuffer.length === providedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, providedBuffer)
      );
    };

    const logSuccess = (identity: string) => {
      request.log.info({
        audit: true,
        eventType: 'auth_success',
        requestId: request.id,
        clientIp: request.ip,
        userIdentity: identity,
        timestamp: new Date().toISOString()
      }, `Auth success for identity: ${identity}`);
    };

    const logFailure = (reason: string) => {
      request.log.warn({
        audit: true,
        eventType: 'auth_failure',
        requestId: request.id,
        clientIp: request.ip,
        timestamp: new Date().toISOString(),
        details: { reason }
      }, `Auth failure: ${reason}`);
    };

    // Strategy: API KEY ONLY
    if (provider === 'apikey') {
      if (!expectedApiKey) {
        logFailure('Server auth misconfigured (API_KEY missing)');
        reply.code(403).send({ error: 'Forbidden', message: 'Server auth misconfigured' });
        return;
      }
      if (!providedApiKey) {
        logFailure('API key is missing');
        reply.code(401).send({ error: 'Unauthorized', message: 'API key is missing' });
        return;
      }
      if (!validateApiKey(providedApiKey)) {
        logFailure('Invalid API key provided');
        reply.code(403).send({ error: 'Forbidden', message: 'Invalid API key' });
        return;
      }
      request.user = { sub: 'apikey-client' };
      logSuccess('apikey-client');
      return;
    }

    // Strategy: OIDC ONLY
    if (provider === 'oidc') {
      if (!jwksUri || !issuer || !audience) {
        request.log.warn('OIDC environment variables (AUTH_JWKS_URI, AUTH_ISSUER, AUTH_AUDIENCE) are not fully configured.');
        logFailure('Server auth misconfigured (OIDC configuration missing)');
        reply.code(403).send({ error: 'Forbidden', message: 'Server auth misconfigured' });
        return;
      }

      if (!bearerToken) {
        logFailure('Bearer token is missing');
        reply.code(401).send({ error: 'Unauthorized', message: 'Bearer token is missing' });
        return;
      }

      try {
        const decoded = await verifyJwt(bearerToken, jwksUri, { issuer, audience }) as Record<string, unknown>;
        request.user = decoded;
        logSuccess((decoded.sub as string) || 'unknown-oidc-user');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Token validation failed';
        logFailure(msg);
        if (msg.includes('jwt expired')) {
          reply.code(401).send({ error: 'Unauthorized', message: 'Token has expired' });
        } else {
          reply.code(403).send({ error: 'Forbidden', message: 'Token validation failed' });
        }
      }
      return;
    }

    // Strategy: BOTH (OIDC or API KEY)
    if (provider === 'both') {
      // If Bearer token is provided, try to authenticate with it
      if (bearerToken) {
        if (!jwksUri || !issuer || !audience) {
          request.log.warn('OIDC environment variables are not fully configured for "both" mode.');
          logFailure('Server auth misconfigured (OIDC configuration missing for both mode)');
          reply.code(403).send({ error: 'Forbidden', message: 'Server auth misconfigured' });
          return;
        }

        try {
          const decoded = await verifyJwt(bearerToken, jwksUri, { issuer, audience }) as Record<string, unknown>;
          request.user = decoded;
          logSuccess((decoded.sub as string) || 'unknown-oidc-user');
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Token validation failed';
          logFailure(msg);
          if (msg.includes('jwt expired')) {
            reply.code(401).send({ error: 'Unauthorized', message: 'Token has expired' });
          } else {
            reply.code(403).send({ error: 'Forbidden', message: 'Token validation failed' });
          }
          return;
        }
      }

      // If API key is provided, try to authenticate with it
      if (providedApiKey) {
        if (!expectedApiKey) {
          logFailure('Server auth misconfigured (missing API_KEY for both mode)');
          reply.code(403).send({ error: 'Forbidden', message: 'Server auth misconfigured' });
          return;
        }
        if (!validateApiKey(providedApiKey)) {
          logFailure('Invalid API key');
          reply.code(403).send({ error: 'Forbidden', message: 'Invalid API key' });
          return;
        }
        request.user = { sub: 'apikey-client' };
        logSuccess('apikey-client');
        return;
      }

      // Neither provided
      logFailure('Authentication required (neither Bearer token nor API key provided)');
      reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    // Unsupported provider
    logFailure(`Unsupported auth provider: ${provider}`);
    reply.code(500).send({ error: 'Internal Server Error', message: 'Server authentication misconfigured' });
  });
};

export const authPlugin = fp(authPluginCallback, {
  name: 'auth-plugin'
});
