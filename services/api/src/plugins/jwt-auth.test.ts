import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { buildApp } from '../app.js';
import { resetJwksClient } from './jwt-auth.js';

// Hoist the mock function so it is available before vi.mock executes
const { mockGetSigningKey } = vi.hoisted(() => ({
  mockGetSigningKey: vi.fn(),
}));

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: mockGetSigningKey,
  })),
}));

describe('OIDC/JWT Authentication Middleware', () => {
  let app: ReturnType<typeof Fastify>;
  let privateKey: string;
  let publicKey: string;
  let keyId = 'test-key-id';

  beforeEach(async () => {
    // Generate an RSA key pair for testing
    const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    privateKey = priv;
    publicKey = pub;

    // Reset env vars and mocks
    process.env.AUTH_PROVIDER = 'oidc';
    process.env.AUTH_JWKS_URI = 'http://localhost/jwks';
    process.env.AUTH_ISSUER = 'http://localhost/issuer';
    process.env.AUTH_AUDIENCE = 'drawio-agent';
    process.env.API_KEY = 'super-secret-key';

    // Mock signing key resolution
    mockGetSigningKey.mockImplementation((
      kid: string,
      callback: (err: Error | null, key?: { getPublicKey: () => string }) => void
    ) => {
      if (kid === keyId) {
        callback(null, {
          getPublicKey: () => publicKey,
        });
      } else {
        callback(new Error('Signing key not found'));
      }
    });

    app = Fastify();
    await buildApp(app);

    // Secure route to test auth
    app.get('/test-secure', async (request) => {
      return { secure: true, user: request.user };
    });

    // Metrics route for testing bypass
    app.get('/metrics', async () => {
      return { metrics: true };
    });
  });

  afterEach(async () => {
    delete process.env.AUTH_PROVIDER;
    delete process.env.AUTH_JWKS_URI;
    delete process.env.AUTH_ISSUER;
    delete process.env.AUTH_AUDIENCE;
    delete process.env.API_KEY;
    mockGetSigningKey.mockReset();
    resetJwksClient();
    if (app) {
      await app.close();
    }
    vi.restoreAllMocks();
  });

  it('should validate a valid RS256 token and return 200', async () => {
    const payload = { sub: 'alice', name: 'Alice' };
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: 'http://localhost/issuer',
      audience: 'drawio-agent',
      expiresIn: '1h',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().secure).toBe(true);
    expect(res.json().user.sub).toBe('alice');
    expect(res.json().user.name).toBe('Alice');
  });

  it('should return 401 if token is expired', async () => {
    const payload = { sub: 'alice' };
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: 'http://localhost/issuer',
      audience: 'drawio-agent',
      expiresIn: '-1h', // Expired in the past
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
    expect(res.json().message).toContain('Token has expired');
  });

  it('should return 403 if token signature is invalid', async () => {
    // Sign with a different key
    const { privateKey: otherPrivateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });

    const payload = { sub: 'alice' };
    const token = jwt.sign(payload, otherPrivateKey, {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: 'http://localhost/issuer',
      audience: 'drawio-agent',
      expiresIn: '1h',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Forbidden');
    expect(res.json().message).toContain('Token validation failed');
  });

  it('should return 403 if issuer does not match', async () => {
    const payload = { sub: 'alice' };
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: 'http://wrong-issuer',
      audience: 'drawio-agent',
      expiresIn: '1h',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('Token validation failed');
  });

  it('should return 403 if audience does not match', async () => {
    const payload = { sub: 'alice' };
    const token = jwt.sign(payload, privateKey, {
      algorithm: 'RS256',
      keyid: keyId,
      issuer: 'http://localhost/issuer',
      audience: 'wrong-audience',
      expiresIn: '1h',
    });

    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().message).toContain('Token validation failed');
  });

  it('should allow bypass for /health, /ready, /metrics', async () => {
    for (const url of ['/health', '/ready', '/metrics']) {
      const res = await app.inject({
        method: 'GET',
        url,
      });
      expect(res.statusCode).not.toBe(401);
      expect(res.statusCode).not.toBe(403);
    }
  });

  describe('Fallback scenarios with auth.provider configurations', () => {
    it('should fallback to API key when AUTH_PROVIDER is both and header is present', async () => {
      const localApp = Fastify();
      process.env.AUTH_PROVIDER = 'both';
      await buildApp(localApp);
      localApp.get('/test-secure', async (request) => {
        return { secure: true, user: request.user };
      });

      const res = await localApp.inject({
        method: 'GET',
        url: '/test-secure',
        headers: {
          'x-api-key': 'super-secret-key',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().secure).toBe(true);
      expect(res.json().user).toBeDefined();
      expect(res.json().user.sub).toBe('apikey-client');
      await localApp.close();
    });

    it('should fallback to API key when AUTH_PROVIDER is both and query param is present', async () => {
      const localApp = Fastify();
      process.env.AUTH_PROVIDER = 'both';
      await buildApp(localApp);
      localApp.get('/test-secure', async (request) => {
        return { secure: true, user: request.user };
      });

      const res = await localApp.inject({
        method: 'GET',
        url: '/test-secure?apiKey=super-secret-key',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().secure).toBe(true);
      expect(res.json().user.sub).toBe('apikey-client');
      await localApp.close();
    });

    it('should reject API key when AUTH_PROVIDER is oidc', async () => {
      const localApp = Fastify();
      process.env.AUTH_PROVIDER = 'oidc';
      await buildApp(localApp);
      localApp.get('/test-secure', async (request) => {
        return { secure: true, user: request.user };
      });

      const res = await localApp.inject({
        method: 'GET',
        url: '/test-secure',
        headers: {
          'x-api-key': 'super-secret-key',
        },
      });

      expect(res.statusCode).toBe(401); // No bearer token provided
      await localApp.close();
    });

    it('should reject JWT when AUTH_PROVIDER is apikey', async () => {
      const localApp = Fastify();
      process.env.AUTH_PROVIDER = 'apikey';
      await buildApp(localApp);
      localApp.get('/test-secure', async (request) => {
        return { secure: true, user: request.user };
      });

      const token = jwt.sign({ sub: 'alice' }, privateKey, {
        algorithm: 'RS256',
        keyid: keyId,
        issuer: 'http://localhost/issuer',
        audience: 'drawio-agent',
      });

      const res = await localApp.inject({
        method: 'GET',
        url: '/test-secure',
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.statusCode).toBe(401); // Expecting X-API-Key or query apiKey
      await localApp.close();
    });
  });
});
