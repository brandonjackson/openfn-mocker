import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import asana from '../src/systems/asana/plugin.js';

const config = { port: 0 };

describe('asana', () => {
  it('creates a task (201) from a { data } body', async () => {
    const { app } = await createSystemServer(asana, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/1.0/tasks',
      payload: { data: { name: 'New task', notes: 'details' } },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.data.gid).toBe('string');
    expect(body.data.name).toBe('New task');
    await app.close();
  });

  it('lists seeded tasks inside a data envelope', async () => {
    const { app } = await createSystemServer(asana, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/1.0/tasks' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    await app.close();
  });

  it('fetches a task by gid', async () => {
    const { app } = await createSystemServer(asana, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/1.0/tasks/task_seed01' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Write spec');
    await app.close();
  });

  it('404s for an unknown task gid', async () => {
    const { app } = await createSystemServer(asana, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/1.0/tasks/nope' });
    expect(res.statusCode).toBe(404);
    expect(Array.isArray(res.json().errors)).toBe(true);
    await app.close();
  });
});
