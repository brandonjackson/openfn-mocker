import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Ghana BDR seed. A couple of already-registered birth records so the list and
 * by-reference reads return data on first boot.
 *
 * Record fields follow openfn-api-specs' `ghana-bdr/BirthNotificationResponse`
 * (the registry's certificate record); `toBirthRecord` below builds the same
 * shape from a posted notification, so seeded and freshly created records are
 * indistinguishable to a workflow.
 */

/** The registration payload `createBirthRecord` posts: registry_code + child/mother/father. */
export interface BirthNotification {
  registry_code?: string;
  child?: Record<string, any>;
  mother?: Record<string, any>;
  father?: Record<string, any>;
}

/**
 * Build a certificate record from a posted birth notification. `gender_code`
 * '1' is MALE and anything else FEMALE, matching the registry's encoding.
 */
export function toBirthRecord(
  data: BirthNotification,
  ids: { certificateNumber: string; referenceId: string }
): Record<string, any> {
  const child = data.child ?? {};
  const mother = data.mother ?? {};
  const father = data.father ?? {};
  return {
    birth_certificate_number: ids.certificateNumber,
    first_name: child.first_name ?? '',
    middle_name: child.middle_name ?? '',
    Surname: child.Surname ?? '',
    birth_date: child.birth_date ?? '',
    gender: child.gender_code === '1' ? 'MALE' : 'FEMALE',
    m_first_name: mother.first_name ?? '',
    m_national_id_number: mother.national_id_number ?? '',
    f_first_name: father.first_name ?? '',
    f_national_id_number: father.national_id_number ?? '',
    reference_id: ids.referenceId,
    registry_code: data.registry_code ?? '',
    created_at: new Date().toISOString(),
    last_updated_at: null,
    issuccessful: true,
    message: `record reference_id : ${ids.referenceId} , created successfully`,
    messagecode: '200',
  };
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const records = [
    toBirthRecord(
      {
        registry_code: '011803',
        child: { first_name: 'Kharis', Surname: 'Osei', birth_date: '2024/03/05', gender_code: '2' },
        mother: { first_name: 'Gifty', national_id_number: 'GHA-000000000-2' },
        father: { first_name: 'Nyarkoa' },
      },
      { certificateNumber: '011803-48-2024', referenceId: 'abc123de-1995' }
    ),
    toBirthRecord(
      {
        registry_code: '011803',
        child: { first_name: 'Kwame', Surname: 'Mensah', birth_date: '2024/05/12', gender_code: '1' },
        mother: { first_name: 'Akua', national_id_number: 'GHA-000112233-1' },
        father: { first_name: 'Kofi', national_id_number: 'GHA-000445566-2' },
      },
      { certificateNumber: '011803-49-2024', referenceId: 'def456gh-2001' }
    ),
  ];
  for (const r of records) store.create('birthRecords', r.reference_id, r);
}
