import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the sunbird-rc system. Registry records live under
 * /api/v1/<entity> and carry an `osid`; verifiable credentials are issued at
 * /credentials/issue and identified by a `did:rcw:` id. getStudent / getCred
 * target the seeded records.
 */
export const guide: SystemGuide = {
  title: 'Sunbird RC',
  docs: 'https://docs.openfn.org/adaptors/packages/sunbird-rc-docs',
  blurb:
    'Sunbird Registry & Credentialing. The adaptor exposes generic REST verbs (get / post / put / del) over registry entities under /api/v1/<entity>, plus credentialing helpers (issueCredential / getCredential). Registry records carry an osid; issued credentials get a did:rcw: id.',
  auth: 'API key (Bearer token, optional)',
  examples: [
    {
      id: 'createStudent',
      method: 'POST',
      path: '/api/v1/Student',
      label: 'Create a Student registry record',
      body: JSON.stringify({ name: 'Asha', grade: '5' }, null, 2),
    },
    {
      id: 'getStudent',
      method: 'GET',
      path: '/api/v1/Student/stu-0001',
      label: 'Fetch a Student by osid',
    },
    {
      id: 'issue',
      method: 'POST',
      path: '/credentials/issue',
      label: 'Issue a verifiable credential',
      body: JSON.stringify(
        { credential: { credentialSubject: { id: 'did:rcw:123' } }, credentialSchemaId: 'schema-1' },
        null,
        2
      ),
    },
    {
      id: 'getCred',
      method: 'GET',
      path: '/credentials/did:rcw:cred0001',
      label: 'Fetch a credential by id',
    },
  ],
};
