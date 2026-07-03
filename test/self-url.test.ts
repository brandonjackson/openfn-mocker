import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';
import { rewriteToExternalOrigin } from '../src/systems/shared/self-url.js';
import type { MockerConfig } from '../src/config.js';

const INTERNAL = 'http://localhost:4321';
const PUBLIC = 'https://mock.up.railway.app';
const PROXY = {
  'x-forwarded-proto': 'https',
  'x-forwarded-host': 'mock.up.railway.app',
  authorization: 'Basic ' + Buffer.from('api:mock').toString('base64'),
};
const DIRECT = { authorization: 'Basic ' + Buffer.from('api:mock').toString('base64') };

describe('rewriteToExternalOrigin', () => {
  it('swaps the origin and inserts a missing mount prefix', () => {
    expect(rewriteToExternalOrigin(`"${INTERNAL}/Patient/1"`, INTERNAL, PUBLIC, '/fhir')).toBe(
      `"${PUBLIC}/fhir/Patient/1"`
    );
  });

  it('does not double-prefix a URL that already carries the mount prefix', () => {
    expect(rewriteToExternalOrigin(`"${INTERNAL}/fhir/Patient"`, INTERNAL, PUBLIC, '/fhir')).toBe(
      `"${PUBLIC}/fhir/Patient"`
    );
  });

  it('prefixes a bare origin (no path)', () => {
    expect(rewriteToExternalOrigin(`"${INTERNAL}"`, INTERNAL, PUBLIC, '/dhis2')).toBe(
      `"${PUBLIC}/dhis2"`
    );
  });

  it('rewrites origin only when there is no mount prefix', () => {
    expect(rewriteToExternalOrigin(`"${INTERNAL}/Patient"`, INTERNAL, PUBLIC, '')).toBe(
      `"${PUBLIC}/Patient"`
    );
  });

  it('rewrites every occurrence and leaves non-matching text alone', () => {
    const input = `{"a":"${INTERNAL}/x","note":"see localhost logs","b":"${INTERNAL}/fhir/y"}`;
    expect(rewriteToExternalOrigin(input, INTERNAL, PUBLIC, '/fhir')).toBe(
      `{"a":"${PUBLIC}/fhir/x","note":"see localhost logs","b":"${PUBLIC}/fhir/y"}`
    );
  });
});

describe('self-referential URLs behind a proxy', () => {
  const config: MockerConfig = {
    log_level: 'silent',
    port: 4321,
    systems: {
      fhir: { enabled: true, port: 4321, apiPath: '' },
      dhis2: { enabled: true, port: 4321, version: '2.39' },
      openmrs: { enabled: true, port: 4321 },
      kobotoolbox: { enabled: true, port: 4321 },
    },
  };
  const open: FastifyInstance[] = [];
  const boot = async () => {
    const { app } = await buildServer(config);
    open.push(app);
    return app;
  };
  afterAll(async () => {
    await Promise.all(open.map((a) => a.close()));
  });

  it('fhir: fullUrl gains the /fhir prefix and the public origin', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/fhir/Patient', headers: PROXY });
    const bundle = res.json();
    expect(bundle.link[0].url).toBe(`${PUBLIC}/fhir/Patient`); // self, already prefixed — no doubling
    const fullUrls: string[] = bundle.entry.map((e: any) => e.fullUrl);
    expect(fullUrls.length).toBeGreaterThan(0);
    for (const u of fullUrls) {
      expect(u.startsWith(`${PUBLIC}/fhir/`)).toBe(true);
      expect(u).not.toContain('localhost');
      expect(u).not.toContain('/fhir/fhir/');
    }
  });

  it('dhis2: system info contextPath becomes the public /dhis2 base', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/dhis2/api/system/info', headers: PROXY });
    expect(res.json().contextPath).toBe(`${PUBLIC}/dhis2`);
  });

  it('openmrs: the create Location header gains the public origin and /openmrs prefix', async () => {
    const app = await boot();
    const res = await app.inject({
      method: 'POST',
      url: '/openmrs/ws/fhir2/R4/Patient',
      headers: PROXY,
      payload: { resourceType: 'Patient' },
    });
    expect(res.statusCode).toBe(201);
    const loc = res.headers.location as string;
    expect(loc.startsWith(`${PUBLIC}/openmrs/ws/fhir2/R4/Patient/`)).toBe(true);
    expect(loc).not.toContain('localhost');
  });

  it('kobotoolbox: seed-baked asset URLs are rewritten', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/kobotoolbox/api/v2/assets', headers: PROXY });
    const assets = res.json().results;
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets) {
      expect(a.url.startsWith(`${PUBLIC}/kobotoolbox/api/v2/assets/`)).toBe(true);
      expect(a.url).not.toContain('localhost');
    }
  });

  it('direct (no proxy headers) responses are left untouched on localhost', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/dhis2/api/system/info', headers: DIRECT });
    expect(res.json().contextPath).toBe('http://localhost:4321');
  });
});
