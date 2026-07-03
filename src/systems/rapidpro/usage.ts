import type { UsageExample } from '../types.js';

/**
 * Usage examples for the rapidpro sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "addContact", signature: "addContact(params, callback = s => s)", description: "Add a new contact to RapidPro.",
    code: "addContact({\n  name: 'Amara', language: 'eng', urns: ['tel:+23276000000']\n});", apiRef: "ex1" },
  { fn: "upsertContact", signature: "upsertContact(params, callback = s => s)", description: "Upsert a contact to RapidPro, deduplicating on the URN value.",
    code: "upsertContact({\n  name: 'Amara', language: 'eng', urns: ['tel:+23276000000']\n});", apiRef: "ex1" },
  { fn: "startFlow", signature: "startFlow(params, callback = s => s)", description: "Start a RapidPro flow for a number of contacts.",
    code: "startFlow({\n  flow: 'f5901b62-ba76-4003-9c62-72fdacc1b7b7',\n  contacts: ['a052b00c-15b3-48e6-9771-edbaa277a353']\n});", apiRef: "ex2" },
  { fn: "sendBroadcast", signature: "sendBroadcast(params, callback = s => s)", description: "Send a message to a list of contacts and/or URNs.",
    code: "sendBroadcast({\n  text: 'Your ANC appointment is tomorrow',\n  urns: ['tel:+23276000000']\n});", apiRef: "ex3" },
];
