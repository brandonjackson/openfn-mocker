import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Google Drive v3 seed. Seeds a couple of files (a PDF and a folder) so
 * list / get / update work on first boot; create adds to the same collection.
 * Records use Drive's `drive#file` kind and a `mimeType` that flags folders.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const files = [
    {
      id: 'file_seed01',
      name: 'Q1 Report.pdf',
      mimeType: 'application/pdf',
      kind: 'drive#file',
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
