import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import mpesa from '../src/systems/mpesa/plugin.js';

const config = { port: 0 };

describe('mpesa', () => {
  it('mints an OAuth access token', async () => {
    const { app } = await createSystemServer(mpesa, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/v1/generate?grant_type=client_credentials',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.access_token.length).toBeGreaterThan(0);
    await app.close();
  });

  it('accepts an STK push and records the transaction', async () => {
    const { app, store } = await createSystemServer(mpesa, config, { logLevel: 'silent' });
    const before = store.count('transactions');
    const res = await app.inject({
      method: 'POST',
      url: '/mpesa/stkpush/v1/processrequest',
      payload: { Amount: 1, PartyA: 254708374149, PhoneNumber: 254708374149, CallBackURL: '/cb' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ResponseCode).toBe('0');
    expect(typeof body.CheckoutRequestID).toBe('string');
    expect(store.count('transactions')).toBe(before + 1);
    await app.close();
  });

  it('returns an async ack for a transaction status query', async () => {
    const { app } = await createSystemServer(mpesa, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/mpesa/transactionstatus/v1/query',
      payload: { TransactionID: 'QGR7ABCD12', PartyA: 600000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ResponseCode).toBe('0');
    expect(typeof body.ConversationID).toBe('string');
    await app.close();
  });

  it('registers C2B URLs', async () => {
    const { app } = await createSystemServer(mpesa, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/mpesa/c2b/v1/registerurl',
      payload: { ShortCode: 600426, ResponseType: 'Completed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ResponseCode).toBe('0');
    await app.close();
  });

  it('seeds prior transactions', async () => {
    const { app, store } = await createSystemServer(mpesa, config, { logLevel: 'silent' });
    expect(store.count('transactions')).toBeGreaterThan(0);
    await app.close();
  });
});
