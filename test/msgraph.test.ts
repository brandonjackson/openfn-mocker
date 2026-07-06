import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import msgraph from '../src/systems/msgraph/plugin.js';

const config = { port: 0 };

describe('msgraph', () => {
  it('returns the signed-in user', async () => {
    const { app } = await createSystemServer(msgraph, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1.0/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe('Mock User');
    await app.close();
  });

  it('gets a seeded drive', async () => {
    const { app } = await createSystemServer(msgraph, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1.0/drives/b!driveSeed01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().driveType).toBe('documentLibrary');
    await app.close();
  });

  it('lists folder children in a value envelope', async () => {
    const { app } = await createSystemServer(msgraph, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/v1.0/drives/b!driveSeed01/root/children',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.value)).toBe(true);
    expect(body.value.length).toBeGreaterThan(0);
    await app.close();
  });

  it('gets a drive item by id and 404s for a missing one', async () => {
    const { app } = await createSystemServer(msgraph, config, { logLevel: 'silent' });
    const ok = await app.inject({
      method: 'GET',
      url: '/v1.0/drives/b!driveSeed01/items/item01',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().name).toBe('report.xlsx');

    const missing = await app.inject({
      method: 'GET',
      url: '/v1.0/drives/b!driveSeed01/items/nope',
    });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('creates a resource (201)', async () => {
    const { app } = await createSystemServer(msgraph, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1.0/sites/root/lists',
      payload: { displayName: 'Tasks' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.displayName).toBe('Tasks');
    await app.close();
  });
});
