import type { UsageExample } from '../types.js';

/**
 * Usage examples for the lamisplus sandbox "Usage" tab: the OpenFn job code for
 * each adaptor function, authored next to this system's seed data so a snippet
 * and the records it reads stay together. Rendered by the sandbox and run end to
 * end by `pnpm test:usage`.
 *
 * The generic HTTP helpers are re-exported under the `http` namespace
 * (`export * as http`), so jobs call them as `http.get`/`http.post`/`http.request`
 * — not bare. `execute` auto-runs the email/password login before them, so they
 * are authenticated. `getPatients` is a top-level operation.
 */
export const usage: UsageExample[] = [
  {
    fn: 'getPatients',
    signature: 'getPatients(query, callback = s => s)',
    description: 'Get Patient resources from the LAMISPlus EHR (returns state.data.data.patients).',
    code: "getPatients({ searchValue: 'Adeyemi' });",
    apiRef: 'patients',
  },
  {
    fn: 'http.get',
    signature: 'http.get(path, options, callback = s => s)',
    description: 'Make a GET request to any LAMISPlus endpoint using a relative path.',
    code: "http.get('/plugin/ehr/api/v1/patient/1');",
    apiRef: 'patient',
  },
  {
    fn: 'http.post',
    signature: 'http.post(path, data, options, callback = s => s)',
    description: 'Make a POST request to any LAMISPlus endpoint with a JSON body.',
    code:
      "http.post('/plugin/ehr/api/v1/patient', {\n" +
      "  firstName: 'Ada', surname: 'Nwosu', sex: 'FEMALE', dateOfBirth: '1992-03-14',\n" +
      "});",
    apiRef: 'create',
  },
  {
    fn: 'http.request',
    signature: 'http.request(method, path, body, options, callback = s => s)',
    description: 'Make a general HTTP request to any LAMISPlus endpoint.',
    code: "http.request('GET', '/plugin/ehr/api/v1/patient');",
    apiRef: 'patients',
  },
];
