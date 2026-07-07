import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import surveycto from '../src/systems/surveycto/plugin.js';

const config = { port: 0 };

describe('surveycto', () => {
  it('fetches submissions as a bare array', async () => {
    const { app } = await createSystemServer(surveycto, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/forms/data/wide/json/my_form' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(typeof body[0].KEY).toBe('string');
    await app.close();
  });

  it('lists seeded datasets under a { data, nextCursor } envelope', async () => {
    const { app } = await createSystemServer(surveycto, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/datasets' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.nextCursor).toBe(null);
    await app.close();
  });

  it('creates a dataset (collection POST, id from body)', async () => {
    const { app } = await createSystemServer(surveycto, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v2/datasets',
      payload: { id: 'my_dataset', title: 'My Dataset' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('my_dataset');
    expect(body.title).toBe('My Dataset');
    await app.close();
  });

  it('updates a dataset by id (item PUT)', async () => {
    const { app } = await createSystemServer(surveycto, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v2/datasets/my_dataset',
      payload: { title: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('my_dataset');
    await app.close();
  });

  it('upserts a dataset row (PATCH record)', async () => {
    const { app } = await createSystemServer(surveycto, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v2/datasets/my_dataset/record',
      payload: { id: 'r1', name: 'Ada' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().successful).toBe(true);
    await app.close();
  });
});
