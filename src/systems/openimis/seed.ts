import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * openIMIS seed (health-insurance Digital Public Good). openIMIS exposes a FHIR
 * R4 API (api_fhir_r4) where insurees are Patients, policies are Contracts and
 * benefits are Coverages/Claims. A small, cross-referenced set is seeded so the
 * openimis adaptor's getFHIR reads return realistic bundles.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('Patient', 'insuree-0001', {
    resourceType: 'Patient',
    id: 'insuree-0001',
    identifier: [
      { type: { coding: [{ system: 'https://openimis.github.io/openimis_fhir_r4_ig/CodeSystem/patient-identifier', code: 'Code' }] }, value: '070707070' },
    ],
    name: [{ use: 'official', family: 'Doe', given: ['Jane'] }],
    gender: 'female',
    birthDate: '1990-04-12',
    address: [{ district: 'Bo', state: 'Southern', country: 'SL' }],
  });
  store.create('Patient', 'insuree-0002', {
    resourceType: 'Patient',
    id: 'insuree-0002',
    identifier: [{ value: '080808080' }],
    name: [{ use: 'official', family: 'Kamara', given: ['Amina'] }],
    gender: 'female',
    birthDate: '1985-09-30',
    address: [{ district: 'Kenema', state: 'Eastern', country: 'SL' }],
  });

  store.create('Contract', 'policy-0001', {
    resourceType: 'Contract',
    id: 'policy-0001',
    status: 'executed',
    subject: [{ reference: 'Patient/insuree-0001' }],
    term: [{ asset: [{ scope: { text: 'Basic Package' } }] }],
    author: { reference: 'Organization/hf-ngelehun' },
  });

  store.create('Coverage', 'coverage-0001', {
    resourceType: 'Coverage',
    id: 'coverage-0001',
    status: 'active',
    beneficiary: { reference: 'Patient/insuree-0001' },
    payor: [{ reference: 'Organization/openimis' }],
    period: { start: '2024-01-01', end: '2024-12-31' },
  });

  store.create('Claim', 'claim-0001', {
    resourceType: 'Claim',
    id: 'claim-0001',
    status: 'active',
    use: 'claim',
    patient: { reference: 'Patient/insuree-0001' },
    created: '2024-03-15',
    provider: { reference: 'Organization/hf-ngelehun' },
    total: { value: 25.0, currency: 'USD' },
  });
}
