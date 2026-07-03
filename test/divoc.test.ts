import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import divoc from '../src/systems/divoc/plugin.js';

const config = { port: 0 };

describe('divoc', () => {
  it('issues an access token at the Keycloak token endpoint', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/realms/divoc/protocol/openid-connect/token',
      payload: 'grant_type=password&username=admin&password=secret',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    await app.close();
  });

  it('certifies a vaccination (200) and returns certificate ids', async () => {
    const { app, store } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const before = store.count('certificates');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/certify',
      payload: {
        preEnrollmentCode: 'PEC-3001',
        recipient: { name: 'Test Person', dob: '1990-01-01', gender: 'Male' },
        vaccination: { name: 'COVISHIELD', dose: 1, totalDoses: 2 },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.count).toBe(1);
    expect(Array.isArray(body.certificateIds)).toBe(true);
    expect(store.count('certificates')).toBe(before + 1);
    await app.close();
  });

  it('accepts an array of certification requests', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/certify',
      payload: [{ preEnrollmentCode: 'A' }, { preEnrollmentCode: 'B' }],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(2);
    await app.close();
  });

  it('lists seeded certificates', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/certificates' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    await app.close();
  });

  it('404s an unknown certificate', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/certificate/nope' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
