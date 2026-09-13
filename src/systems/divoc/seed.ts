import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * DIVOC seed (Digital Infrastructure for Vaccination & Open Credentialing — the
 * open-source digital vaccination-certificate platform).
 *
 * The divoc adaptor's only network call is certifyVaccination -> POST /v1/certify,
 * so nothing here is *required* by the adaptor; the collections exist so the
 * vaccination API's documented read endpoints (pre-enrollments, programs,
 * vaccinators, the recipient's certificate) answer with something real on first
 * boot. Record shapes follow the vendor's own `interfaces/vaccination-api.yaml`
 * (openfn-api-specs `divoc`): PreEnrollment, Program and CertificationRequest.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  // --- pre-enrollments (PreEnrollment): who is booked in for a vaccination ---
  const preEnrollments = [
    {
      code: 'PEC-10000001',
      enrollmentScopeId: 'kigali-district-hospital',
      phone: '+250788000001',
      nationalId: 'NID-10000001',
      dob: '1988-04-12',
      gender: 'Female',
      name: 'Amara Okafor',
      email: 'amara.okafor@example.rw',
      meta: { appointmentSlot: '2026-01-15T09:00:00.000Z' },
    },
    {
      code: 'PEC-10000002',
      enrollmentScopeId: 'kigali-district-hospital',
      phone: '+250788000002',
      nationalId: 'NID-10000002',
      dob: '1975-11-30',
      gender: 'Male',
      name: 'Kwame Mensah',
      email: 'kwame.mensah@example.rw',
      meta: { appointmentSlot: '2026-03-20T10:30:00.000Z' },
    },
    {
      code: 'PEC-2001',
      enrollmentScopeId: 'kigali-district-hospital',
      phone: '+250788123456',
      nationalId: 'NID-2001',
      dob: '1990-01-01',
      gender: 'Female',
      name: 'Sandbox Recipient',
      email: 'sandbox.recipient@example.rw',
      meta: {},
    },
  ];
  for (const p of preEnrollments) store.create('preEnrollments', p.code, p);

  // --- active vaccination programs (Program) ---
  const programs = [
    {
      id: 'covid-19-national',
      name: 'National COVID-19 Vaccination',
      description: 'Two-dose COVID-19 programme run across all district facilities.',
      logoURL: 'https://divoc.example/logo/covid-19.png',
      medicines: [
        {
          name: 'COVISHIELD',
          provider: 'Serum Institute of India',
          vaccinationMode: 'muscular injection',
          schedule: { repeatTimes: 2, repeatInterval: 28 },
          effectiveUntil: 6,
          status: 'Active',
          price: 0,
        },
      ],
    },
  ];
  for (const p of programs) store.create('programs', p.id, p);

  // --- vaccinators mapped to the facility ---
  // The vendor spec $refs ../registry/Vaccinator.json, a sibling file it never
  // shipped, so the response type is undocumented; these follow DIVOC's registry
  // schema as used by the portal.
  const vaccinators = [
    {
      osid: 'vaccinator-0001',
      facilityIds: ['kigali-district-hospital'],
      nationalIdentifier: 'MED-0001',
      code: 'VAC-0001',
      name: 'Dr. Jean Uwimana',
      status: 'Active',
      averageRating: 5,
      trainingCertificate: 'https://divoc.example/certificates/vaccinator-0001.pdf',
      signatures: [],
      programs: [{ programId: 'covid-19-national', certified: true, status: 'Active' }],
    },
    {
      osid: 'vaccinator-0002',
      facilityIds: ['kigali-district-hospital'],
      nationalIdentifier: 'MED-0002',
      code: 'VAC-0002',
      name: 'Dr. Sandbox',
      status: 'Active',
      averageRating: 5,
      trainingCertificate: 'https://divoc.example/certificates/vaccinator-0002.pdf',
      signatures: [],
      programs: [{ programId: 'covid-19-national', certified: true, status: 'Active' }],
    },
  ];
  for (const v of vaccinators) store.create('vaccinators', v.osid, v);

  // --- already-issued certificates (the shape POST /v1/certify accepts) ---
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
