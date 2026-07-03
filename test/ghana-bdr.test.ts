import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ghanaBdr from '../src/systems/ghana-bdr/plugin.js';

const config = { port: 0 };

/** BDR double-encodes its JSON response: parse the wire body twice. */
function decode(res: { json: () => any }): any {
  const once = res.json(); // wire body -> inner JSON string
  return typeof once === 'string' ? JSON.parse(once) : once;
}

describe('ghana-bdr', () => {
  it('registers a birth (200) and returns a double-encoded certificate record', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notification',
      payload: {
        registry_code: '011803',
        child: { first_name: 'Test', Surname: 'Testerson', birth_date: '2024/03/04', gender_code: '2' },
        mother: { national_id_number: 'GHA-000000000-2', first_name: 'Ama' },
        father: { first_name: 'Kofi', Surname: 'Doe' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = decode(res);
    expect(body.issuccessful).toBe(true);
    expect(body.messagecode).toBe('200');
    expect(typeof body.birth_certificate_number).toBe('string');
    expect(typeof body.reference_id).toBe('string');
    expect(body.gender).toBe('FEMALE');
    await app.close();
  });

  it('stores each notification', async () => {
    const { app, store } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const before = store.count('notifications');
    await app.inject({ method: 'POST', url: '/api/notification', payload: { registry_code: '011803', child: {} } });
    expect(store.count('notifications')).toBe(before + 1);
    await app.close();
  });

  it('tolerates a double-encoded request body (adaptor wire format)', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/notification',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify(JSON.stringify({ registry_code: '011803', child: { first_name: 'Wire' } })),
    });
    expect(res.statusCode).toBe(200);
    expect(decode(res).issuccessful).toBe(true);
    await app.close();
  });

  it('lists seeded notifications', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/notification' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBeGreaterThanOrEqual(2);
    expect(body.notifications[0].birth_certificate_number).toBeDefined();
    await app.close();
  });
});
