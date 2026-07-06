import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import memento from '../src/systems/memento/plugin.js';

const config = { port: 0 };

describe('memento', () => {
  it('lists seeded libraries', async () => {
    const { app } = await createSystemServer(memento, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/libraries' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.libraries)).toBe(true);
    expect(body.libraries.length).toBeGreaterThan(0);
    await app.close();
  });

  it('fetches a library with its field schema', async () => {
    const { app } = await createSystemServer(memento, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/libraries/lib_seed01' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.name).toBe('Contacts');
    expect(Array.isArray(body.fields)).toBe(true);
    await app.close();
  });

  it('creates an entry in a library', async () => {
    const { app } = await createSystemServer(memento, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/libraries/lib_seed01/entries',
      payload: { fields: [{ id: 1, value: 'Grace' }] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.author).toBe('mock');
    expect(Array.isArray(body.fields)).toBe(true);
    await app.close();
  });

  it('404s for an unknown library', async () => {
    const { app } = await createSystemServer(memento, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/libraries/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('Not Found');
    await app.close();
  });
});
