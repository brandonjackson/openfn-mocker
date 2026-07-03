import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openimis system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
