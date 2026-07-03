import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';
import { makeMeta } from '../shared/fhir.js';

/**
 * SATUSEHAT seed — Indonesia's national health-data platform speaks FHIR R4
 * under /fhir-r4/v1. A small, cross-referenced set (an Organization/facility,
 * two Patients and a Practitioner) is seeded so the satusehat adaptor's get()
 * reads return realistic resources and searchset Bundles on first boot.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('Organization', '10000001', {
    resourceType: 'Organization',
    id: '10000001',
    meta: makeMeta('1'),
    identifier: [
      { system: 'http://sys-ids.kemkes.go.id/organization/10000001', value: '10000001' },
    ],
    active: true,
    type: [
      {
        coding: [
          { system: 'http://terminology.hl7.org/CodeSystem/organization-type', code: 'prov', display: 'Healthcare Provider' },
        ],
      },
    ],
    name: 'RS Umum Daerah Sehat Sentosa',
    telecom: [{ system: 'phone', value: '+62215678900', use: 'work' }],
  });

  store.create('Patient', 'P02478375123', {
    resourceType: 'Patient',
    id: 'P02478375123',
    meta: makeMeta('1'),
    identifier: [
      { use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: '3175031201990001' },
    ],
    active: true,
    name: [{ use: 'official', text: 'Budi Santoso', family: 'Santoso', given: ['Budi'] }],
    gender: 'male',
    birthDate: '1990-01-12',
    address: [{ use: 'home', city: 'Jakarta Timur', country: 'ID' }],
  });

  store.create('Patient', 'P02478375124', {
    resourceType: 'Patient',
    id: 'P02478375124',
    meta: makeMeta('1'),
    identifier: [
      { use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: '3175031201990002' },
    ],
    active: true,
    name: [{ use: 'official', text: 'Siti Rahayu', family: 'Rahayu', given: ['Siti'] }],
    gender: 'female',
    birthDate: '1988-06-30',
    address: [{ use: 'home', city: 'Bandung', country: 'ID' }],
  });

  store.create('Practitioner', 'N10000001', {
    resourceType: 'Practitioner',
    id: 'N10000001',
    meta: makeMeta('1'),
    identifier: [
      { use: 'official', system: 'https://fhir.kemkes.go.id/id/nakes', value: 'N10000001' },
    ],
    active: true,
    name: [{ use: 'official', text: 'dr. Andi Wijaya', family: 'Wijaya', given: ['Andi'] }],
    gender: 'male',
  });
}
