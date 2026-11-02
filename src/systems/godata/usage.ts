import type { UsageExample } from '../types.js';

/**
 * Usage examples for the godata sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`. Each `apiRef` is the id of the guide example that fires the
 * request the function sends (for upsert*, the half the snippet ends up taking).
 */
export const usage: UsageExample[] = [
  { fn: "listOutbreaks", signature: "listOutbreaks(callback?)", description: "Fetch the full list of outbreaks.",
    code: "listOutbreaks();", apiRef: "list-outbreaks" },
  { fn: "getOutbreak", signature: "getOutbreak(query, callback?)", description: "Get one or more outbreaks matching a query filter.",
    code: "getOutbreak({ where: { name: 'Ebola in Sierra Leone' } });", apiRef: "get-outbreak" },
  { fn: "upsertOutbreak", signature: "upsertOutbreak(outbreak, callback?)", description: "Create or update an outbreak, matched by externalId.",
    code: "upsertOutbreak({ externalId: 'ob-sl-covid19', data: { name: 'Ebola in Sierra Leone' } });", apiRef: "update-outbreak" },
  { fn: "listCases", signature: "listCases(id, callback?)", description: "Fetch all cases within an outbreak by its id.",
    code: "listCases('ob-sl-covid19');", apiRef: "list-cases" },
  { fn: "getCase", signature: "getCase(id, query, callback?)", description: "Get one or more cases in an outbreak matching a query filter.",
    code: "getCase('ob-sl-covid19', { where: { firstName: 'Jane' } });", apiRef: "get-case" },
  { fn: "upsertCase", signature: "upsertCase(id, externalId, goDataCase, callback?)", description: "Create or update a case in an outbreak, matched by externalId.",
    code: "upsertCase('ob-sl-covid19', 'visualId', {\n  firstName: 'Jane', visualId: 'CASE-001',\n});", apiRef: "create-case" },
  { fn: "listContacts", signature: "listContacts(id, callback?)", description: "Fetch all contacts within an outbreak by its id.",
    code: "listContacts('ob-sl-covid19');", apiRef: "list-contacts" },
  { fn: "getContact", signature: "getContact(id, query, callback?)", description: "Get one or more contacts in an outbreak matching a query filter.",
    code: "getContact('ob-sl-covid19', { where: { firstName: 'Jane' } });", apiRef: "get-contact" },
  { fn: "upsertContact", signature: "upsertContact(id, externalId, goDataContact, callback?)", description: "Create or update a contact in an outbreak, matched by externalId.",
    code: "upsertContact('ob-sl-covid19', 'visualId', {\n  firstName: 'Jane', gender: 'female',\n});", apiRef: "create-contact" },
  { fn: "listLocations", signature: "listLocations(callback?)", description: "Fetch the complete list of locations.",
    code: "listLocations();", apiRef: "list-locations" },
  { fn: "getLocation", signature: "getLocation(query, callback?)", description: "Get one or more locations matching a query filter.",
    code: "getLocation({ where: { name: 'Freetown' } });", apiRef: "get-location" },
  { fn: "upsertLocation", signature: "upsertLocation(externalId, goDataLocation, callback?)", description: "Create or update a location, matched on the named field.",
    code: "upsertLocation('id', { id: 'LOC-BO', name: 'Bo District (updated)' });", apiRef: "update-location" },
  { fn: "listReferenceData", signature: "listReferenceData(callback?)", description: "Fetch the complete list of reference-data entries.",
    code: "listReferenceData();", apiRef: "list-reference-data" },
  { fn: "getReferenceData", signature: "getReferenceData(query, callback?)", description: "Get reference-data entries matching a query filter.",
    code: "getReferenceData({ where: { categoryId: 'LNG_REFERENCE_DATA_CATEGORY_CENTRE_NAME' } });", apiRef: "get-reference-data" },
  { fn: "upsertReferenceData", signature: "upsertReferenceData(externalId, goDataReferenceData, callback?)", description: "Create or update a reference-data entry, matched on the named field.",
    code: "upsertReferenceData('id', { id: 'ref-001', value: 'Custom label' });", apiRef: "create-reference-data" },
];
