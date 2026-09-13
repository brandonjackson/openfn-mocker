import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ethiopia Master Facility Registry (mfr.moh.gov.et). The et-mfr adaptor is a
 * thin HTTP wrapper: get/post/request expand a relative path, which the adaptor
 * joins onto an `/api/` prefix before sending, and authenticate with HTTP Basic
 * (username/password from the credential). So a call like get('Facility/All')
 * hits GET /api/Facility/All. Auth is accept-all here.
 *
 * The one shape that matters: **every MFR operation answers 200 with the
 * envelope `{ result, message, model }`** — never a bare array, never a 201.
 * `result` is the API's own status (0 success, 1 rejected) and is independent
 * of the HTTP status; the adaptor's `Utils.js` unwraps `body.model` onto
 * state.data. The health probe is the one exception: it answers its report
 * directly. The two searches (GetFacilities, ExportCSV) are POSTs taking a
 * filter document, not GETs.
 */

const API = '/api';

/** The `{ result, message, model }` envelope every MFR operation answers with. */
function envelope<T>(model: T, message = 'Operation Successful'): { result: number; message: string; model: T } {
  return { result: 0, message, model };
}

/** The same envelope for a rejected call: result 1, no model. */
function rejected(message: string): { result: number; message: string; model: null } {
  return { result: 1, message, model: null };
}

/** An ASP.NET model-validation problem document (HTTP 400). */
function validationProblem(field: string, error: string) {
  return {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors: { [field]: [error] },
    traceId: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
  };
}

/** Next facility id: one past the highest in the store. */
function nextFacilityId(store: DataStore): number {
  const ids = store.list('facilities').map((f) => Number(f.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 1071643) + 1;
}

/** Read a positive integer with a fallback. */
function intOr(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Normalise a query/body value into a list of numbers ([] when absent). */
function idList(value: unknown): number[] {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((v) => Number(v)).filter((n) => Number.isFinite(n));
}

/** The facility filter MFR accepts as a JSON body (POST) or query params (GET /All). */
interface FacilityFilter {
  name?: string;
  regionId?: unknown;
  zoneId?: unknown;
  woredaId?: unknown;
  facilityTypeId?: unknown;
  ownershipId?: unknown;
  operationalStatusId?: unknown;
  statusId?: unknown;
}

const ID_FILTERS = [
  'regionId',
  'zoneId',
  'woredaId',
  'facilityTypeId',
  'ownershipId',
  'operationalStatusId',
  'statusId',
] as const;

/** Apply a FacilityFilter to the facility list. */
function applyFilter(facilities: any[], filter: FacilityFilter): any[] {
  let out = facilities;
  if (typeof filter.name === 'string' && filter.name.length) {
    const needle = filter.name.toLowerCase();
    out = out.filter((f) => String(f.name ?? '').toLowerCase().includes(needle));
  }
  for (const key of ID_FILTERS) {
    const wanted = idList(filter[key]);
    if (wanted.length) out = out.filter((f) => wanted.includes(Number(f[key])));
  }
  return out;
}

/**
 * The flattened row the paged search returns: lookups resolved to their names,
 * with the paging totals repeated on every row.
 */
function toSummary(f: any, totalCount: number, pageCount: number) {
  return {
    id: f.id,
    name: f.name,
    status: f.status?.name ?? null,
    operationalStatus: f.operationalStatus?.name ?? null,
    facilityType: f.facilityType?.name ?? null,
    parentFacilityType: f.facilityType?.parentFacility?.name ?? null,
    ownership: f.ownership?.name ?? null,
    region: f.region?.name ?? null,
    zone: f.zone?.name ?? null,
    woreda: f.woreda?.name ?? null,
    totalCount,
    pageCount,
  };
}

const CSV_COLUMNS = ['id', 'name', 'hmisCode', 'region', 'zone', 'woreda', 'facilityType', 'operationalStatus'];

/** One CSV cell for a facility column, resolving reference objects to names. */
function csvCell(f: any, column: string): string {
  const value = f[column];
  const resolved = value && typeof value === 'object' ? value.name : value;
  return `"${String(resolved ?? '').replace(/"/g, '""')}"`;
}

const plugin: MockSystemPlugin = {
  name: 'et-mfr',
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
    /** A lookup row as the API serves it: without our internal `lookupType` index. */
    const servedLookup = (row: any) => {
      const { lookupType: _type, ...rest } = row;
      return rest;
    };

    /**
     * Resolve the reference objects a written facility's ids point at. A
     * reference the write did not supply is left off the record entirely
     * (`woreda` and `facilityType` are the two the registry reports as null),
     * rather than nulled: MFR only ever returns a resolved object there.
     */
    const resolveRefs = (f: Record<string, any>): Record<string, any> => {
      const lookup = (id: unknown) => {
        const row = id === undefined || id === null ? undefined : store.get('lookups', String(id));
        return row ? servedLookup(row) : undefined;
      };
      const resolved: Record<string, any> = {
        ...f,
        region: store.get('regions', String(f.regionId)),
        zone: store.get('zones', String(f.zoneId)),
        woreda: store.get('woredas', String(f.woredaId)) ?? null,
        status: lookup(f.statusId),
        ownership: lookup(f.ownershipId),
        facilityType: lookup(f.facilityTypeId) ?? null,
        operationalStatus: lookup(f.operationalStatusId),
        settlement: lookup(f.settlementId),
      };
      for (const key of ['region', 'zone', 'status', 'ownership', 'operationalStatus', 'settlement']) {
        if (resolved[key] === undefined) delete resolved[key];
      }
      return resolved;
    };

    // --- Health ---------------------------------------------------------
    // GET /api/Health — the readiness probe, the one route that answers its
    // payload directly rather than in the envelope.
    app.get(`${API}/Health`, async () => ({
      status: 'Healthy',
      environment: 'Production',
      application: 'MFR.API',
      timestamp: new Date().toISOString(),
      totalDurationMs: 12.4,
      dependencies: [
        { name: 'mfr-db', type: 'SqlServer', url: 'tcp:mfr-db,1433', status: 'Healthy', description: null, error: null, durationMs: 8.1, tags: ['db', 'ready'] },
        { name: 'dhis2', type: 'Http', url: 'https://hmis.moh.gov.et/api', status: 'Healthy', description: null, error: null, durationMs: 4.3, tags: ['external'] },
      ],
    }));

    // --- Reference data -------------------------------------------------
    // GET /api/Lookup?name=FacilityType — one reference-data collection. A
    // missing `name` is an ASP.NET model-validation 400; an unknown one is a
    // 200 the API itself rejects (result 1).
    app.get(`${API}/Lookup`, async (req, reply) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const name = typeof q.name === 'string' ? q.name : '';
      if (!name) {
        reply.code(400);
        return validationProblem('name', 'The name field is required.');
      }
      const rows = store.list('lookups', (l) => String(l.lookupType).toLowerCase() === name.toLowerCase());
      if (!rows.length) return rejected(`Lookup type '${name}' was not found.`);
      return envelope(rows.map(servedLookup));
    });

    // POST /api/Lookup — add a reference-data row.
    app.post(`${API}/Lookup`, async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = intOr(body.id, store.count('lookups') + 1000);
      const row = {
        lookupType: typeof body.lookupType === 'string' ? body.lookupType : 'FacilityType',
        id,
        name: body.name ?? null,
        code: body.code ?? null,
        isActive: true,
        createdBy: 1,
        createdDate: new Date().toISOString(),
        modifiedBy: 1,
        modifiedDate: new Date().toISOString(),
        rowGuid: randomUUID(),
      };
      store.create('lookups', String(id), row);
      return envelope(servedLookup(row), 'Lookup created successfully');
    });

    // --- Locations ------------------------------------------------------
    app.get(`${API}/Location/Regions`, async () => envelope(store.list('regions')));
    app.get(`${API}/Location/Zones`, async () => envelope(store.list('zones')));
    app.get(`${API}/Location/Woredas`, async () => envelope(store.list('woredas')));

    // --- Facilities -----------------------------------------------------
    // GET /api/Facility/All — every matching facility in full detail. The
    // filter arrives as query parameters here, as a JSON body on the POSTs.
    app.get(`${API}/Facility/All`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      return envelope(applyFilter(store.list('facilities'), q as FacilityFilter));
    });

    // POST /api/Facility/GetFacilities — one page of flattened summaries. The
    // adaptor walks pages with pageNumber until a short page comes back.
    app.post(`${API}/Facility/GetFacilities`, async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const pageNumber = intOr(body.pageNumber, 1);
      const showPerPage = intOr(body.showPerPage, 200);
      const matched = applyFilter(store.list('facilities'), body as FacilityFilter);
      const totalCount = matched.length;
      const pageCount = Math.ceil(totalCount / showPerPage);
      const page = matched.slice((pageNumber - 1) * showPerPage, pageNumber * showPerPage);
      return envelope(page.map((f) => toSummary(f, totalCount, pageCount)));
    });

    // POST /api/Facility/ExportCSV — the same search, rendered as CSV.
    app.post(`${API}/Facility/ExportCSV`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const columns = Array.isArray(body.columns) && body.columns.length ? body.columns.map(String) : CSV_COLUMNS;
      const rows = applyFilter(store.list('facilities'), body as FacilityFilter);
      const csv = [columns.join(','), ...rows.map((f) => columns.map((c) => csvCell(f, c)).join(','))].join('\n');
      reply.header('content-type', 'application/csv; charset=utf-8');
      return `${csv}\n`;
    });

    // GET /api/Facility?id=1071644 — one facility by its MFR id.
    app.get(`${API}/Facility`, async (req, reply) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const id = q.id === undefined || q.id === '' ? undefined : String(q.id);
      if (id === undefined) return rejected('Facility id is required.');
      const found = store.get('facilities', id);
      if (!found) {
        reply.code(404);
        return rejected('Facility not found.');
      }
      return envelope(found);
    });

    // POST /api/Facility — create a facility. MFR answers 200, not 201.
    app.post(`${API}/Facility`, async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = intOr(body.id, nextFacilityId(store));
      const now = new Date().toISOString();
      const facility = resolveRefs({
        operationalStatusId: 401,
        statusId: 602,
        ...body,
        id,
        isActive: true,
        createdBy: 1,
        createdDate: now,
        modifiedBy: 1,
        modifiedDate: now,
        rowGuid: randomUUID(),
      });
      store.create('facilities', String(id), facility);
      return envelope(facility, 'Facility created successfully');
    });

    // PUT /api/Facility — update a facility (the body carries its id).
    app.put(`${API}/Facility`, async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = body.id === undefined ? undefined : String(body.id);
      const existing = id === undefined ? undefined : store.get('facilities', id);
      if (!existing) return rejected('Facility not found.');
      const merged = resolveRefs({ ...existing, ...body, id: existing.id, modifiedDate: new Date().toISOString() });
      store.replace('facilities', String(existing.id), merged);
      return envelope(merged, 'Facility updated successfully');
    });

    // GET /api/Facility/{dhis2Id} — one facility by its DHIS2 org-unit id.
    app.get(`${API}/Facility/:dhis2Id`, async (req, reply) => {
      const dhis2Id = String((req.params as Record<string, any>).dhis2Id);
      const found = store.list('facilities').find((f) => String(f.dhis2Id) === dhis2Id);
      if (!found) {
        reply.code(404);
        return rejected('Facility not found.');
      }
      return envelope(found);
    });

    // DELETE /api/Facility/{dhis2Id} — delete by DHIS2 id.
    app.delete(`${API}/Facility/:dhis2Id`, async (req) => {
      const dhis2Id = String((req.params as Record<string, any>).dhis2Id);
      const found = store.list('facilities').find((f) => String(f.dhis2Id) === dhis2Id);
      if (!found) return rejected('Facility not found.');
      store.destroy('facilities', String(found.id));
      return envelope(null, 'Facility deleted successfully');
    });
  },

  seed,
};

export default plugin;
