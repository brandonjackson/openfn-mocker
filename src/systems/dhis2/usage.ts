import type { UsageExample } from '../types.js';

/**
 * Usage examples for the dhis2 sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "create", signature: "create(path, data, params?)", description: "Create a new DHIS2 record (program, event, tracked entity, data set, ...).",
    code: "create('trackedEntityInstances', {\n  orgUnit: 'DiszpKrYNg8', trackedEntityType: 'nEenWmSyUEp',\n  attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Aminata' }]\n});", apiRef: "ex4" },
  { fn: "get", signature: "get(path, params?)", description: "Retrieve any DHIS2 resource as JSON via its REST path.",
    code: "get('programs/IpHINAT79UW', { fields: 'id,name,programStages' });", apiRef: "ex3" },
  { fn: "update", signature: "update(resourceType, path, data, options?)", description: "Replace an existing resource; requires the full object body.",
    code: "update('events', 'PVqUD2hvU4E', {\n  program: 'IpHINAT79UW', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED'\n});", apiRef: "ex5" },
  { fn: "upsert", signature: "upsert(resourceType, query, data, options?)", description: "Update a record matched by query, or create it if none is found.",
    code: "upsert('trackedEntities', {}, {\n  orgUnit: 'DiszpKrYNg8', trackedEntityType: 'nEenWmSyUEp',\n  attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Aminata' }]\n});", apiRef: "ex5" },
  { fn: "destroy", signature: "destroy(resourceType, path, data?, options?)", description: "Delete a DHIS2 record by resourceType and id/path.",
    code: "destroy('trackedEntities', 'LcRd6Nyaq7T');", apiRef: "ex5" },
  { fn: "tracker.import", signature: "tracker.import(strategy, payload, options?)", description: "Import tracker data (events, enrollments, trackedEntities) via /api/tracker.",
    code: "tracker.import('CREATE_AND_UPDATE', {\n  events: [{ program: 'IpHINAT79UW', programStage: 'A03MvHHogjR', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED' }]\n});", apiRef: "ex5" },
  { fn: "tracker.export", signature: "tracker.export(path, query?, options?)", description: "Export tracker data (events, enrollments, trackedEntities) from /api/tracker.",
    code: "tracker.export('events', { orgUnit: 'DiszpKrYNg8', program: 'IpHINAT79UW' });", apiRef: "ex6" },
  { fn: "http.get", signature: "http.get(path, options?)", description: "Raw GET request to any DHIS2 endpoint (path is prefixed with /api/).",
    code: "http.get('organisationUnits');" },
  { fn: "http.post", signature: "http.post(path, data, options?)", description: "Raw POST request to any DHIS2 endpoint, e.g. the tracker import API.",
    code: "http.post('tracker', {\n  events: [{ program: 'IpHINAT79UW', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED' }]\n});" },
  { fn: "http.patch", signature: "http.patch(resourceType, path, data, options?)", description: "Raw PATCH request to partially update a DHIS2 resource by id.",
    code: "http.patch('dataElements', 'fbfJHSPpUQD', { name: 'ANC 1st visit (updated)' });" },
  { fn: "http.request", signature: "http.request(method, path, options?)", description: "Raw HTTP request to any DHIS2 endpoint with an explicit method.",
    code: "http.request('GET', 'organisationUnits');" },
];
