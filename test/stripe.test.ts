import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import stripe from '../src/systems/stripe/plugin.js';

const config = { port: 0 };

describe('stripe', () => {
  it('lists seeded customers in a list envelope', async () => {
    const { app } = await createSystemServer(stripe, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/customers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('list');
    expect(body.url).toBe('/v1/customers');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    await app.close();
  });

  it('creates a customer (200) with a cus_ id and object field', async () => {
    const { app } = await createSystemServer(stripe, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/customers',
      payload: { name: 'Grace Hopper', email: 'grace@example.com' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('customer');
    expect(body.id).toMatch(/^cus_/);
    expect(body.email).toBe('grace@example.com');
    await app.close();
  });

  it('retrieves a seeded customer by id', async () => {
    const { app } = await createSystemServer(stripe, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/customers/cus_seed01' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe('cus_seed01');
    expect(body.name).toBe('Jane Doe');
    await app.close();
  });

  it('404s for an unknown customer with a Stripe error envelope', async () => {
    const { app } = await createSystemServer(stripe, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/v1/customers/cus_missing' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.type).toBe('invalid_request_error');
    expect(body.error.message).toBe('No such customer');
    await app.close();
  });

  it('creates a charge (200) that succeeded', async () => {
    const { app } = await createSystemServer(stripe, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/charges',
      payload: { amount: 5000, currency: 'usd', customer: 'cus_seed01' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('charge');
    expect(body.id).toMatch(/^ch_/);
    expect(body.status).toBe('succeeded');
    expect(body.amount).toBe(5000);
    await app.close();
  });
});
