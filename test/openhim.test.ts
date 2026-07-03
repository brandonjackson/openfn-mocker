import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openhim from '../src/systems/openhim/plugin.js';

const config = { port: 0 };

describe('openhim', () => {
  it('lists channels as a bare array', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/channels' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json().length).toBe(2);
    await app.close();
  });

  it('creates a client (201) with a Mongo _id', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      payload: { clientID: 'newclient', name: 'New Client', roles: ['x'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()._id).toBeTruthy();
    await app.close();
  });

  it('reads transactions (read-only) and 404s unknown ids', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const list = await app.inject({ method: 'GET', url: '/transactions' });
    expect(list.json().length).toBe(2);
    const missing = await app.inject({ method: 'GET', url: '/transactions/nope' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('accepts a CHW encounter', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/chw/encounter',
      payload: { patient: 'Jane Doe', observations: [{ code: 'temp', value: 37 }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().receivedAt).toBeTruthy();
    await app.close();
  });
});
