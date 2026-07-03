import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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

/**
 * New Tracker API (/api/tracker) object types, mapped to their store collection,
 * the id field carried inside each object, and the bundleReport type key.
 */
const TRACKER_TYPES: Record<string, { collection: string; idField: string; reportType: string }> = {
  trackedEntities: { collection: 'trackedEntities', idField: 'trackedEntity', reportType: 'TRACKED_ENTITY' },
  events: { collection: 'events', idField: 'event', reportType: 'EVENT' },
  enrollments: { collection: 'enrollments', idField: 'enrollment', reportType: 'ENROLLMENT' },
  relationships: { collection: 'relationships', idField: 'relationship', reportType: 'RELATIONSHIP' },
};

/** A representative DHIS2 /api/analytics response (aggregate grid). */
function analyticsResponse(): Record<string, any> {
  return {
    headers: [
      { name: 'dx', column: 'Data', valueType: 'TEXT', type: 'java.lang.String', hidden: false, meta: true },
      { name: 'pe', column: 'Period', valueType: 'TEXT', type: 'java.lang.String', hidden: false, meta: true },
      { name: 'ou', column: 'Organisation unit', valueType: 'TEXT', type: 'java.lang.String', hidden: false, meta: true },
      { name: 'value', column: 'Value', valueType: 'NUMBER', type: 'java.lang.Double', hidden: false, meta: false },
    ],
    metaData: {
      items: {
        fbfJHSPpUQD: { name: 'ANC 1st visit' },
        cYeuwXTCPkU: { name: 'ANC 2nd visit' },
        ImspTQPwCqd: { name: 'Sierra Leone' },
        '202401': { name: 'January 2024' },
      },
      dimensions: { dx: ['fbfJHSPpUQD', 'cYeuwXTCPkU'], pe: ['202401'], ou: ['ImspTQPwCqd'] },
    },
    rows: [
      ['fbfJHSPpUQD', '202401', 'ImspTQPwCqd', '123.0'],
      ['cYeuwXTCPkU', '202401', 'ImspTQPwCqd', '98.0'],
    ],
    width: 4,
    height: 2,
  };
}

/** A small /api/schemas catalog (enough for get('schemas') / get('schemas/x')). */
function schemaList(port: number): Array<Record<string, any>> {
  const mk = (name: string, plural: string, klass: string) => ({
    name,
    plural,
    klass: `org.hisp.dhis.${klass}`,
    metadata: true,
    href: `http://localhost:${port}/api/schemas/${name}`,
  });
  return [
    mk('dataElement', 'dataElements', 'dataelement.DataElement'),
    mk('organisationUnit', 'organisationUnits', 'organisationunit.OrganisationUnit'),
    mk('program', 'programs', 'program.Program'),
    mk('trackedEntityType', 'trackedEntityTypes', 'trackedentity.TrackedEntityType'),
    mk('dataSet', 'dataSets', 'dataset.DataSet'),
    mk('optionSet', 'optionSets', 'option.OptionSet'),
    mk('option', 'options', 'option.Option'),
  ];
}

const plugin: MockSystemPlugin = {
  name: 'dhis2',
  specFile: 'dhis2.openapi.json',
  // DHIS2 uses HTTP Basic auth; reject requests with no credentials.
  auth: { required: true, schemes: ['basic'] },
  // OpenFn credential shape (what a user pastes into OpenFn); the sandbox reads
  // this to visualise + generate suggestions. The mock validates presence, not value.
  credential: {
    type: 'userpass',
    authHeader: { scheme: 'basic', userField: 'username', passField: 'password' },
    fields: [
      { name: 'hostUrl', role: 'url' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage: [
    { fn: "create", signature: "create(path, data, params?)", description: "Create a new DHIS2 record (program, event, tracked entity, data set, ...).",
      code: "create('trackedEntityInstances', {\n  orgUnit: 'DiszpKrYNg8', trackedEntityType: 'nEenWmSyUEp',\n  attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Aminata' }]\n});", apiRef: "ex4" },
    { fn: "get", signature: "get(path, params?)", description: "Retrieve any DHIS2 resource as JSON via its REST path.",
      code: "get('programs/IpHINAT79UW', { fields: 'id,name,programStages' });", apiRef: "ex3" },
    { fn: "update", signature: "update(resourceType, path, data, options?)", description: "Replace an existing resource; requires the full object body.",
      code: "update('events', 'PVqUD2hvU4E', {\n  program: 'IpHINAT79UW', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED'\n});", apiRef: "ex5" },
    { fn: "upsert", signature: "upsert(resourceType, query, data, options?)", description: "Update a record matched by query, or create it if none is found.",
      code: "upsert('trackedEntities', {}, {\n  orgUnit: 'DiszpKrYNg8', trackedEntityType: 'nEenWmSyUEp',\n  attributes: [{ attribute: 'w75KJ2mc4zz', value: 'Aminata' }]\n});", apiRef: "ex5" },
    { fn: "destroy", signature: "destroy(resourceType, path, data?, options?)", description: "Delete a DHIS2 record by resourceType and id/path.",
      code: "destroy('trackedEntities', 'LcRd6Nyaq7T');", apiRef: "ex5" },
    { fn: "tracker.import", signature: "tracker.import(strategy, payload, options?)", description: "Import tracker data (events, enrollments, trackedEntities) via /api/tracker.",
      code: "tracker.import('CREATE_AND_UPDATE', {\n  events: [{ program: 'IpHINAT79UW', programStage: 'A03MvHHogjR', orgUnit: 'DiszpKrYNg8', status: 'COMPLETED' }]\n});", apiRef: "ex5" },
    { fn: "tracker.export", signature: "tracker.export(path, query?, options?)", description: "Export tracker data (events, enrollments, trackedEntities) from /api/tracker.",
      code: "tracker.export('events', { orgUnit: 'DiszpKrYNg8', program: 'IpHINAT79UW' });", apiRef: "ex6" },
  ],

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

    // ---------------------------------------------------------------------
    // Generic /api/** layer for the modern (generic) dhis2 adaptor.
    //
    // The adaptor routes everything through /api[/{version}]/{path}, so this
    // wildcard covers: an optional numeric version segment, the new Tracker API
    // (POST/GET /api/tracker), analytics, schemas, resourceTypes, and classic
    // CRUD for ANY resourceType. The specific routes above take priority (static
    // beats wildcard), so seeded resources and the existing tests are unaffected;
    // this only handles versioned paths and endpoints not covered above.
    // ---------------------------------------------------------------------

    /** Wildcard path -> segments, stripping a trailing `.json` and a leading numeric version. */
    const apiSegments = (req: FastifyRequest): string[] => {
      let segs = String((req.params as Record<string, any>)['*'] ?? '')
        .split('?')[0]
        .split('/')
        .filter(Boolean);
      if (segs.length && /^\d+$/.test(segs[0])) segs = segs.slice(1); // /api/{version}/...
      if (segs.length) segs[segs.length - 1] = segs[segs.length - 1].replace(/\.json$/, '');
      return segs;
    };

    const systemInfo = () => ({
      version: (config.version as string) || '2.39',
      revision: '9d9dcf1',
      serverDate: new Date().toISOString(),
      contextPath: `http://localhost:${config.port}`,
    });

    /** POST /api/tracker — import trackedEntities/events/enrollments/relationships. */
    const trackerImport = (body: Record<string, any>, reply: FastifyReply) => {
      const typeReportMap: Record<string, any> = {};
      let total = 0;
      for (const [key, meta] of Object.entries(TRACKER_TYPES)) {
        const arr = Array.isArray(body[key]) ? body[key] : [];
        const objectReports = arr.map((obj: any) => {
          const o = obj && typeof obj === 'object' ? obj : {};
          const existing = o[meta.idField];
          const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
          store.create(meta.collection, uid, { ...o, [meta.idField]: uid });
          total++;
          return { uid, trackerType: meta.reportType, errorReports: [] };
        });
        if (objectReports.length) {
          typeReportMap[meta.reportType] = {
            trackerType: meta.reportType,
            stats: { created: objectReports.length, updated: 0, deleted: 0, ignored: 0, total: objectReports.length },
            objectReports,
          };
        }
      }
      reply.code(200);
      return {
        status: 'OK',
        validationReport: { errorReports: [], warningReports: [] },
        stats: { created: total, updated: 0, deleted: 0, ignored: 0, total },
        bundleReport: { status: 'OK', typeReportMap },
      };
    };

    // GET /api/** — reads for the generic adaptor + new endpoints.
    app.get('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs.length === 0) return {};
      const [head, second, third] = segs;
      const query = (req.query ?? {}) as Record<string, any>;

      if (head === 'system' && second === 'info') return systemInfo();
      if (head === 'analytics') return analyticsResponse();
      if (head === 'resourceTypes') {
        return { resourceTypes: schemaList(config.port).map((s) => ({ singular: s.name, plural: s.plural, href: s.href })) };
      }
      if (head === 'schemas') {
        const all = schemaList(config.port);
        if (second) {
          const found = all.find((s) => s.name === second || s.plural === second);
          if (!found) {
            reply.code(404);
            return NOT_FOUND;
          }
          return found;
        }
        return { schemas: all };
      }
      if (head === 'tracker') {
        // /api/tracker/{type}[/{id}]
        const meta = second ? TRACKER_TYPES[second] : undefined;
        if (!meta) return { instances: [], page: 1, pageSize: 50, total: 0 };
        if (third) {
          const item = store.get(meta.collection, third);
          if (item === undefined) {
            reply.code(404);
            return NOT_FOUND;
          }
          return item;
        }
        const instances = store.list(meta.collection);
        return { instances, page: 1, pageSize: 50, total: instances.length };
      }
      if (head === 'dataValueSets') {
        const dataValues: any[] = [];
        for (const set of store.list('dataValueSets')) {
          if (Array.isArray(set?.dataValues)) dataValues.push(...set.dataValues);
        }
        return { dataValues };
      }

      // Classic resource: /api/{resourceType}[/{id}]
      if (segs.length === 1) return listEnvelope(head, store.list(head), query);
      const item = store.get(head, segs[segs.length - 1]);
      if (item === undefined) {
        reply.code(404);
        return NOT_FOUND;
      }
      return item;
    });

    // POST /api/** — new Tracker imports + classic creates for any resourceType.
    app.post('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs.length === 0) {
        reply.code(404);
        return NOT_FOUND;
      }
      const head = segs[0];
      const body = (req.body ?? {}) as Record<string, any>;

      if (head === 'tracker') return trackerImport(body, reply);

      // Classic create: store + ImportSummary. Only for a bare collection path.
      if (segs.length === 1) {
        const idField = ID_FIELD[head] ?? 'id';
        const existing = body[idField];
        const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
        const record = { ...(typeof body === 'object' && !Array.isArray(body) ? body : {}), [idField]: uid };
        store.create(head, uid, record);
        reply.code(200);
        reply.header('Location', `http://localhost:${config.port}/api/${head}/${uid}`);
        return importSummary(uid);
      }
      // POST to /api/{resource}/{id} (update-by-post): merge.
      const updated = store.update(head, segs[segs.length - 1], body);
      reply.code(200);
      return updated ? importSummary(String(segs[segs.length - 1])) : NOT_FOUND;
    });

    // PUT /api/{resourceType}/{id} — full update.
    app.put('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs.length < 2) {
        reply.code(404);
        return NOT_FOUND;
      }
      const [head] = segs;
      const id = segs[segs.length - 1];
      const idField = ID_FIELD[head] ?? 'id';
      const body = (req.body ?? {}) as Record<string, any>;
      store.replace(head, id, { ...body, [idField]: id });
      reply.code(200);
      return importSummary(id);
    });

    // PATCH /api/{resourceType}/{id} — partial update (http.patch).
    app.patch('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs.length < 2) {
        reply.code(404);
        return NOT_FOUND;
      }
      const [head] = segs;
      const id = segs[segs.length - 1];
      const updated = store.update(head, id, (req.body ?? {}) as Record<string, any>);
      if (updated === undefined) {
        reply.code(404);
        return NOT_FOUND;
      }
      reply.code(200);
      return importSummary(id);
    });

    // DELETE /api/{resourceType}/{id} (classic) or DELETE /api/tracker/{type}/{id}.
    // (The adaptor's destroy() on tracker types goes through POST /api/tracker
    // with importStrategy=DELETE; a bare DELETE is also accepted here.)
    app.delete('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs[0] === 'tracker') {
        const meta = segs[1] ? TRACKER_TYPES[segs[1]] : undefined;
        if (meta && segs[2]) store.destroy(meta.collection, segs[2]);
        reply.code(200);
        return { httpStatus: 'OK', httpStatusCode: 200, status: 'OK' };
      }
      if (segs.length < 2) {
        reply.code(404);
        return NOT_FOUND;
      }
      const head = segs[0];
      const id = segs[segs.length - 1];
      if (!store.destroy(head, id)) {
        reply.code(404);
        return NOT_FOUND;
      }
      reply.code(200);
      return {
        httpStatus: 'OK',
        httpStatusCode: 200,
        status: 'OK',
        response: { responseType: 'ObjectReport', uid: id, klass: head },
      };
    });
  },

  seed,
};

export default plugin;
