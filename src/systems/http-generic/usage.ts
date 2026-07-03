import type { UsageExample } from '../types.js';

/**
 * Usage examples for the http-generic sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "request", signature: "request(method, path, options)", description: "Make an HTTP request with a custom method, path, and options.",
    code: "request('GET', '/api/v1/referrals', { query: { status: 'open' } });", apiRef: "ex1" },
  { fn: "get", signature: "get(path, options)", description: "Make a GET request to retrieve data from an endpoint.",
    code: "get('/api/v1/referrals');", apiRef: "ex1" },
  { fn: "post", signature: "post(path, data, options)", description: "Make a POST request to create a resource at an endpoint.",
    code: "post('/api/v1/referrals', { patientId: '123', reason: 'Specialist consult' });", apiRef: "ex0" },
  { fn: "put", signature: "put(path, data, options)", description: "Make a PUT request to replace a resource at an endpoint.",
    code: "put('/anything/you/want', { id: 1, status: 'updated' });", apiRef: "ex2" },
  { fn: "patch", signature: "patch(path, data, options)", description: "Make a PATCH request to partially update a resource at an endpoint.",
    code: "patch('/anything/you/want', { status: 'closed' });", apiRef: "ex2" },
  { fn: "del", signature: "del(path, options)", description: "Make a DELETE request to remove a resource at an endpoint.",
    code: "del('/anything/you/want/123');", apiRef: "ex2" },
  { fn: "parseXML", signature: "parseXML(data, script)", description: "Parse an XML string into state (no HTTP request); pass an optional callback to extract data.",
    code: "parseXML('<library><book><title>Wuthering Heights</title></book></library>');" },
];
