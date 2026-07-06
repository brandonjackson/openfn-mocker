import type { UsageExample } from '../types.js';

/**
 * Usage examples for the dagu sandbox "Usage" tab. The adaptor exposes generic
 * verbs; get/post take a relative path (the adaptor prepends the base URL) and
 * request takes an explicit method + path.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options?, callback?)',
    description: 'List the DAGs registered in Dagu.',
    code: "get('/api/v1/dags');",
    apiRef: 'listDags',
  },
  {
    fn: 'post',
    signature: 'post(path, data, options?, callback?)',
    description: 'Trigger an action (e.g. start) on a DAG.',
    code: "post('/api/v1/dags/nightly', { action: 'start' });",
    apiRef: 'startDag',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options?, callback?)',
    description: 'Make an arbitrary request against the Dagu API.',
    code: "request('GET', '/api/v1/dags/nightly');",
    apiRef: 'getDag',
  },
];
