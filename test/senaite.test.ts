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
    const res = await app.inject({ method: 'GET', url: `${API}/get/clt000000000000000000000000000001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].title).toBe('Bo Government Hospital');
    await app.close();
  });

  it('creates a Client (201) with a generated UID', async () => {
    const { app } = await createSystemServer(senaite, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${API}/create/Client`,
      payload: { title: 'Freetown Clinic', ClientID: 'C-0003' },
    });
    expect(res.statusCode).toBe(201);
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
      url: `${API}/update/clt000000000000000000000000000002`,
      payload: { title: 'Kenema Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items[0].title).toBe('Kenema Renamed');
    await app.close();
  });
});
