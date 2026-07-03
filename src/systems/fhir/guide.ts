import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the fhir system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
