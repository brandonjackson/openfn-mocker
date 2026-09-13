import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import opencrvs from '../src/systems/opencrvs/plugin.js';
import { EVENTS, LOCATIONS } from '../src/systems/opencrvs/seed.js';

const config = { port: 0 };

describe('opencrvs', () => {
  it('GraphQL searchEvents returns seeded events', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      payload: { query: 'query { searchEvents { totalItems results { id } } }' },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data.searchEvents;
    expect(data.totalItems).toBe(2);
    expect(data.results.length).toBe(2);
    // Status and registration number are derived from the event's actions[].
    const birth = data.results.find((r: any) => r.id === EVENTS.birth);
    expect(birth.registration.status).toBe('REGISTERED');
    expect(birth.registration.registrationNumber).toBe('2024BQSQGYH');
    await app.close();
  });

  it('creates an event, notifies it, and reads it back', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const create = await app.inject({
      method: 'POST',
      url: '/api/events/events',
      payload: { type: 'v2.birth', transactionId: 'txn-123' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().id;
    // An EventDocument has no top-level status — only an ordered actions[].
    expect(create.json().status).toBeUndefined();
    expect(create.json().actions.map((a: any) => a.type)).toEqual(['CREATE']);
    expect(typeof create.json().trackingId).toBe('string');

    const notify = await app.inject({
      method: 'POST',
      url: `/api/events/events/${id}/notify`,
      payload: { transactionId: 'txn-124', declaration: { 'child.firstname': 'Baby' } },
    });
    expect(notify.statusCode).toBe(200);
    expect(notify.json().actions.map((a: any) => a.type)).toEqual(['CREATE', 'NOTIFY']);

    const read = await app.inject({ method: 'GET', url: `/api/events/events/${id}` });
    const notified = read.json().actions.find((a: any) => a.type === 'NOTIFY');
    expect(notified.declaration['child.firstname']).toBe('Baby');
    await app.close();
  });

  it('searches events instead of listing them (there is no GET collection route)', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const all = await app.inject({ method: 'POST', url: '/api/events/events/search', payload: {} });
    expect(all.statusCode).toBe(200);
    expect(all.json().total).toBe(2);

    const registered = await app.inject({
      method: 'POST',
      url: '/api/events/events/search',
      payload: {
        query: { type: 'and', clauses: [{ eventType: 'v2.birth', status: { type: 'anyOf', terms: ['REGISTERED'] } }] },
      },
    });
    expect(registered.json().total).toBe(1);
    expect(registered.json().results[0].id).toBe(EVENTS.birth);
    expect(registered.json().results[0].legalStatuses.REGISTERED.registrationNumber).toBe('2024BQSQGYH');

    const missing = await app.inject({ method: 'GET', url: '/api/events/events' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('lists locations in the v2 shape', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/events/locations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(4);
    const facility = res.json().find((l: any) => l.id === LOCATIONS.facility);
    expect(facility.locationType).toBe('HEALTH_FACILITY');
    expect(facility.administrativeAreaId).toBe(LOCATIONS.district);

    const offices = await app.inject({ method: 'GET', url: '/api/events/locations?locationType=CRVS_OFFICE' });
    expect(offices.json().map((l: any) => l.id)).toEqual([LOCATIONS.office]);
    await app.close();
  });

  it('accepts a birth notification', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/notification', payload: { child: { firstName: 'X' } } });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe('received');
    await app.close();
  });

  it('mints an access token for the OAuth client-credentials exchange', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/token',
      payload: { grant_type: 'client_credentials', client_id: 'x', client_secret: 'y' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().access_token).toBe('string');
    await app.close();
  });
});
