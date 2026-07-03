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
  /** Auth style, shown on the card (e.g. 'Basic', 'Bearer', 'none'). */
  auth: string;
  /**
   * Authorization header the sandbox sends on every request to this system.
   * Present only for systems whose mock requires credentials (see the plugin's
   * `auth.required`); omit for open systems (FHIR, generic http). The value is
   * built from the example credential below — the mock validates presence, not
   * the value, so any correctly-shaped header works.
   */
  authHeader?: string;
  /** OpenFn credential URL field (e.g. hostUrl). */
  credentialField: string;
  /** Link to this system's OpenFn adaptor documentation. */
  docs?: string;
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

/** Build a `Basic <base64 user:pass>` Authorization header value. */
function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}

/**
 * Curated capabilities per system, keyed by system name (== registry / mount
 * key). Paths are relative to the system mount; renderSandboxPage prepends the
 * mount path. Example bodies target the shipped seed data so they work on first
 * boot and are read-back-able.
 */
export const SYSTEM_GUIDES: Record<string, SystemGuide> = {
  dhis2: {
    title: 'DHIS2',
    docs: 'https://docs.openfn.org/adaptors/packages/dhis2-docs',
    blurb:
      'Aggregate + tracker health data. List responses carry a pager and a resource-typed array; writes return an ImportSummary envelope. The generic adaptor is fully covered: the new /api/tracker API, /api/analytics, /api/schemas, and CRUD for any resource (with an optional /api/{version}/ segment).',
    auth: 'Basic',
    authHeader: basic('admin', 'mock'),
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
      {
        method: 'POST',
        path: '/api/tracker?importStrategy=CREATE_AND_UPDATE&async=false',
        label: 'New Tracker API: import events/trackedEntities (bundleReport)',
        body: JSON.stringify(
          {
            events: [
              { program: 'IpHINAT79UW', programStage: 'A03MvHHogjR', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED' },
            ],
          },
          null,
          2
        ),
      },
      {
        method: 'GET',
        path: '/api/tracker/events',
        label: 'Tracker export ({ instances, page, total })',
      },
      {
        method: 'GET',
        path: '/api/analytics?dimension=dx:fbfJHSPpUQD&dimension=pe:202401&dimension=ou:ImspTQPwCqd',
        label: 'Analytics grid (headers + rows + metaData)',
      },
      { method: 'GET', path: '/api/schemas/dataElement', label: 'Metadata schema for a resource type' },
      {
        method: 'GET',
        path: '/api/40/organisationUnits',
        label: 'Optional API version segment (/api/{version}/…)',
      },
    ],
  },

  fhir: {
    title: 'FHIR (HAPI R4)',
    docs: 'https://docs.openfn.org/adaptors/packages/fhir-docs',
    blurb:
      'HL7 FHIR R4 server. Searches return searchset Bundles, reads return the resource, and POST to the base runs a transaction/batch Bundle. Also serves the /metadata CapabilityStatement, resource _history, and a Claim for getClaim().',
    auth: 'none / Bearer',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/fhir', apiPath: '' },
    examples: [
      { method: 'GET', path: '/metadata', label: 'CapabilityStatement (fhir get("metadata"))' },
      { method: 'GET', path: '/Patient', label: 'Search all patients (searchset Bundle)' },
      { method: 'GET', path: '/Patient/pat-1', label: 'Read one patient by id' },
      { method: 'GET', path: '/Patient/pat-1/_history', label: 'Resource history Bundle' },
      { method: 'GET', path: '/Patient?name=Kamara', label: 'Search patients by name' },
      { method: 'GET', path: '/Claim/claim-1', label: 'Read a Claim (fhir getClaim())' },
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
    docs: 'https://docs.openfn.org/adaptors/packages/openmrs-docs',
    blurb:
      'Medical record system exposed as a generic REST API ({ results, links }) and a FHIR R4 module. Any resource name works (with subresources like patient/{uuid}/identifier), updates POST to the uuid, and the same seeded patients appear in both representations.',
    auth: 'Basic',
    authHeader: basic('admin', 'mock'),
    credentialField: 'instanceUrl',
    credential: { instanceUrl: '{{ORIGIN}}/openmrs', username: 'admin', password: 'mock' },
    examples: [
      { method: 'GET', path: '/ws/rest/v1/session', label: 'Authenticated session' },
      { method: 'GET', path: '/ws/rest/v1/patient', label: 'Patient list ({ results, links })' },
      { method: 'GET', path: '/ws/rest/v1/patient?q=Doe', label: 'Search by name / identifier' },
      {
        method: 'GET',
        path: '/ws/rest/v1/patient?v=ref',
        label: 'Reference representation (?v=ref)',
      },
      { method: 'GET', path: '/ws/rest/v1/provider', label: 'Any resource name works (provider)' },
      {
        method: 'GET',
        path: '/ws/fhir2/R4/Patient',
        label: 'Same patients via the FHIR R4 module',
      },
      {
        method: 'GET',
        path: '/ws/fhir2/R4/Observation',
        label: 'FHIR Observations (fhir.get("Observation"))',
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
    docs: 'https://docs.openfn.org/adaptors/packages/commcare-docs',
    blurb:
      'Mobile data collection. The domain-scoped Data API returns Tastypie { meta, objects } envelopes for any resource (case, form, user, application, location); configurable reports and the OpenRosa form receiver are also served.',
    auth: 'Basic / apiKey header',
    authHeader: basic('user@test.com', 'mock'),
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
      { method: 'GET', path: '/a/{{domain}}/api/v0.5/user/', label: 'Mobile workers (any v0.5 resource)' },
      {
        method: 'GET',
        path: '/a/{{domain}}/api/v0.5/configurablereportdata/report-abc/',
        label: 'Configurable report data (fetchReportData)',
      },
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
    docs: 'https://docs.openfn.org/adaptors/packages/kobotoolbox-docs',
    blurb:
      'Survey platform. Assets (forms) and their submissions use DRF { count, next, previous, results } envelopes; submission counts are live. getForms, getSubmissions (?query=/?sort=), getDeploymentInfo and generic http.* asset/data operations are all covered.',
    auth: 'Token',
    authHeader: 'Token mock-kobo-token',
    credentialField: 'baseURL',
    credential: { baseURL: '{{ORIGIN}}/kobotoolbox', apiToken: 'mock-kobo-token' },
    examples: [
      { method: 'GET', path: '/api/v2/assets/?asset_type=survey', label: 'Survey assets (getForms)' },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/',
        label: 'Single asset with live submission count',
      },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/deployment/',
        label: 'Deployment info (getDeploymentInfo)',
      },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/data/',
        label: 'Submissions for an asset',
      },
      {
        method: 'GET',
        path: '/api/v2/assets/aHousehold01Q1/data/?query={"water_source":"borehole"}',
        label: 'Filter submissions (getSubmissions ?query=)',
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
    docs: 'https://docs.openfn.org/adaptors/packages/primero-docs',
    blurb:
      'Child-protection case management. Business fields nest under `data`; lists use { data, metadata }. POST /api/v2/tokens exchanges a bearer token. Cases, case referrals, and the forms/lookups/locations reference data are all served.',
    auth: 'Token via POST /api/v2/tokens',
    authHeader: 'Bearer mock_primero_token',
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
      { method: 'GET', path: '/api/v2/forms', label: 'Form definitions (getForms)' },
      { method: 'GET', path: '/api/v2/lookups', label: 'Lookup values (getLookups)' },
      { method: 'GET', path: '/api/v2/locations', label: 'Location hierarchy (getLocations)' },
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

  mailgun: {
    title: 'Mailgun',
    docs: 'https://docs.openfn.org/adaptors/packages/mailgun-docs',
    blurb:
      'Transactional email. Sending an email also synthesizes a delivered event so it shows up in the events feed.',
    auth: 'Basic (api:key)',
    authHeader: basic('api', 'mock-api-key'),
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
    docs: 'https://docs.openfn.org/adaptors/packages/twilio-docs',
    blurb:
      'SMS + voice. Form-encoded PascalCase input, snake_case JSON output. Reading a single message auto-advances its status queued to sent to delivered.',
    auth: 'Basic (sid:token)',
    authHeader: basic('ACtest123456', 'mock-auth-token'),
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
    docs: 'https://docs.openfn.org/adaptors/packages/http-docs',
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

  godata: {
    title: 'Go.Data',
    docs: 'https://docs.openfn.org/adaptors/packages/godata-docs',
    blurb:
      'WHO outbreak investigation platform. Token login via POST /users/login; list endpoints return bare arrays and a ?filter= JSON Loopback query looks records up. Outbreaks, cases, contacts, locations and reference-data are all served.',
    auth: 'Token via POST /users/login',
    credentialField: 'apiUrl',
    credential: { apiUrl: '{{ORIGIN}}/godata', email: 'api@who.int', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/users/login',
        label: 'Login: returns { id: <token> }',
        body: JSON.stringify({ email: 'api@who.int', password: 'mock' }, null, 2),
      },
      { method: 'GET', path: '/outbreaks', label: 'List outbreaks (bare array)' },
      { method: 'GET', path: '/outbreaks/ob-sl-covid19/cases', label: 'Cases for an outbreak' },
      {
        method: 'GET',
        path: '/outbreaks/ob-sl-covid19/cases?filter=%7B%22where%22%3A%7B%22firstName%22%3A%22Jane%22%7D%7D',
        label: 'Filter cases (?filter= Loopback where)',
      },
      { method: 'GET', path: '/locations', label: 'Location tree' },
      {
        method: 'POST',
        path: '/outbreaks/ob-sl-covid19/cases',
        label: 'Create a case (upsertCase)',
        body: JSON.stringify({ firstName: 'Sandbox', lastName: 'Case', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE' }, null, 2),
      },
    ],
  },

  rapidpro: {
    title: 'RapidPro / TextIt',
    docs: 'https://docs.openfn.org/adaptors/packages/rapidpro-docs',
    blurb:
      'Messaging & flow automation. Token auth over /api/v2 with .json suffixes and DRF { next, previous, results } envelopes. addContact/upsertContact, startFlow and sendBroadcast are covered; posting a contact whose urn already exists updates it.',
    auth: 'Token',
    credentialField: 'host',
    credential: { host: '{{ORIGIN}}/rapidpro', token: 'mock-rapidpro-token' },
    examples: [
      { method: 'GET', path: '/api/v2/contacts.json', label: 'List contacts (DRF envelope)' },
      {
        method: 'POST',
        path: '/api/v2/contacts.json',
        label: 'Add / upsert a contact (dedup on urn)',
        body: JSON.stringify({ name: 'Sandbox Contact', urns: ['tel:+23276123456'], fields: { district: 'Bo' } }, null, 2),
      },
      {
        method: 'POST',
        path: '/api/v2/flow_starts.json',
        label: 'Start a flow (startFlow)',
        body: JSON.stringify({ flow: 'flow-0001-anc-reminder', groups: ['grp-0001-anc'] }, null, 2),
      },
      {
        method: 'POST',
        path: '/api/v2/broadcasts.json',
        label: 'Send a broadcast (sendBroadcast)',
        body: JSON.stringify({ urns: ['tel:+23276000001'], text: 'Your appointment is tomorrow' }, null, 2),
      },
      { method: 'GET', path: '/api/v2/flows.json', label: 'List flows' },
    ],
  },

  odk: {
    title: 'ODK Central',
    docs: 'https://docs.openfn.org/adaptors/packages/odk-docs',
    blurb:
      'Open Data Kit data collection. Session-token auth; projects and forms are REST arrays and submissions come through the OData endpoint (…/forms/{id}.svc/Submissions) as { value: [...] } with ODK __id / __system metadata.',
    auth: 'Session token (POST /v1/sessions)',
    credentialField: 'baseURL',
    credential: { baseURL: '{{ORIGIN}}/odk', email: 'fieldworker@example.org', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/v1/sessions',
        label: 'Create a session token',
        body: JSON.stringify({ email: 'fieldworker@example.org', password: 'mock' }, null, 2),
      },
      { method: 'GET', path: '/v1/projects', label: 'List projects' },
      { method: 'GET', path: '/v1/projects/1/forms', label: 'Forms for a project (getForms)' },
      {
        method: 'GET',
        path: '/v1/projects/1/forms/household-survey.svc/Submissions',
        label: 'Submissions (OData, getSubmissions)',
      },
      {
        method: 'POST',
        path: '/v1/projects/1/forms/household-survey.svc/Submissions',
        label: 'Add a submission',
        body: JSON.stringify({ head_name: 'Sandbox Household', household_size: 3, district: 'Bo' }, null, 2),
      },
    ],
  },

  openlmis: {
    title: 'OpenLMIS',
    docs: 'https://docs.openfn.org/adaptors/packages/openlmis-docs',
    blurb:
      'Logistics management (v3). OAuth2 token via POST /api/oauth/token; reference-data + requisition lists use the Spring Data { content, totalElements, totalPages, … } page envelope. Facilities, orderables, programs and requisitions are served.',
    auth: 'OAuth2 (POST /api/oauth/token)',
    credentialField: 'hostUrl',
    credential: { hostUrl: '{{ORIGIN}}/openlmis', username: 'admin', password: 'mock' },
    examples: [
      { method: 'POST', path: '/api/oauth/token?grant_type=client_credentials', label: 'Get an access token' },
      { method: 'GET', path: '/api/facilities', label: 'Facilities (Spring page envelope)' },
      { method: 'GET', path: '/api/orderables', label: 'Products / orderables' },
      { method: 'GET', path: '/api/requisitions', label: 'Requisitions' },
      {
        method: 'POST',
        path: '/api/requisitions/initiate?program=10845cb9-d365-4aaa-badd-b4fa39c6a26a&facility=a6799d64-d10d-4011-b8c2-0e4d4a3f0001',
        label: 'Initiate a requisition',
      },
    ],
  },

  openimis: {
    title: 'openIMIS',
    docs: 'https://docs.openfn.org/adaptors/packages/openimis-docs',
    blurb:
      'Health-insurance management via a FHIR R4 API (api_fhir_r4). Login at POST /api/api_fhir_r4/login/ returns a bearer token; insurees are Patients, policies are Contracts and benefits are Coverages/Claims, all returned as searchset Bundles.',
    auth: 'Token (POST …/login/)',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/openimis', username: 'Admin', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/api/api_fhir_r4/login/',
        label: 'Login: returns { token }',
        body: JSON.stringify({ username: 'Admin', password: 'mock' }, null, 2),
      },
      { method: 'GET', path: '/api/api_fhir_r4/Patient', label: 'Insurees as FHIR Patients (Bundle)' },
      { method: 'GET', path: '/api/api_fhir_r4/Patient/insuree-0001', label: 'Read one insuree' },
      { method: 'GET', path: '/api/api_fhir_r4/Contract', label: 'Policies (Contracts)' },
      { method: 'GET', path: '/api/api_fhir_r4/Claim', label: 'Claims' },
    ],
  },

  openspp: {
    title: 'OpenSPP',
    docs: 'https://docs.openfn.org/adaptors/packages/openspp-docs',
    blurb:
      'Social-protection registry built on Odoo. The adaptor speaks Odoo XML-RPC (/xmlrpc/2/common + /xmlrpc/2/object): individuals and group households live in res.partner, with g2p.program enrolments and spp.area/spp.service.point. Requests and responses are XML — use the request console with Content-Type text/xml.',
    auth: 'Odoo authenticate (XML-RPC)',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/openspp', db: 'openspp', username: 'admin', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/xmlrpc/2/common',
        label: 'authenticate → uid (XML-RPC)',
        contentType: XML,
        body:
          '<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>' +
          '<param><value><string>openspp</string></value></param>' +
          '<param><value><string>admin</string></value></param>' +
          '<param><value><string>mock</string></value></param>' +
          '<param><value><struct></struct></value></param></params></methodCall>',
      },
      {
        method: 'POST',
        path: '/xmlrpc/2/object',
        label: 'search_read households (res.partner where is_group=true)',
        contentType: XML,
        body:
          '<?xml version="1.0"?><methodCall><methodName>execute_kw</methodName><params>' +
          '<param><value><string>openspp</string></value></param>' +
          '<param><value><int>2</int></value></param>' +
          '<param><value><string>mock</string></value></param>' +
          '<param><value><string>res.partner</string></value></param>' +
          '<param><value><string>search_read</string></value></param>' +
          '<param><value><array><data><value><array><data>' +
          '<value><array><data><value><string>is_group</string></value>' +
          '<value><string>=</string></value><value><boolean>1</boolean></value>' +
          '</data></array></value></data></array></value></data></array></value></param>' +
          '<param><value><struct><member><name>fields</name><value><array><data>' +
          '<value><string>name</string></value><value><string>kind</string></value>' +
          '</data></array></value></member></struct></value></param></params></methodCall>',
      },
    ],
  },

  opencrvs: {
    title: 'OpenCRVS',
    docs: 'https://docs.openfn.org/adaptors/packages/opencrvs-docs',
    blurb:
      'Civil registration & vital statistics. A GraphQL search API (queryEvents → { data: { searchEvents } }) sits alongside the events REST API: POST /api/events/events creates an event, …/notify advances it, and /api/events/locations lists places.',
    auth: 'Bearer JWT',
    credentialField: 'url',
    credential: { url: '{{ORIGIN}}/opencrvs', token: 'mock-opencrvs-token' },
    examples: [
      {
        method: 'POST',
        path: '/graphql',
        label: 'searchEvents (queryEvents)',
        body: JSON.stringify({ query: 'query { searchEvents { totalItems results { id type } } }' }, null, 2),
      },
      { method: 'GET', path: '/api/events/events', label: 'List registration events' },
      {
        method: 'POST',
        path: '/api/events/events',
        label: 'Create an event (createEvent)',
        body: JSON.stringify({ type: 'v2.birth', transactionId: 'sandbox-txn-1' }, null, 2),
      },
      { method: 'GET', path: '/api/events/locations', label: 'Location list' },
    ],
  },

  openelis: {
    title: 'OpenELIS Global',
    docs: 'https://docs.openfn.org/adaptors/packages/openelis-docs',
    blurb:
      'Laboratory information system (OpenELIS Global 2.x) exposed as FHIR R4 under /fhir. Lab work is modelled as ServiceRequests (orders), Specimens, Observations (results) and DiagnosticReports, all tied to a Patient and returned as searchset Bundles.',
    auth: 'Basic / Bearer',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/openelis', username: 'admin', password: 'mock' },
    examples: [
      { method: 'GET', path: '/fhir/ServiceRequest', label: 'Lab orders (ServiceRequest Bundle)' },
      { method: 'GET', path: '/fhir/DiagnosticReport/report-0001', label: 'A diagnostic report + results' },
      { method: 'GET', path: '/fhir/Observation', label: 'Result Observations' },
      {
        method: 'POST',
        path: '/fhir/ServiceRequest',
        label: 'Create a lab order',
        body: JSON.stringify({ resourceType: 'ServiceRequest', status: 'active', intent: 'order', subject: { reference: 'Patient/pat-0001' } }, null, 2),
      },
    ],
  },

  cht: {
    title: 'CHT (Community Health Toolkit)',
    docs: 'https://docs.openfn.org/adaptors/packages/cht-docs',
    blurb:
      'Medic Community Health Toolkit on CouchDB. Create contacts via the Medic REST API (/api/v1/people, /api/v1/places), read/write raw docs and _bulk_docs on /medic, follow the _changes feed, and read/update app settings.',
    auth: 'Basic',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/cht', username: 'medic', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/api/v1/people',
        label: 'Create a person (returns { id, rev })',
        body: JSON.stringify({ name: 'Sandbox CHW', role: 'chw', phone: '+23276123456' }, null, 2),
      },
      { method: 'GET', path: '/medic/_changes', label: 'CouchDB changes feed' },
      { method: 'GET', path: '/medic/person-patient-0001', label: 'Read a doc by _id' },
      {
        method: 'POST',
        path: '/medic/_bulk_docs',
        label: 'Bulk write docs',
        body: JSON.stringify({ docs: [{ type: 'person', name: 'Bulk One' }] }, null, 2),
      },
      { method: 'GET', path: '/api/v2/export/contacts', label: 'Export contacts' },
    ],
  },

  openhim: {
    title: 'OpenHIM',
    docs: 'https://docs.openfn.org/adaptors/packages/openhim-docs',
    blurb:
      'Health information mediator (OpenHIE). Manages the OpenHIM Core API — channels, clients, tasks and (read-only) transactions as Mongo docs keyed by a 24-hex _id — plus a sample /chw/encounter mediator route. List endpoints return bare arrays.',
    auth: 'OpenHIM header auth',
    credentialField: 'apiURL',
    credential: { apiURL: '{{ORIGIN}}/openhim', username: 'root@openhim.org', password: 'mock' },
    examples: [
      { method: 'GET', path: '/channels', label: 'List channels' },
      { method: 'GET', path: '/clients', label: 'List clients' },
      { method: 'GET', path: '/transactions', label: 'List transactions (read-only)' },
      {
        method: 'POST',
        path: '/clients',
        label: 'Register a client',
        body: JSON.stringify({ clientID: 'sandbox', name: 'Sandbox Client', roles: ['chw'] }, null, 2),
      },
      {
        method: 'POST',
        path: '/chw/encounter',
        label: 'Post a CHW encounter (createEncounter)',
        body: JSON.stringify({ patient: 'Jane Doe', observations: [{ code: 'temp', value: 37.2 }] }, null, 2),
      },
    ],
  },

  openboxes: {
    title: 'OpenBoxes',
    docs: 'https://docs.openfn.org/adaptors/packages/openboxes-docs',
    blurb:
      "Supply-chain & inventory management. Token login at POST /api/login; every payload nests under a `data` key and ids are 32-char hex. Products, locations and stock movements (with line items) are served.",
    auth: 'Token (POST /api/login)',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/openboxes', username: 'admin', password: 'mock' },
    examples: [
      {
        method: 'POST',
        path: '/api/login',
        label: 'Login: returns { data: { token } }',
        body: JSON.stringify({ username: 'admin', password: 'mock' }, null, 2),
      },
      { method: 'GET', path: '/api/products', label: 'Products ({ data: [...] })' },
      { method: 'GET', path: '/api/locations', label: 'Depots & wards' },
      { method: 'GET', path: '/api/stockMovements', label: 'Stock movements' },
      {
        method: 'POST',
        path: '/api/products',
        label: 'Create a product',
        body: JSON.stringify({ productCode: 'SANDBOX-001', name: 'Sandbox Product', unitOfMeasure: 'EA' }, null, 2),
      },
    ],
  },

  ihris: {
    title: 'iHRIS',
    docs: 'https://docs.openfn.org/adaptors/packages/ihris-docs',
    blurb:
      'Health-workforce information system exposed as FHIR R4 under /fhir. The workforce is modelled as Practitioners, PractitionerRoles, Organizations and Locations returned as searchset Bundles.',
    auth: 'Basic / Bearer',
    credentialField: 'baseUrl',
    credential: { baseUrl: '{{ORIGIN}}/ihris', username: 'admin', password: 'mock' },
    examples: [
      { method: 'GET', path: '/fhir/Practitioner', label: 'Health workforce (Practitioner Bundle)' },
      { method: 'GET', path: '/fhir/Practitioner?name=Sesay', label: 'Search practitioners by name' },
      { method: 'GET', path: '/fhir/PractitionerRole/role-prac-0001', label: 'A practitioner role' },
      {
        method: 'POST',
        path: '/fhir/Practitioner',
        label: 'Add a practitioner',
        body: JSON.stringify({ resourceType: 'Practitioner', name: [{ family: 'Sandbox', given: ['New'] }], gender: 'female' }, null, 2),
      },
    ],
  },
};

/** Preferred display order; anything else falls in after, alphabetically. */
const PREFERRED_ORDER = [
  // Health & clinical DPGs
  'dhis2',
  'fhir',
  'openmrs',
  'openimis',
  'openelis',
  'ihris',
  'openhim',
  // Community health & case management
  'commcare',
  'cht',
  'primero',
  'godata',
  // Data collection & messaging
  'kobotoolbox',
  'odk',
  'rapidpro',
  // Registries & supply chain
  'opencrvs',
  'openspp',
  'openlmis',
  'openboxes',
  // Operational tools
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
      authHeader: guide.authHeader,
      credentialField: guide.credentialField,
      docs: guide.docs,
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
    '<div class="layout">\n' +
    '<aside id="sidebar" class="sidebar"><p class="loading">…</p></aside>\n' +
    '<main id="app" class="content"><p class="loading">Loading sandbox…</p></main>\n' +
    '</div>\n' +
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
  'html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}',
  'body{margin:0;background:var(--bg);color:var(--ink);',
  'font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}',
  'code,pre,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;}',
  'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
  'header.top{background:var(--code);color:#f8fafc;padding:26px 20px;}',
  '.wrap{max-width:1080px;margin:0 auto;padding:0 20px;}',
  'header.top .wrap{padding:0}',
  'header.top h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em;}',
  'header.top p{margin:0;color:#c7ccd6;max-width:70ch;}',
  '.baseurl{margin-top:14px;display:inline-flex;align-items:center;gap:8px;background:#1e293b;',
  'border:1px solid #33415a;border-radius:8px;padding:7px 11px;font-size:13px;}',
  '.baseurl b{color:#93c5fd;font-weight:600}',
  '.baseurl .mono{color:#f1f5f9}',
  // Two-column layout: sticky left-hand nav + main content column.
  '.layout{max-width:1080px;margin:0 auto;padding:22px 20px 60px;display:flex;gap:30px;align-items:flex-start;}',
  '.sidebar{flex:0 0 200px;position:sticky;top:18px;align-self:flex-start;max-height:calc(100vh - 34px);overflow:auto;}',
  '.sidebar-inner{font-size:14px}',
  '.nav-group{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:16px 0 6px}',
  '.nav-group:first-child{margin-top:0}',
  '.nav-list{list-style:none;margin:0 0 4px;padding:0}',
  '.nav-list a{display:block;padding:5px 10px;border-radius:7px;color:var(--ink);border-left:2px solid transparent;line-height:1.35}',
  '.nav-list a:hover{background:var(--accent-soft);color:var(--accent);text-decoration:none}',
  '.nav-list a.active{background:var(--accent-soft);color:var(--accent);border-left-color:var(--accent);font-weight:600}',
  '.content{flex:1;min-width:0}',
  // Per-system guide block: "Set up the adaptor" steps + "API overview" docs links.
  '.sys-guide{display:grid;grid-template-columns:1fr 1fr;gap:18px 28px;margin:10px 0 16px;',
  'padding:14px 16px;background:var(--bg);border:1px solid var(--border);border-radius:10px}',
  '.sys-guide h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}',
  '.sys-guide p{margin:0 0 10px;color:var(--muted)}',
  '.sys-guide code{background:#eef1f5;border:1px solid var(--border);border-radius:5px;padding:1px 5px;',
  'font-size:12px;color:var(--code);word-break:break-word}',
  '.steps{margin:0;padding:0;list-style:none;counter-reset:step;font-size:13.5px}',
  '.steps>li{position:relative;padding:0 0 12px 34px;color:var(--muted)}',
  '.steps>li:last-child{padding-bottom:0}',
  '.steps>li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:-1px;',
  'width:23px;height:23px;border-radius:50%;background:var(--accent-soft);color:var(--accent);',
  'font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}',
  '.steps .step-h{display:block;color:var(--ink);font-weight:600;margin-bottom:1px}',
  '.doc-links{list-style:none;margin:0;padding:0;display:grid;gap:7px;font-size:13.5px}',
  '.doc-links a{font-weight:600}',
  '.loading{color:var(--muted)}',
  'section.console{background:var(--panel);border:1px solid var(--border);border-radius:12px;',
  'padding:16px;margin-bottom:22px;box-shadow:0 1px 2px rgba(16,24,38,.04);scroll-margin-top:16px;}',
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
  'margin-bottom:16px;box-shadow:0 1px 2px rgba(16,24,38,.04);scroll-margin-top:16px;}',
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
  // Stack the sidebar above the content on narrow screens (nav becomes a wrap).
  '@media(max-width:820px){.layout{flex-direction:column;gap:16px;padding-top:18px}',
  '.sidebar{position:static;flex:none;width:100%;max-height:none;overflow:visible;',
  'border:1px solid var(--border);background:var(--panel);border-radius:12px;padding:12px 14px}',
  '.nav-list{display:flex;flex-wrap:wrap;gap:4px 6px;margin-bottom:2px}',
  '.nav-list a{border-left:none;padding:4px 9px}',
  '.nav-group{margin:10px 0 5px}.nav-group:first-child{margin-top:0}}',
  '@media(max-width:640px){.ex .path{min-width:140px}header.top h1{font-size:19px}.sys-guide{grid-template-columns:1fr;gap:16px}}',
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
  '<footer>Every request runs against the live in-memory mock; data resets on restart or via the reset endpoints.<br>',
  '<a href="https://docs.openfn.org/documentation" target="_blank" rel="noopener">OpenFn docs</a> · ',
  '<a href="https://docs.openfn.org/adaptors" target="_blank" rel="noopener">Adaptors reference</a> · ',
  '<a href="https://docs.openfn.org/documentation/build/credentials" target="_blank" rel="noopener">Credentials</a> · ',
  '<a href="/_admin/systems">/_admin/systems</a> · ',
  '<a href="https://github.com/brandonjackson/openfn-mocker">source</a></footer>',
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
  // Build an element from mixed parts (strings become text nodes; nodes append as-is).
  'function rich(tag,cls,parts){var n=el(tag,cls);for(var i=0;i<parts.length;i++){var p=parts[i];',
  'n.appendChild(typeof p==="string"?document.createTextNode(p):p);}return n;}',
  'function bold(t){return el("b",null,t);}',
  'function codeEl(t){return el("code",null,t);}',
  'function link(t,href){var a=el("a",null,t);a.href=href;a.target="_blank";a.rel="noopener";return a;}',
  'function pretty(text,ctype){if(ctype&&ctype.indexOf("json")===-1){return text;}',
  'try{return JSON.stringify(JSON.parse(text),null,2);}catch(e){return text;}}',
  // Perform a request and render into a response container.
  'function send(method,path,contentType,body,respEl,btn,authHeader){',
  'var opts={method:method,headers:{}};',
  // Auth-required systems get their credential header; the mock checks presence,
  // not the value. Open systems (fhir, http-generic) pass no header.
  'if(authHeader){opts.headers["Authorization"]=authHeader;}',
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
  'var sec=el("section","console");sec.id="console";sec.appendChild(el("h2",null,"Request console"));',
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
  'function buildExample(ex,authHeader){',
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
  'send(ex.method,path.value,ex.contentType,body?body.value:null,resp,run,authHeader);});',
  'return wrap;}',
  // One system card.
  'function buildSystem(sys){',
  'var card=el("section","sys");card.id="sys-"+sys.name;',
  'var head=el("div","sys-head");',
  'head.appendChild(el("h3",null,sys.title));',
  'head.appendChild(el("span","mount",sys.mountPath));',
  'if(sys.auth){head.appendChild(el("span","auth","auth: "+sys.auth));}',
  'card.appendChild(head);',
  // Per-system guide: how to set up this adaptor + an API overview with docs links.
  'var guide=el("div","sys-guide");',
  'var setup=el("div","sys-guide-col");setup.appendChild(el("h4",null,"Set up the adaptor"));',
  'var steps=el("ol","steps");',
  'steps.appendChild(rich("li",null,[el("span","step-h","Create the credential"),',
  '"In OpenFn open ",bold("Settings \\u2192 Credentials \\u2192 New credential"),", pick ",bold(sys.title),',
  '", and name it e.g. ",codeEl("mocker-"+sys.name),"."]));',
  'steps.appendChild(rich("li",null,[el("span","step-h","Point it at this mock"),',
  '"Under ",bold("Credential environments"),", set ",bold(sys.credentialField)," to ",',
  'codeEl(ORIGIN+sys.mountPath),". ",(sys.authHeader?',
  '"This system requires credentials, but any value works \\u2014 the mock checks they are present, never that they are valid. ":',
  '"No auth is required for this system. "),',
  '"Copy the full credential below."]));',
  'steps.appendChild(rich("li",null,[el("span","step-h","Grant access & attach"),',
  '"Under ",bold("Projects access")," add your project, save, then select the credential on the workflow step."]));',
  'setup.appendChild(steps);',
  'var ov=el("div","sys-guide-col");ov.appendChild(el("h4",null,"API overview"));',
  'ov.appendChild(el("p",null,sys.blurb));',
  'var dl=el("ul","doc-links");',
  'if(sys.docs){dl.appendChild(rich("li",null,[link(sys.title+" adaptor docs \\u2197",sys.docs)]));}',
  'dl.appendChild(rich("li",null,[link("Managing credentials \\u2197","https://docs.openfn.org/documentation/build/credentials")]));',
  'ov.appendChild(dl);',
  'guide.appendChild(setup);guide.appendChild(ov);card.appendChild(guide);',
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
  'for(var i=0;i<sys.examples.length;i++){card.appendChild(buildExample(sys.examples[i],sys.authHeader));}',
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
  // Left-hand navigation: the request console plus one link per system.
  'function buildSidebar(){',
  'var nav=el("nav","sidebar-inner");',
  'var g=el("ul","nav-list");var li=el("li");var a=el("a",null,"Request console");',
  'a.href="#console";li.appendChild(a);g.appendChild(li);nav.appendChild(g);',
  'if(DATA.systems.length){',
  'nav.appendChild(el("div","nav-group","Systems"));',
  'var s=el("ul","nav-list");',
  // Nav links are sorted alphabetically by title (the content cards keep their
  // curated order); localeCompare gives a case-insensitive, human-friendly sort.
  'var navSystems=DATA.systems.slice().sort(function(a,b){return a.title.localeCompare(b.title);});',
  'for(var j=0;j<navSystems.length;j++){var sys=navSystems[j];var li2=el("li");',
  'var a2=el("a",null,sys.title);a2.href="#sys-"+sys.name;li2.appendChild(a2);s.appendChild(li2);}',
  'nav.appendChild(s);}',
  'return nav;}',
  // Scroll-spy: highlight the nav link for whichever section is currently in view.
  'function setupScrollSpy(){',
  'var order=[],map={};var links=document.querySelectorAll(".nav-list a");',
  'for(var i=0;i<links.length;i++){var href=links[i].getAttribute("href");',
  'if(href&&href.charAt(0)==="#"){var id=href.slice(1);',
  'if(document.getElementById(id)){map[id]=links[i];order.push(id);}}}',
  'if(!order.length)return;var ticking=false;',
  'function offset(){return window.pageYOffset||window.scrollY||0;}',
  'function update(){ticking=false;var pos=offset()+130;var active=order[0];',
  'for(var k=0;k<order.length;k++){var e=document.getElementById(order[k]);',
  'if(e&&e.getBoundingClientRect().top+offset()<=pos)active=order[k];}',
  'for(var m=0;m<order.length;m++){map[order[m]].className=order[m]===active?"active":"";}}',
  'window.addEventListener("scroll",function(){if(!ticking){ticking=true;',
  '(window.requestAnimationFrame||function(f){setTimeout(f,16);})(update);}});',
  'update();}',
  // Boot.
  'function boot(){',
  'var base=document.getElementById("base-url");if(base)base.textContent=ORIGIN;',
  'var side=document.getElementById("sidebar");if(side){side.innerHTML="";side.appendChild(buildSidebar());}',
  'var app=document.getElementById("app");app.innerHTML="";',
  'app.appendChild(buildConsole());',
  'if(!DATA.systems.length){app.appendChild(el("p","loading","No systems are enabled."));setupScrollSpy();return;}',
  'app.appendChild(el("p","blurb","Enabled systems ("+DATA.systems.length+'
    + '"). Each card shows how to set up its OpenFn adaptor, then lets you run requests live \\u2014 edit any path or body, then Run."));',
  'for(var i=0;i<DATA.systems.length;i++){app.appendChild(buildSystem(DATA.systems[i]));}',
  'setupScrollSpy();}',
  'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}',
  '})();',
].join('');

/** True if an Accept header indicates the client wants HTML (a browser). */
export function wantsHtml(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/html');
}
