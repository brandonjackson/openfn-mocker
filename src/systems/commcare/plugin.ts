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
  },

  seed,
};

export default plugin;
