import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MockSystemPlugin, SystemConfig } from '../types.js';
import type { DataStore } from '../../store.js';
import { parseMethodCall, serializeResponse, serializeFault } from '../shared/xmlrpc.js';
import { seed, UID } from './seed.js';

/**
 * OpenSPP (social-protection Digital Public Good, built on Odoo). The openspp
 * adaptor uses `odoo-await`, which speaks Odoo's XML-RPC external API over two
 * endpoints:
 *   POST /xmlrpc/2/common — `version` and `authenticate` (returns a uid int).
 *   POST /xmlrpc/2/object — `execute_kw(db, uid, pw, model, method, args, kwargs)`
 *     with method in { search_read, search, search_count, read, create, write,
 *     unlink, fields_get }.
 *
 * Records live in store collections keyed by the Odoo model name (res.partner,
 * g2p.program, spp.area, ...). Domains are applied with the common Odoo
 * operators and support dotted relational paths (e.g. `partner_id.spp_id`,
 * `group.spp_id`) by following many2one links between models — the openspp
 * adaptor searches enrolment/membership models by a field on the related
 * registrant, which this mock resolves the same way Odoo does. Requests and
 * responses are XML, so this plugin parses/serializes XML-RPC by hand (see
 * ../shared/xmlrpc). Auth is accept-all.
 *
 * Together these cover the full openspp adaptor surface: createGroup /
 * createIndividual / updateGroup / updateIndividual / getGroup / getIndividual /
 * getGroupMembers / searchGroup / searchIndividual / addToGroup /
 * removeFromGroup / getProgram / getPrograms / enroll / unenroll /
 * getEnrolledPrograms / getServicePoint / searchServicePoint / getArea /
 * searchArea.
 */

/**
 * Odoo relational (many2one) fields, keyed by model then field name, mapping to
 * the target model. Used to resolve dotted domain paths like
 * `partner_id.spp_id` or `group.spp_id`: the openspp adaptor searches
 * membership/enrolment models by a field on the *related* registrant, which
 * Odoo resolves by walking the relation. The mock follows the same links.
 */
const RELATIONS: Record<string, Record<string, string>> = {
  'res.partner': { area_id: 'spp.area', parent_id: 'res.partner' },
  'g2p.program_membership': { partner_id: 'res.partner', program_id: 'g2p.program' },
  'g2p.group.membership': { group: 'res.partner', individual: 'res.partner', kind: 'g2p.group.membership.kind' },
  'spp.service.point': { area_id: 'spp.area' },
  'spp.area': { parent_id: 'spp.area' },
};

/**
 * Resolve a (possibly dotted) domain field against a record, following Odoo
 * relations. `spp_id` -> record.spp_id; `partner_id.spp_id` -> follow the
 * many2one `partner_id` to its res.partner, then read that record's `spp_id`.
 */
function resolveFieldValue(store: DataStore, model: string, record: any, field: string): any {
  if (!record) return undefined;
  const dot = field.indexOf('.');
  if (dot === -1) return record[field];
  const head = field.slice(0, dot);
  const rest = field.slice(dot + 1);
  let ref = record[head];
  // Odoo many2one values are [id, label]; follow the id to the related record.
  if (Array.isArray(ref)) ref = ref[0];
  const targetModel = RELATIONS[model]?.[head];
  if (targetModel == null || ref == null) return undefined;
  return resolveFieldValue(store, targetModel, store.get(targetModel, String(ref)), rest);
}

/** Apply one Odoo domain condition [field, op, value] to a record. */
function matchCondition(store: DataStore, model: string, record: any, cond: any[]): boolean {
  if (!Array.isArray(cond) || cond.length < 3) return true;
  const [field, op, value] = cond;
  let actual = resolveFieldValue(store, model, record, field);
  // Odoo many2one fields are stored as [id, label]; compare against the id.
  if (Array.isArray(actual)) actual = actual[0];
  switch (op) {
    case '=':
    case '==':
      return String(actual) === String(value);
    case '!=':
    case '<>':
      return String(actual) !== String(value);
    case '>':
      return actual > value;
    case '>=':
      return actual >= value;
    case '<':
      return actual < value;
    case '<=':
      return actual <= value;
    case 'like':
    case 'ilike':
    case '=like':
    case '=ilike':
      return String(actual ?? '').toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      return Array.isArray(value) && value.map(String).includes(String(actual));
    case 'not in':
      return Array.isArray(value) && !value.map(String).includes(String(actual));
    default:
      return true;
  }
}

/** Filter records by an Odoo domain (logical operators '&' '|' '!' are ANDed). */
function applyDomain(store: DataStore, model: string, records: any[], domain: any): any[] {
  if (!Array.isArray(domain) || domain.length === 0) return records;
  const conditions = domain.filter((d) => Array.isArray(d));
  return records.filter((r) => conditions.every((c) => matchCondition(store, model, r, c)));
}

/** Project a record down to the requested fields (id always included). */
function projectFields(record: any, fields: any): any {
  if (!Array.isArray(fields) || fields.length === 0) return record;
  const out: Record<string, any> = { id: record.id };
  for (const f of fields) if (f in record) out[f] = record[f];
  return out;
}

/** Next integer id for a model collection (max existing + 1). */
function nextId(store: DataStore, model: string): number {
  const ids = store.list(model).map((r) => Number(r.id)).filter(Number.isFinite);
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

function executeKw(store: DataStore, params: any[]): any {
  // params: [db, uid, password, model, method, args, kwargs]
  const model = params[3];
  const method = params[4];
  const args: any[] = Array.isArray(params[5]) ? params[5] : [];
  const kwargs: Record<string, any> = params[6] && typeof params[6] === 'object' ? params[6] : {};

  switch (method) {
    case 'search_read': {
      const domain = args[0] ?? kwargs.domain ?? [];
      let records = applyDomain(store, model, store.list(model), domain);
      const offset = Number(kwargs.offset ?? 0) || 0;
      const limit = kwargs.limit != null ? Number(kwargs.limit) : undefined;
      if (offset) records = records.slice(offset);
      if (limit != null) records = records.slice(0, limit);
      return records.map((r) => projectFields(r, kwargs.fields));
    }
    case 'search': {
      const domain = args[0] ?? kwargs.domain ?? [];
      return applyDomain(store, model, store.list(model), domain).map((r) => Number(r.id));
    }
    case 'search_count': {
      const domain = args[0] ?? kwargs.domain ?? [];
      return applyDomain(store, model, store.list(model), domain).length;
    }
    case 'read': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      return ids
        .map((id) => store.get(model, String(id)))
        .filter((r) => r !== undefined)
        .map((r) => projectFields(r, kwargs.fields));
    }
    case 'create': {
      const values = args[0] && typeof args[0] === 'object' ? args[0] : {};
      const id = nextId(store, model);
      store.create(model, String(id), { id, ...values });
      return id;
    }
    case 'write': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      const values = args[1] && typeof args[1] === 'object' ? args[1] : {};
      for (const id of ids) store.update(model, String(id), values);
      return true;
    }
    case 'unlink': {
      const ids: any[] = Array.isArray(args[0]) ? args[0] : [args[0]];
      for (const id of ids) store.destroy(model, String(id));
      return true;
    }
    case 'fields_get':
      return {};
    default:
      throw new Error(`Unsupported model method: ${method}`);
  }
}

const plugin: MockSystemPlugin = {
  name: 'openspp',
  credential: {
    type: 'userpass',
    fields: [
      { name: 'baseUrl', role: 'url' },
      { name: 'database', role: 'static', value: 'openspp' },
      { name: 'username', role: 'username', value: 'admin' },
      { name: 'password', role: 'secret', secret: { charset: 'alnum', length: 16 } },
    ],
  },

  usage: [
    { fn: "getGroup", signature: "getGroup(sppId, callback?)", description: "Fetch one group (household) registrant by its spp_id.",
      code: "getGroup('GRP_KAMARA01');", apiRef: "search-group" },
    { fn: "getIndividual", signature: "getIndividual(sppId, callback?)", description: "Fetch one individual registrant by its spp_id.",
      code: "getIndividual('IND_AMINA001');", apiRef: "search-individual" },
    { fn: "searchGroup", signature: "searchGroup(domain, options?, callback?)", description: "Search group registrants with an Odoo domain (adds is_group=true).",
      code: "searchGroup([['spp_id', 'ilike', 'GRP']], { limit: 10 });", apiRef: "search-group" },
    { fn: "searchIndividual", signature: "searchIndividual(domain, options?, callback?)", description: "Search individual registrants with an Odoo domain (adds is_group=false).",
      code: "searchIndividual([['gender', '=', 'Female']], { offset: 0 });", apiRef: "search-individual" },
    { fn: "createGroup", signature: "createGroup(data, callback?)", description: "Create a group (household) registrant; returns its new spp_id.",
      code: "createGroup({ name: 'Bangura Household', kind: 'Household' });", apiRef: "create-group" },
    { fn: "createIndividual", signature: "createIndividual(data, callback?)", description: "Create an individual registrant; returns its new spp_id.",
      code: "createIndividual({ name: 'Fatima Bangura', gender: 'Female' });", apiRef: "create-individual" },
    { fn: "updateGroup", signature: "updateGroup(sppId, data)", description: "Update a group registrant found by spp_id.",
      code: "updateGroup('GRP_KAMARA01', { name: 'Kamara Family' });", apiRef: "search-group" },
    { fn: "updateIndividual", signature: "updateIndividual(sppId, data)", description: "Update an individual registrant found by spp_id.",
      code: "updateIndividual('IND_AMINA001', { phone: '+23276000999' });", apiRef: "search-individual" },
    { fn: "getGroupMembers", signature: "getGroupMembers(sppId, options?, callback?)", description: "List the live members of a group (is_ended=false).",
      code: "getGroupMembers('GRP_KAMARA01', { limit: 20 });", apiRef: "group-members" },
    { fn: "addToGroup", signature: "addToGroup(groupSppId, individualSppId, role?)", description: "Add an individual to a group, optionally with a membership role.",
      code: "addToGroup('GRP_KAMARA01', 'IND_FATMATA1', 'Head');", apiRef: "group-members" },
    { fn: "removeFromGroup", signature: "removeFromGroup(groupSppId, individualSppId)", description: "End an individual's live membership in a group.",
      code: "removeFromGroup('GRP_KAMARA01', 'IND_MOHAMED1');", apiRef: "group-members" },
    { fn: "getProgram", signature: "getProgram(programId, callback?)", description: "Fetch one program by its program_id.",
      code: "getProgram('PROG_CT2024');", apiRef: "programs" },
    { fn: "getPrograms", signature: "getPrograms(options?, callback?)", description: "List all programs (supports offset/limit).",
      code: "getPrograms({ offset: 0 });", apiRef: "programs" },
    { fn: "enroll", signature: "enroll(sppId, programId)", description: "Enroll a registrant into a program (creates/updates the membership).",
      code: "enroll('GRP_KAMARA01', 'PROG_CT2024');", apiRef: "enrolments" },
    { fn: "unenroll", signature: "unenroll(sppId, programId)", description: "Remove a registrant from a program (marks the membership not-enrolled).",
      code: "unenroll('GRP_KAMARA01', 'PROG_CT2024');", apiRef: "enrolments" },
    { fn: "getEnrolledPrograms", signature: "getEnrolledPrograms(sppId, callback?)", description: "List the programs a registrant is enrolled in.",
      code: "getEnrolledPrograms('GRP_KAMARA01');", apiRef: "enrolments" },
    { fn: "getServicePoint", signature: "getServicePoint(sppId, callback?)", description: "Fetch one service point (pay point / agent) by spp_id.",
      code: "getServicePoint('SVP_BO01');", apiRef: "service-points" },
    { fn: "searchServicePoint", signature: "searchServicePoint(domain, options?, callback?)", description: "Search service points with an Odoo domain.",
      code: "searchServicePoint([['is_disabled', '=', false]]);", apiRef: "service-points" },
    { fn: "getArea", signature: "getArea(sppId, callback?)", description: "Fetch one area by spp_id.",
      code: "getArea('AREA_SL_BO');", apiRef: "areas" },
    { fn: "searchArea", signature: "searchArea(domain, options?, callback?)", description: "Search areas with an Odoo domain.",
      code: "searchArea([['code', 'ilike', 'SL']]);", apiRef: "areas" },
  ],

  async overrides(app: FastifyInstance, store: DataStore, _config: SystemConfig) {
    const xml = (reply: FastifyReply) => reply.type('text/xml; charset=utf-8');

    // POST /xmlrpc/2/common — version / authenticate.
    app.post('/xmlrpc/2/common', async (req: FastifyRequest, reply) => {
      xml(reply);
      const call = parseMethodCall(String(req.body ?? ''));
      if (call.methodName === 'version') {
        return serializeResponse({
          server_version: '16.0',
          server_version_info: [16, 0, 0, 'final', 0, ''],
          server_serie: '16.0',
          protocol_version: 1,
        });
      }
      // authenticate(db, login, password, {}) -> uid (accept any credentials).
      return serializeResponse(UID);
    });

    // POST /xmlrpc/2/object — execute_kw dispatch.
    app.post('/xmlrpc/2/object', async (req: FastifyRequest, reply) => {
      xml(reply);
      const call = parseMethodCall(String(req.body ?? ''));
      if (call.methodName !== 'execute_kw') {
        return serializeFault(1, `Unsupported method: ${call.methodName}`);
      }
      try {
        return serializeResponse(executeKw(store, call.params));
      } catch (e) {
        return serializeFault(2, (e as Error).message);
      }
    });
  },

  seed,
};

export default plugin;
