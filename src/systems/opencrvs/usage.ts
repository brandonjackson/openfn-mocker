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
];
