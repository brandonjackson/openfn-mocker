import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, rev } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * CHT / Community Health Toolkit (Medic) — a community-health Digital Public
 * Good on CouchDB. The cht adaptor is a generic client (get/post/put/request)
 * over the Medic REST API and the underlying CouchDB. Faithful surface:
 *  - POST /api/v1/people and /api/v1/places create contact docs, returning the
 *    CouchDB `{ id, rev }` write ack.
 *  - GET /medic/:id / PUT /medic/:id read+write raw docs; POST /medic/_bulk_docs
 *    writes many; GET /medic/_changes is the changes feed.
 *  - GET /api/v2/export/contacts and /reports download the seeded contacts and
 *    reports as CSV, as cht-core does (only dhis and user-devices export JSON).
 *  - GET/PUT /api/v1/settings reads+writes app settings. Auth is Basic.
 */

/** One CSV line as cht-core writes it: strings and arrays quoted, quotes backslash-escaped. */
function csvLine(cells: unknown[]): string {
  return (
    cells
      .map((cell) => {
        if (typeof cell === 'string') return `"${cell.replace(/"/g, '\\"')}"`;
        if (Array.isArray(cell)) return `"${JSON.stringify(cell).replace(/"/g, '\\"')}"`;
        return cell ?? '';
      })
      .join(',') + '\n'
  );
}

/** Dot-notation paths of a report's `fields` (arrays stay one cell), as report-mapper does. */
function flatten(fields: Record<string, any>, prepend: string[] = []): Record<string, any> {
  const acc: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    const path = [...prepend, k];
    if (typeof v === 'object' && v && !Array.isArray(v)) Object.assign(acc, flatten(v, path));
    else acc[path.join('.')] = v;
  }
  return acc;
}

/** A CSV export download: unquoted header line, then one line per row. */
function sendCsvExport(reply: FastifyReply, type: string, header: string[], rows: unknown[][]): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  reply
    .header('content-type', 'text/csv')
    .header('content-disposition', `attachment; filename=${type}-${stamp}.csv`);
  return header.join(',') + '\n' + rows.map(csvLine).join('');
}

/** CouchDB write ack. */
function ack(id: string, revNo = 1): Record<string, any> {
  return { ok: true, id, rev: rev(revNo) };
}

/** Store a doc (assigning _id/_rev), returning the ack. */
function putDoc(store: DataStore, doc: Record<string, any>): Record<string, any> {
  const _id = typeof doc._id === 'string' && doc._id ? doc._id : randomUUID();
  const existing = store.get('docs', _id);
  const revNo = existing ? parseInt(String(existing._rev), 10) + 1 || 1 : 1;
  const stored = { ...doc, _id, _rev: rev(revNo) };
  store.replace('docs', _id, stored);
  const seq = store.count('changes') + 1;
  store.replace('changes', _id, { seq, id: _id, changes: [{ rev: stored._rev }] });
  return ack(_id, revNo);
}

const plugin: MockSystemPlugin = {
  name: 'cht',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'medic' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // The cht adaptor always sends `content-type: application/json` (Utils.js
    // hardcodes it), even on requests that carry no body: put() passes a null
    // body, and post() routes its body through an option key that
    // language-common's request ignores, so the body never reaches the wire.
    // Fastify's built-in JSON parser 400s on an empty body, so replace it (scoped
    // to this system) with one that treats an empty body as `{}`.
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req: unknown, body: string, done: (err: Error | null, body?: any) => void) => {
        if (!body || body.trim() === '') {
          done(null, {});
          return;
        }
        try {
          done(null, JSON.parse(body));
        } catch (err) {
          done(err as Error, undefined);
        }
      }
    );

    // --- Medic REST: create people / places ---
    for (const kind of ['people', 'places'] as const) {
      app.post(`/api/v1/${kind}`, async (req, reply) => {
        const body = (req.body ?? {}) as Record<string, any>;
        const docType = kind === 'people' ? 'person' : body.type ?? 'clinic';
        const result = putDoc(store, { ...body, type: docType });
        reply.code(200);
        return result;
      });
    }

    // --- App settings ---
    app.get('/api/v1/settings', async () => store.get('settings', 'settings')?.settings ?? {});
    app.put('/api/v1/settings', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const current = store.get('settings', 'settings')?.settings ?? {};
      const merged = { ...current, ...body };
      store.replace('settings', 'settings', { settings: merged });
      return { success: true, updated: true };
    });

    // --- Data exports (getData / http.get over /api/v2/export) ---
    // cht-core streams every export except dhis and user-devices as a CSV
    // download (api/src/services/export-data.js: `format`), with the header and
    // row shape each mapper defines (api/src/services/export/*-mapper.js).
    app.get('/api/v2/export/reports', async (_req, reply) => {
      const reports = store.list('docs', (d) => d.type === 'data_record');
      const fieldColumns = [...new Set(reports.flatMap((r) => Object.keys(flatten(r.fields ?? {}))))].sort();
      const header = [
        '_id',
        'form',
        'patient_id',
        'reported_date',
        'from',
        'contact.name',
        'contact.parent.name',
        'contact.parent.parent.name',
        'contact.parent.parent.parent.name',
        ...fieldColumns,
      ];
      const rows = reports.map((r) => [
        r._id,
        r.form,
        r.patient_id,
        r.reported_date,
        r.from,
        r.contact?.name,
        r.contact?.parent?.name,
        r.contact?.parent?.parent?.name,
        r.contact?.parent?.parent?.parent?.name,
        ...fieldColumns.map((c) => flatten(r.fields ?? {})[c]),
      ]);
      return sendCsvExport(reply, 'reports', header, rows);
    });
    app.get('/api/v2/export/contacts', async (_req, reply) => {
      const contacts = store.list('docs', (d) => d.type !== 'data_record');
      const header = ['id', 'rev', 'name', 'patient_id', 'type', 'contact_type', 'place_id'];
      const rows = contacts.map((c) => [c._id, c._rev, c.name, c.patient_id, c.type, c.contact_type, c.place_id]);
      return sendCsvExport(reply, 'contacts', header, rows);
    });

    // --- CouchDB changes feed ---
    app.get('/medic/_changes', async (req) => {
      const results = store.list('changes');
      const q = (req.query ?? {}) as Record<string, any>;
      const since = typeof q.since === 'string' ? parseInt(q.since, 10) || 0 : 0;
      const filtered = results.filter((r) => Number(r.seq) > since);
      const lastSeq = filtered.length ? filtered[filtered.length - 1].seq : since;
      return { results: filtered, last_seq: lastSeq, pending: 0 };
    });

    // --- CouchDB bulk write ---
    app.post('/medic/_bulk_docs', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const docs: any[] = Array.isArray(body.docs) ? body.docs : [];
      reply.code(201);
      return docs.map((doc) => {
        const res = putDoc(store, doc);
        return { ok: true, id: res.id, rev: res.rev };
      });
    });

    // --- CouchDB single-doc read/write ---
    // Static _changes/_bulk_docs are registered above and win over :docId.
    app.get('/medic/:docId', async (req, reply) => {
      const docId = String((req.params as Record<string, any>).docId);
      const doc = store.get('docs', docId);
      if (doc === undefined) {
        reply.code(404);
        return { error: 'not_found', reason: 'missing' };
      }
      return doc;
    });
    const writeDoc = async (req: FastifyRequest, reply: any) => {
      const docId = String((req.params as Record<string, any>).docId);
      const body = (req.body ?? {}) as Record<string, any>;
      const result = putDoc(store, { ...body, _id: docId });
      reply.code(201);
      return result;
    };
    app.put('/medic/:docId', writeDoc);
  },

  seed,
};

export default plugin;
