import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ihris system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
