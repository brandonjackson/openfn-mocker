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

  it('sends a message to a seeded contact and lists it', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const sent = await app.inject({
      method: 'POST',
      url: '/api/v2/messages.json',
      payload: { contact: 'a052b00c-15b3-48e6-9771-edbaa277a353', text: 'Hi' },
    });
    expect(sent.statusCode).toBe(201);
    expect(sent.json().direction).toBe('out');
    const list = await app.inject({ method: 'GET', url: '/api/v2/messages.json?contact=a052b00c-15b3-48e6-9771-edbaa277a353' });
    expect(list.json().results.some((m: any) => m.uuid === sent.json().uuid)).toBe(true);
    const bad = await app.inject({ method: 'POST', url: '/api/v2/messages.json', payload: { contact: 'nope', text: 'Hi' } });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it('adds contacts to a group in bulk (204)', async () => {
    const { app, store } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/contact_actions.json',
      payload: { contacts: ['tel:+23276000003'], action: 'add', group: 'ANC Mothers' },
    });
    expect(res.statusCode).toBe(204);
    const c = store.list('contacts', (x) => x.urns.includes('tel:+23276000003'))[0];
    expect(c.groups.map((g: any) => g.uuid)).toContain('grp-0001-anc');
    await app.close();
  });

  it('creates a group and lists runs of a flow', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const g = await app.inject({ method: 'POST', url: '/api/v2/groups.json', payload: { name: 'Postnatal' } });
    expect(g.statusCode).toBe(201);
    const runs = await app.inject({ method: 'GET', url: '/api/v2/runs.json?flow=flow-0001-anc-reminder' });
    expect(runs.json().results[0].values.confirmed.category).toBe('Yes');
    const ws = await app.inject({ method: 'GET', url: '/api/v2/workspace.json' });
    expect(ws.json().date_style).toBe('day_first');
    await app.close();
  });

  it('rejects an unknown flow or group with a 400 like RapidPro', async () => {
    const { app } = await createSystemServer(rapidpro, config, { logLevel: 'silent' });
    const fs = await app.inject({ method: 'POST', url: '/api/v2/flow_starts.json', payload: { flow: 'nope', urns: ['tel:+1'] } });
    expect(fs.statusCode).toBe(400);
    expect(fs.json().flow[0]).toMatch(/No such object/);
    const c = await app.inject({ method: 'POST', url: '/api/v2/contacts.json', payload: { name: 'X', groups: ['nope'] } });
    expect(c.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/api/v2/contacts.json', payload: { name: 'Y', groups: ['ANC Mothers'] } });
    expect(ok.json().groups).toEqual([{ uuid: 'grp-0001-anc', name: 'ANC Mothers' }]);
    await app.close();
  });
});
