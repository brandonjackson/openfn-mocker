import type { UsageExample } from '../types.js';

/**
 * Usage examples for the satusehat sandbox "Usage" tab: the OpenFn job code for
 * each adaptor function, authored next to this system's seed data so a snippet
 * and the records it reads stay together. Rendered by the sandbox and run end to
 * end by `pnpm test:usage`. Paths are adaptor-relative (the adaptor prefixes
 * them with /fhir-r4/v1) so no absolute URL appears in the snippets.
 */
export const usage: UsageExample[] = [
  {
    fn: 'get',
    signature: 'get(path, params = {}, callback = s => s)',
    description: 'GET a FHIR resource (or searchset Bundle) from SATUSEHAT under /fhir-r4/v1.',
    code: "get('Patient', { name: 'Budi' });",
    apiRef: 'get',
  },
  {
    fn: 'post',
    signature: 'post(path, data, params = {}, callback = s => s)',
    description: 'POST a FHIR resource to SATUSEHAT to create it.',
    code: "post('Patient', {\n  resourceType: 'Patient',\n  name: [{ use: 'official', text: 'Dewi Lestari' }],\n  gender: 'female',\n});",
    apiRef: 'post',
  },
  {
    fn: 'put',
    signature: 'put(path, data, params = {}, callback = s => s)',
    description: 'PUT a FHIR resource to SATUSEHAT to replace it by id.',
    code: "put('Patient/P02478375123', {\n  resourceType: 'Patient',\n  id: 'P02478375123',\n  active: true,\n});",
    apiRef: 'put',
  },
  {
    fn: 'patch',
    signature: 'patch(path, data, params = {}, callback = s => s)',
    description: 'PATCH a SATUSEHAT resource with a JSON-Patch (RFC 6902) operations array.',
    code: "patch('Patient/P02478375123', [\n  { op: 'replace', path: '/active', value: false },\n]);",
    apiRef: 'patch',
  },
];
