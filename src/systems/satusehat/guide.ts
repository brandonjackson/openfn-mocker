import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the satusehat system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'SATUSEHAT',
  docs: 'https://docs.openfn.org/adaptors/packages/satusehat-docs',
  blurb:
    "Indonesia's national health-data platform (FHIR R4). The adaptor first exchanges its OAuth2 client credentials for a bearer token at POST /oauth2/v1/accesstoken?grant_type=client_credentials, then reads and writes FHIR resources under /fhir-r4/v1/<Resource>. get/post/put and JSON-Patch patch are covered. SatuSehat documents PUT only where a resource's own page describes a full replace, so Patient is updated with PATCH.",
  auth: 'OAuth2 (client credentials)',
  examples: [
    {
      method: 'POST',
      path: '/oauth2/v1/accesstoken?grant_type=client_credentials',
      label: 'OAuth2 token handshake → { access_token }',
      id: 'token',
      contentType: 'application/x-www-form-urlencoded',
      body: 'client_id=mock-client-id&client_secret=mock-client-secret',
    },
    { method: 'GET', path: '/fhir-r4/v1/Patient', label: 'Search Patients (searchset Bundle)', id: 'get' },
    { method: 'GET', path: '/fhir-r4/v1/Patient/P02478375123', label: 'Read one Patient by id' },
    {
      method: 'POST',
      path: '/fhir-r4/v1/Patient',
      label: 'Create a Patient',
      id: 'post',
      body: JSON.stringify(
        {
          resourceType: 'Patient',
          name: [{ use: 'official', text: 'Dewi Lestari' }],
          gender: 'female',
        },
        null,
        2
      ),
    },
    {
      // SatuSehat documents no full-replace (PUT) on Patient — the onboarding and
      // MPI Patient pages describe search, create and PATCH only — so the update
      // example runs against Encounter, where the platform does document PUT.
      method: 'PUT',
      path: '/fhir-r4/v1/Encounter/b0d1d54a-4ea1-4e69-b2e2-8b4cf1e0a111',
      label: 'Update an Encounter (full replace)',
      id: 'put',
      body: JSON.stringify(
        {
          resourceType: 'Encounter',
          id: 'b0d1d54a-4ea1-4e69-b2e2-8b4cf1e0a111',
          status: 'finished',
          class: {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'AMB',
            display: 'ambulatory',
          },
          subject: { reference: 'Patient/P02478375123', display: 'Budi Santoso' },
          period: { start: '2024-03-04T01:00:00+00:00', end: '2024-03-04T02:00:00+00:00' },
          serviceProvider: { reference: 'Organization/10000001' },
        },
        null,
        2
      ),
    },
    {
      method: 'PATCH',
      path: '/fhir-r4/v1/Patient/P02478375123',
      label: 'JSON-Patch a Patient (partial update)',
      id: 'patch',
      contentType: 'application/json-patch+json',
      body: JSON.stringify([{ op: 'replace', path: '/active', value: false }], null, 2),
    },
    { method: 'GET', path: '/fhir-r4/v1/Organization', label: 'Search Organizations (facilities)' },
  ],
};
