import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed, genUid } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

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

// ---------------------------------------------------------------------------
// Field filtering (`?fields=`), as DHIS2's FieldFilterService applies it to
// metadata reads: a list defaults to the ID_NAME preset (`id,displayName`), a
// single object to `*`, and a nested reference that is not itself expanded
// with `[...]` comes back id-only (FieldPathHelper.expandReference).
// ---------------------------------------------------------------------------

interface FieldNode {
  name: string;
  children?: FieldNode[];
}

const FIELD_PRESETS: Record<string, string[]> = {
  all: ['*'],
  owner: ['*'],
  persisted: ['*'],
  simple: ['*'],
  id: ['id'],
  code: ['code'],
  idName: ['id', 'displayName'],
  identifiable: ['id', 'name', 'code', 'created', 'lastUpdated', 'lastUpdatedBy'],
  nameable: ['id', 'name', 'shortName', 'description', 'code', 'created', 'lastUpdated'],
};

/** Parse a DHIS2 field expression (`id,name,parent[id,name],:nameable`) into a tree. */
function parseFields(spec: string): FieldNode[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of spec) {
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const out: FieldNode[] = [];
  for (const raw of parts.map((p) => p.trim()).filter(Boolean)) {
    if (raw.startsWith('!')) continue; // exclusions: not modelled, the field is simply not added
    const open = raw.search(/[[(]/);
    if (open > 0) {
      out.push({ name: raw.slice(0, open), children: parseFields(raw.slice(open + 1, -1)) });
    } else if (raw.startsWith(':')) {
      for (const f of FIELD_PRESETS[raw.slice(1)] ?? ['*']) out.push({ name: f });
    } else out.push({ name: raw });
  }
  return out;
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** A nested value with no sub-selection: references collapse to `{ id }`. */
function defaultValue(v: any): any {
  if (Array.isArray(v)) return v.map(defaultValue);
  if (isPlainObject(v) && typeof v.id === 'string') return { id: v.id };
  return v;
}

/** Project one object through a field tree. */
function project(obj: any, fields: FieldNode[]): any {
  if (Array.isArray(obj)) return obj.map((o) => project(o, fields));
  if (!isPlainObject(obj)) return obj;
  const src: Record<string, any> =
    typeof obj.name === 'string' && obj.displayName === undefined ? { ...obj, displayName: obj.name } : obj;
  const out: Record<string, any> = {};
  if (fields.some((f) => f.name === '*')) {
    for (const [k, v] of Object.entries(src)) out[k] = defaultValue(v);
  }
  for (const f of fields) {
    if (f.name === '*' || !(f.name in src)) continue;
    out[f.name] = f.children ? project(src[f.name], f.children) : defaultValue(src[f.name]);
  }
  return out;
}

/** Apply `?fields=` (or the default for a list / a single object) to a metadata read. */
function selectFields(value: any, query: Record<string, any>, list: boolean): any {
  const raw = query.fields;
  const spec = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' && raw.trim() ? raw : undefined;
  const fields = spec ? parseFields(spec) : list ? FIELD_PRESETS.idName.map((name) => ({ name })) : [{ name: '*' }];
  return project(value, fields);
}

/** Build a DHIS2 list envelope `{ pager, "<resourceType>": [...] }`. */
function listEnvelope(resourceType: string, all: any[], query: Record<string, any>): any {
  // Legacy tracker lists render every field unless `fields` narrows them (2.40's
  // controllers use getFieldsFromRequestOrAll); metadata lists default to id,displayName.
  const filtered = applyFilters(all, parseFilters(query));
  const items =
    LEGACY_TRACKER.has(resourceType) && query.fields === undefined
      ? filtered
      : filtered.map((item) => selectFields(item, query, true));
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
 * The deprecated (pre-2.41) tracker resources. DHIS2 2.40 and earlier serve
 * these at /api/{resource}; 2.41 removed them in favour of /api/tracker. Their
 * writes answer with ImportSummaries, not the ObjectReport metadata writes use.
 */
const LEGACY_TRACKER = new Set(['trackedEntityInstances', 'events', 'enrollments']);

/** Java class DHIS2 reports as `klass` in an ObjectReport, per metadata collection. */
const KLASS: Record<string, string> = {
  organisationUnits: 'org.hisp.dhis.organisationunit.OrganisationUnit',
  dataElements: 'org.hisp.dhis.dataelement.DataElement',
  programs: 'org.hisp.dhis.program.Program',
  programStages: 'org.hisp.dhis.program.ProgramStage',
  trackedEntityTypes: 'org.hisp.dhis.trackedentity.TrackedEntityType',
  trackedEntityAttributes: 'org.hisp.dhis.trackedentity.TrackedEntityAttribute',
  dataSets: 'org.hisp.dhis.dataset.DataSet',
  optionSets: 'org.hisp.dhis.option.OptionSet',
  options: 'org.hisp.dhis.option.Option',
};

const klassOf = (collection: string): string => {
  if (KLASS[collection]) return KLASS[collection];
  const singular = collection.replace(/s$/, '');
  return `org.hisp.dhis.${singular.toLowerCase()}.${singular[0]?.toUpperCase() ?? ''}${singular.slice(1)}`;
};

/**
 * A metadata write's WebMessage (WebMessageUtils.objectReport). A create
 * answers 201 Created (AbstractCrudController.postObject sets it, and
 * WebMessageControllerAdvice copies it onto the response); update, patch and
 * delete answer 200. `errorCode` is absent: DHIS2 only sets it on errors and
 * serialises with NON_NULL.
 */
function objectReport(collection: string, uid: string, created = false): Record<string, any> {
  return {
    httpStatus: created ? 'Created' : 'OK',
    httpStatusCode: created ? 201 : 200,
    status: 'OK',
    response: { responseType: 'ObjectReport', uid, klass: klassOf(collection), errorReports: [] },
  };
}

/**
 * A legacy tracker import's WebMessage (WebMessageUtils.importSummaries): one
 * ImportSummary per imported object, wrapped in ImportSummaries with the
 * totals. 2.40's EnrollmentController answers 201; the TEI and event
 * controllers answer 200.
 */
function importSummaries(
  collection: string,
  uids: string[],
  baseUrl: string
): { code: number; body: Record<string, any> } {
  const code = collection === 'enrollments' ? 201 : 200;
  return {
    code,
    body: {
      httpStatus: code === 201 ? 'Created' : 'OK',
      httpStatusCode: code,
      status: 'OK',
      message: 'Import was successful.',
      response: {
        responseType: 'ImportSummaries',
        status: 'SUCCESS',
        imported: uids.length,
        updated: 0,
        deleted: 0,
        ignored: 0,
        total: uids.length,
        importSummaries: uids.map((uid) => ({
          responseType: 'ImportSummary',
          status: 'SUCCESS',
          importCount: { imported: 1, updated: 0, ignored: 0, deleted: 0 },
          reference: uid,
          href: `${baseUrl}/api/${collection}/${uid}`,
        })),
      },
    },
  };
}

/** Apply an RFC 6902 JSON Patch (the body DHIS2's PATCH /api/{type}/{uid} takes) to a record. */
function applyJsonPatch(record: Record<string, any>, ops: any[]): Record<string, any> {
  const out = JSON.parse(JSON.stringify(record));
  for (const op of ops) {
    if (!op || typeof op !== 'object' || typeof op.path !== 'string') continue;
    const keys = op.path.split('/').slice(1).map((k: string) => k.replace(/~1/g, '/').replace(/~0/g, '~'));
    if (keys.length === 0) continue;
    let target: any = out;
    for (const k of keys.slice(0, -1)) {
      if (target[k] === undefined || target[k] === null) target[k] = {};
      target = target[k];
    }
    const last = keys[keys.length - 1];
    if (op.op === 'remove') {
      if (Array.isArray(target)) target.splice(Number(last), 1);
      else delete target[last];
    } else if (op.op === 'add' || op.op === 'replace') {
      if (Array.isArray(target) && last === '-') target.push(op.value);
      else target[last] = op.value;
    }
  }
  return out;
}

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
    // The grid reports its own dimensions: `width`/`headerWidth` count the
    // columns, `visibleWidth` the non-hidden ones and `height` the rows.
    // `lastDataRow` is a flag (is the cursor on the grid's last data row), not
    // an index.
    width: 4,
    height: 2,
    headerWidth: 4,
    visibleWidth: 4,
    lastDataRow: false,
  };
}

/** A small /api/schemas catalog (enough for get('schemas') / get('schemas/x')). */
function schemaList(port: number): Array<Record<string, any>> {
  // `order` is the schema's rank in DHIS2's metadata import order — required on
  // every schema, and what an importer sorts a metadata payload by.
  const mk = (name: string, plural: string, klass: string, order: number) => ({
    name,
    plural,
    klass: `org.hisp.dhis.${klass}`,
    metadata: true,
    order,
    href: `http://localhost:${port}/api/schemas/${name}`,
  });
  return [
    mk('dataElement', 'dataElements', 'dataelement.DataElement', 1300),
    mk('organisationUnit', 'organisationUnits', 'organisationunit.OrganisationUnit', 1310),
    mk('program', 'programs', 'program.Program', 1320),
    mk('trackedEntityType', 'trackedEntityTypes', 'trackedentity.TrackedEntityType', 1330),
    mk('dataSet', 'dataSets', 'dataset.DataSet', 1340),
    mk('optionSet', 'optionSets', 'option.OptionSet', 1350),
    mk('option', 'options', 'option.Option', 1360),
  ];
}

const plugin: MockSystemPlugin = {
  name: 'dhis2',
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

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const baseUrl = `http://localhost:${config.port}`;

    // --- System info (also served behind /api/{version}/ by the wildcard) ---
    const systemInfo = () => ({
      version: (config.version as string) || '2.39',
      revision: '9d9dcf1',
      serverDate: new Date().toISOString(),
      contextPath: baseUrl,
      // The session lifetime in seconds — the one field DHIS2 marks required on
      // this resource — plus the locale/calendar context a client reads with it.
      sessionTimeout: 3600,
      calendar: 'iso8601',
      dateFormat: 'yyyy-mm-dd',
      serverTimeZoneId: 'Etc/UTC',
    });
    app.get('/api/system/info', async () => systemInfo());

    /** Create one metadata object: store it and answer 201 + Location + ObjectReport. */
    const createMetadata = (collection: string, body: any, reply: FastifyReply) => {
      const obj = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
      const existing = obj.id;
      const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
      store.create(collection, uid, { ...obj, id: uid });
      reply.code(201);
      reply.header('Location', `${baseUrl}/api/${collection}/${uid}`);
      return objectReport(collection, uid, true);
    };

    /**
     * Legacy tracker import (2.40 and earlier): a single object, or a bulk
     * `{ "<collection>": [...] }` payload, answered with ImportSummaries.
     */
    const importLegacyTracker = (collection: string, body: any, reply: FastifyReply) => {
      const idField = ID_FIELD[collection] ?? 'id';
      const obj = body && typeof body === 'object' ? body : {};
      const items: any[] = Array.isArray(obj[collection]) ? obj[collection] : [obj];
      const uids = items.map((item) => {
        const o = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
        const existing = o[idField];
        const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
        store.create(collection, uid, { ...o, [idField]: uid });
        return uid;
      });
      const { code, body: out } = importSummaries(collection, uids, baseUrl);
      reply.code(code);
      if (uids.length === 1) reply.header('Location', `${baseUrl}/api/${collection}/${uids[0]}`);
      return out;
    };

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
        return selectFields(item, (req.query ?? {}) as Record<string, any>, false);
      });
    }

    // Tracker collections: list envelope + import POST.
    const trackerResources = ['trackedEntityInstances', 'events', 'enrollments'];
    for (const res of trackerResources) {
      app.get(`/api/${res}`, async (req: FastifyRequest) => {
        return listEnvelope(res, store.list(res), (req.query ?? {}) as Record<string, any>);
      });
    }

    // Legacy tracker imports (ImportSummaries) and metadata creates (ObjectReport).
    for (const res of LEGACY_TRACKER) {
      app.post(`/api/${res}`, async (req: FastifyRequest, reply) => importLegacyTracker(res, req.body, reply));
    }
    for (const res of ['organisationUnits', 'dataElements']) {
      app.post(`/api/${res}`, async (req: FastifyRequest, reply) => createMetadata(res, req.body, reply));
    }

    // dataValueSets: read returns a DataValueSet (the requested dataSet /
    // period / orgUnit plus their flattened dataValues); POST imports.
    const readDataValueSet = (query: Record<string, any>) => {
      const dataValues: any[] = [];
      for (const set of store.list('dataValueSets')) {
        if (!Array.isArray(set?.dataValues)) continue;
        for (const dv of set.dataValues) {
          const v = { period: set.period, orgUnit: set.orgUnit, ...dv };
          if (query.period && v.period !== query.period) continue;
          if (query.orgUnit && v.orgUnit !== query.orgUnit) continue;
          if (query.dataSet && set.dataSet !== query.dataSet) continue;
          dataValues.push(v);
        }
      }
      const out: Record<string, any> = {};
      for (const k of ['dataSet', 'period', 'orgUnit']) if (typeof query[k] === 'string') out[k] = query[k];
      return { ...out, dataValues };
    };
    app.get('/api/dataValueSets', async (req: FastifyRequest) =>
      readDataValueSet((req.query ?? {}) as Record<string, any>)
    );
    app.post('/api/dataValueSets', async (req: FastifyRequest, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const uid = genUid();
      store.create('dataValueSets', uid, { id: uid, ...body });
      reply.code(200);
      return {
        httpStatus: 'OK',
        httpStatusCode: 200,
        status: 'OK',
        message: 'Import was successful.',
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

    // /api/metadata: ingest a bundle of collections. DHIS2 wraps the
    // ImportReport (stats + one typeReport per object type) in a WebMessage.
    app.post('/api/metadata', async (req: FastifyRequest, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      let created = 0;
      const typeReports: any[] = [];
      for (const [key, value] of Object.entries(body)) {
        if (!Array.isArray(value)) continue;
        const idField = ID_FIELD[key] ?? 'id';
        const klass = klassOf(key);
        const objectReports = value.map((item, index) => {
          const obj = item && typeof item === 'object' ? item : {};
          const existing = (obj as Record<string, any>)[idField];
          const uid = existing != null && String(existing).length > 0 ? String(existing) : genUid();
          store.create(key, uid, { ...obj, [idField]: uid });
          return { klass, index, uid, errorReports: [] };
        });
        created += objectReports.length;
        const n = objectReports.length;
        typeReports.push({ klass, stats: { created: n, updated: 0, deleted: 0, ignored: 0, total: n }, objectReports });
      }
      reply.code(200);
      return {
        httpStatus: 'OK',
        httpStatusCode: 200,
        status: 'OK',
        response: {
          responseType: 'ImportReport',
          status: 'OK',
          stats: { created, updated: 0, deleted: 0, ignored: 0, total: created },
          typeReports,
        },
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
      if (head === 'dataValueSets') return readDataValueSet(query);

      // Classic resource: /api/{resourceType}[/{id}]
      if (segs.length === 1) return listEnvelope(head, store.list(head), query);
      const item = store.get(head, segs[segs.length - 1]);
      if (item === undefined) {
        reply.code(404);
        return NOT_FOUND;
      }
      return LEGACY_TRACKER.has(head) && query.fields === undefined ? item : selectFields(item, query, false);
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

      // Classic create, only for a bare collection path: a legacy tracker
      // import (ImportSummaries) or a metadata create (201 + ObjectReport).
      if (segs.length === 1) {
        if (LEGACY_TRACKER.has(head)) return importLegacyTracker(head, body, reply);
        return createMetadata(head, body, reply);
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
      // Legacy tracker updates answer with an ImportSummary (2.40 controllers).
      if (LEGACY_TRACKER.has(head)) {
        store.replace(head, id, { ...body, [idField]: id });
        reply.code(200);
        return importSummary(id);
      }
      // A metadata PUT updates an existing object (AbstractCrudController
      // .putJsonObject looks it up first, so an unknown uid is a 404).
      if (store.get(head, id) === undefined) {
        reply.code(404);
        return NOT_FOUND;
      }
      store.replace(head, id, { ...body, [idField]: id });
      reply.code(200);
      return objectReport(head, id);
    });

    // PATCH /api/{resourceType}/{id} — partial update (http.patch). DHIS2 takes
    // an RFC 6902 JSON Patch array (application/json-patch+json); a plain
    // object body is merged too, since the adaptor's http.patch sends one.
    app.patch('/api/*', async (req: FastifyRequest, reply) => {
      const segs = apiSegments(req);
      if (segs.length < 2) {
        reply.code(404);
        return NOT_FOUND;
      }
      const [head] = segs;
      const id = segs[segs.length - 1];
      const current = store.get(head, id);
      if (current === undefined) {
        reply.code(404);
        return NOT_FOUND;
      }
      const body = req.body ?? {};
      if (Array.isArray(body)) {
        const idField = ID_FIELD[head] ?? 'id';
        store.replace(head, id, { ...applyJsonPatch(current, body), [idField]: id });
      } else {
        store.update(head, id, body as Record<string, any>);
      }
      reply.code(200);
      return objectReport(head, id);
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
      if (LEGACY_TRACKER.has(head)) {
        // 2.40's legacy tracker controllers answer a delete with an ImportSummary.
        return {
          httpStatus: 'OK',
          httpStatusCode: 200,
          status: 'OK',
          message: 'Import was successful.',
          response: {
            responseType: 'ImportSummary',
            status: 'SUCCESS',
            importCount: { imported: 0, updated: 0, ignored: 0, deleted: 1 },
            reference: id,
          },
        };
      }
      return objectReport(head, id);
    });
  },

  seed,
};

export default plugin;
