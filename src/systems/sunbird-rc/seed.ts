import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Sunbird RC seed. One Student registry record (fixed osid) and one issued
 * credential (fixed did) so the by-id lookups return data on first boot. The
 * guide's getStudent / getCred examples target these ids.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Fixed seed osid, referenced by the guide's getStudent example. */
export const SEED_OSID = 'stu-0001';
/** Fixed seed credential id, referenced by the guide's getCred example. */
export const SEED_CRED_ID = 'did:rcw:cred0001';

export function seed(store: DataStore, _config: SystemConfig): void {
  const students = [
    {
      id: SEED_OSID,
      osid: SEED_OSID,
      name: 'Ravi Kumar',
      grade: '6',
      createdAt: nowIso(),
    },
  ];
  for (const s of students) store.create('Student', s.osid, s);

  const credentials = [
    {
      id: SEED_CRED_ID,
      credential: {
        credentialSubject: { id: 'did:rcw:cred0001', name: 'Ravi Kumar' },
        type: ['VerifiableCredential'],
      },
      credentialSchemaId: 'schema-1',
      createdAt: nowIso(),
    },
  ];
  for (const c of credentials) store.create('credentials', c.id, c);
}
