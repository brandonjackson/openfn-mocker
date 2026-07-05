import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the progres system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by the usage example's
 * `apiRef` cross-link.
 */
export const guide: SystemGuide = {
  title: 'UNHCR proGres v4',
  docs: 'https://docs.openfn.org/adaptors/packages/progres-docs',
  blurb:
    'Refugee registration & case management. The adaptor exposes one operation, postData({ url, body, headers, agentOptions }) — a mutual-TLS POST (client cert + private key, plus a bearer token). These representative v4 endpoints let a postData job register and read individuals.',
  auth: 'Client certificate + token',
  examples: [
    {
      id: 'register',
      method: 'POST',
      path: '/api/v4/individuals',
      label: 'Register an individual (postData)',
      body: JSON.stringify({ givenName: 'Amara', familyName: 'Okoye', dateOfBirth: '1990-01-01', sex: 'F', countryOfOrigin: 'NGA' }, null, 2),
    },
    { id: 'list', method: 'GET', path: '/api/v4/individuals', label: 'List registered individuals' },
    { id: 'read', method: 'GET', path: '/api/v4/individuals/900000001', label: 'Fetch an individual by proGres ID' },
  ],
};
