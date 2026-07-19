import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';

describe('Features endpoint', () => {
  let app: any;
  let originalCollaborationEnabled: string | undefined;

  beforeEach(async () => {
    originalCollaborationEnabled = process.env.COLLABORATION_ENABLED;
    app = Fastify();
    await buildApp(app);
  });

  afterEach(async () => {
    process.env.COLLABORATION_ENABLED = originalCollaborationEnabled;
    await app.close();
  });

  it('GET /api/features should return collaboration: true when enabled', async () => {
    process.env.COLLABORATION_ENABLED = 'true';
    const res = await app.inject({
      method: 'GET',
      url: '/api/features'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collaboration: true });
  });

  it('GET /api/features should return collaboration: false when disabled', async () => {
    process.env.COLLABORATION_ENABLED = 'false';
    const res = await app.inject({
      method: 'GET',
      url: '/api/features'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ collaboration: false });
  });
});
