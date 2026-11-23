import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Azure Blob Storage seed. Seeds one block blob so `downloadBlob` /
 * `getBlobProperties` work on first boot; `uploadBlob` adds to the same 'blobs'
 * collection. Blobs are keyed `<container>/<blobName>` (blob names may contain
 * slashes), and each record carries the content plus the metadata a HEAD
 * (getBlobProperties) response needs.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

function seedBlob(store: DataStore, key: string, content: string, contentType: string, etag: string): void {
  store.create('blobs', key, {
    key,
    content,
    contentType,
    contentLength: Buffer.byteLength(content),
    lastModified: nowIso(),
    etag,
  });
}

export function seed(store: DataStore, _config: SystemConfig): void {
  store.create('containers', 'mock-container', { name: 'mock-container', lastModified: nowIso() });
  seedBlob(store, 'mock-container/hello.txt', 'Hello from Azure mock', 'text/plain', '"0x8MOCK0000001"');
  // A lookup table and a latest export, under folder-like blob names.
  seedBlob(
    store,
    'mock-container/config/facility-mapping.json',
    JSON.stringify({ 'FAC-001': 'ou_kenema_gh', 'FAC-002': 'ou_bo_chc' }),
    'application/json',
    '"0x8MOCK0000002"'
  );
  seedBlob(store, 'mock-container/exports/latest.csv', 'period,indicator,value\n2026-10,anc1,412\n', 'text/csv', '"0x8MOCK0000003"');
}
