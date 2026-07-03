import type { UsageExample } from '../types.js';

/**
 * Usage examples for the godata sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "listOutbreaks", signature: "listOutbreaks(callback?)", description: "Fetch the full list of outbreaks.",
    code: "listOutbreaks();", apiRef: "ex1" },
  { fn: "getOutbreak", signature: "getOutbreak(query, callback?)", description: "Get one or more outbreaks matching a query filter.",
    code: "getOutbreak({ where: { name: 'Ebola in Sierra Leone' } });", apiRef: "ex1" },
  { fn: "upsertOutbreak", signature: "upsertOutbreak(outbreak, callback?)", description: "Create or update an outbreak, matched by externalId.",
    code: "upsertOutbreak({ externalId: 'ob-sl-covid19', data: { name: 'Ebola in Sierra Leone' } });" },
  { fn: "listCases", signature: "listCases(id, callback?)", description: "Fetch all cases within an outbreak by its id.",
    code: "listCases('ob-sl-covid19');", apiRef: "ex2" },
  { fn: "getCase", signature: "getCase(id, query, callback?)", description: "Get one or more cases in an outbreak matching a query filter.",
    code: "getCase('ob-sl-covid19', { where: { firstName: 'Jane' } });", apiRef: "ex3" },
  { fn: "upsertCase", signature: "upsertCase(id, externalId, goDataCase, callback?)", description: "Create or update a case in an outbreak, matched by externalId.",
    code: "upsertCase('ob-sl-covid19', 'visualId', {\n  firstName: 'Jane', visualId: 'CASE-001',\n});", apiRef: "ex5" },
  { fn: "listContacts", signature: "listContacts(id, callback?)", description: "Fetch all contacts within an outbreak by its id.",
    code: "listContacts('ob-sl-covid19');" },
  { fn: "getContact", signature: "getContact(id, query, callback?)", description: "Get one or more contacts in an outbreak matching a query filter.",
    code: "getContact('ob-sl-covid19', { where: { firstName: 'Jane' } });" },
  { fn: "upsertContact", signature: "upsertContact(id, externalId, goDataContact, callback?)", description: "Create or update a contact in an outbreak, matched by externalId.",
    code: "upsertContact('ob-sl-covid19', 'visualId', {\n  firstName: 'Jane', gender: 'female',\n});" },
  { fn: "listLocations", signature: "listLocations(callback?)", description: "Fetch the complete list of locations.",
    code: "listLocations();", apiRef: "ex4" },
  { fn: "getLocation", signature: "getLocation(query, callback?)", description: "Get one or more locations matching a query filter.",
    code: "getLocation({ where: { name: 'Freetown' } });", apiRef: "ex4" },
  { fn: "upsertLocation", signature: "upsertLocation(externalId, goDataLocation, callback?)", description: "Create or update a location, matched by externalId.",
    code: "upsertLocation('loc-001', { name: 'Freetown Health Centre' });" },
  { fn: "listReferenceData", signature: "listReferenceData(callback?)", description: "Fetch the complete list of reference-data entries.",
    code: "listReferenceData();" },
  { fn: "getReferenceData", signature: "getReferenceData(query, callback?)", description: "Get reference-data entries matching a query filter.",
    code: "getReferenceData({ where: { categoryId: 'LNG_REFERENCE_DATA_CATEGORY_CENTRE_NAME' } });" },
  { fn: "upsertReferenceData", signature: "upsertReferenceData(externalId, goDataReferenceData, callback?)", description: "Create or update a reference-data entry, matched by externalId.",
    code: "upsertReferenceData('ref-001', { value: 'Custom label' });" },
];
