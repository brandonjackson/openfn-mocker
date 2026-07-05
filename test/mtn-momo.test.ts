import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import mtnMomo from '../src/systems/mtn-momo/plugin.js';

const config = { port: 0 };

describe('mtn-momo', () => {
  it('mints a Collection access token', async () => {
    const { app } = await createSystemServer(mtnMomo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/collection/token/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.access_token).toBe('string');
    expect(body.token_type).toBe('access_token');
    await app.close();
  });

  it('accepts a request-to-pay (202) and stores it by X-Reference-Id', async () => {
    const { app, store } = await createSystemServer(mtnMomo, config, { logLevel: 'silent' });
    const referenceId = '33333333-3333-3333-3333-333333333333';
    const res = await app.inject({
      method: 'POST',
      url: '/collection/v1_0/requesttopay',
      headers: { 'x-reference-id': referenceId, 'x-target-environment': 'sandbox' },
      payload: { amount: '100', currency: 'EUR', externalId: '1', payer: { partyIdType: 'MSISDN', partyId: '46733123453' } },
    });
    expect(res.statusCode).toBe(202);
    expect(store.get('requesttopay', referenceId)).toBeTruthy();
    await app.close();
  });

  it('polls a seeded request-to-pay status', async () => {
    const { app } = await createSystemServer(mtnMomo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/collection/v1_0/requesttopay/11111111-1111-1111-1111-111111111111',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('SUCCESSFUL');
    await app.close();
  });

  it('returns the account balance (seed present)', async () => {
    const { app } = await createSystemServer(mtnMomo, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/collection/v1_0/account/balance' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currency).toBe('EUR');
    expect(typeof body.availableBalance).toBe('string');
    await app.close();
  });

  it('404s an unknown request-to-pay reference', async () => {
    const { app } = await createSystemServer(mtnMomo, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/collection/v1_0/requesttopay/99999999-9999-9999-9999-999999999999',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
