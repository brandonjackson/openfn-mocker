import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ghana-bdr sandbox "Usage" tab — one entry per function
 * `@openfn/language-ghana-bdr@1.0.1` exports.
 *
 * Every call transparently trades `configuration.token` for an access token
 * first (POST .../auth/token), so no auth appears in the snippets themselves.
 * The generic `get`/`post`/`request` take a path relative to
 * `configuration.baseUrl`.
 */

const BIRTH_PATH = '/api/v1/UserManagementService/integrations/registrations/birth';

export const usage: UsageExample[] = [
  {
    fn: 'createBirthRecord',
    signature: 'createBirthRecord(data)',
    description: 'Register a birth and generate a birth certificate number.',
    code:
      'createBirthRecord({\n' +
      "  registry_code: '011803',\n" +
      "  child: { first_name: 'Test', Surname: 'Testerson', birth_date: '2024/03/04', gender_code: '2' },\n" +
      "  mother: { national_id_number: 'GHA-000000000-2', first_name: 'Ama' },\n" +
      "  father: { first_name: 'Kofi', Surname: 'Doe' }\n" +
      '});',
    apiRef: 'createBirth',
  },
  {
    fn: 'post',
    signature: 'post(path, data)',
    description: 'POST to any BDR endpoint.',
    code:
      `post('${BIRTH_PATH}', {\n` +
      "  registry_code: '011803',\n" +
      "  child: { first_name: 'Ama', Surname: 'Boateng', birth_date: '2024/05/12', gender_code: '2' }\n" +
      '});',
    apiRef: 'createBirth',
  },
  {
    fn: 'get',
    signature: 'get(path, query)',
    description: 'GET any BDR endpoint, with optional query parameters.',
    code: `get('${BIRTH_PATH}', { registry_code: '011803' });`,
    apiRef: 'listBirths',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options)',
    description: 'Make a request with an arbitrary method — here, one record by reference id.',
    code: `request('GET', '${BIRTH_PATH}/abc123de-1995');`,
    apiRef: 'getBirth',
  },
];
