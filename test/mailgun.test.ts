import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import mailgun from '../src/systems/mailgun/plugin.js';

const config = { port: 0, domain: 'sandbox-test.mailgun.org' };
const MESSAGES = '/v3/sandbox-test.mailgun.org/messages';
const EVENTS = '/v3/sandbox-test.mailgun.org/events';
const STATS = '/v3/sandbox-test.mailgun.org/stats/total';

describe('mailgun (spec-driven reference)', () => {
  it('POST messages returns { id, message: "Queued. Thank you." } (200)', async () => {
    const { app } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: MESSAGES,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload:
        'from=Excited User <mailgun@sandbox-test.mailgun.org>&to=bob@example.org&subject=Hi&text=Hello',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.message).toBe('Queued. Thank you.');
    expect(typeof body.id).toBe('string');
    expect(body.id.length).toBeGreaterThan(0);
    await app.close();
  });

  it('accepts a JSON body too', async () => {
    const { app } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: MESSAGES,
      payload: { from: 'a@x.org', to: 'json@example.org', subject: 'J', text: 'body' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().message).toBe('Queued. Thank you.');
    await app.close();
  });

  it('GET events includes the just-sent message event', async () => {
    const { app } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    await app.inject({
      method: 'POST',
      url: MESSAGES,
      payload: { from: 'a@x.org', to: 'unique-recipient@example.org', subject: 'Test', text: 'B' },
    });
    const res = await app.inject({ method: 'GET', url: EVENTS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.paging).toMatchObject({ first: expect.any(String), last: expect.any(String) });
    const sent = body.items.find((e: any) => e.recipient === 'unique-recipient@example.org');
    expect(sent).toBeTruthy();
    expect(sent.event).toBe('delivered');
    await app.close();
  });

  it('seeds ~10 events out of the box', async () => {
    const { app, store } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    expect(store.count('events')).toBeGreaterThanOrEqual(10);
    await app.close();
  });

  it('GET stats/total returns a stats array', async () => {
    const { app } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: STATS });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().stats)).toBe(true);
    await app.close();
  });
});
