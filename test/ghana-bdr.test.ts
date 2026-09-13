import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ghanaBdr from '../src/systems/ghana-bdr/plugin.js';

const config = { port: 0 };

const TOKEN_PATH = '/api/v1/UserManagementService/integrations/auth/token';
const BIRTH_PATH = '/api/v1/UserManagementService/integrations/registrations/birth';

/** Bearer header the adaptor sends after the token exchange. */
const bearer = { authorization: 'Bearer mock-access-token' };

describe('ghana-bdr', () => {
  it('exchanges the API token for an access token', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: TOKEN_PATH, headers: { token: 'long-lived' } });
    expect(res.statusCode).toBe(200);
    // The adaptor reads exactly these two off `api_data` and throws without them.
    const { api_data: apiData } = res.json();
    expect(typeof apiData.access_token).toBe('string');
    expect(apiData.access_token.length).toBeGreaterThan(0);
    expect(typeof apiData.expires_in).toBe('number');
    await app.close();
  });

  it('rejects a token exchange with no Token header', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: TOKEN_PATH });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('requires a bearer token on the registration endpoints', async () => {
    // autoAuth off so the harness doesn't attach a credential for us.
    const { app } = await createSystemServer(ghanaBdr, config, {
      logLevel: 'silent',
      autoAuth: false,
    });
    const res = await app.inject({ method: 'GET', url: BIRTH_PATH });
    expect(res.statusCode).toBe(401);

    // ...but the token exchange stays reachable without one.
    const token = await app.inject({
      method: 'POST',
      url: TOKEN_PATH,
      headers: { token: 'long-lived' },
    });
    expect(token.statusCode).toBe(200);
    await app.close();
  });

  it('registers a birth (200) and returns a certificate record', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: BIRTH_PATH,
      headers: bearer,
      payload: {
        registry_code: '011803',
        child: { first_name: 'Test', Surname: 'Testerson', birth_date: '2024/03/04', gender_code: '2' },
        mother: { national_id_number: 'GHA-000000000-2', first_name: 'Ama' },
        father: { first_name: 'Kofi', Surname: 'Doe' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.issuccessful).toBe(true);
    expect(body.messagecode).toBe('200');
    expect(typeof body.birth_certificate_number).toBe('string');
    expect(typeof body.reference_id).toBe('string');
    expect(body.gender).toBe('FEMALE');
    expect(body.first_name).toBe('Test');
    await app.close();
  });

  it('stores each registration', async () => {
    const { app, store } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const before = store.count('birthRecords');
    await app.inject({
      method: 'POST',
      url: BIRTH_PATH,
      headers: bearer,
      payload: { registry_code: '011803', child: { first_name: 'New' } },
    });
    expect(store.count('birthRecords')).toBe(before + 1);
    await app.close();
  });

  it('lists seeded registrations and filters by registry_code', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: BIRTH_PATH, headers: bearer });
    expect(all.statusCode).toBe(200);
    expect(all.json().count).toBeGreaterThanOrEqual(2);
    expect(all.json().records[0].birth_certificate_number).toBeDefined();

    const none = await app.inject({
      method: 'GET',
      url: `${BIRTH_PATH}?registry_code=999999`,
      headers: bearer,
    });
    expect(none.json().count).toBe(0);
    await app.close();
  });

  it('reads one registration by reference id, 404 for an unknown one', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const found = await app.inject({
      method: 'GET',
      url: `${BIRTH_PATH}/abc123de-1995`,
      headers: bearer,
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().reference_id).toBe('abc123de-1995');

    const missing = await app.inject({ method: 'GET', url: `${BIRTH_PATH}/nope`, headers: bearer });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
