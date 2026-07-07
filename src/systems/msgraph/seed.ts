import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';
import { exampleCsv } from '../shared/attachments.js';

/**
 * Microsoft Graph seed. Seeds one document-library drive and three drive items
 * (a spreadsheet file, a downloadable CSV file, and a folder) so getDrive /
 * getFolder / getFile work on first boot. Ids use Graph's opaque `b!...` drive id
 * + short item id style.
 *
 * `getFile(id)` (default, `metadata: false`) downloads the item's bytes and reads
 * them as TEXT, so the downloadable item (`item02`) uses a text/csv fixture (see
 * src/systems/shared/attachments.ts); its bytes live in the `itemContent`
 * collection, served by GET .../items/:itemId/content.
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
      id: 'item02',
      name: 'coverage.csv',
      size: exampleCsv.size,
      file: { mimeType: exampleCsv.mimeType },
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

  // Downloadable bytes for item02, keyed by item id. getFile() reads these as
  // text, so a text/csv fixture round-trips cleanly.
  store.create('itemContent', 'item02', {
    itemId: 'item02',
    mimeType: exampleCsv.mimeType,
    content: exampleCsv.bytes().toString('utf-8'),
  });
}
