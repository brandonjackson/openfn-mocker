import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openelis system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
