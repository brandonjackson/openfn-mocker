import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/app.js';
import { renderSandboxPage, wantsHtml } from '../src/sandbox.js';
import { plugins } from '../src/systems/index.js';
import type { MockerConfig } from '../src/config.js';

const config: MockerConfig = {
  log_level: 'silent',
  port: 0,
  systems: {
    dhis2: { enabled: true, port: 0, version: '2.39' },
    fhir: { enabled: true, port: 0, apiPath: '' },
    commcare: { enabled: true, port: 0, domain: 'test-project' },
    twilio: { enabled: true, port: 0, account_sid: 'ACtest123456' },
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
    // DHIS2 requires auth, so the sandbox sends the credential's Basic header.
    const res = await app.inject({
      method: 'GET',
      url: '/dhis2/api/organisationUnits',
      headers: { authorization: 'Basic ' + Buffer.from('admin:mock').toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().organisationUnits.length).toBeGreaterThan(0);
  });

  it('rejects an auth-required system with 401 when no credentials are sent', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/dhis2/api/organisationUnits' });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toContain('Basic');
    expect(res.json().error).toBe('Unauthorized');
  });

  it('leaves open systems (fhir) reachable without credentials', async () => {
    const app = await boot();
    const res = await app.inject({ method: 'GET', url: '/fhir/Patient' });
    expect(res.statusCode).toBe(200);
  });
});

describe('aggregated request log (GET /_admin/requests)', () => {
  const dhis2Auth = 'Basic ' + Buffer.from('admin:mock').toString('base64');

  it('merges every system into one newest-first timeline, with request+response captured', async () => {
    const app = await boot();
    // Fire a spread of requests across systems, in a known order.
    await app.inject({ method: 'GET', url: '/dhis2/api/organisationUnits', headers: { authorization: dhis2Auth } });
    await app.inject({ method: 'GET', url: '/fhir/Patient' });
    await app.inject({ method: 'GET', url: '/dhis2/api/organisationUnits' }); // 401, no auth
    await app.inject({
      method: 'POST',
      url: '/fhir/Patient',
      headers: { 'content-type': 'application/json' },
      payload: { resourceType: 'Patient', name: [{ family: 'Logtest' }] },
    });

    const res = await app.inject({ method: 'GET', url: '/_admin/requests' });
    expect(res.statusCode).toBe(200);
    const log = res.json();
    expect(Array.isArray(log)).toBe(true);
    expect(log.length).toBeGreaterThanOrEqual(4);

    // Most-recent first: ids strictly descending.
    for (let i = 1; i < log.length; i++) {
      expect(log[i - 1].id).toBeGreaterThan(log[i].id);
    }

    // The last request fired (the POST) is the newest entry.
    expect(log[0]).toMatchObject({ system: 'fhir', method: 'POST', path: '/fhir/Patient', statusCode: 201 });
    // Every entry carries the enriched shape.
    for (const e of log) {
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('system');
      expect(e).toHaveProperty('durationMs');
      expect(e).toHaveProperty('responseSummary');
      expect(typeof e.durationMs).toBe('number');
    }

    // The captured response summary reflects what the mock returned.
    const created = log.find((e: any) => e.method === 'POST');
    expect(created.responseSummary).toContain('Patient');
    const unauthorized = log.find((e: any) => e.statusCode === 401);
    expect(unauthorized.responseSummary).toContain('Unauthorized');

    // More than one system appears in the merged view.
    expect(new Set(log.map((e: any) => e.system)).size).toBeGreaterThan(1);
  });

  it('filters by ?system= and caps with ?limit=', async () => {
    const app = await boot();
    await app.inject({ method: 'GET', url: '/dhis2/api/organisationUnits', headers: { authorization: dhis2Auth } });
    await app.inject({ method: 'GET', url: '/fhir/Patient' });
    await app.inject({ method: 'GET', url: '/fhir/metadata' });

    const fhirOnly = (await app.inject({ method: 'GET', url: '/_admin/requests?system=fhir' })).json();
    expect(fhirOnly.length).toBeGreaterThan(0);
    expect(fhirOnly.every((e: any) => e.system === 'fhir')).toBe(true);

    const limited = (await app.inject({ method: 'GET', url: '/_admin/requests?limit=1' })).json();
    expect(limited.length).toBe(1);
  });
});

describe('renderSandboxPage', () => {
  it('renders a Request log view that polls the aggregated endpoint and lives in the nav', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    // Nav link + page container for the log view.
    expect(html).toContain('Request log');
    expect(html).toContain('#requestlog');
    // The client fetches the aggregated, most-recent-first admin endpoint.
    expect(html).toContain('/_admin/requests?limit=');
    // Live polling + search filtering are wired in the client.
    expect(html).toContain('function fetchLog(');
    expect(html).toContain('function logMatch(');
    expect(html).toContain('function buildLogPage(');
  });

  it('prefixes example paths with the mount path', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    expect(html).toContain('/dhis2/api/organisationUnits');
    expect(html).toContain('/dhis2/api/system/info');
  });

  it('interpolates config-dependent tokens (domain, account_sid)', () => {
    const html = renderSandboxPage([
      { name: 'commcare', mountPath: '/commcare', config: { domain: 'my-project' } },
      { name: 'twilio', mountPath: '/twilio', config: { account_sid: 'ACcustom999' } },
    ]);
    expect(html).toContain('/commcare/a/my-project/api/v0.5/case/');
    expect(html).toContain('ACcustom999');
    // No unresolved config tokens remain.
    expect(html).not.toContain('{{domain}}');
    expect(html).not.toContain('{{account_sid}}');
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
    // Guardrail: every plugin ships a co-located guide with runnable examples.
    for (const key of Object.keys(plugins)) {
      expect(plugins[key].guide, `${key} is missing a guide`).toBeDefined();
      expect(plugins[key].guide!.examples.length).toBeGreaterThan(0);
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
    for (const key of Object.keys(plugins)) {
      expect(plugins[key].guide!.docs).toMatch(/^https:\/\/docs\.openfn\.org\//);
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

  it('sorts the sidebar nav links alphabetically by title', () => {
    // The nav links are ordered client-side; assert the sort is by title so the
    // left-hand list reads A–Z regardless of the curated card order.
    const html = renderSandboxPage([
      { name: 'dhis2', mountPath: '/dhis2' },
      { name: 'mailgun', mountPath: '/mailgun' },
    ]);
    expect(html).toContain('a.title.localeCompare(b.title)');
  });
});

describe('sandbox credential (sourced from the plugin, generated in the browser)', () => {
  it('embeds the plugin credential fields and type, not a hardcoded secret', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    expect(html).toContain('"type":"userpass"');
    expect(html).toContain('"name":"hostUrl"');
    expect(html).toContain('"name":"username"');
    expect(html).toContain('"name":"password"');
    // Password is a secret with a generation shape, not a baked-in value.
    expect(html).toContain('"role":"secret"');
    expect(html).not.toContain('"password":"mock"');
    // The URL field points at the mount; {{ORIGIN}} is resolved in the browser.
    expect(html).toContain('{{ORIGIN}}/dhis2');
  });

  it('ships the client-side credential generator + Regenerate control', () => {
    const html = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    expect(html).toContain('function genSecret(');
    expect(html).toContain('function resolveCredValues(');
    expect(html).toContain('function buildAuthHeader(');
    expect(html).toContain('Regenerate');
    expect(html).toContain('function credTypeLabel(');
  });

  it('surfaces whether the mock enforces auth (PR #10 per-plugin policy)', () => {
    const dhis2 = renderSandboxPage([{ name: 'dhis2', mountPath: '/dhis2' }]);
    expect(dhis2).toContain('"authRequired":true');
    const fhir = renderSandboxPage([{ name: 'fhir', mountPath: '/fhir' }]);
    expect(fhir).toContain('"authRequired":false');
  });

  it('uses the real KoboToolbox credential shape (username/password), not the old apiToken guess', () => {
    const html = renderSandboxPage([{ name: 'kobotoolbox', mountPath: '/kobotoolbox' }]);
    expect(html).toContain('"name":"baseUrl"');
    expect(html).toContain('"name":"username"');
    expect(html).toContain('"name":"apiVersion"');
    expect(html).not.toContain('apiToken');
    expect(html).not.toContain('baseURL');
  });

  it('renders OpenCRVS as OAuth client credentials, not a bearer token', () => {
    const html = renderSandboxPage([{ name: 'opencrvs', mountPath: '/opencrvs' }]);
    expect(html).toContain('"type":"oauth"');
    expect(html).toContain('"name":"clientId"');
    expect(html).toContain('"name":"clientSecret"');
    expect(html).not.toContain('mock-opencrvs-token');
  });

  it('keeps Twilio identifiers static so the mock paths resolve, generating only the secret', () => {
    const html = renderSandboxPage([
      { name: 'twilio', mountPath: '/twilio', config: { account_sid: 'ACtest123456' } },
    ]);
    expect(html).toContain('"name":"accountSid"');
    expect(html).toContain('"name":"authToken"');
    // accountSid is a static value (used to build /Accounts/<sid>/… paths), authToken is generated.
    expect(html).toContain('ACtest123456');
    expect(html).not.toContain('mock-auth-token');
  });

  it('falls back to a bare url credential for a system with no plugin/guide', () => {
    const html = renderSandboxPage([{ name: 'mystery', mountPath: '/mystery' }]);
    expect(html).toContain('"type":"none"');
    expect(html).toContain('{{ORIGIN}}/mystery');
  });
});

describe('usage snippets (copied verbatim into OpenFn jobs)', () => {
  // An adaptor's request() (via @openfn/language-common) refuses an absolute URL
  // whose origin differs from the credential's base URL and throws
  // BASE_URL_MISMATCH — client-side, before anything reaches the mock. A snippet
  // must therefore never hand an adaptor HTTP function an external absolute URL:
  // that is exactly what broke the CommCare fetchReportData example (its postUrl
  // pointed at https://www.example.com/api/). URL arguments must be relative,
  // same-origin paths instead.
  //
  // The only absolute URLs a snippet may legitimately contain are XML namespace
  // URIs used as *data* (e.g. an OpenRosa xmlns), never as a request target.
  const NAMESPACE_HOSTS = new Set(['openrosa.org', 'www.w3.org']);
  const ABSOLUTE_URL = /https?:\/\/([^/\s'"`){}$]+)/g;

  it('never hand an adaptor an external absolute URL (BASE_URL_MISMATCH guard)', () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const [system, plugin] of Object.entries(plugins)) {
      for (const ex of plugin.usage ?? []) {
        checked++;
        for (const match of (ex.code ?? '').matchAll(ABSOLUTE_URL)) {
          const host = match[1];
          if (!NAMESPACE_HOSTS.has(host)) offenders.push(`${system}/${ex.fn} -> ${host}`);
        }
      }
    }
    // Guards the guard: zero snippets means the discovery above is vacuous.
    expect(checked).toBeGreaterThan(0);
    expect(offenders, `external absolute URL(s) in usage snippet(s): ${offenders.join(', ')}`).toEqual([]);
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
