import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ghana NIA seed. A couple of already-minted baby registrations (fixed PINs) so
 * GET /awopa/api/v1/baby/registration and lookups by PIN return data on boot.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const now = new Date().toISOString();
  const registrations = [
    {
      babyPin: 'GHA-001097272-1',
      voucherPin: 'GHA-001097272-4',
      etrackerLightwaveId: '00313180/24-03',
      lightwaveEtrackerId: null,
      babyData: { forenames: 'Kharis', surname: 'Osei', gender: 'Female', dateOfBirth: '2024-03-05' },
      personVouching: { ghanaCardPIN: 'GHA-001097272-4', relationToBaby: 'Mother' },
      createdAt: now,
    },
    {
      babyPin: 'GHA-002145887-1',
      voucherPin: 'GHA-002145887-4',
      etrackerLightwaveId: '00417220/24-05',
      lightwaveEtrackerId: null,
      babyData: { forenames: 'Kwame', surname: 'Mensah', gender: 'Male', dateOfBirth: '2024-05-12' },
      personVouching: { ghanaCardPIN: 'GHA-000998877-3', relationToBaby: 'Father' },
      createdAt: now,
    },
  ];
  for (const r of registrations) store.create('registrations', r.babyPin, r);
}
