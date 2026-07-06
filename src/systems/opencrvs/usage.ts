import type { UsageExample } from '../types.js';

/**
 * Usage examples for the opencrvs sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "queryEvents", signature: "queryEvents(variables, options?)", description: "Run an events search query against the OpenCRVS GraphQL API.",
    code: "queryEvents({\n  event: 'birth', registrationStatuses: ['REGISTERED'],\n});", apiRef: "ex0" },
  { fn: "createEvent", signature: "createEvent(type, options?)", description: "Create an OpenCRVS v2 event, e.g. a birth or death registration.",
    code: "createEvent('v2.birth', { transactionId: 'sandbox-txn-1' });", apiRef: "ex2" },
  { fn: "notifyEvent", signature: "notifyEvent(eventId, declaration, options?)", description: "Notify (advance) an existing OpenCRVS v2 event with declaration data.",
    code: "notifyEvent($.id, {\n  'child.name': { firstname: 'Test', surname: 'Baby' },\n  'child.dob': '2026-05-01',\n});", apiRef: "ex2" },
  { fn: "submitBirthNotification", signature: "submitBirthNotification(declaration, options?)", description: "Create a v2 birth event and notify it in one step.",
    code: "submitBirthNotification({\n  'child.name': { firstname: 'Test', surname: 'Baby' },\n  'child.gender': 'female',\n});", apiRef: "ex2" },
  { fn: "getLocations", signature: "getLocations(options?)", description: "Fetch the list of locations from the country-config host.",
    code: "getLocations();", apiRef: "ex3" },
  { fn: "createDocumentEntry", signature: "createDocumentEntry(resource, fullUrl?)", description: "Wrap a FHIR resource into a document-bundle entry with a generated UUID fullUrl (pure builder, no HTTP — wrap it in fn() since it isn't itself an operation).",
    code: "fn((state) => {\n  state.data = createDocumentEntry({ resourceType: 'Patient', name: [{ given: ['John'] }] });\n  return state;\n});" },
  { fn: "createBirthNotification", signature: "createBirthNotification(body)", description: "POST a FHIR bundle of document entries to the country-config birth-notification hook.",
    code: "createBirthNotification([\n  { fullUrl: 'urn:uuid:mother', resource: { resourceType: 'Patient', name: [{ family: ['Smith'] }] } },\n]);" },
  { fn: "http.post", signature: "http.post(path, body, options)", description: "Make a raw POST request to any OpenCRVS events REST endpoint.",
    code: "http.post('/api/events/events', {});" },
  { fn: "http.request", signature: "http.request(method, path, body, options?)", description: "Make a raw HTTP request with any method to an OpenCRVS events REST endpoint.",
    code: "http.request('GET', '/api/events/events');" },
];
