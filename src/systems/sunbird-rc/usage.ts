import type { UsageExample } from '../types.js';

/**
 * Usage examples for the sunbird-rc sandbox "Usage" tab. The generic verbs
 * (post/get) take a relative resource path; the credentialing helpers take
 * their own arguments (a credential payload, or a credential id).
 */
export const usage: UsageExample[] = [
  {
    fn: 'post',
    signature: 'post(path, data, options?, callback?)',
    description: 'Create a registry record under an entity.',
    code: "post('/api/v1/Student', { name: 'Asha', grade: '5' });",
    apiRef: 'createStudent',
  },
  {
    fn: 'get',
    signature: 'get(path, options?, callback?)',
    description: 'Fetch a registry record by osid.',
    code: "get('/api/v1/Student/stu-0001');",
    apiRef: 'getStudent',
  },
  {
    fn: 'issueCredential',
    signature: 'issueCredential(payload, options?, callback?)',
    description: 'Issue a verifiable credential.',
    code: "issueCredential({\n  credential: { credentialSubject: { id: 'did:rcw:123' } },\n  credentialSchemaId: 'schema-1'\n});",
    apiRef: 'issue',
  },
  {
    fn: 'getCredential',
    signature: 'getCredential(id, options?, callback?)',
    description: 'Fetch an issued credential by id.',
    code: "getCredential('did:rcw:cred0001');",
    apiRef: 'getCred',
  },
  {
    fn: 'downloadCredential',
    signature: 'downloadCredential(id, options?, callback?)',
    description: 'Download a credential as a rendered PDF (returned base64).',
    code: "downloadCredential('did:rcw:cred0001');",
    apiRef: 'getCred',
  },
];
