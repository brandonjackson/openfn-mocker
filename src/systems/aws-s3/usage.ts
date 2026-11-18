import type { UsageExample } from '../types.js';

/**
 * Usage examples for the aws-s3 sandbox "Usage" tab. Each function takes one
 * options object; `bucket` falls back to the credential's `bucket`, so these
 * snippets leave it out.
 */
export const usage: UsageExample[] = [
  {
    fn: 'put',
    signature: 'put({ bucket?, key, body, contentType?, acl?, serverSideEncryption? })',
    description: 'Upload a JSON payload as an object.',
    code: "put({\n  key: 'submissions/2026-11-03/visit-0004.json',\n  body: JSON.stringify({ visitId: 'visit-0004', facility: 'Kibera Health Centre', patientId: 'P-10340' }),\n  contentType: 'application/json',\n});",
    apiRef: 'put-json',
  },
  {
    fn: 'list',
    signature: 'list({ bucket?, prefix?, maxKeys?, continuationToken? })',
    description: "List the objects under a prefix; state.data is the bucket's Contents.",
    code: "list({ prefix: 'submissions/2026-11-01/' });",
    apiRef: 'list-prefix',
  },
  {
    fn: 'get',
    signature: 'get({ bucket?, key })',
    description: 'Download an object; JSON is parsed, anything else comes back as base64.',
    code: "get({ key: 'submissions/2026-11-01/visit-0001.json' });",
    apiRef: 'get-json',
  },
];
