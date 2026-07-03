import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import progres from '../src/systems/progres/plugin.js';

const config = { port: 0 };

describe('progres', () => {
  it('registers an individual (201) with a generated proGres ID', async () => {
    const { app } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v4/individuals',
      payload: { givenName: 'Amara', familyName: 'Okoye', dateOfBirth: '1990-01-01' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.progresId).toMatch(/^\d{9}$/);
    expect(body.status).toBe('REGISTERED');
    expect(body.givenName).toBe('Amara');
    await app.close();
  });

  it('stores each registered individual', async () => {
    const { app, store } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const before = store.count('individuals');
    await app.inject({ method: 'POST', url: '/api/v4/individuals', payload: { givenName: 'New' } });
    expect(store.count('individuals')).toBe(before + 1);
    await app.close();
  });

  it('lists seeded individuals', async () => {
    const { app } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v4/individuals' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCount).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(body.results)).toBe(true);
    await app.close();
  });

  it('fetches a seeded individual by proGres ID', async () => {
    const { app } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v4/individuals/900000001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().familyName).toBe('Okoye');
    await app.close();
  });

  it('404s for an unknown proGres ID', async () => {
    const { app } = await createSystemServer(progres, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v4/individuals/000000000' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NotFound');
    await app.close();
  });
});
