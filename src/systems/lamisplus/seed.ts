import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * LAMISPlus seed (an open-source HIV/AIDS electronic medical record used across
 * Nigeria). The lamisplus adaptor logs in with email + password and reads
 * patients from the EHR plugin API, which returns { data: { patients: [...] } }.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

let nextId = 1;

export function makePatient(overrides: Record<string, any> = {}): Record<string, any> {
  const id = overrides.id ?? nextId++;
  return {
    id,
    uuid: overrides.uuid ?? `patient-uuid-${id}`,
    hospitalNumber: overrides.hospitalNumber ?? `HOSP/2026/${String(id).padStart(4, '0')}`,
    firstName: overrides.firstName ?? 'Unknown',
    surname: overrides.surname ?? 'Patient',
    otherName: overrides.otherName ?? null,
    sex: overrides.sex ?? 'FEMALE',
    dateOfBirth: overrides.dateOfBirth ?? '1990-01-01',
    address: overrides.address ?? { city: 'Lagos', stateProvince: 'Lagos', country: 'Nigeria' },
    facilityId: overrides.facilityId ?? 1,
    dateRegistered: overrides.dateRegistered ?? nowIso(),
    archived: false,
    ...overrides,
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  nextId = 1;
  const patients = [
    makePatient({ firstName: 'Ngozi', surname: 'Adeyemi', sex: 'FEMALE', dateOfBirth: '1985-06-12' }),
    makePatient({ firstName: 'Chidi', surname: 'Okonkwo', sex: 'MALE', dateOfBirth: '1978-02-28' }),
    makePatient({ firstName: 'Fatima', surname: 'Bello', sex: 'FEMALE', dateOfBirth: '1993-11-04' }),
  ];
  for (const p of patients) store.create('patients', String(p.id), p);
}
