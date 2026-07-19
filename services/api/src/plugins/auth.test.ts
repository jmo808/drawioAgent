import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';

describe('API Key Authentication Middleware', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    process.env.API_KEY = 'super-secret-key';
    app = Fastify();
    
    // We register routes and app setup
    await buildApp(app);
    
    // Register test-secure route AFTER building app to ensure middleware applies to it
    app.get('/test-secure', async () => {
      return { secure: true };
    });
  });

  afterEach(async () => {
    delete process.env.API_KEY;
    delete process.env.AUTH_PROVIDER;
    if (app) {
      await app.close();
    }
  });

  it('should allow bypass for /health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(res.statusCode).toBe(200);
  });

  it('should allow bypass for /ready', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });
    // Should NOT be 401 or 403. (Can be 503 if agent offline, but not auth error)
    expect(res.statusCode).not.toBe(401);
    expect(res.statusCode).not.toBe(403);
  });

  it('should return 401 if X-API-Key header is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure'
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'Unauthorized', message: 'API key is missing' });
  });

  it('should return 403 if X-API-Key header is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        'x-api-key': 'wrong-key'
      }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden', message: 'Invalid API key' });
  });

  it('should allow request if X-API-Key header is valid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        'x-api-key': 'super-secret-key'
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ secure: true });
  });

  it('should allow request if apiKey query parameter is valid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure?apiKey=super-secret-key'
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ secure: true });
  });

  it('should return 403 if apiKey query parameter is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-secure?apiKey=wrong-key'
    });
    expect(res.statusCode).toBe(403);
  });

  it('should return 403 with misconfiguration error if API_KEY is not set', async () => {
    const localApp = Fastify();
    delete process.env.API_KEY;
    await buildApp(localApp);
    localApp.get('/test-secure', async () => {
      return { secure: true };
    });

    const res = await localApp.inject({
      method: 'GET',
      url: '/test-secure',
      headers: {
        'x-api-key': 'any-key'
      }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Forbidden', message: 'Server auth misconfigured' });
    await localApp.close();
  });
});
