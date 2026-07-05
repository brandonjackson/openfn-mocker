import type { UsageExample } from '../types.js';

/**
 * Usage examples for the vtiger sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 *
 * The adaptor's `execute` auto-runs the challenge + login handshake before every
 * operation, so jobs only write the operations below. (`login` is exported too,
 * but as a plain `login(state)` helper the handshake calls internally — it is not
 * a curried job operation, so it is intentionally not shown as a usage snippet.)
 */
export const usage: UsageExample[] = [
  { fn: "listTypes", signature: "listTypes(callback = s => s)", description: "List the CRM modules (element types) available over the webservice.",
    code: "listTypes();", apiRef: "list-types" },
  { fn: "postElement", signature: "postElement(params, callback = s => s)", description: "Create, update or delete a record; `operation` selects which, `element` is the record.",
    code: "postElement({\n  operation: 'create',\n  elementType: 'Contacts',\n  element: { firstname: 'Grace', lastname: 'Mensah', assigned_user_id: '19x1' }\n});", apiRef: "create" },
];
