import type { SystemGuide } from '../types.js';

const XML = 'text/xml';

/**
 * Sandbox guide for the commcare system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
};
