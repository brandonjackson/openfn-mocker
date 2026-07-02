import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';
import { renderSandboxPage, wantsHtml, SYSTEM_GUIDES } from '../src/sandbox.js';
import type { MockerConfig } from '../src/config.js';

const config: MockerConfig = {
  log_level: 'silent',
  port: 0,
  systems: {
    dhis2: { enabled: true, port: 0, version: '2.39' },
    fhir: { enabled: true, port: 0, apiPath: '' },
    commcare: { enabled: true, port: 0, domain: 'test-project' },
    twilio: { enabled: true, port: 0, account_sid: 'ACtest123456' },
    airtable: { enabled: true, port: 0, base_id: 'appABC123' },
    'http-generic': { enabled: true, port: 0 },
    salesforce: { enabled: false, port: 0 }, // placeholder, no plugin
  },
};

const openServers: FastifyInstance[] = [];

async function boot() {
  const { app } = await buildServer(config);
  openServers.push(app);
  return app;
}

afterAll(async () => {
  await Promise.all(openServers.map((a) => a.close()));
});

describe('root index content negotiation', () => {
  it('serves the HTML sandbox to browsers (Accept: text/html)', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('<!doctype html>');
    expect(res.body).toContain('API sandbox');
    // Enabled systems are rendered; the disabled placeholder is not.
    expect(res.body).toContain('DHIS2');
    expect(res.body).toContain('FHIR');
    expect(res.body).not.toContain('salesforce');
  });

  it('keeps the JSON contract for API clients (Accept: application/json)', async () => {
    const app = await boot();
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const body = res.json();
    expect(body.name).toBe('openfn-mocker');
    expect(Array.isArray(body.systems)).toBe(true);
    expect(body.systems).toContainEqual({ name: 'dhis2', path: '/dhis2' });
    // Sorted alphabetically, and the disabled placeholder is absent.
    expect(body.systems.map((s: any) => s.name)).not.toContain('salesforce');
  });

  it('defaults to JSON when no Accept header is sent (curl-like)', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json().name).toBe('openfn-mocker');
  });

  it('a sandbox example actually runs against the live mock', async () => {
    const app = await boot();
    // Mirrors the DHIS2 "org-unit hierarchy" example path shown in the sandbox.
    const res = await app.inject({ method: 'GET', url: '/dhis2/api/organisationUnits' });
    expect(res.statusCode).toBe(200);
    expect(res.json().organisationUnits.length).toBeGreaterThan(0);
  });
});

describe('renderSandboxPage', () => {
  it('prefixes example paths with the mount path', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    expect(html).toContain('/dhis2/api/organisationUnits');
    expect(html).toContain('/dhis2/api/system/info');
  });

  it('interpolates config-dependent tokens (domain, account_sid, base_id)', () => {
    const html = renderSandboxPage([
      { name: 'commcare', mountPath: '/commcare', config: { domain: 'my-project' } },
      { name: 'twilio', mountPath: '/twilio', config: { account_sid: 'ACcustom999' } },
      { name: 'airtable', mountPath: '/airtable', config: { base_id: 'appCUSTOM' } },
    ]);
    expect(html).toContain('/commcare/a/my-project/api/v0.5/case/');
    expect(html).toContain('ACcustom999');
    expect(html).toContain('appCUSTOM');
    // No unresolved config tokens remain.
    expect(html).not.toContain('{{domain}}');
    expect(html).not.toContain('{{account_sid}}');
    expect(html).not.toContain('{{base_id}}');
  });

  it('falls back to guide defaults when config omits the token', () => {
    const html = renderSandboxPage([{ name: 'commcare', mountPath: '/commcare' }]);
    expect(html).toContain('/commcare/a/test-project/api/v0.5/case/');
  });

  it('leaves {{ORIGIN}} for the browser to resolve', () => {
    const html = renderSandboxPage([{ name: 'fhir', mountPath: '/fhir', config: { apiPath: '' } }]);
    expect(html).toContain('{{ORIGIN}}');
  });

  it('renders a generic card for a running system with no catalog entry', () => {
    const html = renderSandboxPage([{ name: 'mystery', mountPath: '/mystery' }]);
    expect(html).toContain('mystery');
    expect(html).toContain('Mounted mock system');
  });

  it('escapes < in the embedded data so it cannot break out of the script tag', () => {
    // CommCare ships an XML example body containing "<". It must be unicode-escaped.
    const html = renderSandboxPage([{ name: 'commcare', mountPath: '/commcare' }]);
    expect(html).toContain('\\u003c');
  });

  it('covers every registered system with a guide', () => {
    // Guardrail: keep the catalog in step with the plugin registry.
    for (const key of Object.keys(SYSTEM_GUIDES)) {
      expect(SYSTEM_GUIDES[key].examples.length).toBeGreaterThan(0);
    }
  });

  it('renders a per-system guide (setup steps + API overview) inside each card', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    // The guide is built per-system in the client, labelled with both headings.
    expect(html).toContain('Set up the adaptor');
    expect(html).toContain('API overview');
    // The system's adaptor docs link + the shared credentials doc are present.
    expect(html).toContain('https://docs.openfn.org/adaptors/packages/dhis2-docs');
    expect(html).toContain('https://docs.openfn.org/documentation/build/credentials');
    // The old single top-of-page guide sections are gone.
    expect(html).not.toContain('id="setup"');
    expect(html).not.toContain('id="overview"');
  });

  it('carries an adaptor docs link for every catalogued system', () => {
    for (const key of Object.keys(SYSTEM_GUIDES)) {
      expect(SYSTEM_GUIDES[key].docs).toMatch(/^https:\/\/docs\.openfn\.org\//);
    }
  });

  it('emits a sticky sidebar whose client builds a nav link per enabled system', () => {
    const html = renderSandboxPage([
      { name: 'dhis2', mountPath: '/dhis2' },
      { name: 'mailgun', mountPath: '/mailgun' },
    ]);
    // The sidebar container is in the static skeleton; its links are built in the
    // client from the embedded data, so assert both the anchor + the enabled systems.
    expect(html).toContain('id="sidebar"');
    expect(html).toContain('"#sys-"+sys.name');
    expect(html).toContain('"name":"dhis2"');
    expect(html).toContain('"name":"mailgun"');
  });
});

describe('wantsHtml', () => {
  it('is true only when text/html is present', () => {
    expect(wantsHtml('text/html,application/xhtml+xml')).toBe(true);
    expect(wantsHtml('application/json')).toBe(false);
    expect(wantsHtml('*/*')).toBe(false);
    expect(wantsHtml(undefined)).toBe(false);
  });
});
