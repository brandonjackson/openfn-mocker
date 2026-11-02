import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import godata from '../src/systems/godata/plugin.js';

const config = { port: 0 };

describe('godata', () => {
  it('POST /users/login returns a token id', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/users/login', payload: { email: 'a@b.org', password: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().id).toBe('string');
    await app.close();
  });

  it('GET /outbreaks returns a bare array with the seeded outbreak', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/outbreaks' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.find((o: any) => o.id === 'ob-sl-covid19')).toBeTruthy();
    await app.close();
  });

  it('lists cases scoped to an outbreak', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/outbreaks/ob-sl-covid19/cases' });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBe(3);
    await app.close();
  });

  it('honours a ?filter= where clause', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const filter = encodeURIComponent(JSON.stringify({ where: { firstName: 'Jane' } }));
    const res = await app.inject({ method: 'GET', url: `/outbreaks/ob-sl-covid19/cases?filter=${filter}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBe(1);
    expect(body[0].firstName).toBe('Jane');
    await app.close();
  });

  it('creates a case, read-back-able', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const create = await app.inject({
      method: 'POST',
      url: '/outbreaks/ob-sl-covid19/cases',
      payload: { firstName: 'New', lastName: 'Case' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().id;
    expect(id).toBeTruthy();
    const read = await app.inject({ method: 'GET', url: `/outbreaks/ob-sl-covid19/cases/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().firstName).toBe('New');
    await app.close();
  });

  it('scopes case/contact by-id reads and updates to the outbreak in the path', async () => {
    const { app } = await createSystemServer(godata, config, { logLevel: 'silent' });
    const wrongRead = await app.inject({ method: 'GET', url: '/outbreaks/ob-other/cases/case-0001' });
    expect(wrongRead.statusCode).toBe(404);
    const wrongPut = await app.inject({
      method: 'PUT',
      url: '/outbreaks/ob-other/contacts/cont-0001',
      payload: { riskLevel: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_LOW' },
    });
    expect(wrongPut.statusCode).toBe(404);
    const put = await app.inject({
      method: 'PUT',
      url: '/outbreaks/ob-sl-covid19/contacts/cont-0001',
      payload: { riskLevel: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_LOW', outbreakId: 'ob-other' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ id: 'cont-0001', outbreakId: 'ob-sl-covid19', firstName: 'Mohamed' });
    await app.close();
  });
});
