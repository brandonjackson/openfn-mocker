import type { UsageExample } from '../types.js';

/**
 * Usage examples for the openmrs sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "get", signature: "get(path, options = {})", description: "Fetch a resource or search a list from OpenMRS, with automatic pagination.",
    code: "get('patient', { q: 'Kamara', limit: 10 });", apiRef: "ex2" },
  { fn: "create", signature: "create(path, data)", description: "Create a new resource (patient, person, encounter, ...) in OpenMRS.",
    code: "create('patient', {\n  identifiers: [{ identifier: 'SL-10432', identifierType: '05a29f94-...', preferred: true }],\n  person: { gender: 'F', birthdate: '1990-04-12', names: [{ givenName: 'Fatmata', familyName: 'Kamara' }] },\n});", apiRef: "ex7" },
  { fn: "update", signature: "update(path, data)", description: "Update specific properties of an existing OpenMRS resource.",
    code: "update('person/3cad37ad-984d-4c65-a019-3eb120c9c373', { gender: 'F' });" },
  { fn: "upsert", signature: "upsert(path, data, params = {})", description: "Update a matching resource if a query finds one, else create it.",
    code: "upsert('patient', $.data, { q: 'Fatmata Kamara', limit: 1 });", apiRef: "ex2" },
  { fn: "destroy", signature: "destroy(path, options = {})", description: "Void (or with purge:true, permanently delete) a resource by UUID.",
    code: "destroy('patient/1fdaa696-e759-4a7d-a066-f1ae557c151b');" },
  { fn: "http.get", signature: "http.get(path, options = {})", description: "Send a raw GET request to any OpenMRS REST path, unmodified.",
    code: "http.get('/ws/rest/v1/patient', { query: { v: 'ref', limit: 5 } });", apiRef: "ex3" },
  { fn: "http.post", signature: "http.post(path, data, options = {})", description: "Send a raw POST request with a JSON payload to an OpenMRS REST path.",
    code: "http.post('/ws/rest/v1/patient', {\n  person: { gender: 'M', birthdate: '1985-02-20', names: [{ givenName: 'Mohamed', familyName: 'Sesay' }] },\n});", apiRef: "ex7" },
  { fn: "http.request", signature: "http.request(method, path, options = {})", description: "Send an HTTP request with any method to an OpenMRS REST path.",
    code: "http.request('GET', '/ws/rest/v1/provider', { query: { limit: 10 } });", apiRef: "ex4" },
  { fn: "fhir.get", signature: "fhir.get(path, query, callback)", description: "Query the OpenMRS FHIR R4 module for resources like Patient or Observation.",
    code: "fhir.get('Observation', { patient: '1fdaa696-...', _count: 50 });", apiRef: "ex6" },
];
