import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Microsoft Graph seed. Seeds one document-library drive and two drive items (a
 * spreadsheet file and a folder) so getDrive / getFolder / getFile work on first
 * boot. Ids use Graph's opaque `b!...` drive id + short item id style.
 */

export function nowIso(): string {
  return new Date().toISOString();
}

export function seed(store: DataStore, _config: SystemConfig): void {
  const drive = {
    id: 'b!driveSeed01',
    driveType: 'documentLibrary',
    name: 'Documents',
    owner: { user: { displayName: 'Mock User', id: 'user-01' } },
    createdDateTime: nowIso(),
  };
  store.create('drives', drive.id, drive);

  const items = [
    {
      id: 'item01',
      name: 'report.xlsx',
      size: 20481,
      file: {
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      createdDateTime: nowIso(),
      lastModifiedDateTime: nowIso(),
    },
    {
      id: 'folder01',
      name: 'Data',
      folder: { childCount: 0 },
      createdDateTime: nowIso(),
      lastModifiedDateTime: nowIso(),
    },
  ];
  for (const item of items) store.create('items', item.id, item);
}
