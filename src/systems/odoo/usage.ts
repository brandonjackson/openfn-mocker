import type { UsageExample } from '../types.js';

/**
 * Usage examples for the odoo sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "create", signature: "create(model, data, options?)", description: "Create a record in an Odoo model; returns the new record id.",
    code: "create('res.partner', {\n  name: 'Gamma Distributors', is_company: true\n});", apiRef: "create-partner" },
  { fn: "read", signature: "read(model, recordId, fields?)", description: "Read a record by id, optionally limiting the returned fields.",
    code: "read('res.partner', 1, ['name', 'email']);", apiRef: "read-partner" },
  { fn: "update", signature: "update(model, recordId, data)", description: "Update (write) a record in Odoo.",
    code: "update('res.partner', 1, {\n  phone: '+1-202-555-0199'\n});", apiRef: "write-partner" },
  { fn: "deleteRecord", signature: "deleteRecord(model, recordId)", description: "Delete (unlink) a record from Odoo.",
    code: "deleteRecord('crm.lead', 11);", apiRef: "delete-lead" },
  { fn: "searchRecord", signature: "searchRecord(model, domain)", description: "Search a model with an Odoo domain; returns matching record ids only.",
    code: "searchRecord('res.partner', [\n  ['is_company', '=', true]\n]);", apiRef: "search-partners" },
  { fn: "searchReadRecord", signature: "searchReadRecord(model, domain, fields?, options?)", description: "Search and read records matching an Odoo domain, with fields and offset/limit.",
    code: "searchReadRecord('res.partner',\n  [['customer_rank', '>', 0]],\n  ['name', 'email'],\n  { limit: 10 }\n);", apiRef: "search-read-partners" },
];
