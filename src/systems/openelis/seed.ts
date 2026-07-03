import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * OpenELIS Global seed (laboratory-information Digital Public Good). OpenELIS
 * Global 2.x exposes a FHIR R4 API where lab work is modelled as ServiceRequests
 * (orders), Specimens, Observations (results) and DiagnosticReports, all tied to
 * a Patient. A small malaria/ANC lab scenario is seeded.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('Patient', 'pat-0001', {
    resourceType: 'Patient',
    id: 'pat-0001',
    identifier: [{ system: 'openelis', value: 'LAB-000001' }],
    name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
    gender: 'female',
    birthDate: '1990-04-12',
  });

  store.create('ServiceRequest', 'order-0001', {
    resourceType: 'ServiceRequest',
    id: 'order-0001',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/pat-0001' },
    code: { coding: [{ system: 'http://loinc.org', code: '32700-7', display: 'Malaria smear' }] },
    authoredOn: '2024-03-15T09:00:00.000Z',
  });

  store.create('Specimen', 'spec-0001', {
    resourceType: 'Specimen',
    id: 'spec-0001',
    status: 'available',
    type: { coding: [{ system: 'http://snomed.info/sct', code: '119297000', display: 'Blood specimen' }] },
    subject: { reference: 'Patient/pat-0001' },
    receivedTime: '2024-03-15T09:30:00.000Z',
    request: [{ reference: 'ServiceRequest/order-0001' }],
  });

  store.create('Observation', 'obs-0001', {
    resourceType: 'Observation',
    id: 'obs-0001',
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '32700-7', display: 'Malaria smear' }] },
    subject: { reference: 'Patient/pat-0001' },
    specimen: { reference: 'Specimen/spec-0001' },
    valueCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '260385009', display: 'Negative' }] },
    effectiveDateTime: '2024-03-15T11:00:00.000Z',
  });

  store.create('DiagnosticReport', 'report-0001', {
    resourceType: 'DiagnosticReport',
    id: 'report-0001',
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '32700-7', display: 'Malaria smear' }] },
    subject: { reference: 'Patient/pat-0001' },
    result: [{ reference: 'Observation/obs-0001' }],
    issued: '2024-03-15T11:05:00.000Z',
  });
}
