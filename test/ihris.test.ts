import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ihris from '../src/systems/ihris/plugin.js';

const config = { port: 0 };
const BASE = '/fhir';

describe('ihris (FHIR R4 health workforce)', () => {
  it('searches Practitioners as a Bundle', async () => {
    const { app } = await createSystemServer(ihris, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Practitioner` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBe(3);
    await app.close();
  });

  it('reads a PractitionerRole linking practitioner + org + location', async () => {
    const { app } = await createSystemServer(ihris, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/PractitionerRole/role-prac-0001` });
    expect(res.statusCode).toBe(200);
    expect(res.json().practitioner.reference).toBe('Practitioner/prac-0001');
    expect(res.json().organization.reference).toBe('Organization/org-moh');
    await app.close();
  });

  it('searches Practitioners by name', async () => {
    const { app } = await createSystemServer(ihris, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: `${BASE}/Practitioner?name=Sesay` });
    expect(res.json().total).toBe(1);
    await app.close();
  });

  it('creates a Practitioner', async () => {
    const { app } = await createSystemServer(ihris, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/Practitioner`,
      payload: { resourceType: 'Practitioner', name: [{ family: 'New' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeTruthy();
    await app.close();
  });
});
