import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import flutterwave from '../src/systems/flutterwave/plugin.js';

const config = { port: 0 };

describe('flutterwave', () => {
  it('creates a customer (201) inside a data envelope', async () => {
    const { app } = await createSystemServer(flutterwave, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/customers',
      payload: { name: { first: 'Test', last: 'Person' }, email: 'test@example.com' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(typeof body.data.id).toBe('string');
    expect(body.data.email).toBe('test@example.com');
    await app.close();
  });

  it('initiates a charge (200)', async () => {
    const { app } = await createSystemServer(flutterwave, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/charges',
      payload: { amount: 1000, currency: 'NGN', customer_id: 'cus_00000000000001' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('pending');
    expect(body.data.amount).toBe(1000);
    await app.close();
  });

  it('creates a payment method (201)', async () => {
    const { app } = await createSystemServer(flutterwave, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/payment-methods',
      payload: { type: 'card', customer_id: 'cus_00000000000001' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.type).toBe('card');
    await app.close();
  });

  it('lists seeded customers', async () => {
    const { app } = await createSystemServer(flutterwave, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/customers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    await app.close();
  });
});
