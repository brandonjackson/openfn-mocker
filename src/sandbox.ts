/**
 * Browser API sandbox served at GET / (to clients that accept text/html).
 *
 * This module owns two things:
 *  1. A curated CATALOG of what each mock system can do (credential shape + a
 *     handful of runnable example requests), kept here rather than in the
 *     plugins so all the "what's possible" demo content lives in one reviewable
 *     place.
 *  2. renderSandboxPage(), which turns the catalog + the list of currently
 *     running systems into a single self-contained HTML page (inline CSS + JS,
 *     no external assets) that fires real requests at the live mock from the
 *     browser and shows the responses.
 *
 * The page is served from the same origin as the mock, so its fetch() calls hit
 * the running endpoints directly with no CORS setup.
 */

/** A single runnable example request shown under a system. */
export interface SandboxExample {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to the system mount, e.g. '/api/organisationUnits'. */
  path: string;
  /** One-line description of what the request demonstrates. */
  label: string;
  /** Optional request body, sent verbatim (already formatted). */
  body?: string;
  /** Content-Type for the body (default application/json). */
  contentType?: string;
}

/** Everything the sandbox needs to showcase one system. */
export interface SystemGuide {
  /** Human-friendly title. */
  title: string;
  /** One or two sentences: what the system is + notable quirks. */
  blurb: string;
  /** Auth style, for display only (the mock is accept-all). */
  auth: string;
  /** OpenFn credential URL field (e.g. hostUrl). */
  credentialField: string;
  /** Example OpenFn credential. `{{ORIGIN}}` is replaced in the browser. */
  credential: Record<string, unknown>;
  /**
   * Defaults for `{{token}}` placeholders used in paths/bodies/credential (e.g.
   * `{{domain}}`). Overridden by the matching key in the system's live config.
   */
  vars?: Record<string, string>;
  /** Runnable example requests. */
  examples: SandboxExample[];
}

const FORM = 'application/x-www-form-urlencoded';
const XML = 'text/xml';

/**
 * Curated capabilities per system, keyed by system name (== registry / mount
 * key). Paths are relative to the system mount; renderSandboxPage prepends the
 * mount path. Example bodies target the shipped seed data so they work on first
 * boot and are read-back-able.
 */
export const SYSTEM_GUIDES: Record<string, SystemGuide> = {
  dhis2: {
    title: 'DHIS2',
    blurb:
      'Aggregate + tracker health data. List responses carry a pager and a resource-typed array; writes return an ImportSummary envelope.',
    auth: 'Basic',
    credentialField: 'hostUrl',
    credential: { hostUrl: '{{ORIGIN}}/dhis2', username: 'admin', password: 'mock' },
    examples: [
      { method: 'GET', path: '/api/system/info', label: 'Server version and context path' },
      {
        method: 'GET',
        path: '/api/organisationUnits',
        label: 'Org-unit hierarchy (pager + typed array)',
      },
      {
        method: 'GET',
        path: '/api/organisationUnits?filter=name:eq:Bo',
        label: 'Server-side filter (field:op:value)',
      },
      {
        method: 'GET',
        path: '/api/programs/IpHINAT79UW',
        label: 'Single program (Child Programme) with two stages',
      },
      {
        method: 'POST',
        path: '/api/trackedEntityInstances',
        label: 'Create a tracked entity: returns an ImportSummary, then read it back above',
        body: JSON.stringify(
          {
            trackedEntityType: 'nEenWmSyUEp',
            orgUnit: 'DiszpKrYNg8',
            attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Jane' }],
          },
          null,
          2
        ),
      },
    ],
  },

  fhir: {
    title: 'FHIR (HAPI R4)',
    blurb:
      'HL7 FHIR R4 server. Searches return searchset Bundles, reads return the resource, and POST to the base runs a transaction/batch Bundle.',
    auth: 'none / Bearer',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/fhir', apiPath: '' },
    examples: [
      { method: 'GET', path: '/Patient', label: 'Search all patients (searchset Bundle)' },
      { method: 'GET', path: '/Patient/pat-1', label: 'Read one patient by id' },
      { method: 'GET', path: '/Patient?name=Kamara', label: 'Search patients by name' },
      { method: 'GET', path: '/Observation', label: 'Vital-sign observations' },
      {
        method: 'POST',
        path: '/Patient',
        label: 'Create a Patient: 201 with server-assigned id + meta',
        body: JSON.stringify(
          {
            resourceType: 'Patient',
            name: [{ family: 'Sandbox', given: ['Ada'] }],
            gender: 'female',
            birthDate: '1990-01-01',
          },
          null,
          2
        ),
      },
      {
        method: 'POST',
        path: '',
        label: 'Transaction Bundle: batch writes in one request',
        body: JSON.stringify(
          {
            resourceType: 'Bundle',
            type: 'transaction',
            entry: [
              {
                request: { method: 'POST', url: 'Patient' },
                resource: { resourceType: 'Patient', name: [{ family: 'Tx', given: ['Bundle'] }] },
              },
            ],
          },
          null,
          2
        ),
      },
    ],
  },

  openmrs: {
    title: 'OpenMRS',
    blurb:
      'Medical record system exposed as REST ({ results: [] }) and a FHIR R4 module. The same seeded patients appear in both representations.',
    auth: 'Basic',
    credentialField: 'instanceUrl',
    credential: { instanceUrl: '{{ORIGIN}}/openmrs', username: 'admin', password: 'mock' },
    examples: [
      { method: 'GET', path: '/ws/rest/v1/patient', label: 'Patient list ({ results: [...] })' },
      { method: 'GET', path: '/ws/rest/v1/patient?q=Doe', label: 'Search by name / identifier' },
      {
        method: 'GET',
        path: '/ws/rest/v1/patient?v=ref',
        label: 'Reference representation (?v=ref)',
      },
      {
        method: 'GET',
        path: '/ws/fhir2/R4/Patient',
        label: 'Same patients via the FHIR R4 module',
      },
      {
        method: 'POST',
        path: '/ws/rest/v1/patient',
        label: 'Register a patient: 201 with generated uuid',
        body: JSON.stringify(
          {
            identifiers: [
              {
                identifier: 'MRN-777',
                identifierType: { uuid: '05a29f94-c0ed-11e2-94be-8c13b969e334' },
                preferred: true,
              },
            ],
            person: {
              names: [{ givenName: 'Sandbox', familyName: 'Patient' }],
              gender: 'F',
              birthdate: '1990-01-01',
            },
          },
          null,
          2
        ),
      },
    ],
  },

  commcare: {
    title: 'CommCare HQ',
    blurb:
      'Mobile data collection. The domain-scoped Data API returns Tastypie { meta, objects } envelopes; the OpenRosa receiver ingests form XML.',
    auth: 'Basic / apiKey header',
    credentialField: 'hostURL',
    credential: {
      hostURL: '{{ORIGIN}}/commcare',
      domain: '{{domain}}',
      appId: 'abc123',
      username: 'user@test.com',
      password: 'mock',
    },
    vars: { domain: 'test-project' },
    examples: [
      {
        method: 'GET',
        path: '/a/{{domain}}/api/v0.5/case/',
        label: 'Case list (Tastypie { meta, objects })',
      },
      {
        method: 'GET',
        path: '/a/{{domain}}/api/v0.5/case/?type=patient',
        label: 'Filter cases by type',
      },
      {
        method: 'GET',
        path: '/a/{{domain}}/api/v0.5/case/case-0001/',
        label: 'Single case by case_id',
      },
      { method: 'GET', path: '/a/{{domain}}/api/v0.5/form/', label: 'Submitted forms' },
      {
        method: 'POST',
        path: '/a/{{domain}}/receiver/',
        label: 'OpenRosa form submission: returns an OpenRosaResponse XML ack',
        contentType: XML,
        body:
          '<?xml version="1.0"?>\n' +
          '<data xmlns="http://openrosa.org/formdesigner/PATIENT-REG-FORM">\n' +
          '  <patient_name>Sandbox Patient</patient_name>\n' +
          '  <patient_age>30</patient_age>\n' +
          '  <village>Ngelehun</village>\n' +
          '</data>',
      },
    ],
  },

  kobotoolbox: {
    title: 'KoboToolbox',
    blurb:
      'Survey platform. Assets (forms) and their submissions use DRF { count, next, previous, results } envelopes; submission counts are live.',
    auth: 'Token',
    credentialField: 'baseURL',
    credential: { baseURL: '{{ORIGIN}}/kobotoolbox', apiToken: 'mock-kobo-token' },
    examples: [
      { method: 'GET', path: '/api/v2/assets/', label: 'Survey assets (DRF envelope)' },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/',
        label: 'Single asset with live submission count',
      },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/data/',
        label: 'Submissions for an asset',
      },
      {
        method: 'POST',
        path: '/api/v2/assets/aHousehold01Q1/submissions/',
        label: 'Submit survey data: assigned a new _id, read-back-able',
        body: JSON.stringify(
          {
            household_head_name: 'Sandbox Household',
            household_size: 4,
            water_source: 'borehole',
            district: 'Bo',
          },
          null,
          2
        ),
      },
    ],
  },

  primero: {
    title: 'Primero',
    blurb:
      'Child-protection case management. Business fields nest under `data`; lists use { data, metadata }. POST /api/v2/tokens exchanges a bearer token.',
    auth: 'Token via POST /api/v2/tokens',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/primero', username: 'primero', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/api/v2/tokens',
        label: 'Token exchange: returns a bearer token',
        body: JSON.stringify({ user: { user_name: 'primero', password: 'mock' } }, null, 2),
      },
      { method: 'GET', path: '/api/v2/cases', label: 'Case list ({ data, metadata })' },
      { method: 'GET', path: '/api/v2/cases?query=Jane', label: 'Free-text search over case data' },
      {
        method: 'POST',
        path: '/api/v2/cases',
        label: 'Create a case: server assigns a CP-YYYY-NNN display id',
        body: JSON.stringify(
          {
            data: {
              name_first: 'Sandbox',
              name_last: 'Child',
              age: 10,
              sex: 'female',
              protection_concerns: ['neglect'],
              risk_level: 'medium',
            },
          },
          null,
          2
        ),
      },
    ],
  },

  airtable: {
    title: 'Airtable',
    blurb:
      'Spreadsheet-style base. User fields nest under `fields`; batch writes are capped at 10 records (11+ returns HTTP 422).',
    auth: 'Bearer',
    credentialField: 'baseUrl',
    credential: {
      baseUrl: '{{ORIGIN}}/airtable',
      apiKey: 'mock-airtable-token',
      baseId: '{{base_id}}',
    },
    vars: { base_id: 'appABC123' },
    examples: [
      {
        method: 'GET',
        path: '/v0/{{base_id}}/Contacts',
        label: 'List records (fields nested under `fields`)',
      },
      {
        method: 'GET',
        path: '/v0/{{base_id}}/Contacts?maxRecords=3&sort[0][field]=Name&sort[0][direction]=asc',
        label: 'Sort + limit',
      },
      {
        method: 'POST',
        path: '/v0/{{base_id}}/Contacts',
        label: 'Create a record',
        body: JSON.stringify(
          { fields: { Name: 'Sandbox Contact', Email: 'sandbox@example.org', Status: 'Lead' } },
          null,
          2
        ),
      },
      {
        method: 'POST',
        path: '/v0/{{base_id}}/Contacts',
        label: 'Batch create (max 10 at once)',
        body: JSON.stringify(
          {
            records: [
              { fields: { Name: 'Batch One', Status: 'Active' } },
              { fields: { Name: 'Batch Two', Status: 'Lead' } },
            ],
          },
          null,
          2
        ),
      },
    ],
  },

  mailgun: {
    title: 'Mailgun',
    blurb:
      'Transactional email. Sending an email also synthesizes a delivered event so it shows up in the events feed.',
    auth: 'Basic (api:key)',
    credentialField: 'baseUrl',
    credential: {
      baseUrl: '{{ORIGIN}}/mailgun',
      domain: '{{domain}}',
      apiKey: 'mock-api-key',
    },
    vars: { domain: 'sandbox-test.mailgun.org' },
    examples: [
      {
        method: 'POST',
        path: '/v3/{{domain}}/messages',
        label: 'Send an email (form-encoded): also creates a delivered event',
        contentType: FORM,
        body:
          'from=Mailgun+Sandbox+<postmaster@{{domain}}>' +
          '&to=jane.doe@example.org&subject=Sandbox+test&text=Hello+from+openfn-mocker',
      },
      { method: 'GET', path: '/v3/{{domain}}/events', label: 'Events feed (delivered/opened/bounced)' },
      { method: 'GET', path: '/v3/{{domain}}/stats/total', label: 'Aggregate stats (last 7 days)' },
    ],
  },

  twilio: {
    title: 'Twilio',
    blurb:
      'SMS + voice. Form-encoded PascalCase input, snake_case JSON output. Reading a single message auto-advances its status queued to sent to delivered.',
    auth: 'Basic (sid:token)',
    credentialField: 'baseUrl',
    credential: {
      baseUrl: '{{ORIGIN}}/twilio',
      accountSid: '{{account_sid}}',
      authToken: 'mock-auth-token',
    },
    vars: { account_sid: 'ACtest123456' },
    examples: [
      {
        method: 'POST',
        path: '/2010-04-01/Accounts/{{account_sid}}/Messages.json',
        label: 'Send an SMS (form-encoded PascalCase): starts as queued',
        contentType: FORM,
        body: 'To=%2B15558675399&From=%2B15005550006&Body=Hello+from+openfn-mocker',
      },
      {
        method: 'GET',
        path: '/2010-04-01/Accounts/{{account_sid}}/Messages.json',
        label: 'List messages for the account',
      },
      {
        method: 'GET',
        path: '/2010-04-01/Accounts/{{account_sid}}/Calls.json',
        label: 'List calls for the account',
      },
    ],
  },

  'http-generic': {
    title: 'Generic HTTP',
    blurb:
      'Spec-less catch-all: any path works. A POST turns its path into a collection and the response echoes your request under `_mock`.',
    auth: 'any',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/http-generic' },
    examples: [
      {
        method: 'POST',
        path: '/api/v1/referrals',
        label: 'POST anywhere: the path becomes a collection',
        body: JSON.stringify(
          { patient: 'Jane Doe', facility: 'Ngelehun CHC', urgency: 'high' },
          null,
          2
        ),
      },
      { method: 'GET', path: '/api/v1/referrals', label: 'List what you just posted' },
      { method: 'GET', path: '/anything/you/want', label: 'Any path returns a mock echo' },
    ],
  },
};

/** Preferred display order; anything else falls in after, alphabetically. */
const PREFERRED_ORDER = [
  'dhis2',
  'fhir',
  'openmrs',
  'commcare',
  'kobotoolbox',
  'primero',
  'airtable',
  'mailgun',
  'twilio',
  'http-generic',
];

/** A running system as seen by the renderer. */
export interface RunningSystemView {
  name: string;
  mountPath: string;
  config?: Record<string, unknown>;
}

/** Replace `{{key}}` tokens (except {{ORIGIN}}, resolved in the browser). */
function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key === 'ORIGIN' ? match : key in vars ? vars[key] : match
  );
}

/** Resolve a guide's config-dependent tokens and prepend the mount path. */
function resolveGuide(guide: SystemGuide, sys: RunningSystemView): SystemGuide & { mountPath: string } {
  const vars: Record<string, string> = { ...(guide.vars ?? {}) };
  for (const [k, v] of Object.entries(sys.config ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
  }
  const resolved = JSON.parse(interpolate(JSON.stringify(guide), vars)) as SystemGuide;
  resolved.examples = resolved.examples.map((ex) => ({
    ...ex,
    path: sys.mountPath + ex.path,
  }));
  return { ...resolved, mountPath: sys.mountPath };
}

/** Fallback guide for a running system with no curated catalog entry. */
function genericGuide(sys: RunningSystemView): SystemGuide & { mountPath: string } {
  return {
    title: sys.name,
    blurb: 'Mounted mock system.',
    auth: 'any',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}' + sys.mountPath },
    examples: [],
    mountPath: sys.mountPath,
  };
}

/** HTML-escape for text placed in the document (defense in depth). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render the full sandbox HTML page for the given running systems. The returned
 * string is a complete, self-contained HTML document.
 */
export function renderSandboxPage(
  systems: RunningSystemView[],
  opts: { name?: string } = {}
): string {
  const name = opts.name ?? 'openfn-mocker';

  const ordered = [...systems].sort((a, b) => {
    const ia = PREFERRED_ORDER.indexOf(a.name);
    const ib = PREFERRED_ORDER.indexOf(b.name);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  const cards = ordered.map((sys) => {
    const guide = SYSTEM_GUIDES[sys.name]
      ? resolveGuide(SYSTEM_GUIDES[sys.name], sys)
      : genericGuide(sys);
    return {
      name: sys.name,
      mountPath: sys.mountPath,
      title: guide.title,
      blurb: guide.blurb,
      auth: guide.auth,
      credentialField: guide.credentialField,
      credential: guide.credential,
      examples: guide.examples,
    };
  });

  const data = { name, systems: cards };
  // Escape "<" so the JSON can never terminate the <script> element early.
  const dataJson = JSON.stringify(data).replace(/</g, '\\u003c');

  return (
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<link rel="icon" href="data:image/svg+xml;base64,' +
    FAVICON_B64 +
    '">\n' +
    '<title>' +
    esc(name) +
    ' — API sandbox</title>\n' +
    '<style>' +
    STYLES +
    '</style>\n' +
    '</head>\n' +
    '<body>\n' +
    HEADER +
    '<main id="app"><p class="loading">Loading sandbox…</p></main>\n' +
    FOOTER +
    '<script>window.__SANDBOX__ = ' +
    dataJson +
    ';</script>\n' +
    '<script>' +
    CLIENT_JS +
    '</script>\n' +
    '</body>\n' +
    '</html>\n'
  );
}

/* ------------------------------------------------------------------ */
/* Static page chrome. No backticks or ${...} below (this file is not */
/* a template literal, but keeping it plain avoids surprises).        */
/* ------------------------------------------------------------------ */

/** Inline SVG favicon (indigo rounded square + ring) so the page needs no
 *  external asset and browsers never 404 on /favicon.ico. */
const FAVICON_B64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+' +
  'PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iNyIgZmlsbD0iIzQzMzhjYSIvPjxjaXJjbGUg' +
  'Y3g9IjE2IiBjeT0iMTYiIHI9IjciIGZpbGw9Im5vbmUiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRo' +
  'PSIzIi8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMi4yIiBmaWxsPSIjZmZmIi8+PC9zdmc+';

const STYLES = [
  ':root{--bg:#f5f6f8;--panel:#fff;--ink:#111826;--muted:#5b6472;--border:#e3e7ee;',
  '--accent:#4338ca;--accent-hover:#3730a3;--accent-soft:#eef2ff;--code:#0f172a;--code-ink:#e2e8f0;',
  '--get:#0a7d33;--post:#b45309;--put:#6d28d9;--patch:#0369a1;--delete:#b91c1c;--ok:#0a7d33;--err:#b91c1c;}',
  '*{box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{margin:0;background:var(--bg);color:var(--ink);',
  'font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
  'code,pre,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;}',
  'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
  'header.top{background:var(--code);color:#f8fafc;padding:26px 20px;}',
  '.wrap{max-width:1000px;margin:0 auto;padding:0 20px;}',
  'header.top .wrap{padding:0}',
  'header.top h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em;}',
  'header.top p{margin:0;color:#c7ccd6;max-width:70ch;}',
  '.baseurl{margin-top:14px;display:inline-flex;align-items:center;gap:8px;background:#1e293b;',
  'border:1px solid #33415a;border-radius:8px;padding:7px 11px;font-size:13px;}',
  '.baseurl b{color:#93c5fd;font-weight:600}',
  '.baseurl .mono{color:#f1f5f9}',
  'main{max-width:1000px;margin:0 auto;padding:22px 20px 60px;}',
  '.loading{color:var(--muted)}',
  'section.console{background:var(--panel);border:1px solid var(--border);border-radius:12px;',
  'padding:16px;margin-bottom:22px;box-shadow:0 1px 2px rgba(16,24,38,.04);}',
  'section.console h2,.sys h2{margin:0 0 4px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}',
  '.console .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;}',
  '.console select,.console input,.console textarea,.ex input,.ex textarea{font:inherit;color:var(--ink);',
  'background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px 10px;}',
  '.console input.path{flex:1;min-width:220px}',
  '.console select,.ex-method-sel{font-family:inherit;font-weight:600}',
  'textarea{width:100%;min-height:96px;resize:vertical;margin-top:8px;line-height:1.5;font-size:13px;}',
  '.ex textarea{min-height:70px}',
  'button{font:inherit;font-weight:600;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:8px 14px;}',
  'button.run,button.send{background:var(--accent);color:#fff;}',
  'button.run:hover,button.send:hover{background:var(--accent-hover)}',
  'button.ghost{background:#fff;color:var(--accent);border-color:var(--border);padding:5px 10px;font-size:12px;font-weight:600;}',
  'button.ghost:hover{background:var(--accent-soft)}',
  'button:disabled{opacity:.55;cursor:progress}',
  '.sys{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:16px 16px 6px;',
  'margin-bottom:16px;box-shadow:0 1px 2px rgba(16,24,38,.04);}',
  '.sys-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;}',
  '.sys-head h3{margin:0;font-size:18px;letter-spacing:-.01em}',
  '.sys-head .mount{font-size:13px;color:var(--accent);background:var(--accent-soft);border-radius:6px;padding:2px 8px}',
  '.sys-head .auth{font-size:12px;color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:2px 8px}',
  '.blurb{color:var(--muted);margin:8px 0 12px;max-width:80ch}',
  '.cred{margin:0 0 14px;border:1px solid var(--border);border-radius:8px;overflow:hidden}',
  '.cred-head{display:flex;justify-content:space-between;align-items:center;background:#fafbfc;',
  'border-bottom:1px solid var(--border);padding:6px 10px;font-size:12px;color:var(--muted)}',
  '.cred pre{margin:0;padding:11px 12px;background:var(--code);color:var(--code-ink);',
  'font-size:12.5px;overflow-x:auto}',
  '.ex{border-top:1px solid var(--border);padding:12px 0}',
  '.ex-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
  '.m{font-size:11px;font-weight:700;letter-spacing:.04em;color:#fff;border-radius:5px;padding:3px 7px;min-width:52px;text-align:center}',
  '.m.GET{background:var(--get)}.m.POST{background:var(--post)}.m.PUT{background:var(--put)}',
  '.m.PATCH{background:var(--patch)}.m.DELETE{background:var(--delete)}',
  '.ex .path{flex:1;min-width:200px;font-size:13px;color:var(--ink);background:#fafbfc}',
  '.ex-label{color:var(--muted);font-size:13px;margin:7px 0 0}',
  '.resp{margin-top:10px;display:none}',
  '.resp.show{display:block}',
  '.resp-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;margin-bottom:6px}',
  '.pill{font-weight:700;border-radius:5px;padding:2px 8px;color:#fff}',
  '.pill.ok{background:var(--ok)}.pill.err{background:var(--err)}',
  '.resp-meta .dim{color:var(--muted)}',
  '.resp pre{margin:0;padding:12px;background:var(--code);color:var(--code-ink);border-radius:8px;',
  'font-size:12.5px;max-height:360px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
  '.admin-links{display:flex;gap:8px;flex-wrap:wrap;padding:10px 0 6px;border-top:1px solid var(--border);margin-top:6px}',
  'footer{color:var(--muted);font-size:13px;text-align:center;padding:0 20px 40px}',
  '@media(max-width:640px){.ex .path{min-width:140px}header.top h1{font-size:19px}}',
].join('');

const HEADER = [
  '<header class="top"><div class="wrap">',
  '<h1>openfn-mocker <span style="opacity:.6;font-weight:500">API sandbox</span></h1>',
  '<p>A configurable mock of the external systems OpenFn integrates with. Point an OpenFn credential at ',
  'the base URL below, or try the endpoints live right here in your browser.</p>',
  '<div class="baseurl"><b>BASE URL</b> <span class="mono" id="base-url"></span></div>',
  '</div></header>',
].join('');

const FOOTER = [
  '<footer>Every request runs against the live in-memory mock. Data resets on restart or via the reset ',
  'endpoints. Raw system index: <a href="/_admin/systems">/_admin/systems</a> · ',
  '<a href="https://github.com/brandonjackson/openfn-mocker">source &amp; docs</a></footer>',
].join('');

/*
 * Client script. Kept free of backticks and template interpolation so it can be
 * concatenated verbatim. Builds the DOM with createElement (text via
 * textContent), fires fetch() at the live mock, and renders responses inline.
 */
const CLIENT_JS = [
  '(function(){',
  'var DATA=window.__SANDBOX__||{systems:[]};',
  'var ORIGIN=window.location.origin;',
  'function sub(s){return typeof s==="string"?s.split("{{ORIGIN}}").join(ORIGIN):s;}',
  'function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;',
  'if(text!=null)n.textContent=text;return n;}',
  'function pretty(text,ctype){if(ctype&&ctype.indexOf("json")===-1){return text;}',
  'try{return JSON.stringify(JSON.parse(text),null,2);}catch(e){return text;}}',
  // Perform a request and render into a response container.
  'function send(method,path,contentType,body,respEl,btn){',
  'var opts={method:method,headers:{}};',
  'if(method!=="GET"&&method!=="HEAD"&&body!=null&&body!==""){',
  'opts.headers["Content-Type"]=contentType||"application/json";opts.body=body;}',
  'var t0=(window.performance&&performance.now)?performance.now():Date.now();',
  'if(btn){btn.disabled=true;}',
  'respEl.className="resp show";respEl.innerHTML="";',
  'respEl.appendChild(el("div","resp-meta",null)).appendChild(el("span","dim","Sending…"));',
  'fetch(path,opts).then(function(res){return res.text().then(function(text){',
  'var t1=(window.performance&&performance.now)?performance.now():Date.now();',
  'renderResp(respEl,res.status,res.statusText,Math.round(t1-t0),',
  'res.headers.get("content-type")||"",text,res.headers.get("location"));',
  'if(btn){btn.disabled=false;}',
  '});}).catch(function(err){',
  'respEl.innerHTML="";var m=el("div","resp-meta");m.appendChild(el("span","pill err","ERROR"));',
  'm.appendChild(el("span","dim",String(err&&err.message||err)));respEl.appendChild(m);',
  'if(btn){btn.disabled=false;}});}',
  // Render status line + pretty body.
  'function renderResp(respEl,status,statusText,ms,ctype,text,location){',
  'respEl.innerHTML="";respEl.className="resp show";',
  'var meta=el("div","resp-meta");',
  'var ok=status>=200&&status<300;',
  'meta.appendChild(el("span","pill "+(ok?"ok":"err"),String(status)+(statusText?" "+statusText:"")));',
  'meta.appendChild(el("span","dim",ms+" ms"));',
  'if(ctype){meta.appendChild(el("span","dim",ctype.split(";")[0]));}',
  'if(location){meta.appendChild(el("span","dim","Location: "+location));}',
  'respEl.appendChild(meta);',
  'respEl.appendChild(el("pre",null,pretty(text,ctype)));}',
  // The shared top console.
  'function buildConsole(){',
  'var sec=el("section","console");sec.appendChild(el("h2",null,"Request console"));',
  'var row=el("div","row");',
  'var sel=document.createElement("select");["GET","POST","PUT","PATCH","DELETE"].forEach(function(m){',
  'var o=document.createElement("option");o.value=m;o.textContent=m;sel.appendChild(o);});',
  'var path=el("input","path");path.type="text";path.value="/";path.placeholder="/dhis2/api/organisationUnits";',
  'var ct=el("input","ctype");ct.type="text";ct.value="application/json";ct.style.maxWidth="220px";',
  'ct.title="Content-Type for the request body";',
  'var btn=el("button","send","Send");',
  'row.appendChild(sel);row.appendChild(path);row.appendChild(btn);',
  'var body=el("textarea");body.placeholder="Request body (JSON, form, or XML). Ignored for GET.";',
  'var ctRow=el("div","row");ctRow.appendChild(el("span","dim","Content-Type"));ctRow.appendChild(ct);',
  'var resp=el("div","resp");',
  'sec.appendChild(row);sec.appendChild(body);sec.appendChild(ctRow);sec.appendChild(resp);',
  'btn.addEventListener("click",function(){send(sel.value,path.value,ct.value,body.value,resp,btn);});',
  'window.__loadConsole=function(method,p,contentType,b){sel.value=method;path.value=p;',
  'ct.value=contentType||"application/json";body.value=b||"";',
  'sec.scrollIntoView({behavior:"smooth",block:"start"});};',
  'return sec;}',
  // A single example row (editable path + body, inline response).
  'function buildExample(ex){',
  'var wrap=el("div","ex");',
  'var head=el("div","ex-head");',
  'head.appendChild(el("span","m "+ex.method,ex.method));',
  'var path=el("input","path");path.type="text";path.value=ex.path;',
  'var run=el("button","run","Run");',
  'head.appendChild(path);head.appendChild(run);',
  'wrap.appendChild(head);',
  'wrap.appendChild(el("p","ex-label",ex.label));',
  'var body=null;',
  'if(ex.body!=null){body=el("textarea");body.value=ex.body;wrap.appendChild(body);}',
  'var resp=el("div","resp");wrap.appendChild(resp);',
  'run.addEventListener("click",function(){',
  'send(ex.method,path.value,ex.contentType,body?body.value:null,resp,run);});',
  'return wrap;}',
  // One system card.
  'function buildSystem(sys){',
  'var card=el("section","sys");',
  'var head=el("div","sys-head");',
  'head.appendChild(el("h3",null,sys.title));',
  'head.appendChild(el("span","mount",sys.mountPath));',
  'if(sys.auth){head.appendChild(el("span","auth","auth: "+sys.auth));}',
  'card.appendChild(head);',
  'card.appendChild(el("p","blurb",sys.blurb));',
  // Credential block.
  'var cred=el("div","cred");',
  'var ch=el("div","cred-head");ch.appendChild(el("span",null,"OpenFn credential"));',
  'var copy=el("button","ghost","Copy");ch.appendChild(copy);cred.appendChild(ch);',
  'var credObj=JSON.parse(sub(JSON.stringify(sys.credential)));',
  'var credText=JSON.stringify(credObj,null,2);',
  'cred.appendChild(el("pre",null,credText));',
  'copy.addEventListener("click",function(){',
  'if(navigator.clipboard){navigator.clipboard.writeText(credText).then(function(){',
  'copy.textContent="Copied";setTimeout(function(){copy.textContent="Copy";},1200);});}});',
  'card.appendChild(cred);',
  // Examples.
  'for(var i=0;i<sys.examples.length;i++){card.appendChild(buildExample(sys.examples[i]));}',
  // Admin quick links (route through the top console).
  'var admin=el("div","admin-links");',
  'admin.appendChild(el("span","dim","admin:"));',
  'var mk=function(lbl,method,p,b){var g=el("button","ghost",lbl);g.addEventListener("click",function(){',
  'window.__loadConsole(method,p,"application/json",b||"");});return g;};',
  'admin.appendChild(mk("status","GET",sys.mountPath+"/_admin/status"));',
  'admin.appendChild(mk("requests","GET",sys.mountPath+"/_admin/requests"));',
  'admin.appendChild(mk("store","GET",sys.mountPath+"/_admin/store"));',
  'admin.appendChild(mk("reset","POST",sys.mountPath+"/_admin/reset"));',
  'card.appendChild(admin);',
  'return card;}',
  // Boot.
  'function boot(){',
  'var base=document.getElementById("base-url");if(base)base.textContent=ORIGIN;',
  'var app=document.getElementById("app");app.innerHTML="";',
  'app.appendChild(buildConsole());',
  'if(!DATA.systems.length){app.appendChild(el("p","loading","No systems are enabled."));return;}',
  'var intro=el("p","blurb","Enabled systems ("+DATA.systems.length+'
    + '"). Edit any path or body, then Run.");',
  'app.appendChild(intro);',
  'for(var i=0;i<DATA.systems.length;i++){app.appendChild(buildSystem(DATA.systems[i]));}}',
  'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}',
  '})();',
].join('');

/** True if an Accept header indicates the client wants HTML (a browser). */
export function wantsHtml(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/html');
}
