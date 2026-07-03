import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ihris sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "fhir.get", signature: "fhir.get(path, query)", description: "Make a GET request to any FHIR endpoint in iHRIS.",
    code: "fhir.get('Practitioner', { name: 'Sesay' });", apiRef: "ex1" },
  { fn: "http.get", signature: "http.get(resource, options)", description: "Get a FHIR resource by id, or list all resources of a given type.",
    code: "http.get('/fhir/Practitioner');", apiRef: "ex0" },
  { fn: "http.post", signature: "http.post(resource, body, options)", description: "Create a new FHIR resource, e.g. add a Practitioner.",
    code: "http.post('/fhir/Practitioner', {\n  resourceType: 'Practitioner', name: [{ family: 'Sesay', given: ['Aminata'] }],\n});", apiRef: "ex3" },
  { fn: "http.put", signature: "http.put(resource, body, options)", description: "Update an existing FHIR resource at the given resource path.",
    code: "http.put('/fhir/Practitioner/prac-0001', {\n  resourceType: 'Practitioner', id: 'prac-0001', active: true,\n});" },
  { fn: "http.request", signature: "http.request(method, path, body, options)", description: "Make a general HTTP request with any method to any iHRIS endpoint.",
    code: "http.request('GET', '/fhir/PractitionerRole/role-prac-0001', {}, {});", apiRef: "ex2" },
];
