import type { UsageExample } from '../types.js';

/**
 * Usage examples for the commcare sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "get", signature: "get(path, params = {}, callback = state => state)", description: "Fetch resources from CommCare's REST API, auto-paginating into state.data.",
    code: "get('/case', { type: 'patient' });", apiRef: "ex1" },
  { fn: "post", signature: "post(path, data, params = {}, callback = state => state)", description: "Send a JSON body via POST to a CommCare REST API resource.",
    code: "post('/case', { case_type: 'patient', case_name: 'Jane Doe' });" },
  { fn: "submitXls", signature: "submitXls(data, params)", description: "Bulk-upload an array of objects to CommCare by converting them into an XLS import.",
    code: "submitXls([{ name: 'Jane Doe', phone: '0000000' }], {\n  case_type: 'patient', search_field: 'external_id', create_new_cases: 'on',\n});" },
  { fn: "submit", signature: "submit(data)", description: "Convert JSON fields to XML and submit them to CommCare as an OpenRosa x-form.",
    code: "submit(\n  fields(\n    field('@', state => ({ xmlns: `http://openrosa.org/formdesigner/${state.formId}` })),\n    field('case_type', () => 'patient')\n  )\n);", apiRef: "ex6" },
  { fn: "fetchReportData", signature: "fetchReportData(reportId, params, postUrl)", description: "GET data from a CommCare configurable report and POST the response to another same-origin endpoint.",
    code: "// postUrl must share hostUrl's origin: use a relative path, not an external\n// absolute URL (which the adaptor rejects with BASE_URL_MISMATCH).\nfetchReportData('report-abc', { limit: 10 }, '/a/test-project/api/v0.5/case/');", apiRef: "ex5" },
  { fn: "request", signature: "request(method, path, body, params = {})", description: "Make an arbitrary HTTP request against any CommCare REST API endpoint.",
    code: "// request() takes the full API path (unlike get(), which prefixes the\n// domain-scoped Data API base for you).\nrequest('GET', '/a/test-project/api/v0.5/case', {}, { offset: 0, limit: 20 });", apiRef: "ex0" },
  { fn: "bulk", signature: "bulk(type, data, params)", description: "Bulk-upload case-data or lookup-table records to CommCare as an XLSX import.",
    code: "bulk('case-data', [{ name: 'Jane Doe', phone: '0000000' }], {\n  case_type: 'patient', search_field: 'external_id', create_new_cases: 'on',\n});" },
];
