import type { SystemGuide } from '../types.js';
import { BUCKET } from './seed.js';

/**
 * Sandbox guide for the aws-s3 system. Paths are virtual-hosted style, as the
 * adaptor's SDK sends them: the bucket (`mock-bucket`) is in the host, so the
 * path is just the object key.
 */
export const guide: SystemGuide = {
  title: 'Amazon S3',
  docs: 'https://docs.openfn.org/adaptors/packages/aws-s3-docs',
  blurb: `Object storage. The adaptor's put, list and get call PutObject, ListObjectsV2 and GetObject through the AWS SDK, which addresses the bucket by host (${BUCKET}.s3.us-east-1.amazonaws.com), so paths here are object keys. Responses are S3's XML; the SigV4 signature is not checked.`,
  auth: 'AWS Signature V4 (access key id + secret)',
  examples: [
    { id: 'list', method: 'GET', path: '/?list-type=2', label: 'List every object in the bucket (ListObjectsV2)' },
    { id: 'list-prefix', method: 'GET', path: '/?list-type=2&prefix=submissions/2026-11-01/', label: "List one day's submissions by prefix" },
    { id: 'list-page', method: 'GET', path: '/?list-type=2&max-keys=2', label: 'List two at a time (follow NextContinuationToken)' },
    { id: 'get-json', method: 'GET', path: '/submissions/2026-11-01/visit-0001.json?x-id=GetObject', label: 'Download a JSON submission (GetObject)' },
    { id: 'get-csv', method: 'GET', path: '/exports/facilities.csv?x-id=GetObject', label: 'Download a CSV export' },
    {
      id: 'put-json',
      method: 'PUT',
      path: '/submissions/2026-11-03/visit-0004.json?x-id=PutObject',
      label: 'Upload a JSON payload (PutObject)',
      body: JSON.stringify({ visitId: 'visit-0004', facility: 'Kibera Health Centre', patientId: 'P-10340', date: '2026-11-03' }, null, 2),
    },
    {
      id: 'put-csv',
      method: 'PUT',
      path: '/exports/visits-2026-11.csv?x-id=PutObject',
      label: 'Upload a CSV file',
      contentType: 'text/csv',
      body: 'visit_id,facility,patient_id\nvisit-0001,KHC,P-10233\nvisit-0002,KHC,P-10298\n',
    },
    { id: 'get-missing', method: 'GET', path: '/submissions/does-not-exist.json?x-id=GetObject', label: 'Download a key that does not exist (404 NoSuchKey)' },
  ],
};
