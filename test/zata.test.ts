import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import zata from '../src/systems/zata/plugin.js';

const config = { port: 0 };

describe('zata', () => {
  it('records a sale (201) with accepted status and generated id', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/transaction/sale',
      payload: { amount: 1500, currency: 'USD', buyerTin: '1000000001' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('accepted');
    expect(typeof body.id).toBe('string');
    expect(body.amount).toBe(1500);
    await app.close();
  });

  it('fetches the seeded transaction by id', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/transaction/TXN-0001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe('TXN-0001');
    await app.close();
  });

  it('lists transactions', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/transactions' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().transactions)).toBe(true);
    await app.close();
  });

  it('returns 404 for an unknown transaction', async () => {
    const { app } = await createSystemServer(zata, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/transaction/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
    await app.close();
  });
});
