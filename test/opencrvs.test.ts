import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import opencrvs from '../src/systems/opencrvs/plugin.js';

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
    expect(create.json().status).toBe('CREATED');

    const notify = await app.inject({
      method: 'POST',
      url: `/api/events/events/${id}/notify`,
      payload: { data: { 'child.firstname': 'Baby' } },
    });
    expect(notify.statusCode).toBe(200);
    expect(notify.json().status).toBe('NOTIFIED');

    const read = await app.inject({ method: 'GET', url: `/api/events/events/${id}` });
    expect(read.json().data['child.firstname']).toBe('Baby');
    await app.close();
  });

  it('lists locations', async () => {
    const { app } = await createSystemServer(opencrvs, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/events/locations' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(3);
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
