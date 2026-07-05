import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import monnify from '../src/systems/monnify/plugin.js';

const config = { port: 0 };

describe('monnify', () => {
  it('exchanges credentials for a Bearer token', async () => {
    const { app } = await createSystemServer(monnify, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requestSuccessful).toBe(true);
    expect(typeof body.responseBody.accessToken).toBe('string');
    await app.close();
  });

  it('initializes a transaction and records it', async () => {
    const { app, store } = await createSystemServer(monnify, config, { logLevel: 'silent' });
    const before = store.count('transactions');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/transactions/init-transaction',
      payload: { amount: 500, customerName: 'Test', customerEmail: 't@example.com', paymentReference: 'ref-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.requestSuccessful).toBe(true);
    expect(typeof body.responseBody.transactionReference).toBe('string');
    expect(store.count('transactions')).toBe(before + 1);
    await app.close();
  });

  it('gets a seeded transaction by reference', async () => {
    const { app } = await createSystemServer(monnify, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/transactions/MNFY-TXN-0000000001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().responseBody.paymentStatus).toBe('PAID');
    await app.close();
  });

  it('lists disbursements in a paginated responseBody.content', async () => {
    const { app } = await createSystemServer(monnify, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/disbursements/search-transactions' });
    expect(res.statusCode).toBe(200);
    const rb = res.json().responseBody;
    expect(Array.isArray(rb.content)).toBe(true);
    expect(rb.last).toBe(true);
    expect(rb.content.length).toBeGreaterThan(0);
    await app.close();
  });

  it('404s an unknown transaction reference', async () => {
    const { app } = await createSystemServer(monnify, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/api/v2/transactions/does-not-exist' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
