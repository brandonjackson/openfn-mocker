import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import satusehat from '../src/systems/satusehat/plugin.js';

const config = { port: 0 };
const BASE = '/fhir-r4/v1';

describe('satusehat (FHIR R4 + OAuth2)', () => {
  it('mints an OAuth2 access token at the token endpoint', async () => {
    const { app } = await createSystemServer(satusehat, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/oauth2/v1/accesstoken?grant_type=client_credentials',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'client_id=abc&client_secret=xyz',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.access_token).toBe('mock-satusehat-token');
    expect(body.token_type).toBe('BearerToken');
    await app.close();
  });

  it('creates a Patient (201) with a server id and FHIR meta', async () => {
    const { app } = await createSystemServer(satusehat, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/Patient`,
      payload: { resourceType: 'Patient', name: [{ text: 'Test Patient' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().resourceType).toBe('Patient');
    expect(res.json().id).toBeTruthy();
    expect(res.json().meta.versionId).toBe('1');
    await app.close();
  });

  it('searches Patients as a searchset Bundle (seed present)', async () => {
    const { app } = await createSystemServer(satusehat, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Patient` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBe(2);
    await app.close();
  });

  it('reads a single seeded Patient by id', async () => {
    const { app } = await createSystemServer(satusehat, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Patient/P02478375123` });
    expect(res.statusCode).toBe(200);
    expect(res.json().name[0].family).toBe('Santoso');
    await app.close();
  });

  it('applies a JSON-Patch to a seeded Patient', async () => {
    const { app } = await createSystemServer(satusehat, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PATCH',
      url: `${BASE}/Patient/P02478375123`,
      headers: { 'content-type': 'application/json-patch+json' },
      payload: JSON.stringify([{ op: 'replace', path: '/active', value: false }]),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().active).toBe(false);
    expect(res.json().meta.versionId).toBe('2');
    await app.close();
  });
});
