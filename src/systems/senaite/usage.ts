import type { UsageExample } from '../types.js';

/**
 * Usage examples for the senaite sandbox "Usage" tab. The senaite adaptor
 * exposes a single generic `request(method, path, options)` operation, so each
 * snippet is a `request` call against a different JSON-API endpoint. Paths are
 * adaptor-relative (combined with the credential baseUrl) so no absolute URL
 * appears in the code — `pnpm test:usage` runs each snippet against the mock.
 */
export const usage: UsageExample[] = [
  {
    fn: 'request',
    signature: 'request(method, path, options = {})',
    description: 'Search SENAITE catalog objects by portal_type via the JSON API.',
    code: "request('GET', '@@API/senaite/v1/search?portal_type=Client');",
    apiRef: 'search',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options = {})',
    description: 'Get a single SENAITE object by its UID.',
    code: "request('GET', '@@API/senaite/v1/get/clt000000000000000000000000000001');",
    apiRef: 'get',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options = {})',
    description: 'Create a SENAITE object (here a Client) via the JSON API.',
    code: "request('POST', '@@API/senaite/v1/create/Client', {\n  body: { title: 'Freetown Clinic', ClientID: 'C-0003' },\n});",
    apiRef: 'create',
  },
  {
    fn: 'request',
    signature: 'request(method, path, options = {})',
    description: 'Update a SENAITE object by UID via the JSON API.',
    code: "request('POST', '@@API/senaite/v1/update/clt000000000000000000000000000001', {\n  body: { title: 'Bo Government Hospital (renamed)' },\n});",
    apiRef: 'update',
  },
];
