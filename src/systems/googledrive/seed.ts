import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';
import { examplePdf, exampleCsv, examplePng } from '../shared/attachments.js';

/**
 * Google Drive v3 seed. Seeds a few files (with real downloadable content) plus a
 * folder so list / get / update work on first boot; create adds to the same
 * collection. Records use Drive's `drive#file` kind and a `mimeType` that flags
 * folders. Files carry their bytes base64-encoded in `contentBase64` (stripped
 * from metadata responses); `get()` fetches them via the `?alt=media` branch and
 * base64-encodes them back for the user. The three downloadable files reuse the
 * shared dummy attachments (see src/systems/shared/attachments.ts): a PDF, a CSV,
 * and a PNG.
 */

function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const modifiedTime = nowIso();
  const files = [
    {
      id: 'file_seed01',
      name: 'Q1 Report.pdf',
      mimeType: examplePdf.mimeType,
      kind: 'drive#file',
      size: String(examplePdf.size),
      modifiedTime,
      contentBase64: examplePdf.base64,
    },
    {
      id: 'file_seed02',
      name: 'coverage.csv',
      mimeType: exampleCsv.mimeType,
      kind: 'drive#file',
      size: String(exampleCsv.size),
      modifiedTime,
      contentBase64: exampleCsv.base64,
    },
    {
      id: 'file_seed03',
      name: 'chart.png',
      mimeType: examplePng.mimeType,
      kind: 'drive#file',
      size: String(examplePng.size),
      modifiedTime,
      contentBase64: examplePng.base64,
    },
    {
      id: 'folder_seed01',
      name: 'Projects',
      mimeType: 'application/vnd.google-apps.folder',
      kind: 'drive#file',
    },
  ];
  for (const f of files) store.create('files', f.id, f);
}
