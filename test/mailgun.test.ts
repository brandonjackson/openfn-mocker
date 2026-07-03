import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import { buildServer } from '../src/app.js';
import mailgun from '../src/systems/mailgun/plugin.js';

const config = { port: 0, domain: 'sandbox-test.mailgun.org' };
const MESSAGES = '/v3/sandbox-test.mailgun.org/messages';
const EVENTS = '/v3/sandbox-test.mailgun.org/events';
const STATS = '/v3/sandbox-test.mailgun.org/stats/total';

describe('mailgun (loads its reference spec at runtime)', () => {
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

  it('paging links echo the public origin from X-Forwarded-* (deployed behind a proxy)', async () => {
    const { app } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: EVENTS,
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'mock.up.railway.app' },
    });
    expect(res.statusCode).toBe(200);
    const { paging } = res.json();
    for (const link of Object.values(paging) as string[]) {
      expect(link.startsWith('https://mock.up.railway.app/')).toBe(true);
      expect(link).not.toContain('localhost');
    }
    expect(paging.first).toBe('https://mock.up.railway.app' + EVENTS + '?page=first');
    await app.close();
  });

  it('paging links keep the /mailgun mount prefix on the shared server', async () => {
    const { app } = await buildServer({
      log_level: 'silent',
      port: 0,
      systems: { mailgun: { enabled: true, port: 0, domain: 'sandbox-test.mailgun.org' } },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/mailgun' + EVENTS,
      headers: {
        authorization: 'Basic ' + Buffer.from('api:mock-api-key').toString('base64'),
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'mock.up.railway.app',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().paging.next).toBe(
      'https://mock.up.railway.app/mailgun' + EVENTS + '?page=next'
    );
    await app.close();
  });

  it('records cc/bcc and flags attachments on the stored message', async () => {
    const { app, store } = await createSystemServer(mailgun, config, { logLevel: 'silent' });
    await app.inject({
      method: 'POST',
      url: MESSAGES,
      payload: {
        from: 'a@x.org',
        to: 'primary@example.org',
        cc: 'cc@example.org',
        bcc: 'bcc@example.org',
        subject: 'Attach',
        text: 'B',
        attachment: { filename: 'report.pdf', data: 'Zm9v' },
      },
    });
    const stored = store.list('messages').find((m: any) => m.to === 'primary@example.org');
    expect(stored.cc).toBe('cc@example.org');
    expect(stored.bcc).toBe('bcc@example.org');
    expect(stored.hasAttachment).toBe(true);
    await app.close();
  });
});
