import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the divoc system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Co-located with this system's seed
 * data and imported onto the plugin (`MockSystemPlugin.guide`); rendered by the
 * sandbox and referenced by usage examples' `apiRef` cross-links.
 *
 * Every example is an operation in the vendor's own vaccination API
 * (`interfaces/vaccination-api.yaml`, captured as openfn-api-specs `divoc`).
 */
export const guide: SystemGuide = {
  title: 'DIVOC',
  docs: 'https://docs.openfn.org/adaptors/packages/divoc-docs',
  blurb:
    'Digital vaccination certificates. The adaptor authenticates with a Bearer access_token supplied in the credential; certifyVaccination then POSTs an ARRAY of certification requests to /v1/certify (the vendor types the body as an array, even for one recipient). DIVOC processes certifications asynchronously, so /v1/certify answers 200. POST /authorize is DIVOC\'s own "establish token" login; a deployment\'s bundled Keycloak is a separate service, mocked here at /keycloak/auth/realms/divoc/protocol/openid-connect/token (the adaptor calls neither).',
  auth: 'Bearer access token',
  examples: [
    { id: 'ping', method: 'GET', path: '/v1/ping', label: 'Server heartbeat (unauthenticated)' },
    {
      id: 'authorize',
      method: 'POST',
      path: '/authorize',
      label: 'Establish a token (mobile + 2FA code) — returns { token, refreshToken }',
      body: JSON.stringify({ mobile: '+250788000000', token2fa: '123456' }, null, 2),
    },
    {
      id: 'preEnrollments',
      method: 'GET',
      path: '/v1/preEnrollments',
      label: 'Pre-enrollments for the assigned facility',
    },
    {
      id: 'preEnrollment',
      method: 'GET',
      path: '/v1/preEnrollments/PEC-10000001',
      label: 'One pre-enrollment by code',
    },
    { id: 'programs', method: 'GET', path: '/v1/programs/current', label: 'Active vaccination programs' },
    { id: 'vaccinators', method: 'GET', path: '/v1/vaccinators', label: 'Vaccinators mapped to the facility' },
    { id: 'me', method: 'GET', path: '/v1/users/me', label: 'The signed-in user' },
    {
      id: 'certify',
      method: 'POST',
      path: '/v1/certify',
      label: 'Certify a vaccination (certifyVaccination) — an array of certification requests',
      body: JSON.stringify(
        [
          {
            preEnrollmentCode: 'PEC-2001',
            recipient: { name: 'Sandbox Recipient', contact: ['tel:+250788123456'], dob: '1990-01-01', gender: 'Female' },
            vaccination: { name: 'COVISHIELD', batch: 'B-9001', dose: 1, totalDoses: 2, date: '2026-06-01T09:00:00.000Z' },
            vaccinator: { name: 'Dr. Sandbox' },
            facility: { name: 'Sandbox Clinic' },
          },
        ],
        null,
        2
      ),
    },
    {
      id: 'certificate',
      method: 'GET',
      path: '/v1/certificates',
      label: "The recipient's certificate JSON (one certificate, not a list)",
    },
    {
      id: 'revoke',
      method: 'DELETE',
      path: '/v1/certificates/PEC-10000002?allDoses=true',
      label: 'Revoke every dose certified for a pre-enrollment code',
    },
  ],
};
