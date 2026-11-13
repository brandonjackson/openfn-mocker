import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openfn from '../src/systems/openfn/plugin.js';

const config = { port: 0 };
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

describe('openfn', () => {
  it('lists seeded jobs as a paginated JSON:API document', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/jobs' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toMatchObject({ type: 'jobs', attributes: { name: expect.any(String) } });
    expect(body.included).toEqual([]);
    expect(body.links).toMatchObject({ first: expect.any(String), next: null, prev: null });
    await app.close();
  });

  it('pages a listing with page / page_size', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/jobs?page=1&page_size=1' });
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.links.next).toContain('page=2');
    await app.close();
  });

  it('fetches a job by id', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/11111111-1111-4111-8111-111111111111',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.attributes.name).toBe('Fetch patients');
    await app.close();
  });

  it('has no POST /api/jobs: jobs are read-only in Lightning', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/api/jobs', payload: { name: 'x' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('creates a credential (201) linked to a project, without echoing secrets', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/credentials',
      payload: {
        name: 'DHIS2 production',
        schema: 'dhis2',
        credential_bodies: [{ name: 'main', body: { username: 'u', password: 'p' } }],
        project_credentials: [{ project_id: PROJECT_ID }],
      },
    });
    expect(res.statusCode).toBe(201);
    const { credential } = res.json();
    expect(credential).toMatchObject({ name: 'DHIS2 production', schema: 'dhis2' });
    expect(credential.projects[0].id).toBe(PROJECT_ID);
    expect(JSON.stringify(credential)).not.toContain('password');
    await app.close();
  });

  it('returns a 404 problem document for an unknown job', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/jobs/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ status: 404, code: 'not_found' });
    await app.close();
  });
});
