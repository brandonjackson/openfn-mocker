import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the divoc system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 */
export const guide: SystemGuide = {
  title: 'DIVOC',
  docs: 'https://docs.openfn.org/adaptors/packages/divoc-docs',
  blurb:
    'Digital vaccination certificates. The adaptor authenticates with a Bearer access_token supplied in the credential; certifyVaccination then POSTs one (or an array of) certification request(s) to /v1/certify. DIVOC processes certifications asynchronously, so /v1/certify answers 200. (DIVOC issues that token via its bundled Keycloak, mocked below as a convenience — the adaptor itself does not call it.)',
  auth: 'Bearer access token',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: '/auth/realms/divoc/protocol/openid-connect/token',
      label: 'Get an access token (Keycloak password grant) — obtain the access_token the credential needs',
      body: 'grant_type=password&client_id=divoc-portal&username=admin&password=secret',
      contentType: 'application/x-www-form-urlencoded',
    },
    {
      id: 'certify',
      method: 'POST',
      path: '/v1/certify',
      label: 'Certify a vaccination (certifyVaccination)',
      body: JSON.stringify(
        {
          preEnrollmentCode: 'PEC-2001',
          recipient: { name: 'Sandbox Recipient', contact: ['tel:+250788123456'], dob: '1990-01-01', gender: 'Female' },
          vaccination: { name: 'COVISHIELD', batch: 'B-9001', dose: 1, totalDoses: 2, date: '2026-06-01T09:00:00.000Z' },
          vaccinator: { name: 'Dr. Sandbox' },
          facility: { name: 'Sandbox Clinic' },
        },
        null,
        2
      ),
    },
    { id: 'list', method: 'GET', path: '/v1/certificates', label: 'List issued certificates' },
    { id: 'certificate', method: 'GET', path: '/v1/certificate/cert-10000001', label: 'Fetch one certificate' },
  ],
};
