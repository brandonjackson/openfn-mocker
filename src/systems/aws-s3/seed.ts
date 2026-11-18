import { createHash } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/** The bucket the credential's `bucket` field names, and the one virtual-hosted requests default to. */
export const BUCKET = 'mock-bucket';
export const REGION = 'us-east-1';

/** S3's ETag for a single-part upload: the quoted hex MD5 of the bytes. */
export function etagOf(bytes: Buffer): string {
  return `"${createHash('md5').update(bytes).digest('hex')}"`;
}

/** An S3 object as the mock stores it (key is `<bucket>/<objectKey>`). */
export interface S3Object {
  bucket: string;
  key: string;
  base64: string;
  contentType: string;
  size: number;
  etag: string;
  lastModified: string;
}

export function objectRecord(bucket: string, key: string, bytes: Buffer, contentType: string, lastModified = new Date()): S3Object {
  return {
    bucket,
    key,
    base64: bytes.toString('base64'),
    contentType,
    size: bytes.length,
    etag: etagOf(bytes),
    lastModified: new Date(Math.floor(lastModified.getTime() / 1000) * 1000).toISOString(),
  };
}

/**
 * Amazon S3 seed: one bucket of the kind an OpenFn workflow drops data into —
 * JSON payloads from a form system under `submissions/`, a partner's CSV drop
 * under `incoming/`, a mapping file under `config/`, a CSV export under
 * `exports/` and a plain-text readme at the top level. `get()` JSON-parses an
 * object when it can, so the JSON ones come back as data and the CSV as base64.
 */
export function seed(store: DataStore, _config: SystemConfig): void {
  const put = (key: string, body: string, contentType: string, date: string) =>
    store.create('objects', `${BUCKET}/${key}`, objectRecord(BUCKET, key, Buffer.from(body), contentType, new Date(date)));

  put('README.txt', 'Drop zone for OpenFn integration payloads.\n', 'text/plain', '2026-09-01T08:00:00Z');
  put(
    'submissions/2026-11-01/visit-0001.json',
    JSON.stringify({ visitId: 'visit-0001', facility: 'Kibera Health Centre', patientId: 'P-10233', date: '2026-11-01', vitals: { temperature: 37.2, weight: 61.5 } }),
    'application/json',
    '2026-11-01T09:12:44Z'
  );
  put(
    'submissions/2026-11-01/visit-0002.json',
    JSON.stringify({ visitId: 'visit-0002', facility: 'Kibera Health Centre', patientId: 'P-10298', date: '2026-11-01', vitals: { temperature: 38.4, weight: 14.2 } }),
    'application/json',
    '2026-11-01T10:03:10Z'
  );
  put(
    'submissions/2026-11-02/visit-0003.json',
    JSON.stringify({ visitId: 'visit-0003', facility: 'Mathare North Clinic', patientId: 'P-10301', date: '2026-11-02', vitals: { temperature: 36.8, weight: 72.0 } }),
    'application/json',
    '2026-11-02T07:45:31Z'
  );
  put(
    'config/facility-mappings.json',
    JSON.stringify({ KHC: { dhis2OrgUnit: 'ImspTQPwCqd', name: 'Kibera Health Centre' }, MNC: { dhis2OrgUnit: 'O6uvpzGd5pu', name: 'Mathare North Clinic' } }),
    'application/json',
    '2026-08-20T12:00:00Z'
  );
  put(
    'incoming/2026-11/enrolment.csv',
    'beneficiary_id,name,district\nB-0001,Achieng Otieno,Kibra\nB-0002,Wanjiru Kamau,Mathare\n',
    'text/csv',
    '2026-11-03T06:30:00Z'
  );
  put('exports/facilities.csv', 'facility_id,name,district\nKHC,Kibera Health Centre,Kibra\nMNC,Mathare North Clinic,Mathare\n', 'text/csv', '2026-10-15T16:20:00Z');
}
