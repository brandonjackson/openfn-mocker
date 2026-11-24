import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, nowIso } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ibipimo viral-load lab integration. The adaptor authenticates with a Bearer
 * token and talks to a small v1 REST surface: it POSTs viral-load requests
 * (`{ siteid, samples }`), POSTs to ask for results by sample UID
 * (`{ siteid, sample_uids }`), and GETs the list of sites and sample
 * statuses. Request and response shapes for the two POSTs follow the adaptor's
 * README examples (the API is private; that is the only record of them). The generic get/post/request verbs target the same paths.
 */

/** 'YYYY-MM-DD HH:mm:ss' (as submitted) to the 'DD/MM/YYYY HH:mm:ss' Ibipimo answers with. */
function toDmy(value: unknown): string | null {
  const m = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value) : null;
  if (!m) return typeof value === 'string' ? value : null;
  return `${m[3]}/${m[2]}/${m[1]}${m[4]}`;
}

const plugin: MockSystemPlugin = {
  name: 'ibipimo',
  auth: { required: true, schemes: ['bearer'] },
  credential: {
    type: 'apikey',
    authHeader: { scheme: 'bearer', value: 'mock-token' },
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'apiToken', role: 'secret', secret: { charset: 'hex', length: 40 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // POST /api/v1/post-viral-load-requests — save the samples of one site.
    // Body `{ siteid, samples: [...] }`; answers 201 with
    // `{ errors, saved_viral_load_samples }` (adaptor README, and what
    // processViralLoadSubmission reads).
    app.post('/api/v1/post-viral-load-requests', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (typeof body.siteid !== 'string' || !Array.isArray(body.samples)) {
        // The adaptor maps 400 to "Validation failed or invalid format"; the
        // real error body is not documented.
        reply.code(400);
        return { message: 'Validation failed: siteid and a samples array are required' };
      }
      const saved = body.samples.map((sample: Record<string, any>) => {
        const record = {
          id: randomInt(830002, 999999),
          s_uid: randomBytes(2).toString('hex').toUpperCase(),
          siteid: body.siteid,
          codepatient: sample?.p_code ?? null,
          sidainfo_uid: sample?.sidainfo_uid ?? null,
          date_prelevement: toDmy(sample?.date_blood_taken),
          updated_at: nowIso().slice(0, 19).replace('T', ' '),
          created_at: nowIso().replace('Z', '000Z'),
        };
        store.create('vlrequests', record.s_uid, record);
        const { id, s_uid, siteid, codepatient, date_prelevement, updated_at } = record;
        return { id, s_uid, siteid, codepatient, date_prelevement, updated_at };
      });
      reply.code(201);
      return { errors: [], saved_viral_load_samples: saved };
    });

    // POST /api/v1/ask-for-vl-results — results and statuses by sample UID.
    // Body `{ siteid, sample_uids: [...] }`. Every known request is still
    // unprocessed here (no lab behind the mock), so `results` stays empty and
    // each sample reports `sample_not_processed`, as in the adaptor README.
    app.post('/api/v1/ask-for-vl-results', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      if (typeof body.siteid !== 'string' || !Array.isArray(body.sample_uids)) {
        reply.code(400);
        return { message: 'Validation failed: siteid and a sample_uids array are required' };
      }
      const uids: string[] = body.sample_uids.map(String);
      const sample_statuses: Record<string, unknown> = {};
      const pending: string[] = [];
      const notFound: string[] = [];
      for (const uid of uids) {
        const r = store.get('vlrequests', uid);
        if (!r) {
          notFound.push(uid);
          continue;
        }
        pending.push(uid);
        sample_statuses[uid] = {
          sample_uid: uid,
          request_found: true,
          request_status: 'not_processed',
          request_mode: 'api_sidainfo',
          sidainfo_uid: r.sidainfo_uid,
          codelabo: null,
          date_blood_taken: r.date_prelevement,
          date_blood_received: null,
          created_at: r.created_at,
          updated_at: r.created_at,
          result_status: 'not_available',
          result_available: false,
          no_result_reason_code: 'sample_not_processed',
          no_result_reason_message: 'Sample request exists but has not been processed by the laboratory yet.',
          latest_result_meta: null,
          result: null,
        };
      }
      return {
        siteid: body.siteid,
        results: [],
        sample_statuses,
        no_published_results: pending,
        no_results: pending,
        no_results_summary: pending.length ? { sample_not_processed: { count: pending.length, sample_uids: pending } } : {},
        not_found_sample_uids: notFound,
        total_requested: uids.length,
        total_found: 0,
        total_without_published_result: pending.length,
      };
    });

    // GET /api/v1/sites — list configured sites.
    app.get('/api/v1/sites', async () => ({ sites: store.list('sites') }));

    // GET /api/v1/samples/status — list sample statuses.
    app.get('/api/v1/samples/status', async () => ({ samples: store.list('samples') }));
  },

  seed,
};

export default plugin;
