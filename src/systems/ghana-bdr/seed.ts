import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ghana BDR seed. A couple of already-registered birth notifications so
 * GET /api/notification returns data on first boot.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const now = new Date().toISOString();
  const notifications = [
    {
      birth_certificate_number: '011803-48-2024',
      first_name: 'Kharis',
      middle_name: '',
      Surname: 'Osei',
      birth_date: '2024/03/05',
      gender: 'FEMALE',
      m_first_name: 'Gifty',
      m_national_id_number: 'GHA-000000000-2',
      f_first_name: 'Nyarkoa',
      f_national_id_number: '',
      reference_id: 'abc123de-1995',
      registry_code: '011803',
      created_at: now,
      last_updated_at: null,
      issuccessful: true,
      message: 'record reference_id : abc123de-1995 , created successfully',
      messagecode: '200',
    },
    {
      birth_certificate_number: '011803-49-2024',
      first_name: 'Kwame',
      middle_name: '',
      Surname: 'Mensah',
      birth_date: '2024/05/12',
      gender: 'MALE',
      m_first_name: 'Akua',
      m_national_id_number: 'GHA-000112233-1',
      f_first_name: 'Kofi',
      f_national_id_number: 'GHA-000445566-2',
      reference_id: 'def456gh-2001',
      registry_code: '011803',
      created_at: now,
      last_updated_at: null,
      issuccessful: true,
      message: 'record reference_id : def456gh-2001 , created successfully',
      messagecode: '200',
    },
  ];
  for (const n of notifications) store.create('notifications', n.reference_id, n);
}
