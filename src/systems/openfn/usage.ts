import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openfn sandbox "Usage" tab. The adaptor exposes thin
 * generic verbs; get/post take a relative resource path (the adaptor prepends
 * the base URL) and request takes an explicit method + path.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options?, callback?)',
    description: 'GET a Lightning resource by relative path.',
    code: "get('jobs');",
    apiRef: 'listJobs',
  },
  {
    fn: 'post',
    signature: 'post(path, data, options?, callback?)',
    description: 'POST to a Lightning resource to create a record (jobs are read-only, so this creates a credential).',
    code: "post('credentials', { name: 'DHIS2 production', schema: 'dhis2' });",
    apiRef: 'createCredential',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?, callback?)',
    description: 'Make an arbitrary request against the Lightning API.',
    code: "request('GET', 'projects');",
    apiRef: 'listProjects',
  },
];
