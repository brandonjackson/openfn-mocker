import type { UsageExample } from '../types.js';

/**
 * Usage examples for the odk sandbox "Usage" tab: the OpenFn job code for each
 * adaptor function, authored next to this system's seed data so a snippet and the
 * records it reads stay together. Rendered by the sandbox and run end to end by
 * `pnpm test:usage`.
 */
export const usage: UsageExample[] = [
  { fn: "getForms", signature: "getForms(projectId)", description: "Fetch all forms for a project.",
    code: "getForms(1);", apiRef: "ex2" },
  { fn: "getSubmissions", signature: "getSubmissions(projectId, xmlFormId, query = {})", description: "Fetch submissions to a form, optionally filtered with an OData query.",
    code: "getSubmissions(1, 'household-survey', {\n  $filter: \"__system/submissionDate gt 2020-01-31T23:59:59.999Z\"\n});", apiRef: "ex3" },
  { fn: "get", signature: "get(path, options = {})", description: "Make a GET request against the ODK Central server.",
    code: "get('v1/projects/1/forms');", apiRef: "ex2" },
  { fn: "post", signature: "post(path, body, options = {})", description: "Make a POST request against the ODK Central server.",
    code: "post('v1/projects/1/forms/household-survey.svc/Submissions', {\n  deviceID: 'device-01', instanceID: 'uuid:abc123'\n});", apiRef: "ex4" },
  { fn: "request", signature: "request(method, path, body, options = {})", description: "Make a general HTTP request against ODK Central with any method.",
    code: "request('GET', 'v1/projects');", apiRef: "ex1" },
];
