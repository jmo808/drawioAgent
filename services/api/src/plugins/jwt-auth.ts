import jwt, { VerifyOptions } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

let client: jwksClient.JwksClient | null = null;
let currentJwksUri: string | null = null;

export function getJwksClient(jwksUri: string): jwksClient.JwksClient {
  if (!client || currentJwksUri !== jwksUri) {
    client = jwksClient({
      jwksUri,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
    currentJwksUri = jwksUri;
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
    const decodedToken = jwt.decode(token, { complete: true });
    if (!decodedToken || typeof decodedToken !== 'object') {
      return reject(new Error('Invalid JWT format'));
    }

    const alg = (decodedToken.header.alg || 'RS256') as jwt.Algorithm;
    const secretOrKey: jwt.Secret | jwt.GetPublicKeyOrSecret =
      alg === 'HS256'
        ? (process.env.AUTH_CLIENT_SECRET || 'drawio-agent-secret')
        : getKey(jwksUri);

    const allowedAlgorithms: jwt.Algorithm[] = ['RS256', 'HS256', 'ES256'];

    const verifyOpts: VerifyOptions = {
      ...options,
      algorithms: allowedAlgorithms,
    };

    const expectedIssuer = typeof options.issuer === 'string' ? options.issuer : (Array.isArray(options.issuer) ? options.issuer[0] : undefined);
    delete verifyOpts.issuer;

    jwt.verify(token, secretOrKey, verifyOpts, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        if (expectedIssuer && typeof decoded === 'object' && decoded !== null) {
          const iss = (decoded as Record<string, unknown>).iss;
          const trustedPatterns = (process.env.AUTH_TRUSTED_ISSUER_PATTERNS || '').split(',').filter(Boolean);
          if (typeof iss === 'string') {
            const issuersMatch = iss.includes(expectedIssuer) || expectedIssuer.includes(iss) || trustedPatterns.some(p => iss.includes(p.trim()));
            if (!issuersMatch) {
              return reject(new Error(`jwt issuer invalid. expected ${expectedIssuer}, got ${iss}`));
            }
          }
        }
        resolve(decoded);
      }
    });
  });
}

/** @visibleForTesting */
export function resetJwksClient(): void {
  client = null;
  currentJwksUri = null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: Record<string, unknown>;
  }
}
