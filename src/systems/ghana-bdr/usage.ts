import type { UsageExample } from '../types.js';

/**
 * Usage examples for the ghana-bdr sandbox "Usage" tab — one entry per function
 * `@openfn/language-ghana-bdr@1.0.x` exports.
 *
 * Every call transparently trades `configuration.token` for an access token
 * first (POST .../auth/token), so no auth appears in the snippets themselves.
 * The generic `get`/`post`/`request` take a path relative to
 * `configuration.baseUrl`.
 */

const BASE = '/api/v1/UserManagementService/integrations';
const BIRTH_PATH = `${BASE}/registrations/birth`;
const DEATH_PATH = `${BASE}/registrations/death`;

export const usage: UsageExample[] = [
  {
    fn: 'createBirthRecord',
    signature: 'createBirthRecord(data)',
    description:
      'Register a birth. The payload is flat, and status / region_id / district_id are enforced at submit time.',
    code:
      'createBirthRecord({\n' +
      "  status: 'COMPLETE',\n" +
      '  region_id: 4348,\n' +
      '  district_id: 338,\n' +
      "  type_of_birth: 'SINGLETON',\n" +
      "  informant_type: 'MOTHER',\n" +
      "  informant_first_name: 'Adwoa',\n" +
      "  informant_last_name: 'Godson',\n" +
      "  child_first_name: 'Francis',\n" +
      "  child_last_name: 'Benzoic',\n" +
      "  child_gender: 'MALE',\n" +
      "  child_dob: '2026-06-26',\n" +
      "  child_place_of_birth: 'HOSPITAL',\n" +
      "  child_birth_attendant: 'MID-WIFE',\n" +
      "  mother_first_name: 'Adwoa',\n" +
      "  mother_last_name: 'Godson',\n" +
      '  mother_age: 30,\n' +
      "  mother_nationality: 'GHANA',\n" +
      '  doubtful_maternity: 0,\n' +
      "  father_first_name: 'David',\n" +
      "  father_last_name: 'Godson',\n" +
      '  father_age: 33,\n' +
      "  father_nationality: 'GHANA',\n" +
      '  doubtful_paternity: 0,\n' +
      '});',
    apiRef: 'createBirth',
  },
  {
    fn: 'get',
    signature: 'get(path, query)',
    description: 'GET any BDR endpoint — here a birth record, with its process flow and callback history.',
    code: `get('${BIRTH_PATH}/BIRTH-121234-2026-0000001');`,
    apiRef: 'getBirth',
  },
  {
    fn: 'post',
    signature: 'post(path, data)',
    description: 'POST to any BDR endpoint — here a death registration.',
    code:
      `post('${DEATH_PATH}', {\n` +
      "  status: 'COMPLETE',\n" +
      '  region_id: 4348,\n' +
      '  district_id: 338,\n' +
      "  deceased_first_name: 'Yaw',\n" +
      "  deceased_last_name: 'Mensah',\n" +
      "  deceased_gender: 'MALE',\n" +
      '  deceased_age: 78,\n' +
      "  deceased_age_unit: 'YEARS',\n" +
      "  deceased_date_of_death: '2026-08-30',\n" +
      "  deceased_place_of_death: 'Ludra Hospital',\n" +
      '});',
    apiRef: 'createDeath',
  },
  {
    fn: 'request',
    signature: 'request(method, path, body, options)',
    description:
      'Make a request with an arbitrary method — here the utility lookup that supplies every coded value.',
    code: `request('POST', '${BASE}/utility', {\n  utility_type: 'REGION',\n  country_id: 1,\n});`,
    apiRef: 'utility',
  },
];
