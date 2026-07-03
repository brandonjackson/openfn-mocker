import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import ghanaNia from '../src/systems/ghana-nia/plugin.js';

const config = { port: 0 };

describe('ghana-nia', () => {
  it('registers a child (200) and mints a Ghana Card PIN', async () => {
    const { app } = await createSystemServer(ghanaNia, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/awopa/api/v1/baby/registration',
      payload: {
        babyData: { forenames: 'Test', surname: 'Baby', gender: 'Female', lightwaveETrackerID: '00999999/24-01' },
        personVouching: { relationToBaby: 'Mother' },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.code).toBe('00');
    expect(body.data.babyPin).toMatch(/^GHA-\d{9}-1$/);
    expect(body.data.etrackerLightwaveId).toBe('00999999/24-01');
    await app.close();
  });

  it('stores each registration', async () => {
    const { app, store } = await createSystemServer(ghanaNia, config, { logLevel: 'silent' });
    const before = store.count('registrations');
    await app.inject({
      method: 'POST',
      url: '/awopa/api/v1/baby/registration',
      payload: { babyData: { forenames: 'A' }, personVouching: {} },
    });
    expect(store.count('registrations')).toBe(before + 1);
    await app.close();
  });

  it('lists seeded registrations', async () => {
    const { app } = await createSystemServer(ghanaNia, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/awopa/api/v1/baby/registration' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].babyPin).toMatch(/^GHA-/);
    await app.close();
  });

  it('looks up a seeded registration by PIN', async () => {
    const { app } = await createSystemServer(ghanaNia, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/awopa/api/v1/baby/registration/GHA-001097272-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.voucherPin).toBe('GHA-001097272-4');
    await app.close();
  });

  it('404s for an unknown PIN with the NIA error envelope', async () => {
    const { app } = await createSystemServer(ghanaNia, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/awopa/api/v1/baby/registration/GHA-000000000-9' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, code: '05' });
    await app.close();
  });
});
