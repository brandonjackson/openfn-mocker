import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * WhatsApp Business Platform (Cloud API), served by Meta over the Graph API.
 *
 * The whatsapp adaptor's one HTTP function, `request(method, path, body)`,
 * builds `<baseUrl>/<apiVersion>/<phoneNumberId>/<path>` (node `path.join`)
 * with a Bearer token, so every route here sits under `/:version/:phoneId`.
 * Responses follow Meta's own OpenAPI (facebook/openapi, as committed in
 * openfn-api-specs). Errors use the Graph envelope
 * `{ error: { message, type, code, fbtrace_id } }`.
 *
 * Quirks implemented:
 *  - POST messages returns a `wamid.` id; template sends also report
 *    `message_status: 'accepted'`. A mark-as-read body
 *    (`{ status: 'read', message_id }`) answers `{ success: true }`.
 *  - QR-code deep links get a 14-character base32 code; POSTing an existing
 *    `code` updates its prefilled message.
 */

type Params = { version: string; phoneId: string; code?: string };

function graphError(reply: FastifyReply, status: number, code: number, message: string, type = 'OAuthException') {
  reply.code(status);
  return { error: { message, type, code, fbtrace_id: 'A' + randomBytes(10).toString('base64url') } };
}

function wamid(): string {
  return 'wamid.' + Buffer.from(`HBgM${Date.now()}${randomInt(1e9)}`).toString('base64');
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function qrCode(): string {
  let s = '';
  for (let i = 0; i < 14; i++) s += BASE32[randomInt(BASE32.length)];
  return s;
}

/** A QR record as the single-item and create endpoints return it. */
function qrView(q: any) {
  const { creation_time: _created, ...rest } = q;
  return rest;
}

const digits = (s: unknown): string => String(s ?? '').replace(/\D/g, '');

const plugin: MockSystemPlugin = {
  name: 'whatsapp',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-system-user-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'alnum', length: 48, prefix: 'EAAG' } },
      { name: 'apiVersion', role: 'static', value: '{{version}}' },
      { name: 'phoneNumberId', role: 'static', value: '{{phone_number_id}}' },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    const P = '/:version/:phoneId';

    // GET the business phone number node.
    app.get(P, async (req, reply) => {
      const { phoneId } = req.params as Params;
      const num = store.get('phone_numbers', phoneId);
      if (!num) {
        return graphError(reply, 400, 100, `Unsupported get request. Object with ID '${phoneId}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`, 'GraphMethodException');
      }
      const { registered: _r, ...view } = num;
      return view;
    });

    // POST messages: send any message type, or mark an inbound one as read.
    app.post(`${P}/messages`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (body.messaging_product !== 'whatsapp') {
        return graphError(reply, 400, 100, '(#100) The parameter messaging_product is required.');
      }
      if (body.status === 'read') {
        if (!body.message_id) return graphError(reply, 400, 100, '(#100) The parameter message_id is required.');
        return { success: true };
      }
      if (!body.to) return graphError(reply, 400, 100, '(#100) The parameter to is required.');
      if (!body.type || body[body.type] === undefined) {
        return graphError(reply, 400, 100, `(#100) Param ${body.type ?? 'type'} is required.`);
      }
      const id = wamid();
      store.create('messages', id, { id, status: 'sent', ...body });
      const message: Record<string, string> = { id };
      if (body.type === 'template') message.message_status = 'accepted';
      return {
        messaging_product: 'whatsapp',
        contacts: [{ input: String(body.to), wa_id: digits(body.to) || String(body.to) }],
        messages: [message],
      };
    });

    // Business profile.
    app.get(`${P}/whatsapp_business_profile`, async (req) => {
      const { phoneId } = req.params as Params;
      const profile = store.get('business_profiles', phoneId) ?? { messaging_product: 'whatsapp' };
      return { data: [{ business_profile: profile }] };
    });
    app.post(`${P}/whatsapp_business_profile`, async (req, reply) => {
      const { phoneId } = req.params as Params;
      const body = (req.body ?? {}) as Record<string, any>;
      if (body.messaging_product !== 'whatsapp') {
        return graphError(reply, 400, 100, '(#100) The parameter messaging_product is required.');
      }
      const allowed = ['about', 'address', 'description', 'email', 'vertical', 'websites'];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
      if (store.get('business_profiles', phoneId)) store.update('business_profiles', phoneId, patch);
      else store.create('business_profiles', phoneId, { messaging_product: 'whatsapp', ...patch });
      return { success: true };
    });

    // Blocked users.
    app.get(`${P}/block_users`, async () => {
      const data = store.list('blocked_users');
      return { data, paging: { cursors: { before: 'QVFIU0JlZAm9', after: 'QVFIU0JlZAm9' } } };
    });
    const usersOf = (body: any): string[] =>
      (Array.isArray(body?.block_users) ? body.block_users : []).map((u: any) => String(u?.user ?? '')).filter(Boolean);
    app.post(`${P}/block_users`, async (req, reply) => {
      const users = usersOf(req.body);
      if (!users.length) return graphError(reply, 400, 100, '(#100) The parameter block_users is required.');
      const added = users.map((input) => {
        const wa_id = digits(input) || input;
        store.upsert('blocked_users', wa_id, { messaging_product: 'whatsapp', wa_id });
        return { input, wa_id };
      });
      return { messaging_product: 'whatsapp', block_users: { added_users: added } };
    });
    app.delete(`${P}/block_users`, async (req, reply) => {
      const users = usersOf(req.body);
      if (!users.length) return graphError(reply, 400, 100, '(#100) The parameter block_users is required.');
      const removed = users.map((input) => {
        const wa_id = digits(input) || input;
        store.destroy('blocked_users', wa_id);
        return { input, wa_id };
      });
      return { messaging_product: 'whatsapp', block_users: { removed_users: removed } };
    });

    // QR-code deep links.
    app.get(`${P}/message_qrdls`, async (req) => {
      const q = req.query as Record<string, string>;
      const data = store.list('qr_codes', q.code ? (r) => r.code === q.code : undefined);
      return { data, paging: { cursors: { before: 'QVFIUmlD', after: 'QVFIUmlD' } } };
    });
    app.post(`${P}/message_qrdls`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (typeof body.prefilled_message !== 'string' || !body.prefilled_message) {
        return graphError(reply, 400, 100, '(#100) The parameter prefilled_message is required.');
      }
      if (body.code) {
        const existing = store.get('qr_codes', String(body.code));
        if (!existing) return graphError(reply, 404, 100, `(#100) QR code ${body.code} does not exist.`);
        return qrView(store.update('qr_codes', existing.code, { prefilled_message: body.prefilled_message }));
      }
      const code = qrCode();
      const rec: Record<string, any> = {
        code,
        prefilled_message: body.prefilled_message,
        deep_link_url: `https://wa.me/message/${code}`,
        creation_time: Math.floor(Date.now() / 1000),
      };
      if (body.generate_qr_image) {
        rec.qr_image_url = `https://scontent.xx.fbcdn.net/m1/v/t6/qr/${code}.${String(body.generate_qr_image).toLowerCase()}`;
      }
      store.create('qr_codes', code, rec);
      return qrView(rec);
    });
    app.get(`${P}/message_qrdls/:code`, async (req, reply) => {
      const { code } = req.params as Params;
      const rec = store.get('qr_codes', String(code));
      if (!rec) return graphError(reply, 404, 100, `(#100) QR code ${code} does not exist.`);
      return qrView(rec);
    });
    app.delete(`${P}/message_qrdls/:code`, async (req, reply) => {
      const { code } = req.params as Params;
      if (!store.get('qr_codes', String(code))) return graphError(reply, 404, 100, `(#100) QR code ${code} does not exist.`);
      store.destroy('qr_codes', String(code));
      return { success: true };
    });

    // Registration and verification.
    app.post(`${P}/request_code`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (!['SMS', 'VOICE'].includes(body.code_method) || !/^[a-z]{2}_[A-Z]{2}$/.test(String(body.language ?? ''))) {
        return graphError(reply, 400, 100, '(#100) code_method (SMS or VOICE) and language (e.g. en_US) are required.');
      }
      return { success: true };
    });
    app.post(`${P}/verify_code`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (!/^\d{6}$/.test(String(body.code ?? ''))) {
        return graphError(reply, 400, 136025, 'Verify code error: the code must be 6 digits.');
      }
      const { phoneId } = req.params as Params;
      if (store.get('phone_numbers', phoneId)) store.update('phone_numbers', phoneId, { code_verification_status: 'VERIFIED' });
      return { success: true, id: phoneId };
    });
    app.post(`${P}/register`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (body.messaging_product !== 'whatsapp' || !/^\d{6}$/.test(String(body.pin ?? ''))) {
        return graphError(reply, 400, 100, '(#100) messaging_product and a 6-digit pin are required.');
      }
      const { phoneId } = req.params as Params;
      if (store.get('phone_numbers', phoneId)) store.update('phone_numbers', phoneId, { registered: true });
      return { success: true };
    });
    app.post(`${P}/deregister`, async (req) => {
      const { phoneId } = req.params as Params;
      if (store.get('phone_numbers', phoneId)) store.update('phone_numbers', phoneId, { registered: false });
      return { success: true };
    });

    // Commerce settings (query-string parameters, as Meta documents them).
    app.get(`${P}/whatsapp_commerce_settings`, async (req) => {
      const { phoneId } = req.params as Params;
      const s = store.get('commerce_settings', phoneId);
      return { data: s ? [s] : [] };
    });
    app.post(`${P}/whatsapp_commerce_settings`, async (req) => {
      const { phoneId } = req.params as Params;
      const q = { ...(req.query as Record<string, string>), ...((req.body ?? {}) as Record<string, any>) };
      const patch: Record<string, boolean> = {};
      for (const k of ['is_cart_enabled', 'is_catalog_visible']) {
        if (q[k] !== undefined) patch[k] = q[k] === true || q[k] === 'true';
      }
      if (store.get('commerce_settings', phoneId)) store.update('commerce_settings', phoneId, patch);
      else store.create('commerce_settings', phoneId, { id: String(randomInt(1e15)), is_cart_enabled: false, is_catalog_visible: false, ...patch });
      return { success: true };
    });
  },

  seed,
};

export default plugin;
