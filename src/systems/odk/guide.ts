import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the odk system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
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
    {
      id: 'attachmentList',
      method: 'GET',
      path: '/v1/projects/1/forms/household-survey/submissions/uuid:sub-0001/attachments',
      label: 'List a submission’s attachments',
    },
    {
      id: 'attachmentDownload',
      method: 'GET',
      path: '/v1/projects/1/forms/household-survey/submissions/uuid:sub-0001/attachments/example.png',
      label: 'Download a submission attachment (bytes)',
    },
  ],
};
