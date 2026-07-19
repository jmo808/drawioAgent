import jwt, { VerifyOptions } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

let client: jwksClient.JwksClient | null = null;

export function getJwksClient(jwksUri: string): jwksClient.JwksClient {
  if (!client) {
    client = jwksClient({
      jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return client;
}

export function getKey(jwksUri: string) {
  const jwks = getJwksClient(jwksUri);
  return (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) => {
    if (!header.kid) {
      callback(new Error('Missing kid in JWT header'));
      return;
    }
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) {
        callback(err);
      } else {
        const signingKey = key?.getPublicKey();
        callback(null, signingKey);
      }
    });
  };
}

export function verifyJwt(token: string, jwksUri: string, options: VerifyOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey(jwksUri), { ...options, algorithms: ['RS256'] }, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}

/** @visibleForTesting */
export function resetJwksClient(): void {
  client = null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: Record<string, unknown>;
  }
}
