import { describe, it, expect, afterAll } from 'vitest';
import { createSystemServer } from '../src/server.js';
import airtable from '../src/systems/airtable/plugin.js';

const config = { port: 0, base_id: 'appABC123' };
const CONTACTS = '/v0/appABC123/Contacts';
const TASKS = '/v0/appABC123/Tasks';

const servers: Array<{ close: () => Promise<void> }> = [];
async function boot() {
  const { app, store } = await createSystemServer(airtable, config, { logLevel: 'silent' });
  servers.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

describe('airtable', () => {
  it('GET list returns { records: [...] } envelope with seed data', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: CONTACTS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBe(10);
    const rec = body.records[0];
    expect(rec.id).toMatch(/^rec[A-Za-z0-9]{14}$/);
    expect(typeof rec.createdTime).toBe('string');
    expect(rec.fields).toBeTruthy();
    expect(rec.fields.Name).toBeTruthy();
  });

  it('seeds both Contacts and Tasks tables (10 each)', async () => {
    const { store } = await boot();
    expect(store.count('Contacts')).toBe(10);
    expect(store.count('Tasks')).toBe(10);
  });

  it('POST single { fields } creates and read-back works', async () => {
    const { app } = await boot();
    const create = await app.inject({
      method: 'POST',
      url: CONTACTS,
      payload: { fields: { Name: 'New Person', Status: 'Active' } },
    });
    expect(create.statusCode).toBe(200);
    const created = create.json();
    expect(created.id).toMatch(/^rec[A-Za-z0-9]{14}$/);
    expect(created.fields.Name).toBe('New Person');
    expect(typeof created.createdTime).toBe('string');

    const read = await app.inject({ method: 'GET', url: `${CONTACTS}/${created.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().fields.Name).toBe('New Person');
  });

  it('POST batch { records } returns { records: [...] }', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'POST',
      url: TASKS,
      payload: { records: [{ fields: { Name: 'T1' } }, { fields: { Name: 'T2' } }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.records)).toBe(true);
    expect(body.records.length).toBe(2);
    expect(body.records[0].id).toMatch(/^rec[A-Za-z0-9]{14}$/);
    expect(body.records[1].fields.Name).toBe('T2');
  });

  it('enforces the batch limit of 10 with a 422 INVALID_REQUEST', async () => {
    const { app } = await boot();
    const records = Array.from({ length: 11 }, (_, i) => ({ fields: { Name: `R${i}` } }));
    const res = await app.inject({ method: 'POST', url: CONTACTS, payload: { records } });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.type).toBe('INVALID_REQUEST_UNKNOWN');
    expect(typeof body.error.message).toBe('string');
  });

  it('PATCH single merges fields (keeps existing, adds new)', async () => {
    const { app } = await boot();
    const list = await app.inject({ method: 'GET', url: CONTACTS });
    const target = list.json().records[0];
    expect(target.fields.Email).toBeTruthy();

    const res = await app.inject({
      method: 'PATCH',
      url: `${CONTACTS}/${target.id}`,
      payload: { fields: { Status: 'Updated' } },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.fields.Status).toBe('Updated');
    // Existing field preserved (merge, not replace).
    expect(updated.fields.Email).toBe(target.fields.Email);
  });

  it('PUT single replaces fields wholesale', async () => {
    const { app } = await boot();
    const list = await app.inject({ method: 'GET', url: CONTACTS });
    const target = list.json().records[1];

    const res = await app.inject({
      method: 'PUT',
      url: `${CONTACTS}/${target.id}`,
      payload: { fields: { Name: 'Replaced Only' } },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.fields.Name).toBe('Replaced Only');
    expect(updated.fields.Email).toBeUndefined();
  });

  it('DELETE single returns { deleted: true, id }', async () => {
    const { app } = await boot();
    const list = await app.inject({ method: 'GET', url: TASKS });
    const target = list.json().records[0];

    const res = await app.inject({ method: 'DELETE', url: `${TASKS}/${target.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: true, id: target.id });

    const read = await app.inject({ method: 'GET', url: `${TASKS}/${target.id}` });
    expect(read.statusCode).toBe(404);
  });

  it('DELETE batch via ?records[]= returns { records: [{deleted,id}] }', async () => {
    const { app } = await boot();
    const list = await app.inject({ method: 'GET', url: CONTACTS });
    const [a, b] = list.json().records;

    const res = await app.inject({
      method: 'DELETE',
      url: `${CONTACTS}?records[]=${a.id}&records[]=${b.id}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.records).toEqual([
      { deleted: true, id: a.id },
      { deleted: true, id: b.id },
    ]);
  });

  it('supports pageSize + offset pagination with an offset cursor', async () => {
    const { app } = await boot();
    const page1 = await app.inject({ method: 'GET', url: `${CONTACTS}?pageSize=4` });
    const b1 = page1.json();
    expect(b1.records.length).toBe(4);
    expect(b1.offset).toBe('4');

    const page2 = await app.inject({
      method: 'GET',
      url: `${CONTACTS}?pageSize=4&offset=${b1.offset}`,
    });
    const b2 = page2.json();
    expect(b2.records.length).toBe(4);
    // Different page than the first.
    expect(b2.records[0].id).not.toBe(b1.records[0].id);
  });

  it('supports sort[0][field] & sort[0][direction]', async () => {
    const { app } = await boot();
    const res = await app.inject({
      method: 'GET',
      url: `${CONTACTS}?sort[0][field]=Name&sort[0][direction]=asc`,
    });
    const names = res.json().records.map((r: any) => r.fields.Name);
    const sorted = [...names].sort((x, y) => String(x).localeCompare(String(y)));
    expect(names).toEqual(sorted);
  });
});
