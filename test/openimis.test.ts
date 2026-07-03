import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openimis from '../src/systems/openimis/plugin.js';

const config = { port: 0 };
const BASE = '/api/api_fhir_r4';

describe('openimis (FHIR R4)', () => {
  it('POST /api/api_fhir_r4/login/ returns a token', async () => {
    const { app } = await createSystemServer(openimis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: `${BASE}/login/`, payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().token).toBe('mock_openimis_token');
    await app.close();
  });

  it('searches Patients (insurees) as a searchset Bundle', async () => {
    const { app } = await createSystemServer(openimis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Patient` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBe(2);
    await app.close();
  });

  it('reads a single insuree by id', async () => {
    const { app } = await createSystemServer(openimis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Patient/insuree-0001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().name[0].family).toBe('Doe');
    await app.close();
  });

  it('creates a Contract (policy) with a server id', async () => {
    const { app } = await createSystemServer(openimis, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/Contract`,
      payload: { resourceType: 'Contract', status: 'executed' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
    expect(res.json().meta.versionId).toBe('1');
    await app.close();
  });
});
