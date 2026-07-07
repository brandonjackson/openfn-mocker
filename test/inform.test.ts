import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import inform from '../src/systems/inform/plugin.js';

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
});
