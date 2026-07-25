import { FastifyInstance } from 'fastify';

export async function authRoutes(fastify: FastifyInstance) {
  // OIDC Login redirect endpoint (browser redirect)
  fastify.get('/api/v1/auth/login', async (request, reply) => {
    const issuer = process.env.AUTH_ISSUER || 'https://auth.example.com/';
    const clientId = process.env.AUTH_AUDIENCE || 'drawio-agent';
    const callbackUri = 'https://diagrams.example.com/api/v1/auth/callback';
    
    let baseUrl = 'https://auth.example.com';
    try {
      const parsedIssuer = new URL(issuer);
      baseUrl = `${parsedIssuer.protocol}//${parsedIssuer.host}`;
    } catch (e) {
      fastify.log.error(`Failed to parse AUTH_ISSUER: ${issuer}. Using fallback base URL.`);
    }
    
    const authUrl = `${baseUrl}/application/o/authorize/?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(callbackUri)}&scope=openid%20profile%20email`;
    return reply.redirect(authUrl);
  });

  // OIDC Callback endpoint (server-to-server token exchange using internal cluster network)
  fastify.get('/api/v1/auth/callback', async (request, reply) => {
    const { code } = request.query as Record<string, string>;
    if (!code) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Missing authorization code' });
    }

    const issuer = process.env.AUTH_ISSUER || 'https://auth.example.com/';
    const internalIssuer = process.env.AUTH_INTERNAL_ISSUER || 'http://oidc-server.oidc.svc.cluster.local';
    const clientId = process.env.AUTH_AUDIENCE || 'drawio-agent';
    const clientSecret = process.env.AUTH_CLIENT_SECRET || 'drawio-agent-secret';
    const callbackUri = 'https://diagrams.example.com/api/v1/auth/callback';

    try {
      let internalBaseUrl = 'http://oidc-server.oidc.svc.cluster.local';
      try {
        const parsedInternal = new URL(internalIssuer);
        internalBaseUrl = `${parsedInternal.protocol}//${parsedInternal.host}`;
      } catch (e) {
        fastify.log.error(`Failed to parse AUTH_INTERNAL_ISSUER: ${internalIssuer}. Using fallback internal base URL.`);
      }
      const tokenUrl = `${internalBaseUrl}/application/o/token/`;
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUri,
      });

      const hostHeader = new URL(issuer).host;

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Host': hostHeader,
        },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        fastify.log.error(`OIDC token exchange failed (${response.status}): ${errorText}`);
        return reply.status(401).send({ error: 'Unauthorized', message: `Failed to exchange code: ${errorText}` });
      }

      const tokens = await response.json();
      const token = tokens.access_token || tokens.id_token;

      // Redirect back to main application with token
      return reply.redirect(`https://diagrams.example.com/?token=${encodeURIComponent(token)}`);
    } catch (err) {
      fastify.log.error(`Auth callback error: ${err}`);
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Authentication callback failed' });
    }
  });
}
