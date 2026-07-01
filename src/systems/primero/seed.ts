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
    id: randomUUID(),
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

/** Seed 4 cases and 2 incidents. */
export function seed(store: DataStore, _config: SystemConfig): void {
  const cases = [
    makeCase({
      seq: 1,
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
}
