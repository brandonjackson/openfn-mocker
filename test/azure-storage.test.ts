import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import azureStorage from '../src/systems/azure-storage/plugin.js';

const config = { port: 0 };

describe('azure-storage', () => {
  it('uploads a blob (201, ETag header)', async () => {
    const { app } = await createSystemServer(azureStorage, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PUT',
      url: '/mock-container/reports/summary.txt',
      headers: { 'content-type': 'text/plain' },
      payload: 'file contents here',
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers.etag).toBeDefined();
    await app.close();
  });

  it('downloads a seeded blob', async () => {
    const { app } = await createSystemServer(azureStorage, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/mock-container/hello.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('Hello from Azure mock');
    await app.close();
  });

  it('round-trips an uploaded blob whose name contains slashes', async () => {
    const { app } = await createSystemServer(azureStorage, config, { logLevel: 'silent' });
    await app.inject({
      method: 'PUT',
      url: '/mock-container/reports/summary.txt',
      headers: { 'content-type': 'text/plain' },
      payload: 'file contents here',
    });
    const res = await app.inject({ method: 'GET', url: '/mock-container/reports/summary.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('file contents here');
    await app.close();
  });

  it('returns blob properties via HEAD', async () => {
    const { app } = await createSystemServer(azureStorage, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'HEAD', url: '/mock-container/hello.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ms-blob-type']).toBe('BlockBlob');
    await app.close();
  });

  it('404s (BlobNotFound) for a missing blob', async () => {
    const { app } = await createSystemServer(azureStorage, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/mock-container/does-not-exist.txt' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('BlobNotFound');
    await app.close();
  });
});
