import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Go.Data (WHO outbreak investigation) seed. One COVID-19 outbreak in Sierra
 * Leone with a handful of cases and contacts, a small location tree, and a
 * couple of reference-data entries — matching the resources the OpenFn godata
 * adaptor reads/upserts (outbreaks, cases, contacts, locations, reference-data).
 */

export const LOGIN_TOKEN = 'mock_godata_token';

/** Go.Data ids are lowercase uuids; the seed uses stable readable ones. */
export function makeId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const outbreakId = 'ob-sl-covid19';
  store.create('outbreaks', outbreakId, {
    id: outbreakId,
    name: 'COVID-19 Sierra Leone',
    disease: 'covid-19',
    countries: [{ id: 'LOC-SL' }],
    startDate: '2021-01-01T00:00:00.000Z',
    description: 'National COVID-19 outbreak investigation.',
    caseIdMask: 'CASE-9999',
    contactIdMask: 'CONT-9999',
  });

  const cases = [
    { id: 'case-0001', firstName: 'Jane', lastName: 'Doe', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE', classification: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_CONFIRMED', dateOfReporting: '2021-02-10T00:00:00.000Z', visualId: 'CASE-0001' },
    { id: 'case-0002', firstName: 'John', lastName: 'Smith', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_MALE', classification: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_PROBABLE', dateOfReporting: '2021-02-12T00:00:00.000Z', visualId: 'CASE-0002' },
    { id: 'case-0003', firstName: 'Amina', lastName: 'Kamara', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE', classification: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_CONFIRMED', dateOfReporting: '2021-02-15T00:00:00.000Z', visualId: 'CASE-0003' },
  ];
  for (const c of cases) store.create('cases', c.id, { ...c, outbreakId });

  const contacts = [
    { id: 'cont-0001', firstName: 'Mohamed', lastName: 'Kamara', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_MALE', dateOfReporting: '2021-02-16T00:00:00.000Z', visualId: 'CONT-0001', riskLevel: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_HIGH' },
    { id: 'cont-0002', firstName: 'Fatmata', lastName: 'Sesay', gender: 'LNG_REFERENCE_DATA_CATEGORY_GENDER_FEMALE', dateOfReporting: '2021-02-17T00:00:00.000Z', visualId: 'CONT-0002', riskLevel: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_MEDIUM' },
  ];
  for (const c of contacts) store.create('contacts', c.id, { ...c, outbreakId });

  const locations = [
    { id: 'LOC-SL', name: 'Sierra Leone', parentLocationId: null, geographicalLevelId: 'LNG_REFERENCE_DATA_CATEGORY_LOCATION_GEOGRAPHICAL_LEVEL_ADMIN_LEVEL_0' },
    { id: 'LOC-BO', name: 'Bo District', parentLocationId: 'LOC-SL', geographicalLevelId: 'LNG_REFERENCE_DATA_CATEGORY_LOCATION_GEOGRAPHICAL_LEVEL_ADMIN_LEVEL_1' },
    { id: 'LOC-NGELEHUN', name: 'Ngelehun', parentLocationId: 'LOC-BO', geographicalLevelId: 'LNG_REFERENCE_DATA_CATEGORY_LOCATION_GEOGRAPHICAL_LEVEL_ADMIN_LEVEL_2' },
  ];
  for (const l of locations) store.create('locations', l.id, l);

  const referenceData = [
    { id: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_CONFIRMED', categoryId: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION', value: 'Confirmed', active: true },
    { id: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION_PROBABLE', categoryId: 'LNG_REFERENCE_DATA_CATEGORY_CASE_CLASSIFICATION', value: 'Probable', active: true },
    { id: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL_HIGH', categoryId: 'LNG_REFERENCE_DATA_CATEGORY_RISK_LEVEL', value: 'High', active: true },
  ];
  for (const r of referenceData) store.create('referenceData', r.id, r);
}
