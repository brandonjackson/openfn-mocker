import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import collections from '../src/systems/collections/plugin.js';

const config = { port: 0 };

describe('collections', () => {
  it('lists values in a collection with a cursor', async () => {
    const { app } = await createSystemServer(collections, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/patients' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.cursor).toBe(null);
    await app.close();
  });

  it('fetches a single value by key (value is a JSON string)', async () => {
    const { app } = await createSystemServer(collections, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/patients/patient-001' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.key).toBe('patient-001');
    expect(JSON.parse(body.value).name).toBe('Ada');
    await app.close();
  });

  it('404s for a missing key', async () => {
    const { app } = await createSystemServer(collections, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/patients/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    await app.close();
  });

  it('upserts key/value pairs', async () => {
    const { app } = await createSystemServer(collections, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/patients',
      payload: { items: [{ key: 'patient-003', value: JSON.stringify({ name: 'Grace' }) }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().upserted).toBe(1);

    const check = await app.inject({ method: 'GET', url: '/patients/patient-003' });
    expect(check.statusCode).toBe(200);
    expect(JSON.parse(check.json().value).name).toBe('Grace');
    await app.close();
  });

  it('removes a value by key', async () => {
    const { app } = await createSystemServer(collections, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'DELETE', url: '/patients/patient-001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().deleted).toBe(1);
    await app.close();
  });
});
