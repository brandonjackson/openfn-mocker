import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import openboxes from '../src/systems/openboxes/plugin.js';

const config = { port: 0 };
const boot = () => createSystemServer(openboxes, config, { logLevel: 'silent' });

describe('openboxes', () => {
  it('POST /api/login answers plain text and sets the session cookie', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username: 'a', password: 'b' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.body).toBe('Authentication was successful');
    expect(String(res.headers['set-cookie'])).toMatch(/^JSESSIONID=/);
    // The adaptor posts to `${baseUrl}/login`; the mount-root alias serves it.
    const root = await app.inject({ method: 'POST', url: '/login', payload: { username: 'a', password: 'b' } });
    expect(root.statusCode).toBe(200);
    await app.close();
  });

  it('lists products under { data, totalCount }, paged by max/offset', async () => {
    const { app } = await boot();
    const res = await app.inject({ method: 'GET', url: '/api/products' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(3);
    expect(res.json().totalCount).toBe(3);
    const paged = await app.inject({ method: 'GET', url: '/api/products?max=1&offset=1' });
    expect(paged.json().data.length).toBe(1);
    expect(paged.json().totalCount).toBe(3);
    await app.close();
  });

  it('creates a product as { product } (200), then reads, updates and deletes it', async () => {
    const { app } = await boot();
    const create = await app.inject({
      method: 'POST',
      url: '/api/products',
      payload: { productCode: 'NEW-001', name: 'New Product' },
    });
    expect(create.statusCode).toBe(200);
    const id = create.json().product.id;
    expect(id).toMatch(/^[0-9a-f]{32}$/);

    const read = await app.inject({ method: 'GET', url: `/api/products/${id}` });
    expect(read.json().data.name).toBe('New Product');

    const post = await app.inject({ method: 'POST', url: `/api/products/${id}`, payload: { description: 'd' } });
    expect(post.statusCode).toBe(200);
    expect(post.json().data).toMatchObject({ id, name: 'New Product', description: 'd' });

    const put = await app.inject({ method: 'PUT', url: `/api/products/${id}`, payload: { name: 'Renamed' } });
    expect(put.json().data).toMatchObject({ id, name: 'Renamed', description: 'd' });

    const del = await app.inject({ method: 'DELETE', url: `/api/products/${id}` });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe('');

    const gone = await app.inject({ method: 'GET', url: `/api/products/${id}` });
    expect(gone.statusCode).toBe(404);
    expect(gone.json()).toMatchObject({ errorCode: 404 });
    await app.close();
  });

  it('creates locations with 200 and stock movements with 201', async () => {
    const { app } = await boot();
    const loc = await app.inject({ method: 'POST', url: '/api/locations', payload: { name: 'Ward X' } });
    expect(loc.statusCode).toBe(200);
    expect(loc.json().data.name).toBe('Ward X');
    const sm = await app.inject({ method: 'POST', url: '/api/stockMovements', payload: { name: 'T' } });
    expect(sm.statusCode).toBe(201);
    expect(sm.json().data.name).toBe('T');
    await app.close();
  });

  it('serves no PATCH, and no update for stock movements (as in the real API)', async () => {
    const { app, store } = await boot();
    const productId = store.list('products')[0].id;
    const smId = store.list('stockMovements')[0].id;
    expect((await app.inject({ method: 'PATCH', url: `/api/products/${productId}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `/api/stockMovements/${smId}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/stockMovements/${smId}`, payload: {} })).statusCode).toBe(404);
    await app.close();
  });

  it('reads a stock movement with its line-item count, and its line items', async () => {
    const { app, store } = await boot();
    const smId = store.list('stockMovements')[0].id;
    const read = await app.inject({ method: 'GET', url: `/api/stockMovements/${smId}` });
    expect(read.json().totalCount).toBe(2);
    const res = await app.inject({ method: 'GET', url: `/api/stockMovements/${smId}/stockMovementItems` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
    await app.close();
  });
});
