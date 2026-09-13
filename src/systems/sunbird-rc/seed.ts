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
/** The mock registry's issuer DID — every credential it signs claims this issuer. */
export const ISSUER_DID = 'did:rcw:mock-issuer';

export interface BuildCredentialOpts {
  id: string;
  credentialSubject: Record<string, any>;
  credentialSchemaId?: string | null;
  tags?: string[];
  createdAt?: string;
}

/**
 * A Sunbird-RC `credentialResponse`: the signed verifiable credential plus the
 * registry's own bookkeeping. `POST /credentials/issue` returns this (201) and
 * `GET /credentials/{id}` returns the `credential` inside it, so both come from
 * one builder. The VC carries the W3C fields a real issuance returns — context,
 * id, type, issuer, issuanceDate, credentialSubject and a proof.
 */
export function buildCredential(opts: BuildCredentialOpts): Record<string, any> {
  const createdAt = opts.createdAt ?? nowIso();
  return {
    credential: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      id: opts.id,
      type: ['VerifiableCredential'],
      issuer: { id: ISSUER_DID },
      issuanceDate: createdAt,
      credentialSubject: opts.credentialSubject,
      proof: {
        type: 'Ed25519Signature2020',
        created: createdAt,
        proofPurpose: 'assertionMethod',
        verificationMethod: `${ISSUER_DID}#key-0`,
        proofValue: 'z3FXQjecWufY46yg5abdVZsXqLhxhueuSoZgNSizfN1L5o8dvcAJ9Q',
      },
    },
    credentialSchemaId: opts.credentialSchemaId ?? null,
    tags: opts.tags ?? [],
    createdAt,
    updatedAt: createdAt,
    createdBy: ISSUER_DID,
    updatedBy: ISSUER_DID,
  };
}

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
    buildCredential({
      id: SEED_CRED_ID,
      credentialSubject: { id: SEED_CRED_ID, name: 'Ravi Kumar', grade: '6' },
      credentialSchemaId: 'schema-1',
    }),
  ];
  // Keyed by the credential's own did — the id getCredential / downloadCredential take.
  for (const c of credentials) store.create('credentials', c.credential.id, c);
}
