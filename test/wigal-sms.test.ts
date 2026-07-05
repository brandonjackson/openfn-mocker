import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import wigalSms from '../src/systems/wigal-sms/plugin.js';

const config = { port: 0 };

describe('wigal-sms', () => {
  it('sends an SMS (200) and returns the ACCEPTED envelope', async () => {
    const { app } = await createSystemServer(wigalSms, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v3/sms/send',
      payload: { senderid: 'OpenFn', destinations: [{ destination: '233201234567' }], message: 'Hi', smstype: 'text' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ACCEPTED', message: 'Message Accepted For Processing' });
    await app.close();
  });

  it('stores one message per destination', async () => {
    const { app, store } = await createSystemServer(wigalSms, config, { logLevel: 'silent' });
    const before = store.count('messages');
    await app.inject({
      method: 'POST',
      url: '/api/v3/sms/send',
      payload: {
        senderid: 'OpenFn',
        destinations: [{ destination: '233201111111' }, { destination: '233202222222' }],
        message: 'Bulk',
      },
    });
    expect(store.count('messages')).toBe(before + 2);
    await app.close();
  });

  it('accepts personalized destinations (per-recipient message + msgid)', async () => {
    const { app, store } = await createSystemServer(wigalSms, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v3/sms/send',
      payload: {
        senderid: 'OpenFn',
        destinations: [{ destination: '233542709440', message: 'Hello Joe your order is ready', msgid: 'MGS1010101' }],
      },
    });
    expect(res.statusCode).toBe(200);
    const stored = store.get('messages', 'MGS1010101');
    expect(stored.message).toBe('Hello Joe your order is ready');
    await app.close();
  });

  it('accepts a send with no destinations (accept-all mock)', async () => {
    const { app } = await createSystemServer(wigalSms, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'POST', url: '/api/v3/sms/send', payload: { message: 'noop' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ACCEPTED');
    await app.close();
  });
});
