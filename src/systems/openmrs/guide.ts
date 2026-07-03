import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openmrs system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
