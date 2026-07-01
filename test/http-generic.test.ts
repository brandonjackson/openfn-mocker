import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import httpGeneric from '../src/systems/http-generic/plugin.js';

describe('http-generic catch-all', () => {
  it('POST stores a record; GET list and GET by id return it; _mock echo present', async () => {
    const { app } = await createSystemServer(httpGeneric, { port: 0 }, { logLevel: 'silent' });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/referrals',
      payload: { name: 'Jane Doe', urgency: 'high' },
    });
    expect(created.statusCode).toBe(201);
    const rec = created.json();
    expect(rec.id).toBeTruthy();
    expect(rec.name).toBe('Jane Doe');
    expect(rec._createdAt).toBeTruthy();
    expect(rec._mock).toMatchObject({ method: 'POST', path: '/api/v1/referrals' });
    expect(rec._mock.body).toMatchObject({ name: 'Jane Doe' });

    const listed = await app.inject({ method: 'GET', url: '/api/v1/referrals' });
    expect(listed.statusCode).toBe(200);
    const listBody = listed.json();
    expect(Array.isArray(listBody.items)).toBe(true);
    expect(listBody.items.some((r: any) => r.id === rec.id)).toBe(true);
    expect(listBody._mock).toBeTruthy();

    const single = await app.inject({ method: 'GET', url: `/api/v1/referrals/${rec.id}` });
    expect(single.statusCode).toBe(200);
    expect(single.json().id).toBe(rec.id);
    expect(single.json().name).toBe('Jane Doe');

    await app.close();
  });

  it('supports update, replace and delete', async () => {
    const { app } = await createSystemServer(httpGeneric, { port: 0 }, { logLevel: 'silent' });
    const created = (
      await app.inject({ method: 'POST', url: '/things', payload: { a: 1, b: 2 } })
    ).json();

    const patched = await app.inject({
      method: 'PATCH',
      url: `/things/${created.id}`,
      payload: { b: 20 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ a: 1, b: 20 });

    const deleted = await app.inject({ method: 'DELETE', url: `/things/${created.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({ deleted: [created.id] });

    const gone = await app.inject({ method: 'GET', url: `/things/${created.id}` });
    // After delete, /things still exists as a collection -> item lookup misses -> empty echo.
    expect(gone.json().items).toEqual([]);

    await app.close();
  });

  it('accepts form-urlencoded bodies', async () => {
    const { app } = await createSystemServer(httpGeneric, { port: 0 }, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/submit',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'foo=bar&count=2',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().foo).toBe('bar');
    await app.close();
  });

  it('sets request.mockAuth (accept-all) and never rejects', async () => {
    const { app, requestLog } = await createSystemServer(
      httpGeneric,
      { port: 0 },
      { logLevel: 'silent' }
    );
    const res = await app.inject({
      method: 'GET',
      url: '/anything',
      headers: { authorization: 'Bearer secret-token' },
    });
    expect(res.statusCode).toBe(200);
    const logged = requestLog.list();
    expect(logged.at(-1)?.auth).toMatchObject({ type: 'bearer', token: 'secret-token' });
    await app.close();
  });
});
