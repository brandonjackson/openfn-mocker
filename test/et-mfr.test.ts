import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import etMfr from '../src/systems/et-mfr/plugin.js';

const config = { port: 0 };

describe('et-mfr', () => {
  it('answers the standard { result, message, model } envelope, not a bare array', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Location/Regions' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe(0);
    expect(typeof body.message).toBe('string');
    // The adaptor's Utils.js unwraps `model`, so the list must live there.
    expect(Array.isArray(body.model)).toBe(true);
    expect(body.model.length).toBeGreaterThan(0);
    await app.close();
  });

  it('lists zones and woredas with their parent unit resolved', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const zones = await app.inject({ method: 'GET', url: '/api/Location/Zones' });
    expect(zones.json().model[0].region.name).toBeTruthy();

    const woredas = await app.inject({ method: 'GET', url: '/api/Location/Woredas' });
    expect(woredas.json().model[0].zone.name).toBeTruthy();
    await app.close();
  });

  it('serves reference data by lookup name, and rejects an unknown one', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const ok = await app.inject({ method: 'GET', url: '/api/Lookup?name=FacilityType' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().model.length).toBeGreaterThan(0);
    // Our internal index onto the lookup collections is not part of the API.
    expect(ok.json().model[0].lookupType).toBeUndefined();

    // An unknown type is a 200 the API itself rejects (result 1), not an HTTP error.
    const unknown = await app.inject({ method: 'GET', url: '/api/Lookup?name=Nope' });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).toMatchObject({ result: 1, model: null });

    // A missing name is ASP.NET model validation: a 400 problem document.
    const missing = await app.inject({ method: 'GET', url: '/api/Lookup' });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().errors.name).toBeTruthy();
    await app.close();
  });

  it('lists all facilities and filters by name', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: '/api/Facility/All' });
    expect(all.statusCode).toBe(200);
    expect(all.json().model.length).toBe(3);

    const filtered = await app.inject({ method: 'GET', url: '/api/Facility/All?name=Adama' });
    expect(filtered.json().model.length).toBe(1);

    const byRegion = await app.inject({ method: 'GET', url: '/api/Facility/All?regionId=3' });
    expect(byRegion.json().model.map((f: any) => f.name)).toEqual(['Felege Hiwot Referral Hospital']);
    await app.close();
  });

  it('paginates the POST search and flattens each row', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/Facility/GetFacilities',
      payload: { pageNumber: 1, showPerPage: 2 },
    });
    expect(res.statusCode).toBe(200);
    const rows = res.json().model;
    expect(rows.length).toBe(2);
    // Lookups are resolved to names and the paging totals repeat on every row.
    expect(rows[0].region).toBe('Addis Ababa City Administration');
    expect(rows[0].totalCount).toBe(3);
    expect(rows[0].pageCount).toBe(2);
    await app.close();
  });

  it('fetches one facility by MFR id and 404s an unknown one', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const ok = await app.inject({ method: 'GET', url: '/api/Facility?id=1071644' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().model.name).toContain('Tikur Anbessa');

    const missing = await app.inject({ method: 'GET', url: '/api/Facility?id=999999' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().result).toBe(1);
    await app.close();
  });

  it('fetches one facility by DHIS2 id', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Facility/wprKoIJqBaI' });
    expect(res.statusCode).toBe(200);
    expect(res.json().model.id).toBe(1071644);
    await app.close();
  });

  it('creates a facility with 200 (never 201) and resolves its references', async () => {
    const { app, store } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const before = store.count('facilities');
    const res = await app.inject({
      method: 'POST',
      url: '/api/Facility',
      payload: { name: 'Sandbox HC', regionId: 1, zoneId: 11, woredaId: 101, facilityTypeId: 204 },
    });
    expect(res.statusCode).toBe(200);
    const created = res.json().model;
    expect(typeof created.id).toBe('number');
    expect(created.region.name).toBe('Addis Ababa City Administration');
    expect(created.facilityType.name).toBe('Health Center');
    expect(store.count('facilities')).toBe(before + 1);
    await app.close();
  });

  it('updates and deletes a facility', async () => {
    const { app, store } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/Facility',
      payload: { id: 1071645, phoneNumber: '+251221110099' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().model.phoneNumber).toBe('+251221110099');
    expect(updated.json().model.name).toBe('Adama Hospital Medical College');

    const deleted = await app.inject({ method: 'DELETE', url: '/api/Facility/yRsMqKLsDcK' });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().result).toBe(0);
    expect(store.get('facilities', '1071646')).toBeUndefined();
    await app.close();
  });

  it('exports facilities as CSV from the POST search', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/Facility/ExportCSV',
      payload: { name: 'Hospital' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/csv');
    expect(res.body).toContain('hmisCode');
    expect(res.body).toContain('"Tikur Anbessa Specialized Hospital"');
    await app.close();
  });

  it('reports health outside the envelope', async () => {
    const { app } = await createSystemServer(etMfr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/Health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('Healthy');
    expect(res.json().dependencies.length).toBeGreaterThan(0);
    await app.close();
  });
});
