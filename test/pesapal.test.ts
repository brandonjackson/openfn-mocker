import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import pesapal from '../src/systems/pesapal/plugin.js';

const config = { port: 0 };

describe('pesapal', () => {
  it('mints an access token', async () => {
    const { app } = await createSystemServer(pesapal, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/Auth/RequestToken',
      payload: { consumer_key: 'mock-consumer-key', consumer_secret: 'mock-consumer-secret' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBe('mock-access-token');
    expect(body.error).toBeNull();
    await app.close();
  });

  it('submits an order and returns a tracking id', async () => {
    const { app } = await createSystemServer(pesapal, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/Transactions/SubmitOrderRequest',
      payload: { id: 'order-1001', amount: 1000, currency: 'KES', description: 'Test order' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.order_tracking_id).toBe('string');
    expect(body.merchant_reference).toBe('order-1001');
    expect(body.status).toBe('200');
    await app.close();
  });

  it('reports transaction status for the seeded order', async () => {
    const { app } = await createSystemServer(pesapal, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/Transactions/GetTransactionStatus?orderTrackingId=b945e4af-80a5-4ec1-8706',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.order_tracking_id).toBe('b945e4af-80a5-4ec1-8706');
    expect(body.payment_status_description).toBe('Completed');
    await app.close();
  });

  it('registers an IPN url', async () => {
    const { app } = await createSystemServer(pesapal, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/URLSetup/RegisterIPN',
      payload: { url: 'https://example.com/ipn' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.ipn_id).toBe('string');
    expect(body.url).toBe('https://example.com/ipn');
    await app.close();
  });
});
