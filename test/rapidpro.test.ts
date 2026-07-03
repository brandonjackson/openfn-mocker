import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import rapidpro from '../src/systems/rapidpro/plugin.js';

const config = { port: 0 };

describe('rapidpro', () => {
  it('creates a contact (201) and returns a uuid', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/contacts.json',
      payload: { name: 'Test Person', urns: ['tel:+23276999999'] },
    });
    expect(res.statusCode).toBe(201);
    expect(typeof res.json().uuid).toBe('string');
    await app.close();
  });

  it('upserts an existing contact by matching urn (200)', async () => {
    const { app, store } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const before = store.count('contacts');
    // Seed contact Jane Doe has urn tel:+23276000001.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/contacts.json',
      payload: { name: 'Jane D. Updated', urns: ['tel:+23276000001'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Jane D. Updated');
    expect(store.count('contacts')).toBe(before); // updated, not created
    await app.close();
  });

  it('starts a flow (flow_starts)', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/flow_starts.json',
      payload: { flow: 'flow-0001-anc-reminder', groups: ['grp-0001-anc'] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.flow.name).toBe('ANC Appointment Reminder');
    await app.close();
  });

  it('sends a broadcast', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/broadcasts.json',
      payload: { urns: ['tel:+23276000001'], text: 'Hello' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().text).toEqual({ base: 'Hello' });
    await app.close();
  });

  it('lists flows in a DRF envelope', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/flows.json' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ next: null, previous: null });
    expect(Array.isArray(body.results)).toBe(true);
    await app.close();
  });
});
