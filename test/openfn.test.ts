import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openfn from '../src/systems/openfn/plugin.js';

const config = { port: 0 };

describe('openfn', () => {
  it('lists seeded jobs under an items envelope', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/jobs' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    await app.close();
  });

  it('creates a job (201) with a generated id', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/jobs',
      payload: { name: 'Nightly sync', adaptor: '@openfn/language-http' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe('Nightly sync');
    await app.close();
  });

  it('fetches a job by id', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/jobs/11111111-1111-4111-8111-111111111111',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Fetch patients');
    await app.close();
  });

  it('returns 404 for an unknown job', async () => {
    const { app } = await createSystemServer(openfn, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/jobs/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    await app.close();
  });
});
