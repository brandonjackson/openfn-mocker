import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import primero from '../src/systems/primero/plugin.js';

const config = { port: 0, baseUrl: 'http://localhost:4017' };

const apps: FastifyInstance[] = [];
async function makeApp(): Promise<FastifyInstance> {
  const { app } = await createSystemServer(primero, config, { logLevel: 'silent' });
  apps.push(app);
  return app;
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('primero (token-exchange, nested data envelope)', () => {
  it('POST /api/v2/tokens returns a mock token for any body', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/tokens',
      payload: { user: { user_name: 'primero', password: 'mock' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe('mock_primero_token');
  });

  it('GET /api/v2/cases returns seed data in { data, metadata } envelope', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/cases' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
    expect(body.metadata).toMatchObject({ per: 20, page: 1 });
    expect(body.metadata.total).toBe(body.data.length);
    // Business fields nested under data.
    const first = body.data[0];
    expect(first.case_id).toMatch(/^CP-\d{4}-\d{3}$/);
    expect(first.status).toBe('open');
    expect(first.data).toMatchObject({ name_first: expect.any(String), risk_level: expect.any(String) });
    expect(Array.isArray(first.data.protection_concerns)).toBe(true);
  });

  it('POST then GET a case round-trips with generated id + case_id', async () => {
    const app = await makeApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v2/cases',
      payload: {
        data: {
          name_first: 'Fatmata',
          name_last: 'Bangura',
          age: 10,
          sex: 'female',
          protection_concerns: ['abandonment'],
          risk_level: 'medium',
        },
      },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json();
    expect(createdBody.data.id).toBeTruthy();
    expect(createdBody.data.case_id).toMatch(/^CP-\d{4}-\d{3}$/);
    expect(createdBody.data.data.name_first).toBe('Fatmata');

    const id = createdBody.data.id;
    const read = await app.inject({ method: 'GET', url: `/api/v2/cases/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.data.name_last).toBe('Bangura');
  });

  it('PATCH merges nested data without clobbering other fields', async () => {
    const app = await makeApp();
    const list = await app.inject({ method: 'GET', url: '/api/v2/cases' });
    const target = list.json().data[0];

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v2/cases/${target.id}`,
      payload: { data: { risk_level: 'low' }, status: 'closed' },
    });
    expect(patched.statusCode).toBe(200);
    const pb = patched.json();
    expect(pb.data.data.risk_level).toBe('low');
    // Untouched nested field preserved.
    expect(pb.data.data.name_first).toBe(target.data.name_first);
    expect(pb.data.status).toBe('closed');
  });

  it('supports ?query= loose filtering on cases', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/cases?query=Jane' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((c: any) => JSON.stringify(c.data).includes('Jane'))).toBe(true);
  });

  it('GET /api/v2/incidents returns seed incidents in the same envelope', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/incidents' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].incident_id).toMatch(/^IN-\d{4}-\d{3}$/);
    expect(body.data[0].data).toBeTruthy();
  });

  it('POST /api/v2/incidents creates an incident', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/incidents',
      payload: { data: { cp_incident_violence_type: 'neglect', description: 'New incident' } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).toBeTruthy();
    expect(body.data.data.cp_incident_violence_type).toBe('neglect');
  });

  it('POST /api/v2/referrals creates a referral wrapped in { data }', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/referrals',
      payload: { data: { record_type: 'case', transitioned_to: 'social_worker2', notes: 'follow up' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.id).toBeTruthy();
    expect(body.data.status).toBe('in_progress');
    expect(body.data.data.transitioned_to).toBe('social_worker2');
  });

  it('GET missing case returns 404', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/cases/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
