import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import lamisplus from '../src/systems/lamisplus/plugin.js';

const config = { port: 0 };

describe('lamisplus', () => {
  it('logs in and returns an accessToken', async () => {
    const { app } = await createSystemServer(lamisplus, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/core/api/v1/auth/login',
      payload: { email: 'admin@lamisplus.org', password: 'secret' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().accessToken).toBe('string');
    await app.close();
  });

  it('lists patients in the { data: { patients } } envelope', async () => {
    const { app } = await createSystemServer(lamisplus, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/plugin/ehr/api/v1/patient' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data.patients)).toBe(true);
    expect(body.data.patients.length).toBeGreaterThan(0);
    await app.close();
  });

  it('filters patients by searchValue', async () => {
    const { app } = await createSystemServer(lamisplus, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/plugin/ehr/api/v1/patient?searchValue=Adeyemi' });
    expect(res.statusCode).toBe(200);
    const patients = res.json().data.patients;
    expect(patients.length).toBe(1);
    expect(patients[0].surname).toBe('Adeyemi');
    await app.close();
  });

  it('creates a patient (201)', async () => {
    const { app, store } = await createSystemServer(lamisplus, config, { logLevel: 'silent' });
    const before = store.count('patients');
    const res = await app.inject({
      method: 'POST',
      url: '/plugin/ehr/api/v1/patient',
      payload: { firstName: 'Ada', surname: 'Nwosu', sex: 'FEMALE' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.firstName).toBe('Ada');
    expect(store.count('patients')).toBe(before + 1);
    await app.close();
  });

  it('404s an unknown patient', async () => {
    const { app } = await createSystemServer(lamisplus, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/plugin/ehr/api/v1/patient/99999' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
