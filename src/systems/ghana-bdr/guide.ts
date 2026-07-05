import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ghana-bdr system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by usage examples' `apiRef`
 * cross-links.
 */
export const guide: SystemGuide = {
  title: 'Ghana Births & Deaths Registry (BDR)',
  docs: 'https://docs.openfn.org/adaptors/packages/ghana-bdr-docs',
  blurb:
    'Birth notification & certificate issuance. sendBirthNotification → POST /api/notification, returning a certificate record ({ birth_certificate_number, reference_id, issuccessful }). Credentials (username/password) are appended to the request body, and the API speaks double-encoded JSON on the wire.',
  auth: 'Basic (username/password in body)',
  examples: [
    {
      id: 'notify',
      method: 'POST',
      path: '/api/notification',
      label: 'Register a birth (sendBirthNotification)',
      body: JSON.stringify(
        {
          registry_code: '011803',
          child: { first_name: 'Test', Surname: 'Testerson', birth_date: '2024/03/04', gender_code: '2' },
          mother: { national_id_number: 'GHA-000000000-2', first_name: 'Ama' },
          father: { first_name: 'Kofi', Surname: 'Doe' },
        },
        null,
        2
      ),
    },
    { id: 'list', method: 'GET', path: '/api/notification', label: 'List registered birth notifications' },
  ],
};
