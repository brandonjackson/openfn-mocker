import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import googlesheets from '../src/systems/googlesheets/plugin.js';

const config = { port: 0 };

describe('googlesheets', () => {
  it('reads seeded values for a range', async () => {
    const { app } = await createSystemServer(googlesheets, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/v4/spreadsheets/sheet_seed01/values/Sheet1!A1:C2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.range).toBe('Sheet1!A1:C2');
    expect(body.majorDimension).toBe('ROWS');
    expect(body.values.length).toBe(2);
    await app.close();
  });

  it('appends rows and reports update counts (:append)', async () => {
    const { app } = await createSystemServer(googlesheets, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v4/spreadsheets/sheet_seed01/values/Sheet1!A1:append',
      payload: { values: [['Grace', '32', 'NYC']] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spreadsheetId).toBe('sheet_seed01');
    expect(body.updates.updatedRange).toBe('Sheet1!A1');
    expect(body.updates.updatedRows).toBe(1);
    expect(body.updates.updatedCells).toBe(3);
    await app.close();
  });

  it('batch-updates values and totals the counts (:batchUpdate)', async () => {
    const { app } = await createSystemServer(googlesheets, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v4/spreadsheets/sheet_seed01/values:batchUpdate',
      payload: { valueInputOption: 'RAW', data: [{ range: 'Sheet1!A1', values: [['x', 'y']] }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.spreadsheetId).toBe('sheet_seed01');
    expect(body.totalUpdatedRows).toBe(1);
    expect(body.totalUpdatedCells).toBe(2);
    expect(body.responses.length).toBe(1);
    await app.close();
  });
});
