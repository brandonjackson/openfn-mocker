import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import gmail from '../src/systems/gmail/plugin.js';
import { exampleCsv, exampleXlsx, examplePng } from '../src/systems/shared/attachments.js';

const config = { port: 0 };

describe('gmail', () => {
  it('lists seeded message ids', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const res = await app.inject({ method: 'GET', url: '/gmail/v1/users/me/messages' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages.length).toBeGreaterThan(0);
    expect(body.messages[0]).toHaveProperty('id');
    expect(body.messages[0]).toHaveProperty('threadId');
    expect(body.resultSizeEstimate).toBe(body.messages.length);
    await app.close();
  });

  it('filters the list by a subject: query', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages?q=subject:immunization',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messages).toEqual([{ id: 'msg_seed01', threadId: 'thread_seed01' }]);
    await app.close();
  });

  it('gets a full message with headers and parts, and 404s for a missing one', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const ok = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages/msg_seed01?format=full',
    });
    expect(ok.statusCode).toBe(200);
    const msg = ok.json();
    expect(msg.id).toBe('msg_seed01');
    const subject = msg.payload.headers.find((h: any) => h.name === 'Subject');
    expect(subject.value).toBe('Monthly immunization coverage report');
    expect(Array.isArray(msg.payload.parts)).toBe(true);

    const missing = await app.inject({ method: 'GET', url: '/gmail/v1/users/me/messages/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe(404);
    await app.close();
  });

  it('fetches an attachment’s base64url bytes', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages/msg_seed01/attachments/att_seed01',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.attachmentId).toBe('att_seed01');
    expect(Buffer.from(body.data, 'base64').toString('utf-8')).toContain('Western Area');
    await app.close();
  });

  it('carries the three dummy attachments on the sample message, matchable by filename', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    // The sample-attachments message is found by a subject: query, so a workflow
    // can target exactly it.
    const list = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages?q=subject:sample',
    });
    expect(list.json().messages).toEqual([{ id: 'msg_seed03', threadId: 'thread_seed03' }]);

    const res = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages/msg_seed03?format=full',
    });
    expect(res.statusCode).toBe(200);
    const parts: any[] = res.json().payload.parts;

    // Every dummy attachment is a message part carrying its filename + an
    // attachmentId — exactly what the adaptor matches on to download by name.
    for (const fx of [exampleCsv, exampleXlsx, examplePng]) {
      const part = parts.find((p) => p.filename === fx.filename);
      expect(part, `part for ${fx.filename}`).toBeDefined();
      expect(part.mimeType).toBe(fx.mimeType);
      expect(part.body.size).toBe(fx.size);
      expect(typeof part.body.attachmentId).toBe('string');
    }
    await app.close();
  });

  it('returns each dummy attachment’s bytes intact (csv, xlsx, png)', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const cases = [
      { id: 'att_example_csv', fx: exampleCsv },
      { id: 'att_example_xlsx', fx: exampleXlsx },
      { id: 'att_example_png', fx: examplePng },
    ];
    for (const { id, fx } of cases) {
      const res = await app.inject({
        method: 'GET',
        url: `/gmail/v1/users/me/messages/msg_seed03/attachments/${id}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.attachmentId).toBe(id);
      expect(body.size).toBe(fx.size);
      // Bytes come back base64url-encoded, as the real API returns them, and
      // decode back to the original file byte-for-byte.
      expect(Buffer.from(body.data, 'base64url').equals(fx.bytes())).toBe(true);
    }

    // The CSV in particular decodes to readable text (the adaptor's file
    // content type does Buffer.from(data,'base64').toString('utf-8')).
    const csv = await app.inject({
      method: 'GET',
      url: '/gmail/v1/users/me/messages/msg_seed03/attachments/att_example_csv',
    });
    expect(Buffer.from(csv.json().data, 'base64').toString('utf-8')).toContain('Western Area');
    await app.close();
  });

  it('sends a message and returns the created resource', async () => {
    const { app } = await createSystemServer(gmail, config, { logLevel: 'silent' });
    const res = await app.inject({
      method: 'POST',
      url: '/gmail/v1/users/me/messages/send',
      payload: { raw: 'VG86IHJlY2lwaWVudEBleGFtcGxlLm9yZw' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(typeof body.threadId).toBe('string');
    expect(body.labelIds).toEqual(['SENT']);

    // The sent message is now readable (stateful).
    const got = await app.inject({
      method: 'GET',
      url: `/gmail/v1/users/me/messages/${body.id}`,
    });
    expect(got.statusCode).toBe(200);
    await app.close();
  });

  it('requires a bearer credential', async () => {
    // autoAuth: false drives the real 401 path (no default header injected).
    const { app } = await createSystemServer(gmail, config, {
      logLevel: 'silent',
      autoAuth: false,
    });
    const res = await app.inject({ method: 'GET', url: '/gmail/v1/users/me/messages' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
