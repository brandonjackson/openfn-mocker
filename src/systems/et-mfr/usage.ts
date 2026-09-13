import type { UsageExample } from '../types.js';

/**
 * Usage examples for the et-mfr sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`. The et-mfr adaptor joins these relative paths onto an /api/
 * prefix before sending.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, options, callback = s => s)',
    description: 'Make a GET request to Ethiopia MFR (path is joined onto /api/).',
    code: "get('Facility/All', { query: { name: 'Hospital' } });",
    apiRef: 'facilities',
  },
  {
    fn: 'post',
    signature: 'post(path, body, options, callback = s => s)',
    description: 'Make a POST request to Ethiopia MFR with a JSON body.',
    code:
      "post('Facility', {\n" +
      "  name: 'New Health Center', regionId: 1, zoneId: 11, woredaId: 101, facilityTypeId: 204,\n" +
      "});",
    apiRef: 'create',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options, callback = s => s)',
    description: 'Make a general HTTP request to Ethiopia MFR with any method.',
    code: "request('POST', 'Facility/GetFacilities', { pageNumber: 1, showPerPage: 10 });",
    apiRef: 'paged',
  },
];
