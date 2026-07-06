import { describe, it, expect, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createSystemServer } from '../src/server.js';
import twilio from '../src/systems/twilio/plugin.js';

const SID = 'ACtest123456';
const config = { port: 0, account_sid: SID };
const MESSAGES = `/2010-04-01/Accounts/${SID}/Messages.json`;
const CALLS = `/2010-04-01/Accounts/${SID}/Calls.json`;

const apps: FastifyInstance[] = [];
async function makeServer() {
  const { app, store } = await createSystemServer(twilio, config, { logLevel: 'silent' });
  apps.push(app);
  return { app, store };
}

afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe('twilio', () => {
  it('GET Messages.json returns seed messages in the Twilio list envelope', async () => {
    const { app } = await makeServer();
    const res = await app.inject({ method: 'GET', url: MESSAGES });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBe(5);
    expect(body).toMatchObject({
      page: 0,
      page_size: 50,
      start: 0,
      next_page_uri: null,
      previous_page_uri: null,
    });
    expect(typeof body.uri).toBe('string');
    // snake_case Message fields present.
    const m = body.messages[0];
    expect(m.sid).toMatch(/^SM[0-9a-f]{32}$/);
    expect(m.account_sid).toBe(SID);
    expect(m.direction).toBe('outbound-api');
    expect(m.api_version).toBe('2010-04-01');
    // Every real Message carries a subresource_uris map.
    expect(m.subresource_uris.media).toBe(`/2010-04-01/Accounts/${SID}/Messages/${m.sid}/Media.json`);
    expect(m.subresource_uris.feedback).toContain(`/Messages/${m.sid}/Feedback.json`);
  });

  it('seeds a realistic delivery failure (undelivered with an integer error_code)', async () => {
    const { app } = await makeServer();
    const res = await app.inject({ method: 'GET', url: MESSAGES });
    const failed = res.json().messages.find((m: any) => m.status === 'undelivered');
    expect(failed).toBeTruthy();
    expect(failed.error_code).toBe(30003);
    expect(typeof failed.error_message).toBe('string');
  });

  it('POST Messages.json (form-urlencoded PascalCase) creates a queued message and reads back', async () => {
    const { app } = await makeServer();
    const res = await app.inject({
      method: 'POST',
      url: MESSAGES,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'To=%2B15558675310&From=%2B15005550006&Body=Hello%20world',
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.sid).toMatch(/^SM[0-9a-f]{32}$/);
    expect(created.to).toBe('+15558675310');
    expect(created.from).toBe('+15005550006');
    expect(created.body).toBe('Hello world');
    expect(created.status).toBe('queued');
    expect(created.direction).toBe('outbound-api');
    expect(created.num_segments).toBe('1');
    expect(created.price).toBeNull();
    expect(created.price_unit).toBe('USD');
    expect(created.date_sent).toBeNull();
    expect(created.uri).toBe(`/2010-04-01/Accounts/${SID}/Messages/${created.sid}.json`);
    // date_created is RFC 2822 with +0000.
    expect(created.date_created).toMatch(/\+0000$/);

    // Read-back via list should now include it.
    const list = await app.inject({ method: 'GET', url: MESSAGES });
    expect(list.json().messages.some((m: any) => m.sid === created.sid)).toBe(true);
  });

  it('GET single message AUTO-ADVANCES status queued -> sent -> delivered and persists', async () => {
    const { app } = await makeServer();
    const post = await app.inject({
      method: 'POST',
      url: MESSAGES,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'To=%2B15551230000&From=%2B15005550006&Body=Status%20test',
    });
    const sid = post.json().sid;
    const url = `/2010-04-01/Accounts/${SID}/Messages/${sid}.json`;

    const read1 = await app.inject({ method: 'GET', url });
    expect(read1.statusCode).toBe(200);
    expect(read1.json().status).toBe('sent');
    expect(read1.json().date_sent).toMatch(/\+0000$/);

    const read2 = await app.inject({ method: 'GET', url });
    expect(read2.json().status).toBe('delivered');

    const read3 = await app.inject({ method: 'GET', url });
    expect(read3.json().status).toBe('delivered'); // terminal, stays

    // Advance is persisted: the list reflects delivered too.
    const list = await app.inject({ method: 'GET', url: MESSAGES });
    const found = list.json().messages.find((m: any) => m.sid === sid);
    expect(found.status).toBe('delivered');
  });

  it('GET single message returns 404 with Twilio error shape when missing', async () => {
    const { app } = await makeServer();
    const res = await app.inject({
      method: 'GET',
      url: `/2010-04-01/Accounts/${SID}/Messages/SMdoesnotexist.json`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe(20404);
  });

  it('GET Calls.json returns seed calls in the list envelope', async () => {
    const { app } = await makeServer();
    const res = await app.inject({ method: 'GET', url: CALLS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.calls)).toBe(true);
    expect(body.calls.length).toBe(2);
    const c = body.calls[0];
    expect(c.sid).toMatch(/^CA[0-9a-f]{32}$/);
    expect(c.status).toBe('completed');
    expect(c.duration).toBe('45');
    expect(c.direction).toBe('outbound-api');
    // Fields a real Call resource always includes.
    expect(c.phone_number_sid).toMatch(/^PN[0-9a-f]{32}$/);
    expect(c.parent_call_sid).toBeNull();
    expect(typeof c.to_formatted).toBe('string');
    expect(typeof c.from_formatted).toBe('string');
    expect(c.queue_time).toBe('0');
    expect(c.subresource_uris.recordings).toContain(`/Calls/${c.sid}/Recordings.json`);
    expect(Object.keys(c.subresource_uris)).toContain('transcriptions');
  });

  it('GET single Call by sid returns the resource (404 when missing)', async () => {
    const { app } = await makeServer();
    const list = await app.inject({ method: 'GET', url: CALLS });
    const sid = list.json().calls[0].sid;
    const ok = await app.inject({
      method: 'GET',
      url: `/2010-04-01/Accounts/${SID}/Calls/${sid}.json`,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().sid).toBe(sid);

    const miss = await app.inject({
      method: 'GET',
      url: `/2010-04-01/Accounts/${SID}/Calls/CAmissing.json`,
    });
    expect(miss.statusCode).toBe(404);
    expect(miss.json().code).toBe(20404);
  });

  it('POST accepts MessagingServiceSid and records it', async () => {
    const { app } = await makeServer();
    const res = await app.inject({
      method: 'POST',
      url: MESSAGES,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'To=%2B15558675399&Body=Hi&MessagingServiceSid=MGtest123',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().messaging_service_sid).toBe('MGtest123');
  });
});
