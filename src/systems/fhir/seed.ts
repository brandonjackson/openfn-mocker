import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/** Default apiPath segment FHIR routes live under (config.apiPath overrides). */
export const DEFAULT_API_PATH = 'fhir';

/** Resource types this mock knows how to seed. */
export const RESOURCE_TYPES = ['Patient', 'Encounter', 'Observation', 'Condition'] as const;

/** Current instant as an ISO-8601 string (FHIR instant/dateTime). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Build a FHIR `meta` element with a versionId + lastUpdated instant. */
export function makeMeta(versionId = '1'): Record<string, any> {
  return { versionId, lastUpdated: nowIso() };
}

/**
 * Seed a handful of valid R4 resources: 3 Patients, 2 Encounters,
 * 2 Observations, 1 Condition. Each carries an id + meta so it reads back and
 * appears in search Bundles. Encounters/Observations/Condition reference the
 * seeded Patients via `subject`.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const patients = [
    {
      resourceType: 'Patient',
      id: 'pat-1',
      meta: makeMeta(),
      identifier: [{ system: 'http://example.org/mrn', value: 'MRN-001' }],
      active: true,
      name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
      telecom: [{ system: 'phone', value: '+232-76-000001', use: 'mobile' }],
      gender: 'female',
      birthDate: '1996-03-15',
      address: [{ city: 'Ngelehun', country: 'Sierra Leone' }],
    },
    {
      resourceType: 'Patient',
      id: 'pat-2',
      meta: makeMeta(),
      identifier: [{ system: 'http://example.org/mrn', value: 'MRN-002' }],
      active: true,
      name: [{ use: 'official', family: 'Smith', given: ['John', 'A'] }],
      gender: 'male',
      birthDate: '1988-07-22',
      address: [{ city: 'Bo', country: 'Sierra Leone' }],
    },
    {
      resourceType: 'Patient',
      id: 'pat-3',
      meta: makeMeta(),
      identifier: [{ system: 'http://example.org/mrn', value: 'MRN-003' }],
      active: true,
      name: [{ use: 'official', family: 'Kamara', given: ['Aminata'] }],
      gender: 'female',
      birthDate: '2010-11-05',
      address: [{ city: 'Kenema', country: 'Sierra Leone' }],
    },
  ];

  const encounters = [
    {
      resourceType: 'Encounter',
      id: 'enc-1',
      meta: makeMeta(),
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      },
      type: [
        {
          coding: [{ system: 'http://snomed.info/sct', code: '162673000', display: 'General examination of patient' }],
        },
      ],
      subject: { reference: 'Patient/pat-1', display: 'Jane Doe' },
      period: { start: '2024-02-01T09:00:00Z', end: '2024-02-01T09:30:00Z' },
    },
    {
      resourceType: 'Encounter',
      id: 'enc-2',
      meta: makeMeta(),
      status: 'in-progress',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter',
      },
      subject: { reference: 'Patient/pat-2', display: 'John Smith' },
      period: { start: '2024-03-10T14:00:00Z' },
    },
  ];

  const observations = [
    {
      resourceType: 'Observation',
      id: 'obs-1',
      meta: makeMeta(),
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }],
        text: 'Heart rate',
      },
      subject: { reference: 'Patient/pat-1', display: 'Jane Doe' },
      encounter: { reference: 'Encounter/enc-1' },
      effectiveDateTime: '2024-02-01T09:05:00Z',
      valueQuantity: {
        value: 80,
        unit: 'beats/minute',
        system: 'http://unitsofmeasure.org',
        code: '/min',
      },
    },
    {
      resourceType: 'Observation',
      id: 'obs-2',
      meta: makeMeta(),
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: 'http://loinc.org', code: '8310-5', display: 'Body temperature' }],
        text: 'Body temperature',
      },
      subject: { reference: 'Patient/pat-2', display: 'John Smith' },
      encounter: { reference: 'Encounter/enc-2' },
      effectiveDateTime: '2024-03-10T14:15:00Z',
      valueQuantity: {
        value: 37.2,
        unit: 'C',
        system: 'http://unitsofmeasure.org',
        code: 'Cel',
      },
    },
  ];

  const conditions = [
    {
      resourceType: 'Condition',
      id: 'cond-1',
      meta: makeMeta(),
      clinicalStatus: {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' },
        ],
      },
      verificationStatus: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
            code: 'confirmed',
            display: 'Confirmed',
          },
        ],
      },
      code: {
        coding: [{ system: 'http://snomed.info/sct', code: '38341003', display: 'Hypertensive disorder' }],
        text: 'Hypertension',
      },
      subject: { reference: 'Patient/pat-1', display: 'Jane Doe' },
      onsetDateTime: '2023-12-01',
    },
  ];

  for (const p of patients) store.create('Patient', p.id, p);
  for (const e of encounters) store.create('Encounter', e.id, e);
  for (const o of observations) store.create('Observation', o.id, o);
  for (const c of conditions) store.create('Condition', c.id, c);
}
