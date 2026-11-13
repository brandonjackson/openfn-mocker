import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the openfn (Lightning) system. Paths match the Lightning
 * REST resources the generic verbs target. Jobs and projects come back as
 * JSON:API documents; jobs are read-only, so the write example creates a
 * credential. The getJob example points at the fixed seed job id.
 */
export const guide: SystemGuide = {
  title: 'OpenFn (Lightning)',
  docs: 'https://docs.openfn.org/adaptors/packages/openfn-docs',
  blurb:
    'The OpenFn platform (Lightning) API. The adaptor exposes generic get / post / request verbs over the Lightning REST API, authenticated with a Bearer access token. Jobs and projects are JSON:API documents ({ data, included, links }, paged with page / page_size); jobs are read-only. Errors are RFC 9457 problem documents, e.g. 404 { code: "not_found" }.',
  auth: 'API key (Bearer access token)',
  examples: [
    { id: 'listJobs', method: 'GET', path: '/api/jobs', label: 'List jobs' },
    {
      id: 'getJob',
      method: 'GET',
      path: '/api/jobs/11111111-1111-4111-8111-111111111111',
      label: 'Fetch a job by id',
    },
    { id: 'listProjects', method: 'GET', path: '/api/projects', label: 'List projects' },
    {
      id: 'getProject',
      method: 'GET',
      path: '/api/projects/33333333-3333-4333-8333-333333333333',
      label: 'Fetch a project by id',
    },
    {
      id: 'createCredential',
      method: 'POST',
      path: '/api/credentials',
      label: 'Create a credential',
      body: JSON.stringify(
        {
          name: 'DHIS2 production',
          schema: 'dhis2',
          credential_bodies: [{ name: 'main', body: { hostUrl: 'https://dhis2.example.org', username: 'admin' } }],
          project_credentials: [{ project_id: '33333333-3333-4333-8333-333333333333' }],
        },
        null,
        2,
      ),
    },
  ],
};
