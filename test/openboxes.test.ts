import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openboxes from '../src/systems/openboxes/plugin.js';

const config = { port: 0 };

describe('openboxes', () => {
  it('POST /api/login returns a token in a { data } envelope', async () => {
    const { app } = await createSystemServer(openboxes, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBe('mock_openboxes_token');
    await app.close();
  });

  it('lists products under a { data } envelope', async () => {
    const { app } = await createSystemServer(openboxes, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
    expect(res.json().data.length).toBe(3);
    await app.close();
  });

  it('creates a product, read-back-able', async () => {
    const { app } = await createSystemServer(openboxes, config, { logLevel: 'silent' });
    const create = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { productCode: 'NEW-001', name: 'New Product' },
    });
    expect(create.statusCode).toBe(201);
    const id = create.json().data.id;
    expect(id).toBeTruthy();
    const read = await app.inject({ method: 'GET', url: `/api/products/${id}` });
    expect(read.json().data.name).toBe('New Product');
    await app.close();
  });

  it('returns stock movement line items', async () => {
    const { app, store } = await createSystemServer(openboxes, config, { logLevel: 'silent' });
    const smId = store.list('stockMovements')[0].id;
    const res = await app.inject({ method: 'GET', url: `/api/stockMovements/${smId}/stockMovementItems` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
    await app.close();
  });
});
