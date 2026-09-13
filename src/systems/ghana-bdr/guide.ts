import type { SystemGuide } from '../types.js';

/**
 * Sandbox guide for the ghana-bdr system: its blurb and the runnable example
 * requests shown on the sandbox "API" tab. Referenced by usage examples' `apiRef`
 * cross-links. Paths and payloads match what `@openfn/language-ghana-bdr@1.0.x`
 * calls and what the vendor's "HBDRP INTEGRATION" collection documents
 * (openfn-api-specs `ghana-bdr`).
 */

const BASE = '/api/v1/UserManagementService/integrations';
const BIRTH_PATH = `${BASE}/registrations/birth`;
const DEATH_PATH = `${BASE}/registrations/death`;

/** A seeded record, so the status lookups below return something on first boot. */
const SEEDED_BIRTH = 'BIRTH-121234-2026-0000001';
const SEEDED_DEATH = 'DEATH-121234-2026-0000001';

/** The full COMPLETE payload, as the adaptor's own createBirthRecord example sends it. */
const birthPayload = {
  status: 'COMPLETE',
  region_id: 4348,
  district_id: 338,
  type_of_birth: 'SINGLETON',
  informant_type: 'MOTHER',
  informant_national_id_type: 'GHANA CARD',
  informant_national_id_number: '34454344',
  informant_first_name: 'David',
  informant_last_name: 'Godson',
  informant_region_id: 4348,
  informant_district_id: 338,
  informant_residential_address: 'Dansoman',
  informant_phone_number: '2335648498309',
  child_first_name: 'Francis',
  child_last_name: 'Benzoic',
  child_gender: 'MALE',
  child_dob: '2026-06-26',
  child_place_of_birth: 'HOSPITAL',
  child_birth_attendant: 'MID-WIFE',
  child_birth_institution: 'Ludra Hospital',
  child_town: 'Ashaiman',
  child_house_no: 'H/F286',
  child_street_name: 'Ashaiman Newtown',
  mother_national_id_type: 'GHANA CARD',
  mother_national_id_number: '32432423433',
  mother_phone_number: '2335456823893',
  mother_first_name: 'Adwoa',
  mother_last_name: 'Godson',
  mother_age: 30,
  mother_marital_status: 'MARRIED',
  mother_previous_birth_no: 2,
  mother_occupation: 'Teacher',
  mother_educational_level: 'DIPLOMA',
  mother_region_id: 4348,
  mother_district_id: 338,
  mother_town: 'Accra',
  mother_religion: 'CHRISTIAN',
  mother_residence: 'Tema',
  mother_nationality: 'GHANA',
  doubtful_maternity: 0,
  father_national_id_type: 'GHANA CARD',
  father_national_id_number: '32432423433',
  father_phone_number: '233548791223',
  father_first_name: 'David',
  father_last_name: 'Godson',
  father_age: 33,
  father_marital_status: 'MARRIED',
  father_children_no: 5,
  father_occupation: 'Doctor',
  father_educational_level: 'DIPLOMA',
  father_region_id: 4348,
  father_district_id: 338,
  father_town: 'Tema',
  father_residence: 'Tema',
  father_nationality: 'GHANA',
  father_religion: 'CHRISTIAN',
  doubtful_paternity: 0,
};

export const guide: SystemGuide = {
  title: 'Ghana Births & Deaths Registry (BDR)',
  docs: 'https://docs.openfn.org/adaptors/packages/ghana-bdr-docs',
  blurb:
    'HBDRP, the registry\'s integration API. The adaptor trades the long-lived API token for a short-lived access token (POST .../auth/token, returning { api_data: { access_token, expires_in } }) and sends it as a Bearer token on every call. createBirthRecord → POST .../registrations/birth with a FLAT payload; every response is the { api_code, api_status, api_message, api_data } envelope. Only status, region_id and district_id are enforced at submit time — DRAFT saves as-is, COMPLETE moves the record on to verification — and every coded field (region_id, district_id, GENDER, BIRTH_TYPE, ...) must come from the utility lookup.',
  auth: 'Bearer (access token exchanged for an API token)',
  examples: [
    {
      id: 'token',
      method: 'POST',
      path: `${BASE}/auth/token`,
      label: 'Exchange the API-consumer token for an access token',
    },
    {
      id: 'refresh',
      method: 'POST',
      path: `${BASE}/auth/refresh`,
      label: 'Exchange a refresh token for a new token pair',
      body: JSON.stringify({ refresh_token: 'mock-refresh-token' }, null, 2),
    },
    {
      id: 'utility',
      method: 'POST',
      path: `${BASE}/utility`,
      label: 'Look up coded values (here the regions of Ghana) — the ids every *_id field needs',
      body: JSON.stringify({ utility_type: 'REGION', country_id: 1 }, null, 2),
    },
    {
      id: 'createBirth',
      method: 'POST',
      path: BIRTH_PATH,
      label: 'Register a birth (createBirthRecord) — flat payload, status COMPLETE',
      body: JSON.stringify(birthPayload, null, 2),
    },
    {
      id: 'getBirth',
      method: 'GET',
      path: `${BIRTH_PATH}/${SEEDED_BIRTH}`,
      label: 'Poll a birth record by document number (process flow + callback history)',
    },
    {
      id: 'updateBirth',
      method: 'POST',
      path: `${BIRTH_PATH}/${SEEDED_BIRTH}`,
      label: 'Update a birth record (same payload as create)',
      body: JSON.stringify({ ...birthPayload, child_town: 'Tema' }, null, 2),
    },
    {
      id: 'createDeath',
      method: 'POST',
      path: DEATH_PATH,
      label: 'Register a death',
      body: JSON.stringify(
        {
          status: 'COMPLETE',
          region_id: 4348,
          district_id: 338,
          informant_type: 'FATHER',
          informant_first_name: 'Kofi',
          informant_last_name: 'Mensah',
          deceased_first_name: 'Yaw',
          deceased_last_name: 'Mensah',
          deceased_gender: 'MALE',
          deceased_age: 78,
          deceased_age_unit: 'YEARS',
          deceased_nationality: 'GHANA',
          deceased_date_of_death: '2026-08-30',
          deceased_place_of_death: 'Ludra Hospital',
          death_region_id: 4348,
          death_district_id: 338,
          death_town: 'Tema',
          cemetery_name: 'Tema Public Cemetery',
          cemetery_town: 'Tema',
        },
        null,
        2
      ),
    },
    {
      id: 'getDeath',
      method: 'GET',
      path: `${DEATH_PATH}/${SEEDED_DEATH}`,
      label: 'Poll a death record by document number',
    },
  ],
};
