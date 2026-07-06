import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import googledrive from '../src/systems/googledrive/plugin.js';

const config = { port: 0 };

describe('googledrive', () => {
  it('lists seeded files', async () => {
    const { app } = await createSystemServer(googledrive, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/drive/v3/files' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files.length).toBeGreaterThan(0);
    expect(body.incompleteSearch).toBe(false);
    await app.close();
  });

  it('creates a file with a generated id', async () => {
    const { app } = await createSystemServer(googledrive, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/drive/v3/files',
      payload: { name: 'New Folder', mimeType: 'application/vnd.google-apps.folder' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe('New Folder');
    expect(body.kind).toBe('drive#file');
    await app.close();
  });

  it('gets a file by id and 404s for a missing one', async () => {
    const { app } = await createSystemServer(googledrive, config, { logLevel: 'silent' });
    const ok = await app.inject({ method: 'GET', url: '/drive/v3/files/file_seed01' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('Q1 Report.pdf');

    const missing = await app.inject({ method: 'GET', url: '/drive/v3/files/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe(404);
    await app.close();
  });

  it('updates file metadata via PATCH', async () => {
    const { app } = await createSystemServer(googledrive, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PATCH',
      url: '/drive/v3/files/file_seed01',
      payload: { name: 'Renamed.pdf' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renamed.pdf');
    await app.close();
  });
});
