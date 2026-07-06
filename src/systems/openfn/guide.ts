import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openfn (Lightning) system. Paths match the Lightning
 * REST resources the generic verbs target; listings use the `{ items: [...] }`
 * envelope. The getJob example points at the fixed seed job id.
 */
export const guide: SystemGuide = {
  title: 'OpenFn (Lightning)',
  docs: 'https://docs.openfn.org/adaptors/packages/openfn-docs',
  blurb:
    'The OpenFn platform (Lightning) API. The adaptor exposes generic get / post / request verbs over the Lightning REST API, authenticated with a Bearer access token. Listings are wrapped in { items: [...] } and a missing record returns 404 { error: "not_found" }.',
  auth: 'API key (Bearer access token)',
  examples: [
    { id: 'listJobs', method: 'GET', path: '/jobs', label: 'List jobs' },
    {
      id: 'createJob',
      method: 'POST',
      path: '/jobs',
      label: 'Create a job',
      body: JSON.stringify({ name: 'Nightly sync', adaptor: '@openfn/language-http' }, null, 2),
    },
    {
      id: 'getJob',
      method: 'GET',
      path: '/jobs/11111111-1111-4111-8111-111111111111',
      label: 'Fetch a job by id',
    },
    { id: 'listProjects', method: 'GET', path: '/projects', label: 'List projects' },
  ],
};
