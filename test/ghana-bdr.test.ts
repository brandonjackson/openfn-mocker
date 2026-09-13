import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ghanaBdr from '../src/systems/ghana-bdr/plugin.js';

const config = { port: 0 };

const BASE = '/api/v1/UserManagementService/integrations';
const TOKEN_PATH = `${BASE}/auth/token`;
const REFRESH_PATH = `${BASE}/auth/refresh`;
const BIRTH_PATH = `${BASE}/registrations/birth`;
const DEATH_PATH = `${BASE}/registrations/death`;
const UTILITY_PATH = `${BASE}/utility`;

const SEEDED_BIRTH = 'BIRTH-121234-2026-0000001';
const SEEDED_DEATH = 'DEATH-121234-2026-0000001';

/** Bearer header the adaptor sends after the token exchange. */
const bearer = { authorization: 'Bearer mock-access-token' };

/** A minimal payload that satisfies the three fields enforced at submit time. */
const birthPayload = {
  status: 'COMPLETE',
  region_id: 4348,
  district_id: 338,
  type_of_birth: 'SINGLETON',
  informant_type: 'MOTHER',
  informant_first_name: 'Adwoa',
  informant_last_name: 'Godson',
  child_first_name: 'Francis',
  child_last_name: 'Benzoic',
  child_gender: 'MALE',
  child_dob: '2026-06-26',
  mother_first_name: 'Adwoa',
  mother_last_name: 'Godson',
  doubtful_maternity: 0,
  father_first_name: 'David',
  father_last_name: 'Godson',
  doubtful_paternity: 1,
};

describe('ghana-bdr', () => {
  it('exchanges the API token for an access token', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: TOKEN_PATH, headers: { token: 'long-lived' } });
    expect(res.statusCode).toBe(200);
    // The adaptor reads exactly these two off `api_data` and throws without them.
    const { api_data: apiData, api_code: apiCode } = res.json();
    expect(apiCode).toBe(200);
    expect(typeof apiData.access_token).toBe('string');
    expect(apiData.access_token.length).toBeGreaterThan(0);
    expect(typeof apiData.expires_in).toBe('number');
    expect(typeof apiData.refresh_token).toBe('string');
    await app.close();
  });

  it('rejects a token exchange with no credential at all', async () => {
    // autoAuth off so the harness doesn't attach a Bearer token for us — the
    // vendor accepts the consumer token as `Token:` OR `Authorization: Bearer`.
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent', autoAuth: false });
    const res = await app.inject({ method: 'POST', url: TOKEN_PATH });
    expect(res.statusCode).toBe(401);
    expect(res.json().api_status).toBe('error');
    await app.close();
  });

  it('refreshes a token pair, and 422s without a refresh token', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: REFRESH_PATH,
      payload: { refresh_token: 'mock-refresh-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().api_data.access_token).toBe('string');

    const bad = await app.inject({ method: 'POST', url: REFRESH_PATH, payload: {} });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });

  it('requires a bearer token on the registration endpoints', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, {
      logLevel: 'silent',
      autoAuth: false,
    });
    const res = await app.inject({ method: 'GET', url: `${BIRTH_PATH}/${SEEDED_BIRTH}` });
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

  it('registers a birth (200) and returns the stored record in the envelope', async () => {
    const { app, store } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const before = store.count('birthRecords');
    const res = await app.inject({
      method: 'POST',
      url: BIRTH_PATH,
      headers: bearer,
      payload: birthPayload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.api_code).toBe(200);
    expect(body.api_status).toBe('success');
    const record = body.api_data;
    expect(record.document_number).toMatch(/^BIRTH-/);
    expect(record.service_type).toBe('EARLY_BIRTH');
    expect(record.status).toBe('PENDING');
    // Names come back upper-cased by the registry; dates do not change.
    expect(record.child_first_name).toBe('FRANCIS');
    expect(record.child_dob).toBe('2026-06-26');
    // 0/1 goes in, a boolean comes back.
    expect(record.doubtful_paternity).toBe(true);
    expect(record.registry_id).toBe(1);
    // The create response carries no process flow or callback history.
    expect(record.process_flow).toBeUndefined();
    expect(record.callback_history).toBeUndefined();
    expect(store.count('birthRecords')).toBe(before + 1);
    await app.close();
  });

  it('enforces status, region_id and district_id in both modes', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    for (const missing of ['status', 'region_id', 'district_id']) {
      const payload: Record<string, any> = { ...birthPayload };
      delete payload[missing];
      const res = await app.inject({ method: 'POST', url: BIRTH_PATH, headers: bearer, payload });
      expect(res.statusCode).toBe(422);
      expect(res.json().api_message).toContain(missing);
    }
    await app.close();
  });

  it('dates a birth older than a year as a LATE_BIRTH', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: BIRTH_PATH,
      headers: bearer,
      payload: { ...birthPayload, child_dob: '2019-01-01' },
    });
    expect(res.json().api_data.service_type).toBe('LATE_BIRTH');
    await app.close();
  });

  it('polls one birth record by document number, 404 for an unknown one', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const found = await app.inject({
      method: 'GET',
      url: `${BIRTH_PATH}/${SEEDED_BIRTH}`,
      headers: bearer,
    });
    expect(found.statusCode).toBe(200);
    const record = found.json().api_data;
    expect(record.document_number).toBe(SEEDED_BIRTH);
    // The status lookup — and only the status lookup — carries these.
    expect(record.process_flow.current_stage).toBe('MARKED_COMPLETE');
    expect(Array.isArray(record.callback_history)).toBe(true);

    const missing = await app.inject({ method: 'GET', url: `${BIRTH_PATH}/nope`, headers: bearer });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().api_status).toBe('error');
    await app.close();
  });

  it('updates a birth record in place, keeping its document number', async () => {
    const { app, store } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const before = store.count('birthRecords');
    const res = await app.inject({
      method: 'POST',
      url: `${BIRTH_PATH}/${SEEDED_BIRTH}`,
      headers: bearer,
      payload: { ...birthPayload, child_town: 'Tema' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().api_data.document_number).toBe(SEEDED_BIRTH);
    expect(res.json().api_data.child_town).toBe('TEMA');
    expect(store.count('birthRecords')).toBe(before);

    const missing = await app.inject({
      method: 'POST',
      url: `${BIRTH_PATH}/nope`,
      headers: bearer,
      payload: birthPayload,
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('registers a death and polls it back', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const created = await app.inject({
      method: 'POST',
      url: DEATH_PATH,
      headers: bearer,
      payload: {
        status: 'COMPLETE',
        region_id: 4348,
        district_id: 338,
        deceased_first_name: 'Yaw',
        deceased_last_name: 'Mensah',
        deceased_date_of_death: '2026-08-30',
      },
    });
    expect(created.statusCode).toBe(200);
    const docNumber = created.json().api_data.document_number;
    expect(docNumber).toMatch(/^DEATH-/);

    const found = await app.inject({ method: 'GET', url: `${DEATH_PATH}/${docNumber}`, headers: bearer });
    expect(found.statusCode).toBe(200);
    expect(found.json().api_data.deceased_first_name).toBe('YAW');

    const seeded = await app.inject({ method: 'GET', url: `${DEATH_PATH}/${SEEDED_DEATH}`, headers: bearer });
    expect(seeded.statusCode).toBe(200);

    const missing = await app.inject({ method: 'GET', url: `${DEATH_PATH}/nope`, headers: bearer });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('serves the coded-value lookups, narrowed by their parent id', async () => {
    const { app } = await createSystemServer(ghanaBdr, config, { logLevel: 'silent' });
    const regions = await app.inject({
      method: 'POST',
      url: UTILITY_PATH,
      headers: bearer,
      payload: { utility_type: 'REGION', country_id: 1 },
    });
    expect(regions.statusCode).toBe(200);
    expect(regions.json().api_data[0]).toMatchObject({ id: 4348, name: 'GREATER ACCRA' });

    const districts = await app.inject({
      method: 'POST',
      url: UTILITY_PATH,
      headers: bearer,
      payload: { utility_type: 'DISTRICT', region_id: 4349 },
    });
    expect(districts.json().api_data).toHaveLength(1);
    expect(districts.json().api_data[0].name).toBe('KUMASI METROPOLITAN');

    // Flat lookups come back as plain strings.
    const genders = await app.inject({
      method: 'POST',
      url: UTILITY_PATH,
      headers: bearer,
      payload: { utility_type: 'GENDER' },
    });
    expect(genders.json().api_data).toEqual(['MALE', 'FEMALE']);

    const bad = await app.inject({
      method: 'POST',
      url: UTILITY_PATH,
      headers: bearer,
      payload: { utility_type: 'NOT_A_LIST' },
    });
    expect(bad.statusCode).toBe(422);
    await app.close();
  });
});
