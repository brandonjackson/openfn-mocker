import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ghana-bdr system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by usage examples' `apiRef`
 * cross-links. Paths match what `@openfn/language-ghana-bdr@1.0.1` calls.
 */

const BIRTH_PATH = '/api/v1/UserManagementService/integrations/registrations/birth';

export const guide: SystemGuide = {
  title: 'Ghana Births & Deaths Registry (BDR)',
  docs: 'https://docs.openfn.org/adaptors/packages/ghana-bdr-docs',
  blurb:
    'Birth registration & certificate issuance. The adaptor trades the long-lived API token for a short-lived access token (POST /api/v1/UserManagementService/integrations/auth/token, returning { api_data: { access_token, expires_in } }) and sends it as a Bearer token on every call. createBirthRecord → POST .../registrations/birth, returning a certificate record ({ birth_certificate_number, reference_id, issuccessful }).',
  auth: 'Bearer (access token exchanged for an API token)',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: '/api/v1/UserManagementService/integrations/auth/token',
      label: 'Exchange the API token for an access token',
    },
    {
      id: 'createBirth',
      method: 'POST',
      path: BIRTH_PATH,
      label: 'Register a birth (createBirthRecord)',
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
    { id: 'listBirths', method: 'GET', path: BIRTH_PATH, label: 'List registered births' },
    {
      id: 'getBirth',
      method: 'GET',
      path: `${BIRTH_PATH}/abc123de-1995`,
      label: 'Get one registered birth by reference id',
    },
  ],
};
