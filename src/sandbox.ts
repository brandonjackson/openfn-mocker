/**
 * Browser API sandbox served at GET / (to clients that accept text/html).
 *
 * This module owns two things:
 *  1. A curated CATALOG of demo content for each mock system (a blurb + a
 *     handful of runnable example requests). The credential itself is NOT here:
 *     it is declared on the system's plugin (`MockSystemPlugin.credential`), the
 *     single source of truth for its auth, and the sandbox reads it from there
 *     to visualise the credential and generate ready-to-paste suggestions.
 *  2. renderSandboxPage(), which turns the catalog + the list of currently
 *     running systems into a single self-contained HTML page (inline CSS + JS,
 *     no external assets) that fires real requests at the live mock from the
 *     browser and shows the responses.
 *
 * The page is served from the same origin as the mock, so its fetch() calls hit
 * the running endpoints directly with no CORS setup.
 */

import { plugins } from './systems/index.js';
import type { CredentialSpec, CredentialFieldSpec, AuthRequirement } from './auth.js';

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

/**
 * Demo content for one system: the prose and runnable examples shown on its
 * sandbox page. The *credential* is NOT here — it is declared on the system's
 * plugin (`MockSystemPlugin.credential`) and read straight from there, so the
 * plugin stays the single source of truth for its auth.
 */
export interface SystemGuide {
  /** Human-friendly title. */
  title: string;
  /** One or two sentences: what the system is + notable quirks. */
  blurb: string;
  /** Auth style, shown on the card (e.g. 'Basic', 'Bearer', 'none'). */
  auth: string;
  /** Link to this system's OpenFn adaptor documentation. */
  docs?: string;
  /**
   * Defaults for `{{token}}` placeholders used in paths/bodies (e.g.
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
    docs: 'https://docs.openfn.org/adaptors/packages/dhis2-docs',
    blurb:
      'Aggregate + tracker health data. List responses carry a pager and a resource-typed array; writes return an ImportSummary envelope. The generic adaptor is fully covered: the new /api/tracker API, /api/analytics, /api/schemas, and CRUD for any resource (with an optional /api/{version}/ segment).',
    auth: 'Basic',
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

/** Build the `{{token}}` var map for a system (guide defaults, overridden by live config). */
function systemVars(guide: SystemGuide | undefined, sys: RunningSystemView): Record<string, string> {
  const vars: Record<string, string> = { ...(guide?.vars ?? {}) };
  for (const [k, v] of Object.entries(sys.config ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') vars[k] = String(v);
  }
  return vars;
}

/** A credential field resolved for the client (secrets carry their shape, not a value). */
interface ResolvedCredentialField {
  name: string;
  role: CredentialFieldSpec['role'];
  value?: string;
  secret?: CredentialFieldSpec['secret'];
}

/** Everything the client needs to render + generate a system's credential. */
interface ResolvedCredential {
  type: CredentialSpec['type'];
  /** Name of the URL field the adaptor targets (used in the setup steps). */
  urlField: string;
  fields: ResolvedCredentialField[];
  authHeader?: CredentialSpec['authHeader'];
}

/**
 * Resolve a plugin's CredentialSpec for the browser: fill the URL field with the
 * mock origin + mount, interpolate `{{token}}` values, and leave secret fields
 * un-valued (the client generates them). `{{ORIGIN}}` is left for the browser.
 */
function resolveCredential(
  spec: CredentialSpec | undefined,
  mountPath: string,
  vars: Record<string, string>
): ResolvedCredential {
  if (!spec) {
    return {
      type: 'none',
      urlField: 'baseUrl',
      fields: [{ name: 'baseUrl', role: 'url', value: '{{ORIGIN}}' + mountPath }],
    };
  }
  let urlField: string | undefined;
  const fields: ResolvedCredentialField[] = spec.fields.map((f) => {
    if (f.role === 'url') {
      urlField = f.name;
      return { name: f.name, role: 'url', value: '{{ORIGIN}}' + mountPath };
    }
    if (f.role === 'secret') {
      return { name: f.name, role: 'secret', secret: f.secret ?? {} };
    }
    return { name: f.name, role: f.role, value: interpolate(f.value ?? '', vars) };
  });
  return {
    type: spec.type,
    urlField: urlField ?? spec.fields[0]?.name ?? 'baseUrl',
    fields,
    authHeader: spec.authHeader,
  };
}

/** Resolve a guide's examples: interpolate `{{token}}`s and prepend the mount path. */
function resolveExamples(
  guide: SystemGuide | undefined,
  mountPath: string,
  vars: Record<string, string>
): SandboxExample[] {
  if (!guide) return [];
  return guide.examples.map((ex) => {
    const resolved = JSON.parse(interpolate(JSON.stringify(ex), vars)) as SandboxExample;
    return { ...resolved, path: mountPath + resolved.path };
  });
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

  const cards = systems.map((sys) => {
    const guide = SYSTEM_GUIDES[sys.name];
    const plugin = plugins[sys.name];
    const vars = systemVars(guide, sys);
    const auth: AuthRequirement | undefined = plugin?.auth;
    return {
      name: sys.name,
      mountPath: sys.mountPath,
      title: guide?.title ?? sys.name,
      blurb: guide?.blurb ?? 'Mounted mock system.',
      auth: guide?.auth ?? 'any',
      docs: guide?.docs,
      // Credential comes from the plugin (single source of truth); the sandbox
      // only visualises it and generates ready-to-paste suggestions.
      credential: resolveCredential(plugin?.credential, sys.mountPath, vars),
      // Whether the *mock* enforces auth (from the plugin's AuthRequirement),
      // surfaced so the sandbox can show "mock requires a credential" vs "open".
      authRequired: Boolean(auth?.required),
      authSchemes: auth?.schemes ?? [],
      examples: resolveExamples(guide, sys.mountPath, vars),
    };
  });

  // Everything is ordered alphabetically by title (A–Z) so the content pages
  // match the left-hand nav, which is sorted the same way in the client.
  cards.sort((a, b) => a.title.localeCompare(b.title));

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

/**
 * OpenFn logo mark, cleaned from docs.openfn.org's /img/logo.svg: a black
 * square with the brand cyan→magenta gradient and the "Fn" letterforms.
 * Embedded as base64 so the page stays self-contained (no external asset,
 * no /favicon.ico 404). Reused for both the navbar brand and the favicon.
 */
const LOGO_B64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8v' +
  'd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIxMTYuMDcgLTExMi4yOCA4MDAuMDAgODAwLjAw' +
  'Ij48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9Im9mZyIgZ3JhZGllbnRVbml0cz0idXNlclNwYWNlT25V' +
  'c2UiIHgxPSIxMzYuMjE4MDUiIHkxPSI2NjcuNTcyMzMiIHgyPSI4OTUuOTIzOTUiIHkyPSItOTIuMTMz' +
  'NjE0Ij48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiM4M2Q2ZTIiLz48c3RvcCBvZmZzZXQ9IjEi' +
  'IHN0b3AtY29sb3I9IiNhZjI3ODMiIHN0b3Atb3BhY2l0eT0iMCIvPjwvbGluZWFyR3JhZGllbnQ+PC9k' +
  'ZWZzPjxyZWN0IHg9IjEzNi4yMTgwNSIgeT0iLTkyLjEzMzYxNCIgd2lkdGg9Ijc1OS43MDU5MyIgaGVp' +
  'Z2h0PSI3NTkuNzA1OTMiIGZpbGw9IiNmZmYiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSI0MC4y' +
  'OTQxIi8+PHJlY3QgeD0iMTM2LjIxODA1IiB5PSItOTIuMTMzNjE0IiB3aWR0aD0iNzU5LjcwNTkzIiBo' +
  'ZWlnaHQ9Ijc1OS43MDU5MyIgZmlsbD0idXJsKCNvZmcpIiBzdHJva2U9IiMwMDAiIHN0cm9rZS13aWR0' +
  'aD0iNDAuMjk0MSIvPjxwYXRoIGQ9Im0gMjcxLjY4ODUyLDExOC43Njc0IGggMjA0LjM1MTQ2IHYgNjIu' +
  'MDkzMTggSCAzNDEuMTk1ODIgViAyNjAuMDk4OSBIIDQ3Mi43OTYzIHYgNjIuMDkzMTkgSCAzNDEuMTk1' +
  'ODIgdiAxNDUuMDM4NTYgaCAtNjkuNTA3MyB6IiBmaWxsPSIjMDAwIi8+PHBhdGggZD0ibSA2NzUuMTI3' +
  'NjksMzIyLjE5MjA5IHEgMCwtMTIuOTc0NyAtMy43MDcwNiwtMjEuNzc4OTUgLTMuMjQzNjcsLTguODA0' +
  'MjYgLTkuMjY3NjQsLTEzLjkwMTQ2IC02LjAyMzk2LC01LjU2MDU5IC0xMy40MzgwNywtNy44Nzc1IC03' +
  'LjQxNDEyLC0yLjMxNjkxIC0xNS4yOTE2MSwtMi4zMTY5MSAtMjAuMzg4ODEsMCAtMzEuOTczMzYsMTUu' +
  'NzU0OTkgLTExLjU4NDU1LDE1LjI5MTYxIC0xMS41ODQ1NSwzOS44NTA4NSB2IDEzNS4zMDc1NCBoIC02' +
  'Ni43MjcgViAyMjkuMDUyMzEgaCA2My45NDY3MSB2IDMxLjA0NjU5IGggMC45MjY3NiBxIDE0LjgyODIz' +
  'LC0yMS43Nzg5NSAzMi40MzY3NCwtMjkuNjU2NDQgMTcuNjA4NTIsLTcuODc3NSAzNy45OTczMywtNy44' +
  'Nzc1IDIxLjMxNTU3LDAgMzcuMDcwNTYsNi40ODczNSAxNS43NTQ5OCw2LjQ4NzM1IDI1Ljk0OTM5LDE4' +
  'LjA3MTkgMTAuNjU3NzgsMTEuMTIxMTcgMTUuMjkxNiwyNi40MTI3NyA1LjA5NzIsMTQuODI4MjIgNS4w' +
  'OTcyLDMxLjk3MzM2IHYgMTYxLjcyMDMxIGggLTY2LjcyNyB6IiBmaWxsPSIjMDAwIi8+PC9zdmc+';

/** Favicon reuses the OpenFn mark so the browser tab matches the docs. */
const FAVICON_B64 = LOGO_B64;

// Palette + chrome mirror the OpenFn documentation site (docs.openfn.org, a
// Docusaurus/infima light theme): azure #2196f3 primary, white navbar + content,
// a light sidebar with soft-blue active states, a dark-slate footer, the same
// system-ui / SFMono font stacks, 8px radii and 1px #dadde1 borders. Response
// bodies stay on a dark code surface, matching the docs' dark Prism code blocks.
const STYLES = [
  ':root{--bg:#fff;--panel:#fff;--ink:#1c1e21;--muted:#606770;',
  '--border:#dadde1;--border-soft:#ebedf0;--wash:#f6f7f8;',
  '--accent:#2196f3;--accent-hover:#0d89ec;--accent-strong:#0a6bb7;--accent-soft:#ebf2fc;',
  '--code:#282a36;--code-ink:#e6edf3;',
  '--footer:#303846;--footer-ink:#dfe3ea;--footer-link:#b7c0cf;',
  '--radius:8px;--navbar-h:60px;--wrap:1120px;--shadow:0 1px 2px 0 rgba(0,0,0,.1);',
  '--mono:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;',
  '--get:#0a7d33;--post:#b45309;--put:#6d28d9;--patch:#0369a1;--delete:#b91c1c;--ok:#0a7d33;--err:#b91c1c;}',
  '*{box-sizing:border-box}',
  'html{-webkit-text-size-adjust:100%}',
  'body{margin:0;background:var(--bg);color:var(--ink);',
  'font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji";}',
  'code,pre,.mono{font-family:var(--mono);}',
  'a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}',
  '.wrap{max-width:var(--wrap);margin:0 auto;padding:0 24px;}',
  // Top navbar: white, sticky, OpenFn logo + wordmark on the left, docs links on
  // the right — the docs.openfn.org navbar.
  'header.navbar{position:sticky;top:0;z-index:20;background:#fff;height:var(--navbar-h);',
  'border-bottom:1px solid var(--border);box-shadow:var(--shadow);}',
  '.navbar-inner{max-width:var(--wrap);margin:0 auto;height:100%;padding:0 24px;',
  'display:flex;align-items:center;justify-content:space-between;gap:16px;}',
  '.brand{display:inline-flex;align-items:center;gap:9px;color:var(--ink);font-weight:700;font-size:19px;letter-spacing:-.01em;}',
  '.brand:hover{text-decoration:none}',
  '.brand-logo{width:30px;height:30px;display:block}',
  '.brand-sep{color:var(--border);font-weight:400}',
  '.brand-sub{color:var(--muted);font-weight:500;font-size:16px}',
  '.navbar-links{display:flex;align-items:center;gap:22px;font-size:15px;font-weight:500}',
  '.navbar-links a{color:var(--ink)}',
  '.navbar-links a:hover{color:var(--accent);text-decoration:none}',
  // Hero band under the navbar: page title + intro + base URL chip.
  '.hero{background:#fff;border-bottom:1px solid var(--border);}',
  '.hero .wrap{padding:34px 24px 30px}',
  '.hero h1{margin:0 0 8px;font-size:34px;line-height:1.15;letter-spacing:-.02em;font-weight:800;}',
  '.hero-lede{margin:0;color:var(--muted);font-size:17px;max-width:72ch;}',
  '.baseurl{margin-top:18px;display:inline-flex;align-items:center;gap:10px;background:var(--accent-soft);',
  'border:1px solid #cfe3fb;border-radius:var(--radius);padding:8px 13px;font-size:14px;}',
  '.baseurl-label{color:var(--accent-strong);font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:11px}',
  '.baseurl .mono{color:var(--ink)}',
  // Two-column layout: sticky left-hand nav + main content column.
  '.layout{max-width:var(--wrap);margin:0 auto;padding:26px 24px 60px;display:flex;gap:36px;align-items:flex-start;}',
  '.sidebar{flex:0 0 220px;position:sticky;top:calc(var(--navbar-h) + 18px);align-self:flex-start;',
  'max-height:calc(100vh - var(--navbar-h) - 34px);overflow:auto;}',
  '.sidebar-inner{font-size:14.5px}',
  '.nav-group{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:18px 0 6px;padding:0 10px}',
  '.nav-group:first-child{margin-top:0}',
  '.nav-list{list-style:none;margin:0 0 4px;padding:0}',
  '.nav-list a{display:block;padding:6px 10px;border-radius:var(--radius);color:var(--muted);line-height:1.4}',
  '.nav-list a:hover{background:var(--wash);color:var(--ink);text-decoration:none}',
  '.nav-list a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}',
  '.content{flex:1;min-width:0}',
  // Each nav target is its own page: only the active one is shown. Clicking a
  // nav link swaps pages via the hash router (no scrolling animation).
  '.page{display:none}',
  '.page.active{display:block}',
  // Per-system guide block: "Set up the adaptor" steps + "API overview" docs links.
  '.sys-guide{display:grid;grid-template-columns:1fr 1fr;gap:18px 30px;margin:12px 0 18px;',
  'padding:18px 20px;background:var(--wash);border:1px solid var(--border-soft);border-radius:var(--radius)}',
  '.sys-guide h4{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}',
  '.sys-guide p{margin:0 0 10px;color:var(--muted)}',
  '.sys-guide code{background:#fff;border:1px solid var(--border);border-radius:5px;padding:1px 5px;',
  'font-size:12.5px;color:var(--ink);word-break:break-word}',
  '.steps{margin:0;padding:0;list-style:none;counter-reset:step;font-size:14px}',
  '.steps>li{position:relative;padding:0 0 14px 36px;color:var(--muted)}',
  '.steps>li:last-child{padding-bottom:0}',
  '.steps>li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:-1px;',
  'width:24px;height:24px;border-radius:50%;background:var(--accent-soft);color:var(--accent);',
  'font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center}',
  '.steps .step-h{display:block;color:var(--ink);font-weight:600;margin-bottom:1px}',
  '.doc-links{list-style:none;margin:0;padding:0;display:grid;gap:8px;font-size:14px}',
  '.doc-links a{font-weight:600}',
  '.loading{color:var(--muted)}',
  'section.console{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);',
  'padding:22px 22px 18px;margin-bottom:24px;box-shadow:var(--shadow);}',
  'section.console h2,.sys h2{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);}',
  '.console .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;}',
  '.console select,.console input,.console textarea,.ex input,.ex textarea{font:inherit;font-size:14px;color:var(--ink);',
  'background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:8px 11px;}',
  '.console input.path{flex:1;min-width:220px}',
  '.console select,.ex-method-sel{font-family:inherit;font-weight:600}',
  'input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}',
  'textarea{width:100%;min-height:96px;resize:vertical;margin-top:8px;line-height:1.5;font-size:13px;}',
  '.ex textarea{min-height:70px}',
  'button{font:inherit;font-weight:600;cursor:pointer;border:1px solid transparent;border-radius:var(--radius);padding:8px 15px;transition:background .15s}',
  'button.run,button.send{background:var(--accent);color:#fff;}',
  'button.run:hover,button.send:hover{background:var(--accent-hover)}',
  'button.ghost{background:#fff;color:var(--accent);border-color:var(--border);padding:5px 11px;font-size:12.5px;font-weight:600;}',
  'button.ghost:hover{background:var(--accent-soft);border-color:var(--accent)}',
  'button:disabled{opacity:.55;cursor:progress}',
  '.sys{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:22px 22px 10px;',
  'margin-bottom:18px;box-shadow:var(--shadow);}',
  '.sys-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;}',
  '.sys-head h3{margin:0;font-size:24px;letter-spacing:-.01em;font-weight:800}',
  '.sys-head .mount{font-family:var(--mono);font-size:13px;color:var(--accent);background:var(--accent-soft);border-radius:6px;padding:2px 8px}',
  '.sys-head .auth{font-size:12px;color:var(--muted);border:1px solid var(--border);border-radius:6px;padding:2px 8px}',
  // The "requires a credential" chip highlights systems whose mock returns 401.
  '.sys-head .auth.req{color:var(--accent-strong);border-color:#cfe3fb;background:var(--accent-soft)}',
  '.blurb{color:var(--muted);margin:10px 0 14px;max-width:80ch}',
  '.cred{margin:0 0 16px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}',
  '.cred-head{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--wash);',
  'border-bottom:1px solid var(--border);padding:7px 12px;font-size:12.5px;color:var(--muted)}',
  '.cred-head-l{display:flex;align-items:center;gap:10px;min-width:0}',
  // Credential-type badge: Username & password / API key / OAuth / No credentials.
  '.cred-type{font-size:11px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;',
  'color:var(--accent-strong);background:var(--accent-soft);border:1px solid #cfe3fb;border-radius:5px;padding:2px 7px;white-space:nowrap}',
  '.cred-actions{display:flex;gap:6px;flex:none}',
  '.cred-note{margin:-8px 2px 16px;color:var(--muted);font-size:12.5px}',
  '.cred pre{margin:0;padding:13px 14px;background:var(--code);color:var(--code-ink);',
  'font-size:12.5px;overflow-x:auto}',
  '.ex{border-top:1px solid var(--border-soft);padding:14px 0}',
  '.ex-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
  '.m{font-size:11px;font-weight:700;letter-spacing:.04em;color:#fff;border-radius:5px;padding:3px 7px;min-width:56px;text-align:center}',
  '.m.GET{background:var(--get)}.m.POST{background:var(--post)}.m.PUT{background:var(--put)}',
  '.m.PATCH{background:var(--patch)}.m.DELETE{background:var(--delete)}',
  '.ex .path{flex:1;min-width:200px;font-size:13px;color:var(--ink);background:var(--wash)}',
  '.ex-label{color:var(--muted);font-size:13.5px;margin:8px 0 0}',
  '.resp{margin-top:10px;display:none}',
  '.resp.show{display:block}',
  '.resp-meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;margin-bottom:6px}',
  '.pill{font-weight:700;border-radius:5px;padding:2px 8px;color:#fff}',
  '.pill.ok{background:var(--ok)}.pill.err{background:var(--err)}',
  '.resp-meta .dim{color:var(--muted)}',
  '.resp pre{margin:0;padding:13px;background:var(--code);color:var(--code-ink);border-radius:var(--radius);',
  'font-size:12.5px;max-height:380px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
  '.admin-links{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 0 8px;border-top:1px solid var(--border-soft);margin-top:8px}',
  // Footer: OpenFn dark slate with light links.
  'footer.foot{background:var(--footer);color:var(--footer-ink);padding:32px 24px;margin-top:8px}',
  'footer.foot .foot-note{margin:0 0 10px;font-size:13.5px;text-align:center}',
  'footer.foot .foot-links{margin:0;font-size:13.5px;text-align:center}',
  'footer.foot a{color:var(--footer-link)}footer.foot a:hover{color:#fff}',
  // Stack the sidebar above the content on narrow screens (nav becomes a wrap).
  '@media(max-width:860px){.layout{flex-direction:column;gap:16px;padding-top:20px}',
  '.sidebar{position:static;flex:none;width:100%;max-height:none;overflow:visible;',
  'border:1px solid var(--border);background:#fff;border-radius:var(--radius);padding:14px 16px}',
  '.nav-list{display:flex;flex-wrap:wrap;gap:4px 6px;margin-bottom:2px}',
  '.nav-list a{padding:5px 10px}',
  '.nav-group{margin:12px 0 6px;padding:0}.nav-group:first-child{margin-top:0}}',
  '@media(max-width:640px){.ex .path{min-width:140px}.hero h1{font-size:27px}.sys-head h3{font-size:20px}',
  '.navbar-links{gap:14px}.brand-sub,.brand-sep{display:none}.sys-guide{grid-template-columns:1fr;gap:16px}}',
].join('');

const HEADER = [
  '<header class="navbar"><div class="navbar-inner">',
  '<a class="brand" href="#console" aria-label="OpenFn mocker — API sandbox">',
  '<img class="brand-logo" src="data:image/svg+xml;base64,',
  LOGO_B64,
  '" alt="OpenFn" width="30" height="30">',
  '<span class="brand-name">OpenFn</span>',
  '<span class="brand-sep">/</span>',
  '<span class="brand-sub">mocker</span>',
  '</a>',
  '<nav class="navbar-links">',
  '<a href="https://docs.openfn.org/documentation" target="_blank" rel="noopener">Docs</a>',
  '<a href="https://docs.openfn.org/adaptors" target="_blank" rel="noopener">Adaptors</a>',
  '<a href="https://github.com/brandonjackson/openfn-mocker" target="_blank" rel="noopener">GitHub</a>',
  '</nav></div></header>',
  '<div class="hero"><div class="wrap">',
  '<h1>API sandbox</h1>',
  '<p class="hero-lede">A configurable mock of the external systems OpenFn integrates with. ',
  'Point an OpenFn credential at the base URL below, or try the endpoints live right here in your browser.</p>',
  '<div class="baseurl"><span class="baseurl-label">Base URL</span> <span class="mono" id="base-url"></span></div>',
  '</div></div>',
].join('');

const FOOTER = [
  '<footer class="foot"><div class="wrap">',
  '<p class="foot-note">Every request runs against the live in-memory mock; data resets on restart or via the reset endpoints.</p>',
  '<p class="foot-links">',
  '<a href="https://docs.openfn.org/documentation" target="_blank" rel="noopener">OpenFn docs</a> · ',
  '<a href="https://docs.openfn.org/adaptors" target="_blank" rel="noopener">Adaptors reference</a> · ',
  '<a href="https://docs.openfn.org/documentation/build/credentials" target="_blank" rel="noopener">Credentials</a> · ',
  '<a href="/_admin/systems">/_admin/systems</a> · ',
  '<a href="https://github.com/brandonjackson/openfn-mocker">source</a>',
  '</p></div></footer>',
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
  // --- Credential suggestion generation (client-side, fresh per page view) ---
  'var HEX="0123456789abcdef";',
  'var ALNUM="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";',
  'function randChars(n,charset){var alph=charset==="hex"?HEX:ALNUM;var out="";',
  'var buf=new Uint8Array(n);(window.crypto||window.msCrypto).getRandomValues(buf);',
  'for(var i=0;i<n;i++){out+=alph.charAt(buf[i]%alph.length);}return out;}',
  'function genSecret(shape){shape=shape||{};',
  'return (shape.prefix||"")+randChars(shape.length||16,shape.charset||"alnum");}',
  // Resolve a credential spec into a concrete { field: value } object: url/static/
  // username values as-is (with {{ORIGIN}} substituted), secrets freshly generated.
  'function resolveCredValues(cred){var out={};for(var i=0;i<cred.fields.length;i++){',
  'var f=cred.fields[i];out[f.name]=f.role==="secret"?genSecret(f.secret):sub(f.value||"");}return out;}',
  // Build an Authorization header from a resolved credential + the plugin spec.
  // The mock validates presence, not value, so this just keeps the live example
  // requests realistic and consistent with the credential shown.
  'function buildAuthHeader(spec,vals){if(!spec)return null;',
  'if(spec.scheme==="basic"){var u=spec.user!=null?spec.user:(vals[spec.userField]||"");',
  'var p=spec.value!=null?spec.value:(vals[spec.passField]||"");return "Basic "+btoa(u+":"+p);}',
  'var tok=spec.value!=null?spec.value:(vals[spec.passField]||"");',
  'return (spec.scheme==="bearer"?"Bearer ":"Token ")+tok;}',
  // Human label for the credential-type badge.
  'function credTypeLabel(t){return t==="userpass"?"Username & password":',
  't==="apikey"?"API key":t==="oauth"?"OAuth client credentials":"No credentials";}',
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
  'var sec=el("section","console page");sec.id="console";sec.appendChild(el("h2",null,"Request console"));',
  'sec.appendChild(el("p","blurb","Send an ad-hoc request to any mounted system, or pick a system from the left to open its setup guide and runnable examples."));',
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
  // Navigate to the console page (fires the router); if already there just jump up.
  'if(currentId()!=="console"){window.location.hash="#console";}else{window.scrollTo(0,0);}};',
  'return sec;}',
  // A single example row (editable path + body, inline response).
  'function buildExample(ex,getAuth){',
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
  'send(ex.method,path.value,ex.contentType,body?body.value:null,resp,run,getAuth?getAuth():null);});',
  'return wrap;}',
  // One system card.
  'function buildSystem(sys){',
  'var card=el("section","sys page");card.id="sys-"+sys.name;',
  'var head=el("div","sys-head");',
  'head.appendChild(el("h3",null,sys.title));',
  'head.appendChild(el("span","mount",sys.mountPath));',
  'if(sys.auth){head.appendChild(el("span","auth","auth: "+sys.auth));}',
  // Surface the plugin's own auth policy: does the mock 401 an anonymous request?
  'head.appendChild(el("span","auth"+(sys.authRequired?" req":""),',
  'sys.authRequired?"requires a credential":"accepts anonymous"));',
  'card.appendChild(head);',
  // Per-system guide: how to set up this adaptor + an API overview with docs links.
  'var guide=el("div","sys-guide");',
  'var setup=el("div","sys-guide-col");setup.appendChild(el("h4",null,"Set up the adaptor"));',
  'var steps=el("ol","steps");',
  'steps.appendChild(rich("li",null,[el("span","step-h","Create the credential"),',
  '"In OpenFn open ",bold("Settings \\u2192 Credentials \\u2192 New credential"),", pick ",bold(sys.title),',
  '", and name it e.g. ",codeEl("mocker-"+sys.name),"."]));',
  'steps.appendChild(rich("li",null,[el("span","step-h","Point it at this mock"),',
  '"Under ",bold("Credential environments"),", set ",bold(sys.credential.urlField)," to ",',
  'codeEl(ORIGIN+sys.mountPath),". ",(sys.authRequired?',
  '"This mock requires a credential, but any value works \\u2014 it checks one is present, never that it is valid. ":',
  '"This mock accepts requests with or without credentials. "),',
  '"Copy the suggested credential below and paste it into OpenFn."]));',
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
  // Credential block: a fresh, ready-to-paste suggestion generated per page view.
  'var cred=el("div","cred");',
  'var ch=el("div","cred-head");',
  'var chL=el("div","cred-head-l");',
  'chL.appendChild(el("span",null,"OpenFn credential"));',
  'chL.appendChild(el("span","cred-type",credTypeLabel(sys.credential.type)));',
  'ch.appendChild(chL);',
  'var chR=el("div","cred-actions");',
  'var regen=el("button","ghost","Regenerate");var copy=el("button","ghost","Copy");',
  'chR.appendChild(regen);chR.appendChild(copy);ch.appendChild(chR);cred.appendChild(ch);',
  'var pre=el("pre",null,"");cred.appendChild(pre);',
  // state.authHeader is read by the example Run buttons via getAuth(), so
  // Regenerate updates both the shown credential and what the examples send.
  'var state={vals:{},authHeader:null};',
  'function renderCred(){state.vals=resolveCredValues(sys.credential);',
  'state.authHeader=buildAuthHeader(sys.credential.authHeader,state.vals);',
  'pre.textContent=JSON.stringify(state.vals,null,2);}',
  'renderCred();',
  'regen.addEventListener("click",renderCred);',
  'copy.addEventListener("click",function(){',
  'if(navigator.clipboard){navigator.clipboard.writeText(pre.textContent).then(function(){',
  'copy.textContent="Copied";setTimeout(function(){copy.textContent="Copy";},1200);});}});',
  'card.appendChild(cred);',
  // Only note "generated" when the credential actually carries a secret.
  'var hasSecret=sys.credential.fields.some(function(f){return f.role==="secret";});',
  'if(hasSecret){card.appendChild(el("p","cred-note",',
  '"Secret values are freshly generated suggestions \\u2014 the mock accepts any value; use Regenerate for a new set."));}',
  // Examples read the current auth header via getAuth so Regenerate takes effect.
  'for(var i=0;i<sys.examples.length;i++){card.appendChild(buildExample(sys.examples[i],function(){return state.authHeader;}));}',
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
  // Hash router: each nav link points at a page id (#console or #sys-<name>);
  // show only the active page and highlight its nav link. Defaults to the
  // console when the hash is empty or unknown.
  'function currentId(){var h=(window.location.hash||"").replace(/^#/,"");',
  'return h&&document.getElementById(h)?h:"console";}',
  'function showPage(){var id=currentId();',
  'var pages=document.querySelectorAll("#app .page");',
  'for(var i=0;i<pages.length;i++){',
  'if(pages[i].id===id){pages[i].classList.add("active");}else{pages[i].classList.remove("active");}}',
  'var links=document.querySelectorAll(".nav-list a");',
  'for(var j=0;j<links.length;j++){var href=links[j].getAttribute("href")||"";',
  'if(href==="#"+id){links[j].classList.add("active");}else{links[j].classList.remove("active");}}',
  'window.scrollTo(0,0);}',
  // Boot.
  'function boot(){',
  'var base=document.getElementById("base-url");if(base)base.textContent=ORIGIN;',
  'var side=document.getElementById("sidebar");if(side){side.innerHTML="";side.appendChild(buildSidebar());}',
  'var app=document.getElementById("app");app.innerHTML="";',
  'var consolePage=buildConsole();',
  'if(!DATA.systems.length){consolePage.appendChild(el("p","loading","No systems are enabled."));}',
  'app.appendChild(consolePage);',
  // One page per system; the router shows just one at a time.
  'for(var i=0;i<DATA.systems.length;i++){app.appendChild(buildSystem(DATA.systems[i]));}',
  'window.addEventListener("hashchange",showPage);',
  'showPage();}',
  'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot);}else{boot();}',
  '})();',
].join('');

/** True if an Accept header indicates the client wants HTML (a browser). */
export function wantsHtml(accept: string | undefined): boolean {
  return typeof accept === 'string' && accept.includes('text/html');
}
