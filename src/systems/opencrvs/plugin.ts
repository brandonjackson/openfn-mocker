import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { seed } from './seed.js';
import { usage } from './usage.js';
import { guide } from './guide.js';

/**
 * OpenCRVS (civil-registration & vital-statistics Digital Public Good). The
 * opencrvs adaptor talks to three surfaces, all mounted here:
 *  - POST /graphql — legacy v1 search/query API (queryEvents). Returns
 *    `{ data: { searchEvents: { totalItems, results } } }`.
 *  - the v2 events REST API: POST /api/events/events creates an event,
 *    POST /api/events/events/:eventId/notify advances it, POST
 *    /api/events/events/search lists them (there is no GET collection route —
 *    search is the only way to enumerate events), GET
 *    /api/events/events/:eventId reads one back and GET /api/events/locations
 *    lists places.
 *  - POST /notification — the country-config birth-notification hook.
 * Auth is a bearer JWT (accept-all here).
 *
 * Event records are stored as vendor `EventDocument`s: no top-level status or
 * registration number, just an ordered `actions[]`. Everything else the older
 * surfaces want (status, registration number, the flattened declaration) is
 * derived from that list by the helpers below, exactly as OpenCRVS derives its
 * own `EventIndex`.
 */

/** Action types that move an event's derived status, in the vendor's vocabulary. */
const STATUS_BY_ACTION: Record<string, string> = {
  CREATE: 'CREATED',
  NOTIFY: 'NOTIFIED',
  DECLARE: 'DECLARED',
  REGISTER: 'REGISTERED',
  ARCHIVE: 'ARCHIVED',
};

const actionsOf = (e: any): any[] => (Array.isArray(e?.actions) ? e.actions : []);

/** Latest status-bearing action wins — an EventDocument carries no status field. */
function statusOf(e: any): string {
  let status = 'CREATED';
  for (const a of actionsOf(e)) {
    const next = STATUS_BY_ACTION[a?.type];
    if (next) status = next;
  }
  return status;
}

/** The event's declaration: every action's partial declaration, merged in order. */
function declarationOf(e: any): Record<string, any> {
  const merged: Record<string, any> = {};
  for (const a of actionsOf(e)) Object.assign(merged, a?.declaration ?? {});
  return merged;
}

/** Find the last action of a given type (REGISTER carries the registration number). */
const lastAction = (e: any, type: string): any =>
  actionsOf(e).filter((a) => a?.type === type).slice(-1)[0];

/** The `legalStatuses.<STATUS>` entry an EventIndex exposes for a DECLARE/REGISTER. */
function legalStatus(action: any, extra: Record<string, any> = {}): Record<string, any> | null {
  if (!action) return null;
  return {
    createdAt: action.createdAt,
    createdBy: action.createdBy,
    createdAtLocation: action.createdAtLocation ?? null,
    createdByUserType: action.createdByUserType ?? null,
    createdByRole: action.createdByRole,
    acceptedAt: action.createdAt,
    ...extra,
  };
}

/** Project a stored EventDocument onto the flat `EventIndex` search returns. */
function toEventIndex(e: any): Record<string, any> {
  const actions = actionsOf(e);
  const declaration = declarationOf(e);
  const created = actions[0];
  const latest = actions[actions.length - 1];
  const registered = lastAction(e, 'REGISTER');
  const placeOfEvent = declaration['child.placeOfBirth'] ?? declaration['deceased.placeOfDeath'] ?? null;
  return {
    id: e.id,
    type: e.type,
    status: statusOf(e),
    legalStatuses: {
      DECLARED: legalStatus(lastAction(e, 'DECLARE')),
      REGISTERED: legalStatus(registered, { registrationNumber: registered?.registrationNumber ?? '' }),
    },
    createdAt: e.createdAt,
    dateOfEvent: declaration['child.dob'] ?? declaration['deceased.dod'] ?? null,
    placeOfEvent: typeof placeOfEvent === 'string' ? placeOfEvent : null,
    createdBy: created?.createdBy ?? '',
    createdByUserType: created?.createdByUserType ?? null,
    createdAtLocation: created?.createdAtLocation ?? null,
    updatedAt: e.updatedAt,
    updatedBy: latest?.createdBy ?? null,
    updatedByUserRole: latest?.createdByRole ?? null,
    updatedAtLocation: latest?.createdAtLocation ?? null,
    assignedTo: null,
    trackingId: e.trackingId,
    potentialDuplicates: [],
    flags: [],
    declaration,
  };
}

/** Render a stored name-object declaration field as a v1 GraphQL HumanName list. */
function toHumanNames(value: any): Array<Record<string, any>> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return [{ use: 'en', firstNames: value.firstname ?? '', familyName: value.surname ?? '' }];
}

/** Shape a stored event as a v1 GraphQL `searchEvents` result row. */
function toSearchResult(e: any): Record<string, any> {
  const declaration = declarationOf(e);
  const birth = e.type?.includes('birth');
  const registered = lastAction(e, 'REGISTER');
  return {
    __typename: birth ? 'BirthEventSearchSet' : 'DeathEventSearchSet',
    id: e.id,
    type: birth ? 'Birth' : 'Death',
    ...(birth
      ? { dateOfBirth: declaration['child.dob'], childName: toHumanNames(declaration['child.name']) }
      : { dateOfDeath: declaration['deceased.dod'], deceasedName: toHumanNames(declaration['deceased.name']) }),
    registration: {
      status: statusOf(e),
      trackingId: e.trackingId,
      registrationNumber: registered?.registrationNumber ?? null,
      registeredLocationId: registered?.createdAtLocation ?? null,
      contactNumber: null,
      duplicates: null,
      createdAt: e.createdAt,
      modifiedAt: e.updatedAt,
    },
  };
}

/** A fresh OpenCRVS-style tracking id: 7 uppercase alphanumerics. */
function newTrackingId(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 7; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Build an ActionDocument of `type` from a request body, as the API records it. */
function makeAction(type: string, body: Record<string, any>, at: string): Record<string, any> {
  return {
    id: randomUUID(),
    type,
    status: 'Accepted',
    transactionId: body.transactionId ?? randomUUID(),
    createdAt: at,
    createdBy: '0f9d2b57-4c83-41ae-9e36-8b1a7d5c204e',
    createdByRole: 'NATIONAL_SYSTEM_ADMIN',
    createdByUserType: 'system',
    createdAtLocation: body.createdAtLocation ?? null,
    declaration: body.declaration ?? body.data ?? {},
    ...(body.annotation === undefined ? {} : { annotation: body.annotation }),
  };
}

/** Does an EventIndex satisfy one `QueryExpression` clause of a search request? */
function matchesClause(index: Record<string, any>, clause: any): boolean {
  if (!clause || typeof clause !== 'object') return true;
  if (Array.isArray(clause.clauses)) {
    const results = clause.clauses.map((c: any) => matchesClause(index, c));
    return clause.type === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  if (clause.id !== undefined && clause.id !== index.id) return false;
  if (clause.eventType !== undefined && clause.eventType !== index.type) return false;
  if (clause.trackingId?.term !== undefined && clause.trackingId.term !== index.trackingId) return false;
  const status = clause.status;
  if (status?.type === 'exact' && status.term !== index.status) return false;
  if (status?.type === 'anyOf' && Array.isArray(status.terms) && !status.terms.includes(index.status)) return false;
  return true;
}

const plugin: MockSystemPlugin = {
  name: 'opencrvs',
  credential: {
    type: 'oauth',
    fields: [
      // `domain` is a bare host[:port], not a URL: the adaptor builds its own
      // per-service hosts from it (`https://<service>.<domain>`), so a scheme
      // or mount path here would land inside the derived hostname. See the
      // 'host' CredentialFieldRole and README's "Local network aliasing".
      { name: 'domain', role: 'host' },
      { name: 'clientId', role: 'secret', secret: { charset: 'hex', length: 24 } },
      { name: 'clientSecret', role: 'secret', secret: { charset: 'hex', length: 32 } },
    ],
  },
  // The v2 adaptor calls four hosts derived from `domain`: `auth.<domain>` for
  // the token exchange, and `gateway.` / `register.` / `countryconfig.` for the
  // REST + GraphQL surfaces below (all served by the same routes regardless of
  // which alias they arrive on). Only the local test-harness alias-proxy acts
  // on this — see README's "Local network aliasing".
  hostAliases: ['auth.{host}', 'gateway.{host}', 'register.{host}', 'countryconfig.{host}'],

  usage,
  guide,

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    // --- OAuth token exchange (auth.<domain>/token) ---
    // The mock never validates clientId/clientSecret, matching every other
    // credential here — it just mints a token so the adaptor's own request
    // pipeline (which requires an access_token before calling anything else)
    // can proceed.
    app.post('/token', async (_req, reply) => {
      reply.code(200);
      return { access_token: randomUUID(), token_type: 'bearer', expires_in: 3600 };
    });

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
    // Note there is deliberately no `GET /api/events/events`: OpenCRVS has no
    // collection route, events are enumerated through the search endpoint below.

    // POST /api/events/events/search — the only way to list events. Returns
    // `{ results: EventIndex[], total }`, honouring the query's clauses plus
    // limit/offset.
    app.post('/api/events/events/search', async (req) => {
      const body = (req.body ?? {}) as Record<string, any>;
      const indexes = store.list('events').map(toEventIndex);
      const matched = body.query ? indexes.filter((i) => matchesClause(i, body.query)) : indexes;
      const offset = Number(body.offset ?? 0);
      const limit = Number(body.limit ?? 100);
      return { results: matched.slice(offset, offset + limit), total: matched.length };
    });

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
        createdAt: now,
        updatedAt: now,
        trackingId: newTrackingId(),
        actions: [makeAction('CREATE', body, now)],
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
      const updated = {
        ...existing,
        updatedAt: now,
        actions: [...actionsOf(existing), makeAction('NOTIFY', body, now)],
      };
      store.replace('events', id, updated);
      reply.code(200);
      return updated;
    });

    // --- Locations (country-config) ---
    app.get('/api/events/locations', async (req) => {
      const q = (req.query ?? {}) as Record<string, any>;
      const ids = q.locationIds === undefined ? undefined : String(q.locationIds).split(',');
      return store.list('locations').filter((l: any) => {
        if (ids && !ids.includes(l.id)) return false;
        if (q.locationType !== undefined && l.locationType !== q.locationType) return false;
        if (q.externalId !== undefined && l.externalId !== q.externalId) return false;
        return true;
      });
    });

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
