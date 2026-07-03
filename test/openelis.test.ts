import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openelis from '../src/systems/openelis/plugin.js';

const config = { port: 0 };
const BASE = '/fhir';

describe('openelis (FHIR R4 lab)', () => {
  it('searches ServiceRequests (lab orders) as a Bundle', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/ServiceRequest` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBe(1);
    await app.close();
  });

  it('reads a DiagnosticReport with linked results', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/DiagnosticReport/report-0001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().result[0].reference).toBe('Observation/obs-0001');
    await app.close();
  });

  it('creates an Observation (result)', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/Observation`,
      payload: { resourceType: 'Observation', status: 'final' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
    await app.close();
  });

  it('serves a CapabilityStatement at /metadata', async () => {
    const { app } = await createSystemServer(openelis, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/metadata` });
    expect(res.statusCode).toBe(200);
    expect(res.json().resourceType).toBe('CapabilityStatement');
    await app.close();
  });
});
