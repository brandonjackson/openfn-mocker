import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import divoc from '../src/systems/divoc/plugin.js';

const config = { port: 0 };

describe('divoc', () => {
  it('establishes a token at the vendor login endpoint', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/authorize',
      payload: { mobile: '+250788000000', token2fa: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    await app.close();
  });

  it('401s a login with no mobile number', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/authorize', payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('issues an access token at the bundled Keycloak token endpoint', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/keycloak/auth/realms/divoc/protocol/openid-connect/token',
      payload: 'grant_type=password&username=admin&password=secret',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.token_type).toBe('Bearer');
    await app.close();
  });

  it('certifies an array of vaccinations (200) and returns certificate ids', async () => {
    const { app, store } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const before = store.count('certificates');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/certify',
      payload: [
        {
          preEnrollmentCode: 'PEC-3001',
          recipient: { name: 'Test Person', dob: '1990-01-01', gender: 'Male' },
          vaccination: { name: 'COVISHIELD', dose: 1, totalDoses: 2 },
        },
      ],
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.count).toBe(1);
    expect(Array.isArray(body.certificateIds)).toBe(true);
    expect(store.count('certificates')).toBe(before + 1);
    await app.close();
  });

  it('also accepts a bare certification request object', async () => {
    // The vendor types the body as an array; the adaptor posts whatever the job
    // hands it, so the mock stays lenient about a single object.
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/certify',
      payload: { preEnrollmentCode: 'A' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().count).toBe(1);
    await app.close();
  });

  it("returns the recipient's certificate as a single object, not a list", async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/certificates' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(false);
    expect(typeof body.certificateId).toBe('string');
    await app.close();
  });

  it('serves the most recently issued certificate', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    await app.inject({
      method: 'POST',
      url: '/v1/certify',
      payload: [{ preEnrollmentCode: 'PEC-4001', recipient: { name: 'Newest' } }],
    });
    const res = await app.inject({ method: 'GET', url: '/v1/certificates' });
    expect(res.json().preEnrollmentCode).toBe('PEC-4001');
    await app.close();
  });

  it('revokes every dose for a pre-enrollment code', async () => {
    const { app, store } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const before = store.count('certificates');
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/certificates/PEC-10000002?allDoses=true',
    });
    expect(res.statusCode).toBe(200);
    expect(store.count('certificates')).toBe(before - 1);
    await app.close();
  });

  it('404s a revoke for an unknown pre-enrollment code', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'DELETE', url: '/v1/certificates/nope?allDoses=true' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('lists pre-enrollments and reads one by code, 404 for an unknown one', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'GET', url: '/v1/preEnrollments' });
    expect(all.statusCode).toBe(200);
    expect(all.json().length).toBeGreaterThan(0);

    const one = await app.inject({ method: 'GET', url: '/v1/preEnrollments/PEC-10000001' });
    expect(one.statusCode).toBe(200);
    expect(one.json().name).toBe('Amara Okafor');

    const missing = await app.inject({ method: 'GET', url: '/v1/preEnrollments/nope' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('serves the facility configuration reads and the heartbeat', async () => {
    const { app } = await createSystemServer(divoc, config, { logLevel: 'silent' });
    const programs = await app.inject({ method: 'GET', url: '/v1/programs/current' });
    expect(programs.json()[0].medicines[0].name).toBe('COVISHIELD');

    const vaccinators = await app.inject({ method: 'GET', url: '/v1/vaccinators' });
    expect(vaccinators.json().length).toBeGreaterThan(0);

    const me = await app.inject({ method: 'GET', url: '/v1/users/me' });
    expect(Array.isArray(me.json().roles)).toBe(true);

    const ping = await app.inject({ method: 'GET', url: '/v1/ping' });
    expect(ping.statusCode).toBe(200);
    await app.close();
  });
});
