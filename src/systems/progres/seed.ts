import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * proGres seed. A couple of already-registered individuals (fixed proGres IDs) so
 * GET /api/v4/individuals and lookups by ID return data on boot.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const now = new Date().toISOString();
  const individuals = [
    {
      progresId: '900000001',
      individualGuid: '11111111-1111-4111-8111-111111111111',
      givenName: 'Amara',
      familyName: 'Okoye',
      dateOfBirth: '1990-01-01',
      sex: 'F',
      countryOfOrigin: 'NGA',
      status: 'REGISTERED',
      registeredAt: now,
    },
    {
      progresId: '900000002',
      individualGuid: '22222222-2222-4222-8222-222222222222',
      givenName: 'Yusuf',
      familyName: 'Diallo',
      dateOfBirth: '1985-07-14',
      sex: 'M',
      countryOfOrigin: 'MLI',
      status: 'REGISTERED',
      registeredAt: now,
    },
  ];
  for (const i of individuals) store.create('individuals', i.progresId, i);
}
