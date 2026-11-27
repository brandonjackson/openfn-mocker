import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DataStore } from '../../store.js';

/**
 * OpenSPP REST API v2 (`spp_api_v2`, FastAPI, mounted at /api/v2/spp) — what
 * @openfn/language-openspp 4.x calls. Records are addressed by external
 * identifier `system|value` (URL-encoded in paths), never by database id.
 *
 * Shapes follow openfn-api-specs' openspp spec, which is extracted from the
 * vendor routers (OpenSPP/OpenSPP2 spp_api_v2*):
 *  - reads return the resource (Individual, Group, Program, ProgramMembership,
 *    ServicePoint);
 *  - Individual/Group/Program/ProgramMembership searches return the
 *    SearchResult envelope `{ data, meta: {total,count,offset}, links }`;
 *  - ServicePoint search returns a FHIR-style searchset Bundle;
 *  - errors are FastAPI's `{ detail }`.
 */
export const API = '/api/v2/spp';

/** Store collections for the REST half (the XML-RPC half uses Odoo model names). */
export const C = {
  individuals: 'api.individuals',
  groups: 'api.groups',
  members: 'api.group_members',
  programs: 'api.programs',
  memberships: 'api.program_memberships',
  servicePoints: 'api.service_points',
} as const;

export const ROLE_SYSTEM = 'urn:openspp:vocab:group-membership-type';

type Q = Record<string, any>;

const now = () => new Date().toISOString();
const today = () => now().slice(0, 10);
const meta = (versionId = '1') => ({ versionId, lastUpdated: now() });

/** `system|value` of the first identifier: the store key. */
export const keyOf = (r: any): string | undefined => {
  const id = Array.isArray(r?.identifier) ? r.identifier[0] : undefined;
  return id && id.system && id.value ? `${id.system}|${id.value}` : undefined;
};

/** Find a record whose identifiers include `system|value`. */
function findByIdentifier(store: DataStore, collection: string, ident: string): any | undefined {
  const direct = store.get(collection, ident);
  if (direct) return direct;
  return store
    .list(collection)
    .find((r) => Array.isArray(r.identifier) && r.identifier.some((i: any) => `${i.system}|${i.value}` === ident));
}

function notFound(reply: FastifyReply, what: string) {
  reply.code(404);
  return { detail: `${what} not found` };
}

function badIdentifier(reply: FastifyReply) {
  reply.code(400);
  return { detail: 'Invalid identifier format. Expected: {system}|{value}' };
}

/** Sparse fieldsets: `_elements=identifier,name` keeps those plus type/meta. */
function elements(record: any, q: Q): any {
  const el = typeof q._elements === 'string' ? q._elements.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  if (!el.length) return record;
  const out: Q = {};
  for (const k of ['type', 'resourceType', ...el, 'meta']) if (k in record) out[k] = record[k];
  return out;
}

function pageParams(q: Q): { count: number; offset: number } {
  const count = Math.min(Math.max(Number(q._count ?? 20) || 20, 1), 100);
  const offset = Math.max(Number(q._offset ?? 0) || 0, 0);
  return { count, offset };
}

/** Build the SearchResult envelope with self/next/prev links. */
function searchResult(path: string, q: Q, all: any[]): any {
  const { count, offset } = pageParams(q);
  const page = all.slice(offset, offset + count);
  const base = Object.fromEntries(Object.entries(q).filter(([k]) => k !== '_offset'));
  const link = (o: number) => `${API}${path}?${new URLSearchParams({ ...base, _offset: String(o) }).toString()}`;
  return {
    data: page.map((r) => elements(r, q)),
    meta: { total: all.length, count: page.length, offset },
    links: {
      self: link(offset),
      next: offset + count < all.length ? link(offset + count) : null,
      prev: offset > 0 ? link(Math.max(offset - count, 0)) : null,
    },
  };
}

/** JSON Merge Patch (RFC 7396): null deletes, objects merge, everything else replaces. */
function mergePatch(target: any, patch: any): any {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out: Q = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

const bumpMeta = (r: any) => ({ ...r, meta: meta(String(Number(r.meta?.versionId ?? '1') + 1)) });

/** `name` search matches HumanName parts or a plain string name, case-insensitively. */
function nameMatches(name: any, needle: string): boolean {
  const n = needle.toLowerCase();
  if (typeof name === 'string') return name.toLowerCase().includes(n);
  if (name && typeof name === 'object') {
    return [name.text, name.family, name.given, name.middle].some((p) => typeof p === 'string' && p.toLowerCase().includes(n));
  }
  return false;
}

/** Date search with ge/le/gt/lt/eq prefix, e.g. birthdate=ge2010-01-01. */
function dateMatches(value: any, expr: string): boolean {
  if (typeof value !== 'string') return false;
  const m = /^(ge|le|gt|lt|eq)?(.+)$/.exec(expr);
  if (!m) return true;
  const [, op = 'eq', d] = m;
  switch (op) {
    case 'ge': return value >= d;
    case 'le': return value <= d;
    case 'gt': return value > d;
    case 'lt': return value < d;
    default: return value.startsWith(d);
  }
}

/** Active (not ended) memberships of a group. */
const liveMembers = (store: DataStore, groupKey: string) =>
  store.list(C.members, (m) => m.groupKey === groupKey && m.status === 'active');

function membershipResponse(m: any): any {
  const out: Q = {
    type: 'GroupMember',
    group: { reference: `Group/${m.groupKey}` },
    entity: { reference: `Individual/${m.individualKey}` },
    status: m.status,
  };
  if (m.role) out.role = m.role;
  if (m.startDate) out.startDate = m.startDate;
  if (m.endedDate) out.endedDate = m.endedDate;
  return out;
}

/** An Individual with its live groupMembership refs filled in from the member table. */
function withMemberships(store: DataStore, ind: any): any {
  const key = keyOf(ind)!;
  const refs = store
    .list(C.members, (m) => m.individualKey === key && m.status === 'active')
    .map((m) => ({ group: { reference: `Group/${m.groupKey}` }, ...(m.role ? { role: m.role } : {}), ...(m.startDate ? { period: { start: m.startDate } } : {}) }));
  return refs.length ? { ...ind, groupMembership: refs } : ind;
}

function parseRef(ref: any, type: string): string | undefined {
  const s = typeof ref?.reference === 'string' ? ref.reference : undefined;
  return s && s.startsWith(`${type}/`) && s.includes('|') ? s.slice(type.length + 1) : undefined;
}

/** Store a group-member row under a random key it also carries as `_key`. */
export function addMember(store: DataStore, m: Q): void {
  const _key = randomUUID();
  store.create(C.members, _key, { ...m, _key });
}

const hasPipe = (s: string) => typeof s === 'string' && s.includes('|');

export function registerRest(app: FastifyInstance, store: DataStore): void {
  // --- OAuth 2.0 client credentials ---------------------------------------
  // The vendor handler accepts JSON, form-encoded or HTTP Basic credentials;
  // the adaptor sends JSON. Accept-all, but grant_type must be client_credentials.
  app.post(`${API}/oauth/token`, async (req, reply) => {
    const body = (req.body ?? {}) as Q;
    const grant = body.grant_type ?? 'client_credentials';
    if (grant !== 'client_credentials') {
      reply.code(400);
      return { detail: 'Unsupported grant_type. Only client_credentials is supported.' };
    }
    return {
      access_token: `mock-openspp-${randomUUID()}`,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'individual:read individual:create individual:update group:read group:create group:update program:read program_membership:read program_membership:create program_membership:update service_point:read',
    };
  });

  // --- Individual ----------------------------------------------------------
  app.get(`${API}/Individual`, async (req) => {
    const q = (req.query ?? {}) as Q;
    let items = store.list(C.individuals);
    if (typeof q.identifier === 'string') items = items.filter((r) => findByIdentifier(store, C.individuals, q.identifier) === r);
    if (typeof q.name === 'string') items = items.filter((r) => nameMatches(r.name, q.name));
    if (typeof q.birthdate === 'string') items = items.filter((r) => dateMatches(r.birthDate, q.birthdate));
    if (typeof q.gender === 'string') {
      const code = q.gender.includes('|') ? q.gender.split('|')[1] : q.gender;
      items = items.filter((r) => r.gender?.coding?.some((c: any) => c.code === code));
    }
    if (typeof q.group === 'string') {
      if (q.group === 'none') {
        const inGroup = new Set(store.list(C.members, (m) => m.status === 'active').map((m) => m.individualKey));
        items = items.filter((r) => !inGroup.has(keyOf(r)));
      } else {
        let members = liveMembers(store, q.group);
        const role = q['membership-role'];
        if (typeof role === 'string') members = members.filter((m) => m.role?.coding?.some((c: any) => c.code === role));
        const keys = new Set(members.map((m) => m.individualKey));
        items = items.filter((r) => keys.has(keyOf(r)));
      }
    }
    return searchResult('/Individual', q, items.map((r) => withMemberships(store, r)));
  });

  app.get(`${API}/Individual/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const id = req.params.identifier;
    if (!hasPipe(id)) return badIdentifier(reply);
    const ind = findByIdentifier(store, C.individuals, id);
    if (!ind) return notFound(reply, 'Individual');
    if (ind.meta?.versionId) reply.header('ETag', `"${ind.meta.versionId}"`);
    return elements(withMemberships(store, ind), (req.query ?? {}) as Q);
  });

  app.get(`${API}/Individual/:identifier/groups`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const ind = findByIdentifier(store, C.individuals, req.params.identifier);
    if (!ind) return notFound(reply, 'Individual');
    const key = keyOf(ind)!;
    const entries = store
      .list(C.members, (m) => m.individualKey === key && m.status === 'active')
      .map((m) => {
        const group = store.get(C.groups, m.groupKey);
        return {
          group: { reference: `Group/${m.groupKey}`, ...(group?.name ? { display: group.name } : {}) },
          ...(m.role ? { role: m.role } : {}),
          ...(m.startDate ? { period: { start: m.startDate } } : {}),
        };
      });
    return { individual: { reference: `Individual/${key}` }, total: entries.length, memberships: entries };
  });

  app.post(`${API}/Individual`, async (req, reply) => {
    const body = (req.body ?? {}) as Q;
    const key = keyOf(body);
    if (!key) {
      reply.code(422);
      return { detail: [{ loc: ['body', 'identifier'], msg: 'List should have at least 1 item after validation, not 0', type: 'too_short' }] };
    }
    if (findByIdentifier(store, C.individuals, key)) {
      reply.code(409);
      return { detail: `Individual with identifier ${key} already exists` };
    }
    const rec = { type: 'Individual', active: true, ...body, meta: meta() };
    store.create(C.individuals, key, rec);
    reply.code(201).header('Location', `${API}/Individual/${encodeURIComponent(key)}`);
    return rec;
  });

  app.patch(`${API}/Individual/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const ind = findByIdentifier(store, C.individuals, req.params.identifier);
    if (!ind) return notFound(reply, 'Individual');
    const updated = bumpMeta(mergePatch(ind, (req.body ?? {}) as Q));
    store.replace(C.individuals, keyOf(ind)!, updated);
    return withMemberships(store, updated);
  });

  // --- Group ---------------------------------------------------------------
  app.get(`${API}/Group`, async (req) => {
    const q = (req.query ?? {}) as Q;
    let items = store.list(C.groups);
    if (typeof q.identifier === 'string') items = items.filter((r) => findByIdentifier(store, C.groups, q.identifier) === r);
    if (typeof q.name === 'string') items = items.filter((r) => nameMatches(r.name, q.name));
    if (typeof q.type === 'string') items = items.filter((r) => r.groupType === q.type);
    return searchResult('/Group', q, items);
  });

  app.get(`${API}/Group/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const id = req.params.identifier;
    if (!hasPipe(id)) return badIdentifier(reply);
    const g = findByIdentifier(store, C.groups, id);
    if (!g) return notFound(reply, 'Group');
    if (g.meta?.versionId) reply.header('ETag', `"${g.meta.versionId}"`);
    return elements(g, (req.query ?? {}) as Q);
  });

  app.post(`${API}/Group`, async (req, reply) => {
    const body = (req.body ?? {}) as Q;
    const key = keyOf(body);
    if (!key) {
      reply.code(422);
      return { detail: [{ loc: ['body', 'identifier'], msg: 'List should have at least 1 item after validation, not 0', type: 'too_short' }] };
    }
    if (findByIdentifier(store, C.groups, key)) {
      reply.code(409);
      return { detail: `Group with identifier ${key} already exists` };
    }
    const { member, ...rest } = body;
    const rec = { type: 'Group', active: true, groupType: 'household', ...rest, meta: meta() };
    store.create(C.groups, key, rec);
    for (const m of Array.isArray(member) ? member : []) {
      const ik = parseRef(m.entity, 'Individual');
      if (ik) addMember(store, { groupKey: key, individualKey: ik, role: m.role, startDate: m.period?.start, status: 'active' });
    }
    reply.code(201).header('Location', `${API}/Group/${encodeURIComponent(key)}`);
    return rec;
  });

  app.patch(`${API}/Group/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const g = findByIdentifier(store, C.groups, req.params.identifier);
    if (!g) return notFound(reply, 'Group');
    const updated = bumpMeta(mergePatch(g, (req.body ?? {}) as Q));
    store.replace(C.groups, keyOf(g)!, updated);
    return updated;
  });

  // POST /Group/{id}/$add-member — 201 GroupMember; 409 if already a live member.
  app.post(`${API}/Group/:identifier/$add-member`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const g = findByIdentifier(store, C.groups, req.params.identifier);
    if (!g) return notFound(reply, 'Group');
    const body = (req.body ?? {}) as Q;
    const ik = parseRef(body.entity, 'Individual');
    if (!ik) {
      reply.code(400);
      return { detail: 'Invalid reference. Expected: Individual/{system}|{value}' };
    }
    const ind = findByIdentifier(store, C.individuals, ik);
    if (!ind) return notFound(reply, 'Individual');
    const gk = keyOf(g)!;
    const indKey = keyOf(ind)!;
    if (liveMembers(store, gk).some((m) => m.individualKey === indKey)) {
      reply.code(409);
      return { detail: 'Individual is already an active member of this group' };
    }
    const m = { groupKey: gk, individualKey: indKey, role: body.role, startDate: body.startDate ?? today(), status: 'active' };
    addMember(store, m);
    reply.code(201);
    return membershipResponse(m);
  });

  // POST /Group/{id}/$remove-member — ends the live membership (endedDate defaults to now).
  app.post(`${API}/Group/:identifier/$remove-member`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const g = findByIdentifier(store, C.groups, req.params.identifier);
    if (!g) return notFound(reply, 'Group');
    const body = (req.body ?? {}) as Q;
    const ik = parseRef(body.entity, 'Individual');
    if (!ik) {
      reply.code(400);
      return { detail: 'Invalid reference. Expected: Individual/{system}|{value}' };
    }
    const gk = keyOf(g)!;
    const entry = store.list(C.members).find((m) => m.groupKey === gk && m.individualKey === ik && m.status === 'active');
    if (!entry) return notFound(reply, 'Active membership');
    const ended = { ...entry, status: 'inactive', endedDate: body.endedDate ?? today() };
    store.replace(C.members, entry._key, ended);
    return membershipResponse(ended);
  });

  // --- Program -------------------------------------------------------------
  // Cursor-paged: _count + _lastId (the id of the last record of the previous page).
  app.get(`${API}/Program`, async (req) => {
    const q = (req.query ?? {}) as Q;
    let items = store.list(C.programs);
    if (typeof q.name === 'string') items = items.filter((r) => nameMatches(r.name, q.name));
    if (typeof q.targetType === 'string') items = items.filter((r) => r.targetType === q.targetType);
    if (typeof q.status === 'string') items = items.filter((r) => (q.status === 'active') === (r.active !== false));
    if (typeof q.identifier === 'string') items = items.filter((r) => findByIdentifier(store, C.programs, q.identifier) === r);
    const count = Math.min(Math.max(Number(q._count ?? 20) || 20, 1), 100);
    let start = 0;
    if (q._lastId != null) {
      const i = items.findIndex((r) => String(r._id) === String(q._lastId));
      start = i >= 0 ? i + 1 : 0;
    }
    const page = items.slice(start, start + count);
    const more = start + count < items.length;
    const base = Object.fromEntries(Object.entries(q).filter(([k]) => k !== '_lastId'));
    const self = `${API}/Program?${new URLSearchParams(q as any).toString()}`;
    return {
      data: page.map(({ _id, ...r }) => r),
      meta: { total: items.length, count: page.length, offset: start },
      links: {
        self,
        next: more ? `${API}/Program?${new URLSearchParams({ ...base, _lastId: String(page[page.length - 1]._id) }).toString()}` : null,
        prev: null,
      },
    };
  });

  app.get(`${API}/Program/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const id = req.params.identifier;
    if (!hasPipe(id)) return badIdentifier(reply);
    const p = findByIdentifier(store, C.programs, id);
    if (!p) return notFound(reply, 'Program');
    const { _id, ...rest } = p;
    return rest;
  });

  // --- ProgramMembership ---------------------------------------------------
  app.get(`${API}/ProgramMembership`, async (req) => {
    const q = (req.query ?? {}) as Q;
    let items = store.list(C.memberships);
    if (typeof q.beneficiary === 'string') items = items.filter((m) => m.beneficiary?.reference === q.beneficiary);
    if (typeof q.program === 'string') {
      const ref = q.program.startsWith('Program/') ? q.program : `Program/${q.program}`;
      items = items.filter((m) => m.program?.reference === ref);
    }
    if (typeof q.status === 'string') items = items.filter((m) => m.status === q.status);
    return searchResult('/ProgramMembership', q, items.map(({ _key, ...m }) => m));
  });

  app.post(`${API}/ProgramMembership`, async (req, reply) => {
    const body = (req.body ?? {}) as Q;
    const progKey = parseRef(body.program, 'Program');
    const benRef: string | undefined = body.beneficiary?.reference;
    const benType = benRef?.split('/')[0];
    const benKey = benType ? parseRef(body.beneficiary, benType) : undefined;
    if (!progKey || !benKey || !['Individual', 'Group'].includes(benType!)) {
      reply.code(400);
      return { detail: 'program must reference Program/{system}|{value} and beneficiary Individual/… or Group/…' };
    }
    if (!findByIdentifier(store, C.programs, progKey)) return notFound(reply, 'Program');
    if (!findByIdentifier(store, benType === 'Group' ? C.groups : C.individuals, benKey)) return notFound(reply, benType!);
    if (store.list(C.memberships).some((m) => m.program.reference === body.program.reference && m.beneficiary.reference === benRef)) {
      reply.code(409);
      return { detail: 'Beneficiary is already a member of this program' };
    }
    const rec = {
      type: 'ProgramMembership',
      program: { reference: body.program.reference },
      beneficiary: { reference: benRef },
      status: body.status ?? 'draft',
      enrollmentDate: body.enrollmentDate ?? (body.status === 'enrolled' ? today() : null),
      meta: meta(),
    };
    const _key = randomUUID();
    store.create(C.memberships, _key, { ...rec, _key });
    reply.code(201);
    return rec;
  });

  // PUT /ProgramMembership/{beneficiary identifier} — full replacement of the
  // beneficiary's membership in body.program.
  app.put(`${API}/ProgramMembership/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const ident = req.params.identifier;
    if (!hasPipe(ident)) return badIdentifier(reply);
    const body = (req.body ?? {}) as Q;
    const progRef = body.program?.reference;
    const all = store.list(C.memberships).filter((m) => (m.beneficiary?.reference ?? '').endsWith(`/${ident}`));
    const target = (progRef ? all.filter((m) => m.program.reference === progRef) : all)[0];
    if (!target) return notFound(reply, 'ProgramMembership');
    const updated = bumpMeta({
      ...target,
      status: body.status ?? target.status,
      enrollmentDate: body.enrollmentDate ?? target.enrollmentDate,
      exitDate: body.exitDate ?? (body.status === 'exited' ? today() : null),
      exitReason: body.exitReason ?? null,
    });
    store.replace(C.memberships, target._key, updated);
    const { _key, ...out } = updated;
    return out;
  });

  // --- ServicePoint (Bundle envelope) -------------------------------------
  app.get(`${API}/ServicePoint`, async (req) => {
    const q = (req.query ?? {}) as Q;
    let items = store.list(C.servicePoints);
    if (typeof q.name === 'string') items = items.filter((r) => nameMatches(r.name, q.name));
    if (typeof q.country === 'string') items = items.filter((r) => r.country === q.country);
    if (q.contractActive != null) items = items.filter((r) => String(r.contractActive) === String(q.contractActive));
    if (typeof q.area === 'string') items = items.filter((r) => r.area?.reference?.endsWith(q.area) || r.area?.display === q.area);
    const { count, offset } = pageParams(q);
    const page = items.slice(offset, offset + count);
    const qs = (o: number) => new URLSearchParams({ ...q, _offset: String(o) } as any).toString();
    const link = [{ relation: 'self', url: `${API}/ServicePoint?${qs(offset)}` }];
    if (offset + count < items.length) link.push({ relation: 'next', url: `${API}/ServicePoint?${qs(offset + count)}` });
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: items.length,
      link,
      entry: page.map((r) => ({ fullUrl: `${API}/ServicePoint/${encodeURIComponent(r.identifier)}`, resource: r })),
    };
  });

  app.get(`${API}/ServicePoint/:identifier`, async (req: FastifyRequest<{ Params: { identifier: string } }>, reply) => {
    const sp = store.get(C.servicePoints, req.params.identifier);
    if (!sp) return notFound(reply, 'Service point');
    return sp;
  });
}

