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

export function seed(store: DataStore, _config: SystemConfig): void {
  const content = 'Hello from Azure mock';
  store.create('blobs', 'mock-container/hello.txt', {
    key: 'mock-container/hello.txt',
    content,
    contentType: 'text/plain',
    contentLength: Buffer.byteLength(content),
    lastModified: nowIso(),
    etag: '"0x8MOCK0000001"',
  });
}
