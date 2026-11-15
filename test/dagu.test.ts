import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import dagu from '../src/systems/dagu/plugin.js';
import { SEEDED_PRESCRIPTION_GUID } from '../src/systems/dagu/seed.js';

const config = { port: 0 };
const auth = { authorization: 'Bearer mock-access-token' };

describe('dagu (DAGU pharmacy dispensing)', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    ({ app } = await createSystemServer(dagu, config, { logLevel: 'silent' }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('logs in without a bearer token and returns token.access_token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/account/login',
      payload: { username: 'admin', password: 'password' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token.access_token).toBe('string');
    expect(res.json().token.access_token.length).toBeGreaterThan(0);
  });

  it('rejects a login with no credentials', async () => {
    const res = await app.inject({ method: 'POST', url: '/account/login', payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it('requires the bearer token on data routes but not on login', async () => {
    // autoAuth off so the harness doesn't attach a credential for us.
    const { app: bare } = await createSystemServer(dagu, config, { logLevel: 'silent', autoAuth: false });
    const data = await bare.inject({ method: 'GET', url: '/DispensingUnit/Dashboard/StockOutReport' });
    expect(data.statusCode).toBe(401);
    const login = await bare.inject({
      method: 'POST',
      url: '/account/login',
      payload: { username: 'admin', password: 'password' },
    });
    expect(login.statusCode).toBe(200);
    await bare.close();
  });

  it('serves the stock-out report in the { result, message, model } envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/DispensingUnit/Dashboard/StockOutReport', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toBe(0);
    expect(Array.isArray(body.model)).toBe(true);
    expect(body.model.length).toBeGreaterThan(0);
    expect(body.model[0]).toEqual({
      itemName: expect.any(String),
      unitName: expect.any(String),
      itemAmc: expect.any(Number),
    });
  });

  it('pages request history DataTables-style', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/DispensingUnit/Request/History',
      headers: auth,
      payload: { start: 2, length: 3, draw: 4, search: {} },
    });
    expect(res.statusCode).toBe(200);
    const { model } = res.json();
    expect(model.draw).toBe(4);
    expect(model.data).toHaveLength(3);
    expect(model.recordsTotal).toBeGreaterThan(3);
    expect(model.recordsFiltered).toBe(model.recordsTotal);
  });

  it('filters request history by search.value', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/DispensingUnit/Request/History',
      headers: auth,
      payload: { search: { value: 'rejected' } },
    });
    const { model } = res.json();
    expect(model.recordsFiltered).toBe(1);
    expect(model.data[0].status).toBe('Rejected');
  });

  it('checks a seeded prescription', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/Patient/CheckPrescription',
      headers: auth,
      payload: { prescriptionRowGuid: SEEDED_PRESCRIPTION_GUID },
    });
    expect(res.statusCode).toBe(200);
    const { result, model } = res.json();
    expect(result).toBe(0);
    expect(model.prescriptionRowGuid).toBe(SEEDED_PRESCRIPTION_GUID);
    expect(typeof model.canDispense).toBe('boolean');
  });

  it('reports an unknown prescription in the envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/Patient/CheckPrescription',
      headers: auth,
      payload: { prescriptionRowGuid: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).not.toBe(0);
    expect(res.json().model).toBeNull();
  });

  it('pages prescription history from a multipart form body, as the adaptor sends it', async () => {
    const boundary = 'dagu-test-boundary';
    const fields = { start: '0', length: '4', draw: '2', additionalParameters: '{"filter":[]}' };
    const payload =
      Object.entries(fields)
        .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
        .join('') + `--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/Patient/Prescription/History',
      headers: { ...auth, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const { model } = res.json();
    expect(model.draw).toBe(2);
    expect(model.data).toHaveLength(4);
    expect(model.additionalParameters).toEqual({ filter: [] });
  });

  it('pages prescription history from a JSON body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/Patient/Prescription/History',
      headers: auth,
      payload: { start: 10, length: 10 },
    });
    const { model } = res.json();
    expect(model.data.length).toBe(model.recordsTotal - 10);
  });
});
