import type { UsageExample } from '../types.js';

/**
 * Usage examples for the fhir sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "request", signature: "request(method, path, options = {}, callback = s => s)", description: "Send a generic HTTP request to the baseURL defined in config.",
    code: "request('GET', 'metadata')", apiRef: "ex0" },
  { fn: "post", signature: "post(path, data, options = {}, callback = s => s)", description: "Send a HTTP POST request to the baseURL defined in config.",
    code: "post('Bundle', { resourceType: 'Bundle' });", apiRef: "ex8" },
  { fn: "get", signature: "get(path, params = {}, options = {}, callback = s => s)", description: "Send a HTTP GET request to the baseURL defined in config.",
    code: "get('Patient/pat-1');", apiRef: "ex2" },
  { fn: "create", signature: "create(resourceType, resource, params, callback = s => s)", description: "Create a new resource; server assigns the id.",
    code: "create('Patient', {\n  name: [{ use: 'official', family: 'Kamara', given: ['Aminata'] }],\n});", apiRef: "ex7" },
  { fn: "createTransactionBundle", signature: "createTransactionBundle(entries, callback = s => s)", description: "Create a transaction Bundle to process multiple requests at once.",
    code: "createTransactionBundle([\n  { resource: { resourceType: 'Patient', name: [{ family: 'Kamara' }] }, request: { method: 'POST', url: 'Patient' } },\n]);", apiRef: "ex8" },
  { fn: "getClaim", signature: "getClaim(claimId, params, callback = s => s)", description: "Get a Claim by id, or search Claims with query params.",
    code: "getClaim('claim-1');", apiRef: "ex5" },
];
