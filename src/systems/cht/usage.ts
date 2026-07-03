import type { UsageExample } from '../types.js';

/**
 * Usage examples for the cht sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "get", signature: "get(path, options, callback?)", description: "Make a GET request against the CHT base URL.",
    code: "get('/api/v2/export/contacts', { query: { filters: { search: 'jim' } } });", apiRef: "ex4" },
  { fn: "post", signature: "post(path, body, options, callback?)", description: "Make a POST request against the CHT base URL.",
    code: "post('/api/v1/people', { name: 'Hannah', phone: '+254712345678', type: 'contact', contact_type: 'patient' });", apiRef: "ex0" },
  { fn: "put", signature: "put(path, options, callback?)", description: "Make a PUT request against the CHT base URL.",
    code: "put('/api/v1/settings', { query: { overwrite: true } });" },
  { fn: "request", signature: "request(method, path, body, options, callback?)", description: "Make a general HTTP request with any method against the CHT base URL.",
    code: "request('GET', '/medic/_changes', null, { query: { since: 0 } });", apiRef: "ex1" },
];
