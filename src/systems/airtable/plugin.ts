import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { loadSpec, parseSpec, type ParsedSpec } from '../../engine/spec-parser.js';
import { seed, makeRecord, DEFAULT_BASE_ID } from './seed.js';

/**
 * Airtable (port 4020, Bearer auth, credential field baseUrl).
 *
 * Airtable's Web API does not map cleanly onto plain CRUD: the same collection
 * path serves single-vs-batch creates, batch updates and batch deletes, and
 * every response uses an Airtable-specific envelope ({ records: [...] } with
 * user fields nested under `fields`). So routes are registered as custom
 * handlers rather than via registerCrud. The parsed spec (Record schema) is the
 * source of truth for the record shape. Auth is accept-all (handled globally).
 *
 * The store is keyed per table: collection name == tableName. Records are stored
 * as full Airtable records: { id: 'rec'+14, createdTime, fields }.
 */

const MAX_BATCH = 10;

/** Read the tableName path param. */
function tableOf(req: FastifyRequest): string {
  return String((req.params as Record<string, any>).tableName);
}

/** Read the recordId path param. */
function recordIdOf(req: FastifyRequest): string {
  return String((req.params as Record<string, any>).recordId);
}

/** Best-effort parse of a `{Field} = 'value'` filterByFormula equality. */
function parseSimpleFormula(formula: string): { field: string; value: string } | undefined {
  const m = formula.match(/^\s*\{([^}]+)\}\s*=\s*['"]?([^'"]*)['"]?\s*$/);
  if (!m) return undefined;
  return { field: m[1], value: m[2] };
}

/** Parse sort[i][field]/sort[i][direction] query keys (Fastify's flat qs). */
function parseSorts(query: Record<string, any>): Array<{ field: string; dir: string }> {
  const byIdx: Array<{ field: string; dir: string }> = [];
  for (const key of Object.keys(query)) {
    const m = key.match(/^sort\[(\d+)\]\[field\]$/);
    if (!m) continue;
    const idx = Number(m[1]);
    const field = String(query[key]);
    const dir = String(query[`sort[${m[1]}][direction]`] ?? 'asc').toLowerCase();
    byIdx[idx] = { field, dir };
  }
  return byIdx.filter(Boolean);
}

function compareValues(a: any, b: any): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

const plugin: MockSystemPlugin = {
  name: 'airtable',
  specFile: 'airtable.schema.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    // baseId default (routes are param-based; this is only a documented default).
    const defaultBaseId =
      (config.base_id as string) || (config.baseId as string) || DEFAULT_BASE_ID;
    void defaultBaseId;

    // Spec is the source of truth for the record shape; parse once at setup.
    let spec: ParsedSpec | undefined;
    try {
      if (plugin.specFile) spec = parseSpec(loadSpec(plugin.specFile));
    } catch {
      spec = undefined;
    }
    void spec;

    const err = (type: string, message: string) => ({ error: { type, message } });

    /**
     * Airtable "select": filter / sort / paginate a table. Shared by
     * GET /v0/:baseId/:tableName and POST /v0/:baseId/:tableName/listRecords
     * (the latter takes the same params in the request body).
     */
    const selectRecords = (table: string, params: Record<string, any>): Record<string, any> => {
      let items = store.list(table);

      // filterByFormula: best-effort equality, otherwise accepted + ignored.
      const formula = params.filterByFormula;
      if (typeof formula === 'string' && formula.length > 0) {
        const parsed = parseSimpleFormula(formula);
        if (parsed) {
          items = items.filter((r) => String(r?.fields?.[parsed.field] ?? '') === parsed.value);
        }
      }

      // sort[0][field]=&sort[0][direction]= (or a sort:[{field,direction}] array in a POST body).
      const sorts = Array.isArray(params.sort)
        ? params.sort.map((s: any) => ({ field: String(s.field), dir: String(s.direction ?? 'asc').toLowerCase() }))
        : parseSorts(params);
      if (sorts.length) {
        items = [...items].sort((ra, rb) => {
          for (const s of sorts) {
            const cmp = compareValues(ra?.fields?.[s.field], rb?.fields?.[s.field]);
            if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
          }
          return 0;
        });
      }

      // maxRecords caps the total set considered.
      const maxRecords = params.maxRecords != null ? parseInt(String(params.maxRecords), 10) : undefined;
      if (maxRecords != null && !Number.isNaN(maxRecords)) items = items.slice(0, maxRecords);

      // Pagination: offset is a numeric cursor (start index) encoded as string.
      const rawSize = params.pageSize != null ? parseInt(String(params.pageSize), 10) : 100;
      const pageSize = Number.isNaN(rawSize) ? 100 : Math.min(Math.max(rawSize, 1), 100);
      const start = params.offset != null ? parseInt(String(params.offset), 10) : 0;
      const safeStart = Number.isNaN(start) ? 0 : Math.max(start, 0);

      const page = items.slice(safeStart, safeStart + pageSize);
      const nextStart = safeStart + pageSize;
      const result: Record<string, any> = { records: page };
      if (nextStart < items.length) result.offset = String(nextStart);
      return result;
    };

    // GET /v0/:baseId/:tableName — list with pagination / sort / filter.
    app.get('/v0/:baseId/:tableName', async (req) =>
      selectRecords(tableOf(req), (req.query ?? {}) as Record<string, any>)
    );

    // POST /v0/:baseId/:tableName/listRecords — same as GET list, params in body
    // (used when the query string would be too long, e.g. a big filterByFormula).
    app.post('/v0/:baseId/:tableName/listRecords', async (req) =>
      selectRecords(tableOf(req), (req.body ?? {}) as Record<string, any>)
    );

    // GET /v0/:baseId/:tableName/:recordId — single record.
    app.get('/v0/:baseId/:tableName/:recordId', async (req, reply) => {
      const rec = store.get(tableOf(req), recordIdOf(req));
      if (rec === undefined) {
        reply.code(404);
        return err('MODEL_ID_NOT_FOUND', `Record ${recordIdOf(req)} not found`);
      }
      return rec;
    });

    // POST /v0/:baseId/:tableName — single { fields } OR batch { records:[{fields}] }.
    app.post('/v0/:baseId/:tableName', async (req, reply) => {
      const table = tableOf(req);
      const body = (req.body ?? {}) as Record<string, any>;

      if (Array.isArray(body.records)) {
        if (body.records.length > MAX_BATCH) {
          reply.code(422);
          return err(
            'INVALID_REQUEST_UNKNOWN',
            `Invalid request: cannot create more than ${MAX_BATCH} records at once`
          );
        }
        const created = body.records.map((r: any) => {
          const rec = makeRecord((r && r.fields) ?? {});
          store.create(table, rec.id, rec);
          return rec;
        });
        reply.code(200);
        return { records: created };
      }

      // Single create.
      const rec = makeRecord((body.fields as Record<string, any>) ?? {});
      store.create(table, rec.id, rec);
      reply.code(200);
      return rec;
    });

    // PATCH /v0/:baseId/:tableName — batch update (merge fields).
    // PUT /v0/:baseId/:tableName — batch replace (overwrite fields).
    // With { performUpsert: { fieldsToMergeOn } } this becomes an upsert:
    // records are matched by those fields (or by id), updated if found, else
    // created; the response then also carries createdRecords / updatedRecords.
    const batchUpdate = (merge: boolean) => async (req: FastifyRequest, reply: any) => {
      const table = tableOf(req);
      const body = (req.body ?? {}) as Record<string, any>;
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length > MAX_BATCH) {
        reply.code(422);
        return err(
          'INVALID_REQUEST_UNKNOWN',
          `Invalid request: cannot update more than ${MAX_BATCH} records at once`
        );
      }
      const mergeOn: string[] | null = Array.isArray(body.performUpsert?.fieldsToMergeOn)
        ? body.performUpsert.fieldsToMergeOn.map(String)
        : null;

      const out: any[] = [];
      const createdRecords: string[] = [];
      const updatedRecords: string[] = [];
      for (const r of records) {
        let id = r?.id != null ? String(r.id) : '';
        let existing = id ? store.get(table, id) : undefined;
        if (existing === undefined && mergeOn) {
          const match = store
            .list(table)
            .find((rec) =>
              mergeOn.every((f) => String(rec.fields?.[f] ?? '') === String(r.fields?.[f] ?? ''))
            );
          if (match) {
            existing = match;
            id = match.id;
          }
        }
        if (existing !== undefined) {
          const newFields = merge
            ? { ...existing.fields, ...(r.fields ?? {}) }
            : { ...(r.fields ?? {}) };
          const updated = { ...existing, fields: newFields };
          store.replace(table, id, updated);
          out.push(updated);
          if (mergeOn) updatedRecords.push(id);
        } else if (mergeOn) {
          const rec = makeRecord((r && r.fields) ?? {});
          store.create(table, rec.id, rec);
          out.push(rec);
          createdRecords.push(rec.id);
        }
        // No id match and no upsert requested: skip (matches Airtable, which
        // errors on unknown ids; here we simply omit it from the response).
      }
      reply.code(200);
      const result: Record<string, any> = { records: out };
      if (mergeOn) {
        result.createdRecords = createdRecords;
        result.updatedRecords = updatedRecords;
      }
      return result;
    };
    app.patch('/v0/:baseId/:tableName', batchUpdate(true));
    app.put('/v0/:baseId/:tableName', batchUpdate(false));

    // PATCH /v0/:baseId/:tableName/:recordId — update single (merge fields).
    app.patch('/v0/:baseId/:tableName/:recordId', async (req, reply) => {
      const table = tableOf(req);
      const id = recordIdOf(req);
      const existing = store.get(table, id);
      if (existing === undefined) {
        reply.code(404);
        return err('MODEL_ID_NOT_FOUND', `Record ${id} not found`);
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = { ...existing, fields: { ...existing.fields, ...(body.fields ?? {}) } };
      store.replace(table, id, updated);
      return updated;
    });

    // PUT /v0/:baseId/:tableName/:recordId — replace single (overwrite fields).
    app.put('/v0/:baseId/:tableName/:recordId', async (req, reply) => {
      const table = tableOf(req);
      const id = recordIdOf(req);
      const existing = store.get(table, id);
      if (existing === undefined) {
        reply.code(404);
        return err('MODEL_ID_NOT_FOUND', `Record ${id} not found`);
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const updated = { ...existing, fields: { ...(body.fields ?? {}) } };
      store.replace(table, id, updated);
      return updated;
    });

    // DELETE /v0/:baseId/:tableName?records[]=..&records[]=.. — batch delete.
    app.delete('/v0/:baseId/:tableName', async (req) => {
      const table = tableOf(req);
      const query = (req.query ?? {}) as Record<string, any>;
      const raw = query['records[]'] ?? query.records ?? [];
      const ids: string[] = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const out = ids
        .filter((id) => id.length > 0)
        .map((id) => ({ deleted: store.destroy(table, id), id }));
      return { records: out };
    });

    // DELETE /v0/:baseId/:tableName/:recordId — delete single.
    app.delete('/v0/:baseId/:tableName/:recordId', async (req) => {
      const table = tableOf(req);
      const id = recordIdOf(req);
      const deleted = store.destroy(table, id);
      return { deleted, id };
    });
  },

  seed,
};

export default plugin;
