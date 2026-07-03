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
    "Indonesia's national health-data platform (FHIR R4). The adaptor first exchanges its OAuth2 client credentials for a bearer token at POST /oauth2/v1/accesstoken?grant_type=client_credentials, then reads and writes FHIR resources under /fhir-r4/v1/<Resource>. get/post/put and JSON-Patch patch are covered.",
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
      method: 'PUT',
      path: '/fhir-r4/v1/Patient/P02478375123',
      label: 'Update a Patient',
      id: 'put',
      body: JSON.stringify(
        { resourceType: 'Patient', id: 'P02478375123', active: true, gender: 'male' },
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
