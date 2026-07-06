import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import dagu from '../src/systems/dagu/plugin.js';

const config = { port: 0 };

describe('dagu', () => {
  it('lists seeded DAGs under the DAGs envelope', async () => {
    const { app } = await createSystemServer(dagu, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/dags' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.DAGs)).toBe(true);
    expect(body.HasError).toBe(false);
    expect(body.DAGs.length).toBeGreaterThan(0);
    await app.close();
  });

  it('fetches a DAG by name', async () => {
    const { app } = await createSystemServer(dagu, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/dags/nightly' });
    expect(res.statusCode).toBe(200);
    expect(res.json().DAG.name).toBe('nightly');
    await app.close();
  });

  it('acknowledges a start action', async () => {
    const { app } = await createSystemServer(dagu, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dags/nightly',
      payload: { action: 'start' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 404 for an unknown DAG', async () => {
    const { app } = await createSystemServer(dagu, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/dags/missing' });
    expect(res.statusCode).toBe(404);
    expect(res.json().HasError).toBe(true);
    await app.close();
  });
});
