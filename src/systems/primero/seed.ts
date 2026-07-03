import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Primero nests business fields under `data`. Cases/incidents carry both a
 * server `id` (uuid) and a human-facing display id (`case_id` like CP-YYYY-NNN,
 * `incident_id` like IN-YYYY-NNN).
 */

export interface CaseDataInput {
  name_first: string;
  name_last: string;
  age: number;
  sex: string;
  protection_concerns: string[];
  risk_level: string;
}

/** Build a display id such as CP-2024-001. */
export function makeDisplayId(prefix: string, year: number, seq: number): string {
  return `${prefix}-${year}-${String(seq).padStart(3, '0')}`;
}

/** Assemble a full case record (server fields + nested data). */
export function makeCase(opts: {
  seq: number;
  id?: string;
  owned_by?: string;
  registration_date?: string;
  status?: string;
  data: CaseDataInput;
}): Record<string, any> {
  const now = new Date();
  const year = opts.registration_date
    ? Number(opts.registration_date.slice(0, 4))
    : now.getFullYear();
  return {
    id: opts.id ?? randomUUID(),
    case_id: makeDisplayId('CP', year, opts.seq),
    status: opts.status ?? 'open',
    registration_date: opts.registration_date ?? now.toISOString().slice(0, 10),
    owned_by: opts.owned_by ?? 'caseworker1',
    created_at: now.toISOString(),
    data: { ...opts.data },
  };
}

/** Assemble a full incident record (server fields + nested data). */
export function makeIncident(opts: {
  seq: number;
  owned_by?: string;
  case_id?: string;
  status?: string;
  data: Record<string, any>;
}): Record<string, any> {
  const now = new Date();
  return {
    id: randomUUID(),
    incident_id: makeDisplayId('IN', now.getFullYear(), opts.seq),
    status: opts.status ?? 'open',
    owned_by: opts.owned_by ?? 'caseworker1',
    created_at: now.toISOString(),
    case_id: opts.case_id,
    data: { ...opts.data },
  };
}

/** Build a referral record (nested `data`, links to a case via record_id). */
export function makeReferral(opts: {
  caseRecordId: string;
  transitioned_to: string;
  transitioned_by?: string;
  status?: string;
  notes?: string;
}): Record<string, any> {
  const now = new Date();
  return {
    id: randomUUID(),
    record_id: opts.caseRecordId,
    record_type: 'case',
    status: opts.status ?? 'in_progress',
    created_at: now.toISOString(),
    data: {
      transitioned_to: opts.transitioned_to,
      transitioned_by: opts.transitioned_by ?? 'caseworker1',
      notes: opts.notes ?? '',
      service_record_id: null,
    },
  };
}

/** Seed 4 cases, 2 incidents, referrals, and reference data (forms/lookups/locations). */
export function seed(store: DataStore, _config: SystemConfig): void {
  const cases = [
    makeCase({
      seq: 1,
      // Pinned id so http.* usage examples can GET/PATCH a known case by record id.
      id: 'a4d1f9c2-3b7e-4e18-9c2a-8f6b1d0e5a73',
      owned_by: 'caseworker1',
      registration_date: '2024-01-15',
      data: {
        name_first: 'Jane',
        name_last: 'Doe',
        age: 12,
        sex: 'female',
        protection_concerns: ['neglect'],
        risk_level: 'high',
      },
    }),
    makeCase({
      seq: 2,
      owned_by: 'caseworker2',
      registration_date: '2024-02-03',
      data: {
        name_first: 'Kofi',
        name_last: 'Mensah',
        age: 9,
        sex: 'male',
        protection_concerns: ['abandonment'],
        risk_level: 'medium',
      },
    }),
    makeCase({
      seq: 3,
      owned_by: 'caseworker1',
      registration_date: '2024-03-21',
      data: {
        name_first: 'Amina',
        name_last: 'Sesay',
        age: 15,
        sex: 'female',
        protection_concerns: ['sexual_abuse', 'exploitation'],
        risk_level: 'high',
      },
    }),
    makeCase({
      seq: 4,
      owned_by: 'caseworker3',
      registration_date: '2024-04-10',
      data: {
        name_first: 'Samuel',
        name_last: 'Kamara',
        age: 7,
        sex: 'male',
        protection_concerns: ['physical_abuse'],
        risk_level: 'low',
      },
    }),
  ];

  for (const c of cases) store.create('cases', c.id, c);

  const incidents = [
    makeIncident({
      seq: 1,
      owned_by: 'caseworker1',
      case_id: cases[0].case_id,
      data: {
        incident_date: '2024-01-20',
        description: 'Child found without adequate care at home.',
        cp_incident_violence_type: 'neglect',
      },
    }),
    makeIncident({
      seq: 2,
      owned_by: 'caseworker1',
      case_id: cases[2].case_id,
      data: {
        incident_date: '2024-03-25',
        description: 'Reported exploitation at place of work.',
        cp_incident_violence_type: 'exploitation',
      },
    }),
  ];

  for (const inc of incidents) store.create('incidents', inc.id, inc);

  // Referrals linked to seeded cases (getReferrals / withReferrals).
  const referrals = [
    makeReferral({ caseRecordId: cases[0].id, transitioned_to: 'social_worker2', notes: 'Home visit needed.' }),
    makeReferral({ caseRecordId: cases[2].id, transitioned_to: 'health_worker1', notes: 'Medical assessment.' }),
  ];
  for (const ref of referrals) store.create('referrals', ref.id, ref);

  // Forms (getForms).
  const forms = [
    { id: 1, unique_id: 'basic_identity', name: { en: 'Basic Identity' }, module_ids: ['primeromodule-cp'], parent_form: 'case' },
    { id: 2, unique_id: 'family_details', name: { en: 'Family Details' }, module_ids: ['primeromodule-cp'], parent_form: 'case' },
    { id: 3, unique_id: 'protection_concerns', name: { en: 'Protection Concerns' }, module_ids: ['primeromodule-cp'], parent_form: 'case' },
  ];
  for (const f of forms) store.create('forms', String(f.id), f);

  // Lookups (getLookups).
  const lookups = [
    {
      id: 1,
      unique_id: 'lookup-risk-level',
      name: { en: 'Risk Level' },
      values: [
        { id: 'high', display_text: { en: 'High' } },
        { id: 'medium', display_text: { en: 'Medium' } },
        { id: 'low', display_text: { en: 'Low' } },
      ],
    },
    {
      id: 2,
      unique_id: 'lookup-protection-concerns',
      name: { en: 'Protection Concerns' },
      values: [
        { id: 'neglect', display_text: { en: 'Neglect' } },
        { id: 'abandonment', display_text: { en: 'Abandonment' } },
        { id: 'sexual_abuse', display_text: { en: 'Sexual Abuse' } },
      ],
    },
  ];
  for (const l of lookups) store.create('lookups', String(l.id), l);

  // Locations (getLocations).
  const locations = [
    { id: 1, code: 'SL', type: 'country', name: { en: 'Sierra Leone' }, admin_level: 0, hierarchy_path: 'SL' },
    { id: 2, code: 'SL01', type: 'province', name: { en: 'Southern Province' }, admin_level: 1, hierarchy_path: 'SL.SL01' },
    { id: 3, code: 'SL0101', type: 'district', name: { en: 'Bo' }, admin_level: 2, hierarchy_path: 'SL.SL01.SL0101' },
  ];
  for (const loc of locations) store.create('locations', String(loc.id), loc);
}
