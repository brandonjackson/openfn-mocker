import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import etMfr from '../src/systems/et-mfr/plugin.js';

const config = { port: 0 };

describe('et-mfr', () => {
  it('lists regions', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Location/Regions' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    await app.close();
  });

  it('lists all facilities and filters by name', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: '/api/Facility/All' });
    expect(all.statusCode).toBe(200);
    expect(all.json().facilities.length).toBeGreaterThan(0);

    const filtered = await app.inject({ method: 'GET', url: '/api/Facility/All?name=Adama' });
    expect(filtered.json().facilities.length).toBe(1);
    await app.close();
  });

  it('paginates GetFacilities', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Facility/GetFacilities?page=1&pageSize=2' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.facilities.length).toBe(2);
    expect(body.page).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(3);
    await app.close();
  });

  it('fetches one facility by id and 404s an unknown one', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const ok = await app.inject({ method: 'GET', url: '/api/Facility?id=FAC-0001' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().facilityName).toContain('Tikur Anbessa');

    const missing = await app.inject({ method: 'GET', url: '/api/Facility?id=NOPE' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('creates a facility (201)', async () => {
    const { app, store } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const before = store.count('facilities');
    const res = await app.inject({
      method: 'POST',
      url: '/api/Facility',
      payload: { facilityName: 'Sandbox HC', region: 'Addis Ababa' },
    });
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().facilityId).toBe('string');
    expect(store.count('facilities')).toBe(before + 1);
    await app.close();
  });

  it('exports facilities as CSV', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Facility/ExportCSV' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('facilityId');
    await app.close();
  });
});
