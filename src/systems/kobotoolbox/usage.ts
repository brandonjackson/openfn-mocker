import type { UsageExample } from '../types.js';

/**
 * Usage examples for the kobotoolbox sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getForms", signature: "getForms()", description: "Fetch all survey forms (assets) accessible to the authorized user.",
    code: "getForms();", apiRef: "ex0" },
  { fn: "getSubmissions", signature: "getSubmissions(formId, options = {})", description: "Fetch submissions for a form, auto-paginated up to a limit.",
    code: "getSubmissions('aHousehold01Q1');", apiRef: "ex3" },
  { fn: "getSubmissions (filtered)", signature: "getSubmissions(formId, options = {})", description: "Fetch submissions for a form, filtered with a MongoDB-style query.",
    code: "getSubmissions('aHousehold01Q1', {\n  query: { water_source: 'borehole' }\n});", apiRef: "ex4" },
  { fn: "getDeploymentInfo", signature: "getDeploymentInfo(formId)", description: "Fetch deployment status and submission count for a form.",
    code: "getDeploymentInfo('aHousehold01Q1');", apiRef: "ex2" },
  { fn: "http.get", signature: "http.get(path, options = {})", description: "Make a GET request to any KoboToolbox endpoint, e.g. a single asset.",
    code: "http.get('assets/aHousehold01Q1');", apiRef: "ex1" },
  { fn: "http.get (attachment)", signature: "http.get(path, options = {})", description: "Download a submission's media attachment as base64.",
    code: "http.get('assets/aHousehold01Q1/data/12001/attachments/300001', {\n  parseAs: 'base64'\n});", apiRef: "attachmentDownload" },
  { fn: "http.post", signature: "http.post(path, data, options = {})", description: "Make a POST request to submit survey data to a KoboToolbox endpoint.",
    code: "http.post('assets/aHousehold01Q1/submissions/', {\n  household_head_name: 'Fatu Conteh', water_source: 'borehole'\n});", apiRef: "ex5" },
  { fn: "http.put", signature: "http.put(path, data, options = {})", description: "Make a PUT request to a KoboToolbox endpoint, e.g. to redeploy a form.",
    code: "http.put('assets/aHousehold01Q1/deployment/', {});" },
  { fn: "http.request", signature: "http.request(method, path, options = {})", description: "Make an HTTP request with any method to a KoboToolbox endpoint.",
    code: "http.request('PATCH', 'assets/aHousehold01Q1/data/bulk/', {\n  data: { submission_ids: [12001], data: { water_source: 'piped' } }\n});" },
];
