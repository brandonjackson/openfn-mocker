import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { loadSpec, parseSpec, type ParsedSpec } from '../../engine/spec-parser.js';
import { shapeRecord } from '../../engine/response-generator.js';
import { seed, buildStats, makeEvent, makeMessageId, DEFAULT_DOMAIN } from './seed.js';

/**
 * Mailgun (port 4018) — the spec-driven reference plugin. It demonstrates the
 * intended pattern for spec-backed systems: load + parse the OpenAPI spec, then
 * register handlers (here custom, because Mailgun's endpoints are not plain
 * CRUD) and use response-generator helpers (shapeRecord) to keep responses
 * schema-shaped. Auth is accept-all (handled by createSystemServer).
 */

/** From a Mailgun `to` param (string, csv, or array) get the first recipient. */
function firstRecipient(to: any): string | undefined {
  if (Array.isArray(to)) return to[0] != null ? String(to[0]) : undefined;
  if (typeof to === 'string') return to.split(',')[0].trim();
  return to == null ? undefined : String(to);
}

const plugin: MockSystemPlugin = {
  name: 'mailgun',
  specFile: 'mailgun.openapi.json',
  // Mailgun uses HTTP Basic auth (`api:<key>`); reject requests with no credentials.
  auth: { required: true, schemes: ['basic'] },

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const configuredDomain = (config.domain as string) || DEFAULT_DOMAIN;

    // Spec is the source of truth for response shapes; parse it once at setup.
    let spec: ParsedSpec | undefined;
    try {
      if (plugin.specFile) spec = parseSpec(loadSpec(plugin.specFile));
    } catch {
      spec = undefined;
    }
    const eventSchema = spec?.schemas?.Event;

    // POST /v3/:domain/messages — send an email (form-urlencoded or JSON).
    app.post('/v3/:domain/messages', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const msgDomain = (req.params as Record<string, any>).domain || configuredDomain;
      const messageId = makeMessageId(msgDomain);
      const recipient = firstRecipient(body.to);

      store.create('messages', messageId, {
        id: messageId,
        from: body.from,
        to: body.to,
        cc: body.cc,
        bcc: body.bcc,
        subject: body.subject,
        text: body.text,
        html: body.html,
        // The adaptor supports { attachment: { filename, data|url } }; record
        // whether one was present without persisting the (possibly large) bytes.
        hasAttachment: body.attachment != null,
        _createdAt: new Date().toISOString(),
      });

      // Synthesize a delivered event so it shows up in the events feed.
      const ev = makeEvent({
        event: 'delivered',
        domain: msgDomain,
        recipient,
        from: body.from,
        subject: body.subject,
        messageId,
      });
      store.create('events', ev.id, ev);

      reply.code(200);
      return { id: messageId, message: 'Queued. Thank you.' };
    });

    // GET /v3/:domain/events — list events with Mailgun paging envelope.
    app.get('/v3/:domain/events', async (req) => {
      const domain = (req.params as Record<string, any>).domain || configuredDomain;
      const items = store
        .list('events')
        .map((ev) => (eventSchema ? shapeRecord(ev, eventSchema, spec) : ev));
      const base = `http://localhost:${config.port}/v3/${domain}/events`;
      return {
        items,
        paging: {
          first: `${base}?page=first`,
          last: `${base}?page=last`,
          next: `${base}?page=next`,
          previous: `${base}?page=previous`,
        },
      };
    });

    // GET /v3/:domain/stats/total — aggregate stats.
    app.get('/v3/:domain/stats/total', async () => store.get('stats', 'total') ?? buildStats());
  },

  seed,
};

export default plugin;
