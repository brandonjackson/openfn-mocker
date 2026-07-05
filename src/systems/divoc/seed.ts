import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * DIVOC seed (Digital Infrastructure for Vaccination & Open Certification — the
 * open-source digital vaccination-certificate platform). The divoc adaptor's
 * only network call is certifyVaccination -> POST /v1/certify, so there is no
 * read function; we still seed a couple of issued certificates so the sandbox's
 * convenience read endpoints return something on first boot.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const certificates = [
    {
      certificateId: 'cert-10000001',
      preEnrollmentCode: 'PEC-10000001',
      recipient: {
        name: 'Amara Okafor',
        contact: ['tel:+250788000001'],
        dob: '1988-04-12',
        gender: 'Female',
        nationality: 'Rwanda',
      },
      vaccination: {
        name: 'COVISHIELD',
        manufacturer: 'Serum Institute of India',
        batch: 'B-4120',
        dose: 1,
        totalDoses: 2,
        date: '2026-01-15T09:00:00.000Z',
        effectiveStart: '2026-01-15',
        effectiveUntil: '2026-07-15',
      },
      vaccinator: { name: 'Dr. Jean Uwimana' },
      facility: {
        name: 'Kigali District Hospital',
        address: { addressLine1: 'KN 4 Ave', district: 'Nyarugenge', city: 'Kigali', country: 'RW' },
      },
      createdAt: nowIso(),
    },
    {
      certificateId: 'cert-10000002',
      preEnrollmentCode: 'PEC-10000002',
      recipient: {
        name: 'Kwame Mensah',
        contact: ['tel:+250788000002'],
        dob: '1975-11-30',
        gender: 'Male',
        nationality: 'Rwanda',
      },
      vaccination: {
        name: 'COVISHIELD',
        manufacturer: 'Serum Institute of India',
        batch: 'B-4120',
        dose: 2,
        totalDoses: 2,
        date: '2026-03-20T10:30:00.000Z',
        effectiveStart: '2026-03-20',
        effectiveUntil: '2026-09-20',
      },
      vaccinator: { name: 'Dr. Jean Uwimana' },
      facility: {
        name: 'Kigali District Hospital',
        address: { addressLine1: 'KN 4 Ave', district: 'Nyarugenge', city: 'Kigali', country: 'RW' },
      },
      createdAt: nowIso(),
    },
  ];
  for (const c of certificates) store.create('certificates', c.certificateId, c);
}
