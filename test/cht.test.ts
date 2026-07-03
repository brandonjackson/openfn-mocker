import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import cht from '../src/systems/cht/plugin.js';

const config = { port: 0 };

describe('cht (Community Health Toolkit)', () => {
  it('creates a person via the Medic REST API', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/people',
      payload: { name: 'New CHW', phone: '+23276111111' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBeTruthy();
    const read = await app.inject({ method: 'GET', url: `/medic/${body.id}` });
    expect(read.json().type).toBe('person');
    await app.close();
  });

  it('serves the CouchDB _changes feed', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/medic/_changes' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body).toHaveProperty('last_seq');
    await app.close();
  });

  it('filters _changes by ?since=', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: '/medic/_changes' });
    const total = all.json().results.length;
    const res = await app.inject({ method: 'GET', url: '/medic/_changes?since=2' });
    expect(res.json().results.length).toBe(total - 2);
    await app.close();
  });

  it('writes multiple docs via _bulk_docs', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/medic/_bulk_docs',
      payload: { docs: [{ _id: 'bulk-1', type: 'person' }, { type: 'clinic' }] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].ok).toBe(true);
    await app.close();
  });

  it('reads and updates app settings', async () => {
    const { app } = await createSystemServer(cht, config, { logLevel: 'silent' });
    const get = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(get.json().locale).toBe('en');
    const put = await app.inject({ method: 'PUT', url: '/api/v1/settings', payload: { locale: 'fr' } });
    expect(put.json().success).toBe(true);
    const after = await app.inject({ method: 'GET', url: '/api/v1/settings' });
    expect(after.json().locale).toBe('fr');
    await app.close();
  });
});
