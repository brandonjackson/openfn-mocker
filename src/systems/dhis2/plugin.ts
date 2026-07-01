import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, genUid } from './seed.js';

/**
 * DHIS2 (port 4010, Basic auth, credential field hostUrl).
 *
 * DHIS2's Web API is not plain CRUD: list responses carry a `pager` plus a
 * resource-typed array, tracker POSTs return an ImportSummary envelope, and
 * /api/metadata ingests a bundle of collections. So this plugin registers
 * custom handlers rather than leaning on registerCrud. Auth is accept-all
 * (handled by createSystemServer).
 */

/** id field carried inside a record, per collection. */
const ID_FIELD: Record<string, string> = {
  organisationUnits: 'id',
  dataElements: 'id',
  programs: 'id',
  trackedEntityTypes: 'id',
  trackedEntityInstances: 'trackedEntityInstance',
  events: 'event',
  enrollments: 'enrollment',
  dataValueSets: 'id',
};

interface FilterClause {
  field: string;
  op: string;
  value: string;
}

/** Parse DHIS2 `?filter=field:op:value` params (repeatable). */
function parseFilters(query: Record<string, any>): FilterClause[] {
  const raw = query.filter;
  if (raw === undefined || raw === null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: FilterClause[] = [];
  for (const entry of arr) {
    const parts = String(entry).split(':');
    if (parts.length < 2) continue;
    const [field, op, ...rest] = parts;
    out.push({ field, op, value: rest.join(':') });
  }
  return out;
}

function applyFilters(items: any[], filters: FilterClause[]): any[] {
  if (filters.length === 0) return items;
  return items.filter((item) =>
    filters.every((f) => {
      const v = (item as Record<string, any>)[f.field];
      const val = f.value ?? '';
      switch (f.op) {
        case 'eq':
          return String(v) === val;
        case 'ne':
          return String(v) !== val;
        case 'like':
        case 'ilike':
          return String(v ?? '').toLowerCase().includes(val.toLowerCase());
        default:
          return true;
      }
    })
  );
}

/** Build a DHIS2 list envelope `{ pager, "<resourceType>": [...] }`. */
function listEnvelope(resourceType: string, all: any[], query: Record<string, any>): any {
  const items = applyFilters(all, parseFilters(query));
  const paging = query.paging;
  if (paging === 'false' || paging === false) {
    return { [resourceType]: items };
  }
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.max(1, parseInt(String(query.pageSize ?? '50'), 10) || 50);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);
  return { pager: { page, pageSize, pageCount, total }, [resourceType]: paged };
}

/** Standard DHIS2 ImportSummary response for a single created object. */
function importSummary(reference: string): any {
  return {
    httpStatus: 'OK',
    httpStatusCode: 200,
    status: 'OK',
    response: {
      responseType: 'ImportSummary',
      status: 'SUCCESS',
      importCount: { imported: 1, updated: 0, ignored: 0, deleted: 0 },
      reference,
    },
  };
}

const NOT_FOUND = {
  httpStatus: 'Not Found',
  httpStatusCode: 404,
  status: 'ERROR',
  message: 'Object not found.',
};

const plugin: MockSystemPlugin = {
  name: 'dhis2',
  specFile: 'dhis2.openapi.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    // --- System info ---
    app.get('/api/system/info', async () => ({
      version: (config.version as string) || '2.39',
      revision: '9d9dcf1',
      serverDate: new Date().toISOString(),
      contextPath: `http://localhost:${config.port}`,
    }));

    // Metadata resources: list + single-by-uid.
    const metaResources = ['organisationUnits', 'dataElements', 'programs', 'trackedEntityTypes'];
    for (const res of metaResources) {
      app.get(`/api/${res}`, async (req: FastifyRequest) => {
        return listEnvelope(res, store.list(res), (req.query ?? {}) as Record<string, any>);
      });
      app.get(`/api/${res}/:id`, async (req: FastifyRequest, reply) => {
        const id = (req.params as Record<string, any>).id;
        const item = store.get(res, id);
        if (item === undefined) {
          reply.code(404);
          return NOT_FOUND;
        }
        return item;
      });
    }

    // Tracker collections: list envelope + import POST.
    const trackerResources = ['trackedEntityInstances', 'events', 'enrollments'];
    for (const res of trackerResources) {
      app.get(`/api/${res}`, async (req: FastifyRequest) => {
        return listEnvelope(res, store.list(res), (req.query ?? {}) as Record<string, any>);
      });
    }

    // POST importers (import summary + read-back-able store record).
    const importPaths = [
      'trackedEntityInstances',
      'events',
      'enrollments',
      'organisationUnits',
      'dataElements',
    ];
    for (const res of importPaths) {
      const idField = ID_FIELD[res] ?? 'id';
      app.post(`/api/${res}`, async (req: FastifyRequest, reply) => {
        const body = (req.body ?? {}) as Record<string, any>;
        const existing = body[idField];
        const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
        const record = { ...(typeof body === 'object' && !Array.isArray(body) ? body : {}), [idField]: uid };
        store.create(res, uid, record);
        reply.code(200);
        return importSummary(uid);
      });
    }

    // dataValueSets: read returns a flattened { dataValues: [...] }; POST imports.
    app.get('/api/dataValueSets', async () => {
      const dataValues: any[] = [];
      for (const set of store.list('dataValueSets')) {
        if (Array.isArray(set?.dataValues)) dataValues.push(...set.dataValues);
      }
      return { dataValues };
    });
    app.post('/api/dataValueSets', async (req: FastifyRequest, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const uid = genUid();
      store.create('dataValueSets', uid, { id: uid, ...body });
      reply.code(200);
      return {
        httpStatus: 'OK',
        httpStatusCode: 200,
        status: 'OK',
        response: {
          responseType: 'ImportSummary',
          status: 'SUCCESS',
          importCount: {
            imported: Array.isArray(body.dataValues) ? body.dataValues.length : 1,
            updated: 0,
            ignored: 0,
            deleted: 0,
          },
          reference: uid,
        },
      };
    });

    // /api/metadata: ingest a bundle of collections, return stats.
    app.post('/api/metadata', async (req: FastifyRequest, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      let created = 0;
      for (const [key, value] of Object.entries(body)) {
        if (!Array.isArray(value)) continue;
        const idField = ID_FIELD[key] ?? 'id';
        for (const item of value) {
          const obj = item && typeof item === 'object' ? item : {};
          const existing = (obj as Record<string, any>)[idField];
          const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
          store.create(key, uid, { ...obj, [idField]: uid });
          created++;
        }
      }
      reply.code(200);
      return {
        status: 'OK',
        stats: { created, updated: 0, deleted: 0, ignored: 0, total: created },
      };
    });
  },

  seed,
};

export default plugin;
