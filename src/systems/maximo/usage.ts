import type { UsageExample } from '../types.js';

/**
 * Usage examples for the maximo sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`. `fetch` re-POSTs to an absolute `postUrl` (the adaptor passes
 * it straight to the request client, which rejects a relative path); building it
 * from `state.configuration.baseUrl` keeps it same-origin and free of any literal
 * external URL, and the adaptor resolves the function via expandReferences.
 */
export const usage: UsageExample[] = [
  { fn: "fetch", signature: "fetch(params)", description: "GET a Maximo collection and re-POST the response body to another URL.",
    code: "fetch({\n  endpoint: 'oslc/os/mxasset',\n  query: { 'oslc.select': 'assetnum,description,status', 'oslc.pageSize': 5 },\n  postUrl: (state) => `${state.configuration.baseUrl}/collector`\n});", apiRef: "fetch-assets" },
  { fn: "update", signature: "update(params)", description: "Update a record in Maximo 7.6+ (JSON body, PATCH tunnelled through POST).",
    code: "update({\n  endpoint: 'oslc/os/mxwo/1001',\n  body: { status: 'INPROG' }\n});", apiRef: "update-wo" },
  { fn: "update75", signature: "update75(params)", description: "Update a record in Maximo 7.5 (form-encoded body).",
    code: "update75({\n  endpoint: 'oslc/os/mxwo/1001',\n  body: { status: 'INPROG' }\n});", apiRef: "update-wo" },
];
