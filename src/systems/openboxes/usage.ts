import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openboxes sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "get", signature: "get(path, options)", description: "Send a GET request to retrieve data from a resource path.",
    code: "get('products', { query: { max: 10 } });", apiRef: "ex1" },
  { fn: "post", signature: "post(path, body, options)", description: "Send a POST request with a body to create or submit data to a resource.",
    code: "post('products', { name: 'New product', description: 'A new product' });", apiRef: "ex4" },
  { fn: "request", signature: "request(method, path, options)", description: "Perform a flexible HTTP request using any method to a resource path.",
    code: "request('GET', '/stockMovements', { query: { max: 5 } });", apiRef: "ex3" },
];
