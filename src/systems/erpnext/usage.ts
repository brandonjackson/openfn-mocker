import type { UsageExample } from '../types.js';

/**
 * Usage examples for the erpnext sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "create", signature: "create(doctype, data)", description: "Create a document of the given DocType; returns the full created document.",
    code: "create('Customer', {\n  customer_name: 'Gamma Distributors',\n  customer_type: 'Company'\n});", apiRef: "create" },
  { fn: "read", signature: "read(doctype, name)", description: "Read a document by its DocType and name; returns all fields.",
    code: "read('Customer', 'CUST-0001');", apiRef: "read" },
  { fn: "update", signature: "update(doctype, name, data)", description: "Update a document with the specified field changes.",
    code: "update('Customer', 'CUST-0001', {\n  customer_group: 'Non Profit'\n});", apiRef: "update" },
  { fn: "deleteRecord", signature: "deleteRecord(doctype, name)", description: "Delete a document from ERPNext.",
    code: "deleteRecord('Customer', 'CUST-0002');", apiRef: "delete" },
  { fn: "getList", signature: "getList(doctype, options)", description: "List documents with field selection, filters and pagination.",
    code: "getList('Customer', {\n  fields: ['name', 'customer_name'],\n  filters: [['customer_type', '=', 'Company']],\n  limit: 20\n});", apiRef: "list" },
  { fn: "getCount", signature: "getCount(doctype, filters)", description: "Count the documents matching the provided filters.",
    code: "getCount('Customer', {\n  customer_group: 'Commercial'\n});", apiRef: "count" },
];
