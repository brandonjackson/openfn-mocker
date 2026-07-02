import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed, makeForm, DEFAULT_DOMAIN, DEFAULT_APP_ID } from './seed.js';

/**
 * CommCare HQ (port 4011). Source system. Domain-scoped v0.5 Data API returning
 * Tastypie-style { meta, objects } list envelopes, plus an OpenRosa form
 * receiver that consumes raw XML and returns an OpenRosaResponse XML document.
 * Auth is accept-all (handled by createSystemServer).
 */

const OPENROSA_SUCCESS =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<OpenRosaResponse xmlns="http://openrosa.org/http/response">' +
  '<message nature="submit_success">   √   </message>' +
  '</OpenRosaResponse>';

/** Read an integer query param, falling back to a default. */
function intParam(q: Record<string, any>, key: string, fallback: number): number {
  const raw = q[key];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Build a Tastypie list envelope with meta + objects for a paged slice. */
function tastypie(
  all: any[],
  req: FastifyRequest,
  basePath: string,
  defaultLimit: number
): { meta: Record<string, any>; objects: any[] } {
  const q = (req.query ?? {}) as Record<string, any>;
  const offset = intParam(q, 'offset', 0);
  const limit = intParam(q, 'limit', defaultLimit);
  const { items, total, hasMore } = paginate(all, { offset, limit });

  const buildLink = (newOffset: number): string => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (k === 'offset' || k === 'limit') continue;
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    params.set('limit', String(limit));
    params.set('offset', String(newOffset));
    return `${basePath}?${params.toString()}`;
  };

  return {
    meta: {
      limit,
      next: hasMore ? buildLink(offset + limit) : null,
      offset,
      previous: offset > 0 ? buildLink(Math.max(0, offset - limit)) : null,
      total_count: total,
    },
    objects: items,
  };
}

const plugin: MockSystemPlugin = {
  name: 'commcare',
  specFile: 'commcare.schema.json',

  async overrides(app: FastifyInstance, store: DataStore, config: SystemConfig) {
    const configuredDomain = (config.domain as string) || DEFAULT_DOMAIN;
    const appId = (config.appId as string) || DEFAULT_APP_ID;

    // GET case list — Tastypie envelope, supports ?type= &owner_id= &offset= &limit=.
    app.get('/a/:domain/api/v0.5/case/', async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let cases = store.list('cases');
      if (q.type) cases = cases.filter((c) => c.case_type === q.type);
      if (q.owner_id) cases = cases.filter((c) => c.owner_id === q.owner_id);
      const domain = (req.params as Record<string, any>).domain || configuredDomain;
      return tastypie(cases, req, `/a/${domain}/api/v0.5/case/`, 20);
    });

    // GET single case by case_id.
    app.get('/a/:domain/api/v0.5/case/:case_id/', async (req, reply) => {
      const { case_id } = req.params as Record<string, any>;
      const found = store.get('cases', String(case_id));
      if (!found) {
        reply.code(404);
        return { error: 'not found' };
      }
      return found;
    });

    // GET form list — Tastypie envelope.
    app.get('/a/:domain/api/v0.5/form/', async (req) => {
      const forms = store.list('forms');
      const domain = (req.params as Record<string, any>).domain || configuredDomain;
      return tastypie(forms, req, `/a/${domain}/api/v0.5/form/`, 20);
    });

    // GET single form by id.
    app.get('/a/:domain/api/v0.5/form/:id/', async (req, reply) => {
      const { id } = req.params as Record<string, any>;
      const found = store.get('forms', String(id));
      if (!found) {
        reply.code(404);
        return { error: 'not found' };
      }
      return found;
    });

    // POST OpenRosa form submission — raw text/xml body in, OpenRosaResponse XML out.
    const receiver = async (req: FastifyRequest, reply: any) => {
      const domain = (req.params as Record<string, any>).domain || configuredDomain;
      const rawXml = typeof req.body === 'string' ? req.body : '';
      const id = randomUUID();
      const form = makeForm({
        id,
        domain,
        appId,
        userId: 'user-submission',
        fields: { received_xml: rawXml },
      });
      store.create('forms', form.id, form);

      reply.code(201);
      reply.header('content-type', 'text/xml; charset=utf-8');
      return OPENROSA_SUCCESS;
    };
    app.post('/a/:domain/receiver/', receiver);
    app.post('/a/:domain/receiver/:id/', receiver);

    // Bulk uploads (submitXls / bulk) send multipart/form-data; accept the raw
    // body (we don't parse the spreadsheet, only ack it). Registered defensively
    // in case the multipart parser isn't already present on this instance.
    try {
      app.addContentTypeParser(
        'multipart/form-data',
        { parseAs: 'string' },
        (_req: unknown, body: string, done: (err: Error | null, body?: any) => void) => done(null, body)
      );
    } catch {
      /* already registered */
    }

    // --- Generic v0.5 Data API (Tastypie) for any resource -------------
    // The adaptor's get()/post() work over any resource segment (application,
    // user, location, fixture, data-source, ...). case/ and form/ keep their
    // specific handlers above (static wins); this wildcard covers the rest and
    // the configurable-report endpoint.
    const collectionFor = (resource: string): string =>
      resource === 'case' ? 'cases' : resource === 'form' ? 'forms' : resource;

    const v0Segments = (req: FastifyRequest): string[] =>
      String((req.params as Record<string, any>)['*'] ?? '')
        .split('?')[0]
        .split('/')
        .filter(Boolean);

    /** A representative configurable-report data response. */
    const reportResponse = (reportId: string) => ({
      report_name: `Report ${reportId}`,
      columns: [
        { header: 'Region', slug: 'region', expand_column_value: null },
        { header: 'Cases', slug: 'cases', expand_column_value: null },
      ],
      data: [
        { region: 'Bo', cases: 42 },
        { region: 'Kenema', cases: 31 },
        { region: 'Freetown', cases: 58 },
      ],
      total_records: 3,
      next_page: '',
    });

    app.get('/a/:domain/api/v0.5/*', async (req, reply) => {
      const segs = v0Segments(req);
      const domain = (req.params as Record<string, any>).domain || configuredDomain;
      if (segs.length === 0) {
        reply.code(404);
        return { error: 'not found' };
      }
      // Configurable report data: configurablereportdata/{reportId}/
      if (segs[0] === 'configurablereportdata' && segs[1]) {
        return reportResponse(segs[1]);
      }
      const collection = collectionFor(segs[0]);
      if (segs.length === 1) {
        return tastypie(store.list(collection), req, `/a/${domain}/api/v0.5/${segs[0]}/`, 20);
      }
      const found = store.get(collection, segs[1]);
      if (!found) {
        reply.code(404);
        return { error: 'not found' };
      }
      return found;
    });

    app.post('/a/:domain/api/v0.5/*', async (req, reply) => {
      const segs = v0Segments(req);
      if (segs.length !== 1) {
        reply.code(404);
        return { error: 'not found' };
      }
      const collection = collectionFor(segs[0]);
      const body = (req.body ?? {}) as Record<string, any>;
      const idField = segs[0] === 'case' ? 'case_id' : segs[0] === 'location' ? 'location_id' : 'id';
      const id = body[idField] != null && String(body[idField]).length ? String(body[idField]) : randomUUID();
      const record = { ...body, [idField]: id };
      store.create(collection, id, record);
      reply.code(201);
      return record;
    });

    // --- Bulk case/lookup-table upload endpoints (submitXls / bulk) ----
    const bulkResponse = () => ({
      code: 200,
      status: 'success',
      message: 'File uploaded and queued for processing.',
      seconds: 0,
    });
    // submitXls + bulk('case-data') -> importer/excel/bulk_upload_api/
    app.post('/a/:domain/importer/excel/bulk_upload_api/', async (_req, reply) => {
      reply.code(200);
      return bulkResponse();
    });
    // bulk('lookup-table') -> fixtures/fixapi/
    app.post('/a/:domain/fixtures/fixapi/', async (_req, reply) => {
      reply.code(200);
      return bulkResponse();
    });
  },

  seed,
};

export default plugin;
