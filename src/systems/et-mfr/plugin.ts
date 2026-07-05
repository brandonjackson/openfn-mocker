import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { paginate } from '../../engine/response-generator.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * Ethiopia Master Facility Registry (mfr.moh.gov.et). The et-mfr adaptor is a
 * thin HTTP wrapper: get/post/request expand a relative path, which the adaptor
 * joins onto an `/api/` prefix before sending, and authenticate with HTTP Basic
 * (username/password from the credential). So a call like get('Facility/All')
 * hits GET /api/Facility/All. Auth is accept-all here.
 */

const API = '/api';

/** Read a positive integer query param with a fallback. */
function intParam(q: Record<string, any>, key: string, fallback: number): number {
  const n = parseInt(String(q[key] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
    // GET /api/Location/Regions — the region lookup list.
    app.get(`${API}/Location/Regions`, async () => store.list('regions'));

    // GET /api/Facility/All — every facility, optionally filtered by ?name=.
    app.get(`${API}/Facility/All`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      let facilities = store.list('facilities');
      if (typeof q.name === 'string') {
        const name = q.name.toLowerCase();
        facilities = facilities.filter((f) => String(f.facilityName).toLowerCase().includes(name));
      }
      return { facilities, total: facilities.length };
    });

    // GET /api/Facility/GetFacilities — paginated slice (?page= &pageSize=).
    app.get(`${API}/Facility/GetFacilities`, async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const page = intParam(q, 'page', 1);
      const pageSize = intParam(q, 'pageSize', 10);
      const all = store.list('facilities');
      const { items, total } = paginate(all, { offset: (page - 1) * pageSize, limit: pageSize });
      return { facilities: items, total, page, pageSize };
    });

    // GET /api/Facility/ExportCSV — CSV export of all facilities.
    app.get(`${API}/Facility/ExportCSV`, async (_req, reply) => {
      const rows = store.list('facilities');
      const header = 'facilityId,facilityName,hmisCode,region,facilityType,operationalStatus';
      const body = rows
        .map((f) =>
          [f.facilityId, f.facilityName, f.hmisCode, f.region, f.facilityType, f.operationalStatus]
            .map((v) => `"${String(v ?? '')}"`)
            .join(',')
        )
        .join('\n');
      reply.header('content-type', 'text/csv; charset=utf-8');
      return `${header}\n${body}\n`;
    });

    // GET /api/Facility — one facility by ?id=, else the full list.
    app.get(`${API}/Facility`, async (req, reply) => {
      const q = (req.query ?? {}) as Record<string, any>;
      if (typeof q.id === 'string' && q.id.length) {
        const found = store.get('facilities', q.id);
        if (!found) {
          reply.code(404);
          return { error: 'Facility not found' };
        }
        return found;
      }
      const facilities = store.list('facilities');
      return { facilities, total: facilities.length };
    });

    // POST /api/Facility — create a facility (generic post()).
    app.post(`${API}/Facility`, async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const facilityId = body.facilityId ?? `FAC-${String(store.count('facilities') + 1).padStart(4, '0')}`;
      const facility = { operationalStatus: 'Operational', ...body, facilityId };
      store.create('facilities', facilityId, facility);
      reply.code(201);
      return facility;
    });
  },

  seed,
};

export default plugin;
