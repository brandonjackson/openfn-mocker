import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import { parseAuth, hasCredentials } from '../src/auth.js';
import dhis2 from '../src/systems/dhis2/plugin.js';
import commcare from '../src/systems/commcare/plugin.js';
import fhir from '../src/systems/fhir/plugin.js';
import httpGeneric from '../src/systems/http-generic/plugin.js';
import kobotoolbox from '../src/systems/kobotoolbox/plugin.js';
import primero from '../src/systems/primero/plugin.js';
import airtable from '../src/systems/airtable/plugin.js';

const apps: FastifyInstance[] = [];
/** Build a system with enforcement live (autoAuth off, so we drive auth ourselves). */
async function raw(plugin: any, config: Record<string, any> = {}) {
  const { app, store } = await createSystemServer(
    plugin,
    { port: 0, ...config },
    { logLevel: 'silent', autoAuth: false }
  );
  apps.push(app);
  return { app, store };
}

const BASIC = 'Basic ' + Buffer.from('admin:mock').toString('base64');

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('parseAuth', () => {
  it('parses Basic / Bearer / Token / ApiKey / api-key header', () => {
    expect(parseAuth({ authorization: BASIC })).toMatchObject({ type: 'basic', username: 'admin' });
    expect(parseAuth({ authorization: 'Bearer abc' })).toMatchObject({ type: 'bearer', token: 'abc' });
    expect(parseAuth({ authorization: 'Token xyz' })).toMatchObject({ type: 'token', token: 'xyz' });
    expect(parseAuth({ authorization: 'ApiKey me@x.org:k123' })).toMatchObject({
      type: 'apikey',
      username: 'me@x.org',
      key: 'k123',
    });
    expect(parseAuth({ apikey: 'k9' })).toMatchObject({ type: 'apikey', key: 'k9' });
    expect(parseAuth({})).toMatchObject({ type: 'none' });
  });

  it('hasCredentials is true for any presented credential, false for none', () => {
    expect(hasCredentials(parseAuth({ authorization: BASIC }))).toBe(true);
    expect(hasCredentials(parseAuth({ 'x-api-key': 'k' }))).toBe(true);
    // Unknown scheme still counts as "a credential was sent".
    expect(hasCredentials(parseAuth({ authorization: 'Weird foo' }))).toBe(true);
    expect(hasCredentials(parseAuth({}))).toBe(false);
    expect(hasCredentials(undefined)).toBe(false);
  });
});

describe('auth enforcement (required systems)', () => {
  it('DHIS2 returns 401 with WWW-Authenticate when no credentials are sent', async () => {
    const { app } = await raw(dhis2, { version: '2.39' });
    const res = await app.inject({ method: 'GET', url: '/api/organisationUnits' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Basic');
    expect(res.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('DHIS2 proceeds (200) once a credential is present', async () => {
    const { app } = await raw(dhis2, { version: '2.39' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/organisationUnits',
      headers: { authorization: BASIC },
    });
    expect(res.statusCode).toBe(200);
  });

  it('CommCare accepts an ApiKey Authorization header (dual-scheme)', async () => {
    const { app } = await raw(commcare, { domain: 'test-project' });
    const res = await app.inject({
      method: 'GET',
      url: '/a/test-project/api/v0.5/case/',
      headers: { authorization: 'ApiKey user@test.com:key123' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('KoboToolbox 401s without a token, 200s with one', async () => {
    const { app } = await raw(kobotoolbox, { baseURL: 'http://localhost:4016' });
    const anon = await app.inject({ method: 'GET', url: '/api/v2/assets/?format=json' });
    expect(anon.statusCode).toBe(401);
    expect(anon.headers['www-authenticate']).toContain('Token');
    const authed = await app.inject({
      method: 'GET',
      url: '/api/v2/assets/?format=json',
      headers: { authorization: 'Token mock-kobo-token' },
    });
    expect(authed.statusCode).toBe(200);
  });

  it('admin routes stay reachable without credentials on a required system', async () => {
    const { app } = await raw(dhis2, { version: '2.39' });
    const res = await app.inject({ method: 'GET', url: '/_admin/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().system).toBe('dhis2');
  });
});

describe('Primero token-exchange exemption', () => {
  it('POST /api/v2/tokens works without a token, but /cases needs one', async () => {
    const { app } = await raw(primero);
    const token = await app.inject({
      method: 'POST',
      url: '/api/v2/tokens',
      payload: { user: { user_name: 'primero', password: 'mock' } },
    });
    expect(token.statusCode).toBe(200);
    expect(token.json().token).toBe('mock_primero_token');

    const anon = await app.inject({ method: 'GET', url: '/api/v2/cases' });
    expect(anon.statusCode).toBe(401);

    const authed = await app.inject({
      method: 'GET',
      url: '/api/v2/cases',
      headers: { authorization: 'Bearer ' + token.json().token },
    });
    expect(authed.statusCode).toBe(200);
  });
});

describe('open systems stay accept-all', () => {
  it('FHIR serves without credentials (auth optional)', async () => {
    const { app } = await raw(fhir, { apiPath: '' });
    const res = await app.inject({ method: 'GET', url: '/Patient' });
    expect(res.statusCode).toBe(200);
  });

  it('generic http serves any path without credentials', async () => {
    const { app } = await raw(httpGeneric);
    const res = await app.inject({ method: 'GET', url: '/anything/at/all' });
    expect(res.statusCode).toBe(200);
  });

  it('Airtable (bearer) is gated, confirming open != a global default', async () => {
    const { app } = await raw(airtable, { base_id: 'appABC123' });
    const res = await app.inject({ method: 'GET', url: '/v0/appABC123/Contacts' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Bearer');
  });
});
