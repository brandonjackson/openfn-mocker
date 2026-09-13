import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ghana BDR seed — HBDRP, the Births & Deaths Registry's integration API as
 * `@openfn/language-ghana-bdr@1.0.x` talks to it.
 *
 * Shapes follow openfn-api-specs `ghana-bdr` (converted from the vendor's own
 * "HBDRP INTEGRATION" Postman collection, the documentation the adaptor's 1.0.0
 * rewrite cites): flat `BirthRecordRequest` in, `BirthRecord` inside the
 * `{ api_code, api_status, api_message, api_data }` envelope out. The pre-1.0.0
 * CHIM eTracker payload (`registry_code` + nested `child`/`mother`/`father`) is
 * gone from the API and gone from here.
 */

/** The registry stores names, towns and institutions upper-cased. */
const DATE_FIELDS = new Set(['child_dob', 'mother_nationality_issued_date', 'father_nationality_issued_date']);

const upper = (key: string, value: any): any =>
  typeof value === 'string' && !DATE_FIELDS.has(key) ? value.toUpperCase() : value;

/** Every field `BirthRecord` carries back from the submitted payload. */
const BIRTH_RECORD_FIELDS = [
  'type_of_birth',
  'informant_type',
  'informant_national_id_type',
  'informant_national_id_number',
  'informant_first_name',
  'informant_middle_name',
  'informant_last_name',
  'informant_region_id',
  'informant_district_id',
  'informant_town',
  'informant_residential_address',
  'informant_phone_number',
  'child_first_name',
  'child_middle_name',
  'child_last_name',
  'child_gender',
  'child_dob',
  'child_national_id_type',
  'child_national_id_number',
  'child_place_of_birth',
  'child_birth_attendant',
  'child_birth_institution',
  'child_region_id',
  'child_district_id',
  'child_town',
  'child_house_no',
  'child_street_name',
  'mother_first_name',
  'mother_middle_name',
  'mother_last_name',
  'mother_age',
  'mother_marital_status',
  'mother_religion',
  'mother_occupation',
  'mother_nationality',
  'mother_national_id_type',
  'mother_national_id_number',
  'mother_phone_number',
  'mother_region_id',
  'mother_district_id',
  'mother_town',
  'mother_residence',
  'father_first_name',
  'father_middle_name',
  'father_last_name',
  'father_national_id_type',
  'father_national_id_number',
  'father_phone_number',
  'father_region_id',
  'father_district_id',
  'father_town',
  'father_residence',
  'father_age',
  'father_marital_status',
  'father_religion',
  'father_occupation',
  'father_nationality',
  'father_children_no',
  'region_id',
  'district_id',
] as const;

/** Server timestamp format: 'YYYY-MM-DD HH:MM:SS'. */
export function stamp(d: Date = new Date()): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** EARLY_BIRTH under a year old, LATE_BIRTH beyond it — derived, never sent. */
export function serviceType(childDob: string | undefined, now: Date = new Date()): string {
  if (!childDob) return 'EARLY_BIRTH';
  const dob = new Date(childDob);
  if (Number.isNaN(dob.getTime())) return 'EARLY_BIRTH';
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  return now.getTime() - dob.getTime() > oneYear ? 'LATE_BIRTH' : 'EARLY_BIRTH';
}

/** `BIRTH-121234-2026-0000003` / `DEATH-121234-2026-0000003`. */
export function documentNumber(kind: 'BIRTH' | 'DEATH', sequence: number, now: Date = new Date()): string {
  return `${kind}-121234-${now.getFullYear()}-${String(sequence).padStart(7, '0')}`;
}

/**
 * Build the stored `BirthRecord` from a submitted `BirthRecordRequest`.
 * `process_flow` and `callback_history` are stored on the record but only the
 * status-lookup endpoint returns them (see `withoutStatusFields`).
 */
export function toBirthRecord(
  data: Record<string, any>,
  ids: { documentNumber: string; registryId?: number },
  now: Date = new Date()
): Record<string, any> {
  const complete = String(data.status ?? '').toUpperCase() === 'COMPLETE';
  const record: Record<string, any> = {
    document_number: ids.documentNumber,
    service_type: serviceType(data.child_dob, now),
    status: 'PENDING',
  };
  for (const field of BIRTH_RECORD_FIELDS) {
    record[field] = data[field] === undefined ? null : upper(field, data[field]);
  }
  record.doubtful_maternity = Boolean(Number(data.doubtful_maternity ?? 0));
  record.doubtful_paternity = Boolean(Number(data.doubtful_paternity ?? 0));
  // registry_id is assigned by the server; a caller never supplies it.
  record.registry_id = ids.registryId ?? 1;
  record.evidence_content = data.child_file_birth_evidence_name ?? [];
  record.evidence_url = (data.child_file_birth_evidence_name ?? []).map(
    (name: string) => `https://bdrbeta.npontu.com/storage/evidence/${ids.documentNumber}/${name}`
  );
  record.created_at = stamp(now);
  record.updated_at = stamp(now);
  record.completed_at = complete ? stamp(now) : null;
  record.process_flow = {
    current_stage: complete ? 'MARKED_COMPLETE' : 'DRAFT',
    stages: { certification: { is_certified: false } },
  };
  record.callback_history = complete
    ? [{ event_type: 'MARKED_COMPLETE', callback_status: 'DELIVERED', timestamp: now.toISOString() }]
    : [];
  return record;
}

/** Build the stored death record. The vendor publishes no successful death example, so this mirrors the birth record's envelope and timestamps over the submitted payload. */
export function toDeathRecord(
  data: Record<string, any>,
  ids: { documentNumber: string; registryId?: number },
  now: Date = new Date()
): Record<string, any> {
  const complete = String(data.status ?? '').toUpperCase() === 'COMPLETE';
  const record: Record<string, any> = { document_number: ids.documentNumber };
  for (const [key, value] of Object.entries(data)) {
    if (key === 'status' || key === 'service_type') continue;
    record[key] = upper(key, value);
  }
  const death = new Date(data.deceased_date_of_death ?? now);
  const early = now.getTime() - death.getTime() <= 14 * 24 * 60 * 60 * 1000;
  record.service_type = early ? 'EARLY_DEATH' : 'LATE_DEATH';
  record.status = 'PENDING';
  record.registry_id = ids.registryId ?? 1;
  record.created_at = stamp(now);
  record.updated_at = stamp(now);
  record.completed_at = complete ? stamp(now) : null;
  record.process_flow = {
    current_stage: complete ? 'MARKED_COMPLETE' : 'DRAFT',
    stages: { certification: { is_certified: false } },
  };
  record.callback_history = [];
  return record;
}

/** The create/update endpoints return the record as submitted — no process flow, no callback history. */
export function withoutStatusFields(record: Record<string, any>): Record<string, any> {
  const { process_flow: _pf, callback_history: _ch, ...rest } = record;
  return rest;
}

/**
 * Coded-value lists served by POST .../utility. Location lookups (COUNTRY,
 * REGION, DISTRICT, REGISTRY) return objects with the numeric ids that
 * region_id / district_id expect; the flat lookups return plain strings.
 */
export function utilityValues(): Record<string, any[]> {
  const ghana = { id: 1, name: 'GHANA', code: 'GH', created_at: null, updated_at: null, deleted_at: null };
  const greaterAccra = { id: 4348, name: 'GREATER ACCRA', code: '03', country_id: 1 };
  const ashanti = { id: 4349, name: 'ASHANTI', code: '05', country_id: 1 };
  const tema = { id: 338, name: 'TEMA METROPOLITAN', code: '0301', region_id: 4348, region: greaterAccra };
  const accra = { id: 339, name: 'ACCRA METROPOLITAN', code: '0302', region_id: 4348, region: greaterAccra };
  const kumasi = { id: 512, name: 'KUMASI METROPOLITAN', code: '0501', region_id: 4349, region: ashanti };
  return {
    COUNTRY: [ghana],
    REGION: [greaterAccra, ashanti],
    DISTRICT: [tema, accra, kumasi],
    REGISTRY: [
      { id: 1, name: 'TEMA MAIN REGISTRY', code: '121234', district_id: 338, district: tema, officer_id: 11 },
      { id: 2, name: 'ACCRA CENTRAL REGISTRY', code: '121235', district_id: 339, district: accra, officer_id: 12 },
    ],
    NATIONALITY: ['GHANA', 'NIGERIA', 'TOGO', 'OTHER'],
    NATIONAL_ID: ['GHANA CARD', 'PASSPORT', 'VOTER ID', 'DRIVER LICENSE'],
    TOWN: ['ASHAIMAN', 'TEMA', 'ACCRA', 'KUMASI'],
    GENDER: ['MALE', 'FEMALE'],
    BIRTH_TYPE: ['SINGLETON', 'TWIN', 'TRIPLET'],
    BIRTH_ATTENDANT: ['MID-WIFE', 'DOCTOR', 'NURSE', 'TRADITIONAL BIRTH ATTENDANT'],
    RELIGION: ['CHRISTIAN', 'MUSLIM', 'TRADITIONAL', 'OTHER'],
    EDUCATIONAL_LEVEL: ['NONE', 'PRIMARY', 'SECONDARY', 'DIPLOMA', 'DEGREE'],
    INFORMANT_TYPE: ['MOTHER', 'FATHER', 'GUARDIAN', 'OTHER'],
    MARITAL_STATUS: ['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED'],
    PLACE_OF_BIRTH: ['HOSPITAL', 'HOME', 'CLINIC', 'OTHER'],
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const seededAt = new Date('2026-01-27T12:14:35.000Z');

  const births = [
    toBirthRecord(
      {
        status: 'COMPLETE',
        region_id: 4348,
        district_id: 338,
        type_of_birth: 'SINGLETON',
        informant_type: 'MOTHER',
        informant_national_id_type: 'GHANA CARD',
        informant_national_id_number: '34454344',
        informant_first_name: 'Adwoa',
        informant_last_name: 'Godson',
        informant_region_id: 4348,
        informant_district_id: 338,
        informant_residential_address: 'Dansoman',
        informant_phone_number: '2335648498309',
        child_first_name: 'Kharis',
        child_last_name: 'Osei',
        child_gender: 'FEMALE',
        child_dob: '2025-06-26',
        child_place_of_birth: 'HOSPITAL',
        child_birth_attendant: 'MID-WIFE',
        child_birth_institution: 'Ludra Hospital',
        child_town: 'Ashaiman',
        mother_first_name: 'Gifty',
        mother_last_name: 'Osei',
        mother_age: 30,
        mother_marital_status: 'MARRIED',
        mother_occupation: 'Teacher',
        mother_nationality: 'GHANA',
        mother_national_id_type: 'GHANA CARD',
        mother_national_id_number: 'GHA-000000000-2',
        mother_phone_number: '2335456823893',
        mother_residence: 'Tema',
        doubtful_maternity: 0,
        father_first_name: 'Nyarkoa',
        father_last_name: 'Osei',
        father_age: 33,
        father_marital_status: 'MARRIED',
        father_occupation: 'Doctor',
        father_nationality: 'GHANA',
        father_children_no: 2,
        doubtful_paternity: 0,
      },
      { documentNumber: documentNumber('BIRTH', 1, seededAt) },
      seededAt
    ),
    toBirthRecord(
      {
        status: 'DRAFT',
        region_id: 4348,
        district_id: 339,
        type_of_birth: 'SINGLETON',
        informant_type: 'FATHER',
        informant_first_name: 'Kofi',
        informant_last_name: 'Mensah',
        child_first_name: 'Kwame',
        child_last_name: 'Mensah',
        child_gender: 'MALE',
        child_dob: '2025-11-12',
        mother_first_name: 'Akua',
        mother_last_name: 'Mensah',
        mother_national_id_number: 'GHA-000112233-1',
        doubtful_maternity: 0,
        father_first_name: 'Kofi',
        father_last_name: 'Mensah',
        father_national_id_number: 'GHA-000445566-2',
        doubtful_paternity: 0,
      },
      { documentNumber: documentNumber('BIRTH', 2, seededAt) },
      seededAt
    ),
  ];
  for (const record of births) store.create('birthRecords', record.document_number, record);

  const deaths = [
    toDeathRecord(
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
        deceased_date_of_death: '2026-01-20',
        deceased_place_of_death: 'Ludra Hospital',
        death_region_id: 4348,
        death_district_id: 338,
        death_town: 'Tema',
        cemetery_name: 'Tema Public Cemetery',
        cemetery_town: 'Tema',
      },
      { documentNumber: documentNumber('DEATH', 1, seededAt) },
      seededAt
    ),
  ];
  for (const record of deaths) store.create('deathRecords', record.document_number, record);

  for (const [type, values] of Object.entries(utilityValues())) {
    store.create('utilities', type, { utility_type: type, values });
  }
}
