import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openelis sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "http.get", signature: "http.get(path, options)", description: "Send a GET request to fetch lab orders, results, or reports from OpenELIS.",
    code: "http.get('fhir/ServiceRequest');", apiRef: "ex0" },
  { fn: "http.post", signature: "http.post(path, body, options)", description: "Send a POST request to create or submit data, e.g. a new lab order.",
    code: "http.post('fhir/ServiceRequest', {\n  resourceType: 'ServiceRequest', status: 'active', intent: 'order', subject: { reference: 'Patient/pat-0001' },\n});", apiRef: "ex3" },
  { fn: "http.request", signature: "http.request(method, path, body, options)", description: "Make a general HTTP request with any method to an OpenELIS endpoint.",
    code: "http.request('GET', 'fhir/DiagnosticReport/report-0001');", apiRef: "ex1" },
];
