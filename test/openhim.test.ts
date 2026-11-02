import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openhim from '../src/systems/openhim/plugin.js';

const config = { port: 0 };
const CHANNEL_CHW = '6368616e2d63687700000000';
const CLIENT_REPORTER = '636c69656e742d7265700000';
const TXN_1 = '74786e2d3100000000000000';

const basic = (user: string) => `Basic ${Buffer.from(`${user}:secret`).toString('base64')}`;

describe('openhim', () => {
  it('lists channels as a bare array', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/channels' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    expect(res.json().length).toBe(3);
    await app.close();
  });

  it('creates a client with 201 and a text confirmation, as core does', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/clients',
      payload: { clientID: 'newclient', name: 'New Client', roles: ['x'] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.body).toBe('Client successfully created');
    const list = await app.inject({ method: 'GET', url: '/clients' });
    const created = list.json().find((c: any) => c.clientID === 'newclient');
    expect(created._id).toMatch(/^[0-9a-f]{24}$/);
    await app.close();
  });

  it('PUT merges into the stored doc and has no PATCH route', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const put = await app.inject({ method: 'PUT', url: `/clients/${CLIENT_REPORTER}`, payload: { roles: ['fhir'] } });
    expect(put.statusCode).toBe(200);
    expect(put.body).toBe('Successfully updated client.');
    const read = await app.inject({ method: 'GET', url: `/clients/${CLIENT_REPORTER}` });
    expect(read.json()).toMatchObject({ clientID: 'reporter', name: 'Facility Reporter', roles: ['fhir'] });
    const patch = await app.inject({ method: 'PATCH', url: `/clients/${CLIENT_REPORTER}`, payload: {} });
    expect(patch.statusCode).toBe(404);
    await app.close();
  });

  it('deletes a channel and then 404s it with a text message', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const del = await app.inject({ method: 'DELETE', url: `/channels/${CHANNEL_CHW}` });
    expect(del.statusCode).toBe(200);
    expect(del.body).toBe('The channel was successfully deleted');
    const missing = await app.inject({ method: 'GET', url: `/channels/${CHANNEL_CHW}` });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toBe(`We could not find a channel with Id:'${CHANNEL_CHW}'.`);
    await app.close();
  });

  it('builds a rerun task from tids, and lists tasks without their transactions', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { authorization: basic('ops@example.org') },
      payload: { tids: [TXN_1], batchSize: 2, paused: true },
    });
    expect(res.statusCode).toBe(201);
    const id = res.body.match(/^User ops@example\.org created task with id ([0-9a-f]{24})$/)?.[1];
    expect(id).toBeTruthy();
    const task = (await app.inject({ method: 'GET', url: `/tasks/${id}` })).json();
    expect(task).toMatchObject({
      status: 'Paused',
      user: 'ops@example.org',
      batchSize: 2,
      remainingTransactions: 1,
      totalTransactions: 1,
      transactions: [{ tid: TXN_1, tstatus: 'Queued' }],
    });
    const list = (await app.inject({ method: 'GET', url: '/tasks' })).json();
    expect(list.every((t: any) => t.transactions === undefined)).toBe(true);
    await app.close();
  });

  it('reads transactions (read-only) and 404s unknown ids', async () => {
    const { app } = await createSystemServer(openhim, config, { logLevel: 'silent' });
    const list = await app.inject({ method: 'GET', url: '/transactions' });
    expect(list.json().length).toBe(2);
    const one = await app.inject({ method: 'GET', url: `/transactions/${TXN_1}` });
    expect(one.json().status).toBe('Successful');
    const missing = await app.inject({ method: 'GET', url: '/transactions/nope' });
    expect(missing.statusCode).toBe(404);
    const post = await app.inject({ method: 'POST', url: '/transactions', payload: {} });
    expect(post.statusCode).toBe(404);
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
