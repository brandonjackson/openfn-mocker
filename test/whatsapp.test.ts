import { describe, it, expect } from 'vitest';
import { createSystemServer } from '../src/server.js';
import whatsapp from '../src/systems/whatsapp/plugin.js';
import { PHONE_NUMBER_ID } from '../src/systems/whatsapp/seed.js';

const config = { port: 0 };
const auth = { authorization: 'Bearer test-token' };
const base = `/v22.0/${PHONE_NUMBER_ID}`;

async function server() {
  return createSystemServer(whatsapp, config, { logLevel: 'silent' });
}

describe('whatsapp', () => {
  it('rejects a request with no bearer token', async () => {
    const { app } = await createSystemServer(whatsapp, config, { logLevel: 'silent', autoAuth: false });
    const res = await app.inject({ method: 'GET', url: base });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('sends a text message and stores it under its wamid', async () => {
    const { app, store } = await server();
    const res = await app.inject({
      method: 'POST',
      url: `${base}/messages`,
      headers: auth,
      payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '+254 712 345678', type: 'text', text: { body: 'Hi' } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contacts).toEqual([{ input: '+254 712 345678', wa_id: '254712345678' }]);
    expect(body.messages[0].id).toMatch(/^wamid\./);
    expect(body.messages[0].message_status).toBeUndefined();
    expect(store.get('messages', body.messages[0].id).text.body).toBe('Hi');
    await app.close();
  });

  it('reports message_status accepted for a template send', async () => {
    const { app } = await server();
    const res = await app.inject({
      method: 'POST',
      url: `${base}/messages`,
      headers: auth,
      payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '254712345678', type: 'template', template: { name: 'hello_world', language: { code: 'en_US', policy: 'deterministic' } } },
    });
    expect(res.json().messages[0].message_status).toBe('accepted');
    await app.close();
  });

  it('answers a mark-as-read body and rejects a body with no messaging_product', async () => {
    const { app } = await server();
    const read = await app.inject({ method: 'POST', url: `${base}/messages`, headers: auth, payload: { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.X' } });
    expect(read.json()).toEqual({ success: true });
    const bad = await app.inject({ method: 'POST', url: `${base}/messages`, headers: auth, payload: { to: '1', type: 'text', text: { body: 'x' } } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe(100);
    await app.close();
  });

  it('returns the phone number, and a Graph error for an unknown one', async () => {
    const { app } = await server();
    const ok = await app.inject({ method: 'GET', url: base, headers: auth });
    expect(ok.json()).toMatchObject({ id: PHONE_NUMBER_ID, quality_rating: 'GREEN' });
    const missing = await app.inject({ method: 'GET', url: '/v22.0/999', headers: auth });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.type).toBe('GraphMethodException');
    await app.close();
  });

  it('reads and updates the business profile', async () => {
    const { app } = await server();
    await app.inject({ method: 'POST', url: `${base}/whatsapp_business_profile`, headers: auth, payload: { messaging_product: 'whatsapp', about: 'New about' } });
    const res = await app.inject({ method: 'GET', url: `${base}/whatsapp_business_profile`, headers: auth });
    expect(res.json().data[0].business_profile.about).toBe('New about');
    await app.close();
  });

  it('blocks and unblocks users', async () => {
    const { app } = await server();
    const block = await app.inject({ method: 'POST', url: `${base}/block_users`, headers: auth, payload: { messaging_product: 'whatsapp', block_users: [{ user: '254733000333' }] } });
    expect(block.json().block_users.added_users).toEqual([{ input: '254733000333', wa_id: '254733000333' }]);
    const unblock = await app.inject({ method: 'DELETE', url: `${base}/block_users`, headers: auth, payload: { messaging_product: 'whatsapp', block_users: [{ user: '254733000333' }] } });
    expect(unblock.json().block_users.removed_users).toHaveLength(1);
    const list = await app.inject({ method: 'GET', url: `${base}/block_users`, headers: auth });
    expect(list.json().data.map((u: any) => u.wa_id)).not.toContain('254733000333');
    await app.close();
  });

  it('creates, updates, reads and deletes QR-code deep links', async () => {
    const { app } = await server();
    const created = (await app.inject({ method: 'POST', url: `${base}/message_qrdls`, headers: auth, payload: { prefilled_message: 'Hi', generate_qr_image: 'SVG' } })).json();
    expect(created.code).toMatch(/^[A-Z2-7]{14}$/);
    expect(created.qr_image_url).toMatch(/\.svg$/);
    const updated = (await app.inject({ method: 'POST', url: `${base}/message_qrdls`, headers: auth, payload: { code: created.code, prefilled_message: 'Hello' } })).json();
    expect(updated.prefilled_message).toBe('Hello');
    const got = await app.inject({ method: 'GET', url: `${base}/message_qrdls/${created.code}`, headers: auth });
    expect(got.json().prefilled_message).toBe('Hello');
    const del = await app.inject({ method: 'DELETE', url: `${base}/message_qrdls/${created.code}`, headers: auth });
    expect(del.json()).toEqual({ success: true });
    const gone = await app.inject({ method: 'GET', url: `${base}/message_qrdls/${created.code}`, headers: auth });
    expect(gone.statusCode).toBe(404);
    await app.close();
  });

  it('validates the verification code and registration PIN', async () => {
    const { app } = await server();
    const bad = await app.inject({ method: 'POST', url: `${base}/verify_code`, headers: auth, payload: { code: '12' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: `${base}/register`, headers: auth, payload: { messaging_product: 'whatsapp', pin: '123456' } });
    expect(ok.json()).toEqual({ success: true });
    await app.close();
  });

  it('toggles commerce settings from query parameters', async () => {
    const { app } = await server();
    await app.inject({ method: 'POST', url: `${base}/whatsapp_commerce_settings?is_cart_enabled=true`, headers: auth });
    const res = await app.inject({ method: 'GET', url: `${base}/whatsapp_commerce_settings`, headers: auth });
    expect(res.json().data[0]).toMatchObject({ is_cart_enabled: true, is_catalog_visible: false });
    await app.close();
  });
});
