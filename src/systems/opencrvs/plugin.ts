import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';

/**
 * OpenCRVS (civil-registration & vital-statistics Digital Public Good). The
 * opencrvs adaptor talks to three surfaces, all mounted here:
 *  - POST /graphql — legacy search/query API (queryEvents). Returns
 *    `{ data: { searchEvents: { totalItems, results } } }`.
 *  - POST /api/events/events — create an event (createEvent); POST
 *    /api/events/events/:eventId/notify moves it forward (notifyEvent).
 *  - GET /api/events/locations — the location list.
 *  - POST /notification — the country-config birth-notification hook.
 * Auth is a bearer JWT (accept-all here).
 */

/** Shape a stored event as a GraphQL searchEvents result row. */
function toSearchResult(e: any): Record<string, any> {
  return {
    id: e.id,
    type: e.type,
    registration: {
      status: e.status,
      trackingId: e.trackingId,
      registrationNumber: e.registrationNumber ?? null,
    },
    createdAt: e.createdAt,
    modifiedAt: e.updatedAt,
  };
}

const plugin: MockSystemPlugin = {
  name: 'opencrvs',
  credential: {
    type: 'oauth',
    fields: [
      { name: 'domain', role: 'url' },
      { name: 'clientId', role: 'secret', secret: { charset: 'hex', length: 24 } },
      { name: 'clientSecret', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- GraphQL (queryEvents / searchEvents) ---
    app.post('/graphql', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const query = typeof body.query === 'string' ? body.query : '';
      const events = store.list('events');
      if (query.includes('searchEvents') || query.includes('searchEventsById') || !query) {
        return {
          data: {
            searchEvents: {
              totalItems: events.length,
              results: events.map(toSearchResult),
            },
          },
        };
      }
      if (query.includes('fetchRegistration') || query.includes('fetchBirthRegistration')) {
        const id = body.variables?.id;
        const found = id ? store.get('events', String(id)) : undefined;
        return { data: { fetchRegistration: found ?? null } };
      }
      // Unknown query: echo an empty data object so the adaptor doesn't error.
      return { data: {} };
    });

    // --- Events REST API v2 ---
    app.get('/api/events/events', async () => store.list('events'));

    app.get('/api/events/events/:eventId', async (req, reply) => {
      const id = String((req.params as Record<string, any>).eventId);
      const found = store.get('events', id);
      if (found === undefined) {
        reply.code(404);
        return { message: 'Event not found' };
      }
      return found;
    });

    app.post('/api/events/events', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID();
      const now = new Date().toISOString();
      const event = {
        id,
        type: body.type ?? 'v2.birth',
        status: 'CREATED',
        transactionId: body.transactionId ?? randomUUID(),
        trackingId: null,
        registrationNumber: null,
        createdAt: now,
        updatedAt: now,
        actions: [{ type: 'CREATE', createdAt: now }],
        data: body.data ?? {},
      };
      store.create('events', id, event);
      reply.code(200);
      return event;
    });

    // POST /api/events/events/:eventId/notify — advance an event (notifyEvent).
    app.post('/api/events/events/:eventId/notify', async (req, reply) => {
      const id = String((req.params as Record<string, any>).eventId);
      const existing = store.get('events', id);
      if (existing === undefined) {
        reply.code(404);
        return { message: 'Event not found' };
      }
      const body = (req.body ?? {}) as Record<string, any>;
      const now = new Date().toISOString();
      const actions = Array.isArray(existing.actions) ? existing.actions : [];
      const updated = {
        ...existing,
        status: 'NOTIFIED',
        updatedAt: now,
        actions: [...actions, { type: 'NOTIFY', createdAt: now }],
        data: { ...(existing.data ?? {}), ...(body.data ?? {}) },
      };
      store.replace('events', id, updated);
      reply.code(200);
      return updated;
    });

    // --- Locations (country-config) ---
    app.get('/api/events/locations', async () => store.list('locations'));

    // --- Birth notification hook (createBirthNotification / submitBirthNotification) ---
    app.post('/notification', async (req, reply) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const id = randomUUID();
      store.create('notifications', id, { id, receivedAt: new Date().toISOString(), payload: body });
      reply.code(201);
      return { id, status: 'received' };
    });
  },

  seed,
};

export default plugin;
