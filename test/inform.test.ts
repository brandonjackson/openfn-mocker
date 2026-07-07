import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import inform from '../src/systems/inform/plugin.js';
import { exampleJpg } from '../src/systems/shared/attachments.js';

const config = { port: 0 };

describe('inform', () => {
  it('lists forms in a { count, results } envelope', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/forms' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.count).toBe(body.results.length);
    expect(body.results.length).toBeGreaterThan(0);
    await app.close();
  });

  it('lists submissions for a form', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/data/6225' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    await app.close();
  });

  it('fetches a single submission by id', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/data/6225/7783155' });
    expect(res.statusCode).toBe(200);
    expect(res.json()._id).toBe('7783155');
    await app.close();
  });

  it('404s for an unknown attachment', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/media/does-not-exist' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('fetches attachment metadata', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/media/621985' });
    expect(res.statusCode).toBe(200);
    expect(res.json().filename).toBe('photo.jpg');
    await app.close();
  });

  it('downloadAttachment: files/:id redirects to storage bytes', async () => {
    const { app } = await createSystemServer(inform, config, { logLevel: 'silent' });

    // GET files/:id returns a location header pointing at the bytes.
    const meta = await app.inject({ method: 'GET', url: '/api/v2/files/621985?filename=photo.jpg' });
    expect(meta.statusCode).toBe(200);
    const location = meta.headers['location'] as string;
    expect(location).toBeTruthy();
    expect(location).toContain('/storage/621985');

    // The bytes route returns the real JPEG, byte-for-byte.
    const storagePath = new URL(location).pathname;
    const bytes = await app.inject({ method: 'GET', url: storagePath });
    expect(bytes.statusCode).toBe(200);
    expect(bytes.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(bytes.rawPayload, exampleJpg.bytes())).toBe(0);
    await app.close();
  });

  it('the /storage bytes route is reachable without auth (pre-signed URL)', async () => {
    // autoAuth: false drives the real enforcement path; /storage is exempt.
    const { app } = await createSystemServer(inform, config, {
      logLevel: 'silent',
      autoAuth: false,
    });
    // A normal API path still 401s without credentials...
    const gated = await app.inject({ method: 'GET', url: '/api/v2/forms' });
    expect(gated.statusCode).toBe(401);
    // ...but the storage bytes are reachable unauthenticated.
    const open = await app.inject({ method: 'GET', url: '/storage/621985' });
    expect(open.statusCode).toBe(200);
    expect(Buffer.compare(open.rawPayload, exampleJpg.bytes())).toBe(0);
    await app.close();
  });
});
