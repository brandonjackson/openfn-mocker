import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ibipimo from '../src/systems/ibipimo/plugin.js';

const config = { port: 0 };

describe('ibipimo', () => {
  it('queues a viral-load request (201) with a generated requestId', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/post-viral-load-requests',
      payload: { sampleId: 'SMP-1001', patientId: 'PT-001', siteCode: 'ST-01' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.requestId).toBe('string');
    await app.close();
  });

  it('returns seeded viral-load results', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ask-for-vl-results',
      payload: { siteCode: 'ST-01' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    await app.close();
  });

  it('lists seeded sites', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/sites' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.sites)).toBe(true);
    expect(body.sites[0].code).toBe('ST-01');
    await app.close();
  });

  it('lists sample statuses', async () => {
    const { app } = await createSystemServer(ibipimo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/samples/status' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().samples)).toBe(true);
    await app.close();
  });
});
