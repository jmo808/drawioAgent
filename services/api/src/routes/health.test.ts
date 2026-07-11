import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { buildApp } from '../app.js';
import { MockAgent, setGlobalDispatcher } from 'undici';

describe('Health & Readiness endpoints', () => {
  let app: any;
  let mockAgent: MockAgent;

  beforeEach(async () => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    
    app = Fastify();
    await buildApp(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health should return 200 with status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready should return 200 when agent service is reachable', async () => {
    const client = mockAgent.get('http://localhost:8000');
    client.intercept({
      path: '/health',
      method: 'GET'
    }).reply(200, { status: 'ok' });

    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('GET /ready should return 503 when agent service is unreachable', async () => {
    const client = mockAgent.get('http://localhost:8000');
    client.intercept({
      path: '/health',
      method: 'GET'
    }).replyWithError(new Error('Connection refused'));

    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not ready', error: 'Connection refused' });
  });

  it('GET /ready should return 503 when agent service returns non-200', async () => {
    const client = mockAgent.get('http://localhost:8000');
    client.intercept({
      path: '/health',
      method: 'GET'
    }).reply(500, { error: 'Internal Server Error' });

    const res = await app.inject({
      method: 'GET',
      url: '/ready'
    });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not ready', error: 'Agent returned status code 500' });
  });
});
