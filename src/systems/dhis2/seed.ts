import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Generate a DHIS2 uid: 11 characters, the first a letter, the remaining ten
 * from [A-Za-z0-9]. Matches the format DHIS2 assigns to every metadata and
 * tracker object.
 */
export function genUid(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const alnum = letters + '0123456789';
  let uid = letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 10; i++) uid += alnum[Math.floor(Math.random() * alnum.length)];
  return uid;
}

/**
 * Seed realistic DHIS2 metadata: a 3-level org unit hierarchy
 * (national -> regional -> facility), one program with two stages, five data
 * elements (each with a valueType), and two tracked entity types.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const now = new Date().toISOString();
  // DHIS2 dates are ISO-8601 instants; `openingDate` is a date-time like every
  // other, not a bare calendar date.
  const epoch = '1970-01-01T00:00:00.000Z';

  // --- Organisation units: national -> regional -> facility ---
  const nationalId = 'ImspTQPwCqd';
  const regionalId = 'O6uvpzGd5pu';
  const facilityId = 'DiszpKrYNg8';

  store.create('organisationUnits', nationalId, {
    id: nationalId,
    name: 'Sierra Leone',
    shortName: 'Sierra Leone',
    level: 1,
    path: `/${nationalId}`,
    openingDate: epoch,
    // Org units are not aggregated data items; a metadata export carries NONE.
    aggregationType: 'NONE',
    created: now,
    lastUpdated: now,
  });
  store.create('organisationUnits', regionalId, {
    id: regionalId,
    name: 'Bo',
    shortName: 'Bo',
    level: 2,
    path: `/${nationalId}/${regionalId}`,
    parent: { id: nationalId },
    openingDate: epoch,
    // Org units are not aggregated data items; a metadata export carries NONE.
    aggregationType: 'NONE',
    created: now,
    lastUpdated: now,
  });
  store.create('organisationUnits', facilityId, {
    id: facilityId,
    name: 'Ngelehun CHC',
    shortName: 'Ngelehun',
    level: 3,
    path: `/${nationalId}/${regionalId}/${facilityId}`,
    parent: { id: regionalId },
    openingDate: epoch,
    // Org units are not aggregated data items; a metadata export carries NONE.
    aggregationType: 'NONE',
    created: now,
    lastUpdated: now,
  });

  // --- Data elements (each with a valueType) ---
  const dataElements = [
    { id: 'fbfJHSPpUQD', name: 'ANC 1st visit', shortName: 'ANC 1st visit', valueType: 'NUMBER', domainType: 'AGGREGATE' },
    { id: 'cYeuwXTCPkU', name: 'ANC 2nd visit', shortName: 'ANC 2nd visit', valueType: 'NUMBER', domainType: 'AGGREGATE' },
    { id: 'qrur9Dvnyt5', name: 'Age in years', shortName: 'Age', valueType: 'INTEGER', domainType: 'TRACKER' },
    { id: 'a3kGcGDCuk6', name: 'MCH Apgar Score', shortName: 'Apgar', valueType: 'INTEGER', domainType: 'TRACKER' },
    { id: 'X8zyunlgUfM', name: 'Infant Feeding', shortName: 'Feeding', valueType: 'TEXT', domainType: 'TRACKER' },
  ];
  for (const de of dataElements) {
    store.create('dataElements', de.id, { ...de, created: now, lastUpdated: now });
  }

  // --- Program with two stages ---
  const programId = 'IpHINAT79UW';
  store.create('programs', programId, {
    id: programId,
    name: 'Child Programme',
    shortName: 'Child Programme',
    programType: 'WITH_REGISTRATION',
    // A program carries its access and search settings inline; DHIS2 marks all
    // of these required on the resource.
    accessLevel: 'OPEN',
    featureType: 'NONE',
    version: 5,
    expiryDays: 0,
    completeEventsExpiryDays: 0,
    openDaysAfterCoEndDate: 0,
    maxTeiCountToReturn: 0,
    minAttributesRequiredToSearch: 1,
    // Nested metadata comes back as an id-only reference, as DHIS2 returns it
    // when no `fields` are requested.
    trackedEntityType: { id: 'nEenWmSyUEp' },
    created: now,
    lastUpdated: now,
    programStages: [
      { id: 'A03MvHHogjR', name: 'Birth', sortOrder: 1, repeatable: false },
      { id: 'ZzYYXq4fJie', name: 'Baby Postnatal', sortOrder: 2, repeatable: false },
    ],
  });

  // --- Tracked entity types ---
  const trackedEntityType = (id: string, name: string) => ({
    id,
    name,
    featureType: 'NONE',
    maxTeiCountToReturn: 0,
    minAttributesRequiredToSearch: 1,
    created: now,
    lastUpdated: now,
  });
  store.create('trackedEntityTypes', 'nEenWmSyUEp', trackedEntityType('nEenWmSyUEp', 'Person'));
  store.create('trackedEntityTypes', 'MCPQUTHX1Ze', trackedEntityType('MCPQUTHX1Ze', 'Building'));
}
