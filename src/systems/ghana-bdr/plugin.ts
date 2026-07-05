import { randomInt, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ghana BDR (Births & Deaths Registry). The ghana-bdr adaptor posts birth
 * notifications with Basic-style creds (username/password appended to the body).
 * `sendBirthNotification` → POST /api/notification; the generic `get`/`post` hit
 * any path.
 *
 * QUIRK: the real BDR API speaks *double-encoded* JSON on the wire — the adaptor
 * sends JSON.stringify(JSON.stringify(body)) and reads the response with
 * body.json() *then* JSON.parse(). So this mock tolerates a stringified request
 * body and replies to /api/notification with a JSON-encoded JSON string, matching
 * the exact wire format the adaptor expects.
 */

/** Read a body that may be a JSON string (adaptor double-encodes) or an object. */
function readBody(body: unknown): Record<string, any> {
  if (typeof body === 'string') {
    try {
      const once = JSON.parse(body);
      return typeof once === 'string' ? JSON.parse(once) : once;
    } catch {
      return { _raw: body };
    }
  }
  return (body ?? {}) as Record<string, any>;
}

/** Reply with a double-encoded JSON body (BDR's wire format). */
function sendDoubleEncoded(reply: FastifyReply, obj: unknown): string {
  reply.header('content-type', 'application/json');
  return JSON.stringify(JSON.stringify(obj));
}

/** Build a birth-certificate record from a notification body. */
function toNotification(data: Record<string, any>): Record<string, any> {
  const child = data.child ?? {};
  const mother = data.mother ?? {};
  const father = data.father ?? {};
  const referenceId = `${randomUUID().slice(0, 8)}-${randomInt(1000, 9999)}`;
  const cert = `${String(randomInt(0, 1_000_000)).padStart(6, '0')}-${String(randomInt(0, 100)).padStart(2, '0')}-2024`;
  return {
    birth_certificate_number: cert,
    first_name: child.first_name ?? '',
    middle_name: child.middle_name ?? '',
    Surname: child.Surname ?? '',
    birth_date: child.birth_date ?? '',
    gender: child.gender_code === '1' ? 'MALE' : 'FEMALE',
    m_first_name: mother.first_name ?? '',
    m_national_id_number: mother.national_id_number ?? '',
    f_first_name: father.first_name ?? '',
    f_national_id_number: father.national_id_number ?? '',
    reference_id: referenceId,
    registry_code: data.registry_code ?? '',
    created_at: new Date().toISOString(),
    last_updated_at: null,
    issuccessful: true,
    message: `record reference_id : ${referenceId} , created successfully`,
    messagecode: '200',
  };
}

const plugin: MockSystemPlugin = {
  name: 'ghana-bdr',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /api/notification — sendBirthNotification (and generic post): register a
    // birth and mint a certificate number. Response is a double-encoded JSON string.
    app.post('/api/notification', async (req, reply) => {
      const record = toNotification(readBody(req.body));
      store.create('notifications', record.reference_id, record);
      reply.code(200);
      return sendDoubleEncoded(reply, record);
    });

    // GET /api/notification — list registered birth notifications (generic get).
    app.get('/api/notification', async () => ({
      count: store.count('notifications'),
      notifications: store.list('notifications'),
    }));
  },

  seed,
};

export default plugin;
