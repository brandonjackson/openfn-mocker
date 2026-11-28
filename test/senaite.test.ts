import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import senaite from '../src/systems/senaite/plugin.js';

const config = { port: 0 };
const API = '/@@API/senaite/v1';

describe('senaite (Plone JSON API)', () => {
  it('login returns a Set-Cookie session cookie', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/login?__ac_name=admin&__ac_password=secret' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toBeTruthy();
    await app.close();
  });

  it('searches catalog objects by portal_type (envelope + seed present)', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${API}/search?portal_type=Client` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(2);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.every((o: any) => o.portal_type === 'Client')).toBe(true);
    await app.close();
  });

  it('gets a single object by UID', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${API}/get/c1000000000000000000000000000001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].title).toBe('Bo Government Hospital');
    await app.close();
  });

  it('creates a Client (200) with a generated UID', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${API}/create/Client`,
      payload: { title: 'Freetown Clinic', ClientID: 'C-0003' },
    });
    expect(res.statusCode).toBe(200);
    const obj = res.json().items[0];
    expect(obj.portal_type).toBe('Client');
    expect(obj.title).toBe('Freetown Clinic');
    expect(typeof obj.uid).toBe('string');
    await app.close();
  });

  it('updates an object by UID', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${API}/update/c1000000000000000000000000000002`,
      payload: { title: 'Kenema Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].title).toBe('Kenema Renamed');
    await app.close();
  });

  it('seeds 32-character hex UIDs, as SENAITE issues', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${API}/search` });
    for (const o of res.json().items) expect(o.uid).toMatch(/^[0-9a-f]{32}$/);
    await app.close();
  });

  it('PATCH and DELETE on /<portal_type>/<uid> update and deactivate (2.7.0 REST verbs)', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const url = `${API}/Client/c1000000000000000000000000000002`;
    const patched = await app.inject({ method: 'PATCH', url, payload: { Phone: '+232 76 000 000' } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().items[0].Phone).toBe('+232 76 000 000');
    const deleted = await app.inject({ method: 'DELETE', url });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().items[0].review_state).toBe('inactive');
    const missing = await app.inject({ method: 'PUT', url: `${API}/Client/ffffffffffffffffffffffffffffffff`, payload: {} });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('introspects types, schema and workflow', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const inClient = await app.inject({ method: 'GET', url: `${API}/types?parent_uid=c1000000000000000000000000000001` });
    expect(inClient.json().items.map((t: any) => t.portal_type)).toEqual(['AnalysisRequest', 'Contact']);
    const type = await app.inject({ method: 'GET', url: `${API}/types/Client` });
    expect(type.json().catalogs.length).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: `${API}/types/NoSuchType` })).statusCode).toBe(404);
    const schema = await app.inject({ method: 'GET', url: `${API}/schema/Client` });
    expect(schema.json().fields.find((x: any) => x.name === 'ClientID').required).toBe(true);
    const wf = await app.inject({ method: 'GET', url: `${API}/workflow/c1000000000000000000000000000001` });
    expect(wf.json().review_state).toBe('active');
    expect(wf.json().transitions.map((t: any) => t.id)).toContain('deactivate');
    await app.close();
  });

  it('creates partitions of a received sample', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${API}/partition`,
      payload: { uid: 'a5000000000000000000000000000001', partitions: [{ analyses: [] }, { analyses: [] }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(2);
    expect(res.json().items[1].id).toBe('WATER-0001-P02');
    expect((await app.inject({ method: 'POST', url: `${API}/partition`, payload: {} })).statusCode).toBe(400);
    await app.close();
  });
});
