import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import salesforce from '../src/systems/salesforce/plugin.js';

const config = { port: 0 };

describe('salesforce', () => {
  it('creates an sObject record (201, 18-char Id)', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/services/data/v50.0/sobjects/Account',
      payload: { Name: 'New Co' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(typeof body.id).toBe('string');
    expect(body.id).toHaveLength(18);
    await app.close();
  });

  it('retrieves a seeded record by Id (with attributes)', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/services/data/v50.0/sobjects/Account/001000000000001AAA',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.Name).toBe('Acme Inc');
    expect(body.attributes.type).toBe('Account');
    await app.close();
  });

  it('describes an sObject (fields array)', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/services/data/v50.0/sobjects/Account/describe',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Account');
    expect(Array.isArray(body.fields)).toBe(true);
    await app.close();
  });

  it('runs a SOQL query parsed from ?q=', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/services/data/v50.0/query?q=SELECT+Id,+Name+FROM+Account',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.done).toBe(true);
    expect(body.totalSize).toBeGreaterThan(0);
    expect(body.records[0].attributes.type).toBe('Account');
    await app.close();
  });

  it('404s for an unknown record Id', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/services/data/v50.0/sobjects/Account/001999999999999XXX',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()[0].errorCode).toBe('NOT_FOUND');
    await app.close();
  });

  it('returns a SOAP login response as XML', async () => {
    const { app } = await createSystemServer(salesforce, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/services/Soap/u/50.0',
      headers: { 'content-type': 'text/xml' },
      payload: '<login/>',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/xml');
    expect(res.body).toContain('mock-session-id');
    await app.close();
  });
});
