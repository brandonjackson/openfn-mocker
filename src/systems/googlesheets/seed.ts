import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

/**
 * Google Sheets v4 seed. Seeds one range of cell values (keyed by A1 range) in a
 * `sheetData` collection so getValues works on first boot; append / batchUpdate
 * report update counts rather than persisting, matching the mock's read-focus.
 */

export function seed(store: DataStore, _config: SystemConfig): void {
  const range = 'Sheet1!A1:C2';
  store.create('sheetData', range, {
    range,
    majorDimension: 'ROWS',
    values: [
      ['Name', 'Age', 'City'],
      ['Ada', '36', 'London'],
    ],
  });
}
