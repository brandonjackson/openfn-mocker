import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openlmis sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "get", signature: "get(path, options, callback?)", description: "Send a GET request to retrieve a resource from OpenLMIS.",
    code: "get('/facilities');", apiRef: "ex1" },
  { fn: "post", signature: "post(path, body, callback?)", description: "Send a POST request to create a resource, e.g. initiate a requisition.",
    code: "post(`/requisitions/initiate?program=${$.programId}&facility=${$.facilityId}`, {});", apiRef: "ex4" },
  { fn: "put", signature: "put(path, body, callback?)", description: "Send a PUT request to update an existing OpenLMIS resource.",
    code: "put('/programs/418bdc1d-c303-4bd0-b2d3-d8901150a983', { name: 'Essential Meds', code: 'PRG001' });" },
  { fn: "request", signature: "request(method, path, body, options, callback?)", description: "Send a custom HTTP request (any method), e.g. to fetch an OAuth token.",
    code: "request('POST', '/oauth/token?grant_type=client_credentials', {});", apiRef: "ex0" },
];
