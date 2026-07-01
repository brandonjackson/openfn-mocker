import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { DataStore } from '../store.js';
import type { ParsedSpec } from './spec-parser.js';
import { toFastifyPath } from './response-generator.js';

export interface CrudOptions {
  /** Store collection name backing this resource. */
  collection: string;
  /** List/create path, e.g. '/api/events' or '/v0/:baseId/:tableName'. */
  basePath: string;
  /** Path param carrying the id (default 'id'). */
  idParam?: string;
  /** Record property holding the id (default 'id'). */
  idField?: string;
  /** Item path (default `${basePath}/:${idParam}`, trailing slash on basePath trimmed). */
  itemPath?: string;
  /** Which CRUD verbs to register (default all). */
  methods?: Array<'list' | 'get' | 'create' | 'update' | 'replace' | 'delete'>;
  /** Wrap the list result (e.g. into an envelope). Default: raw array. */
  wrapList?(items: any[], req: FastifyRequest, reply: FastifyReply): any;
  /** Wrap a single item (get/update/replace responses). Default: the item. */
  wrapItem?(item: any, req: FastifyRequest, reply: FastifyReply): any;
  /** Wrap the create response. Default: the stored record. */
  wrapCreate?(item: any, req: FastifyRequest, reply: FastifyReply): any;
  /** Turn an incoming entity into the stored record (assign id/timestamps). */
  makeRecord?(body: any, req: FastifyRequest): any;
  /** Unwrap a request envelope to the entity (default: identity). */
  extractBody?(body: any, req: FastifyRequest): any;
  /** Query filter applied to list results. */
  filter?(item: any, req: FastifyRequest): boolean;
  /** Create status code (default 201). */
  createStatus?: number;
  /** 404 body (default { error: 'not found' }). */
  notFoundBody?(req: FastifyRequest): any;
}

/**
 * Register a standard CRUD surface for one collection.
 *
 *   GET    basePath   -> list  (filter + wrapList)
 *   GET    itemPath   -> get   (wrapItem, else 404 notFoundBody)
 *   POST   basePath   -> create (extractBody -> makeRecord -> store.create; wrapCreate; createStatus)
 *   PATCH  itemPath   -> update (shallow merge)
 *   PUT    itemPath   -> replace (full)
 *   DELETE itemPath   -> destroy (200 { deleted:[id] }, else 404)
 *
 * Trailing slashes: any trailing '/' on basePath is trimmed before composing
 * the default itemPath, so basePath '/api/assets/' yields itemPath
 * '/api/assets/:id' (not a double slash). The server also runs with Fastify's
 * ignoreTrailingSlash enabled, so '/api/assets' and '/api/assets/' both match.
 */
export function registerCrud(app: FastifyInstance, store: DataStore, opts: CrudOptions): void {
  const idParam = opts.idParam ?? 'id';
  const idField = opts.idField ?? 'id';
  const basePath = opts.basePath;
  const itemPath = opts.itemPath ?? `${basePath.replace(/\/+$/, '')}/:${idParam}`;
  const methods = new Set(opts.methods ?? ['list', 'get', 'create', 'update', 'replace', 'delete']);
  const createStatus = opts.createStatus ?? 201;

  const extractBody = opts.extractBody ?? ((body: any) => body);
  const makeRecord =
    opts.makeRecord ??
    ((body: any): any => {
      const rec =
        body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : { value: body };
      if (rec[idField] === undefined || rec[idField] === null || rec[idField] === '') {
        rec[idField] = randomUUID();
      }
      return rec;
    });
  const notFoundBody = opts.notFoundBody ?? (() => ({ error: 'not found' }));

  const idOf = (req: FastifyRequest): string => String((req.params as Record<string, any>)[idParam]);

  if (methods.has('list')) {
    app.get(basePath, async (req, reply) => {
      let items = store.list(opts.collection);
      if (opts.filter) items = items.filter((it) => opts.filter!(it, req));
      return opts.wrapList ? opts.wrapList(items, req, reply) : items;
    });
  }

  if (methods.has('get')) {
    app.get(itemPath, async (req, reply) => {
      const item = store.get(opts.collection, idOf(req));
      if (item === undefined) {
        reply.code(404);
        return notFoundBody(req);
      }
      return opts.wrapItem ? opts.wrapItem(item, req, reply) : item;
    });
  }

  if (methods.has('create')) {
    app.post(basePath, async (req, reply) => {
      const entity = extractBody(req.body, req);
      const record = makeRecord(entity, req);
      const id = record?.[idField];
      store.create(opts.collection, id != null ? String(id) : undefined, record);
      reply.code(createStatus);
      return opts.wrapCreate ? opts.wrapCreate(record, req, reply) : record;
    });
  }

  if (methods.has('update')) {
    app.patch(itemPath, async (req, reply) => {
      const patch = extractBody(req.body, req);
      const updated = store.update(opts.collection, idOf(req), patch);
      if (updated === undefined) {
        reply.code(404);
        return notFoundBody(req);
      }
      return opts.wrapItem ? opts.wrapItem(updated, req, reply) : updated;
    });
  }

  if (methods.has('replace')) {
    app.put(itemPath, async (req, reply) => {
      const entity = extractBody(req.body, req);
      const record = makeRecord(entity, req);
      const id = idOf(req);
      if (record && typeof record === 'object') record[idField] = id;
      store.replace(opts.collection, id, record);
      return opts.wrapItem ? opts.wrapItem(record, req, reply) : record;
    });
  }

  if (methods.has('delete')) {
    app.delete(itemPath, async (req, reply) => {
      const id = idOf(req);
      if (!store.destroy(opts.collection, id)) {
        reply.code(404);
        return notFoundBody(req);
      }
      reply.code(200);
      return { deleted: [id] };
    });
  }
}

/**
 * Best-effort auto-wiring of simple CRUD from a parsed spec. Groups operations
 * by resource (an item path is one whose last segment is a `{param}`; its
 * collection path is the parent). Complex plugins ignore this and call
 * registerCrud / raw routes directly.
 *
 * `opts.only` filters to specific collection names (the last static segment of
 * the collection path).
 */
export function registerFromSpec(
  app: FastifyInstance,
  store: DataStore,
  spec: ParsedSpec,
  opts?: { only?: string[] }
): void {
  interface Group {
    collectionPath: string;
    collection: string;
    idParam?: string;
    methods: Set<'list' | 'get' | 'create' | 'update' | 'replace' | 'delete'>;
  }
  const groups = new Map<string, Group>();

  const analyze = (
    p: string
  ): { collectionPath: string; isItem: boolean; idParam?: string } => {
    const segs = p.split('/').filter(Boolean);
    const last = segs[segs.length - 1];
    if (last && last.startsWith('{') && last.endsWith('}')) {
      return { collectionPath: '/' + segs.slice(0, -1).join('/'), isItem: true, idParam: last.slice(1, -1) };
    }
    return { collectionPath: '/' + segs.join('/'), isItem: false };
  };

  const lastStatic = (p: string): string => {
    const segs = p.split('/').filter((s) => s && !(s.startsWith('{') && s.endsWith('}')));
    return segs[segs.length - 1] ?? 'root';
  };

  for (const op of spec.operations) {
    const { collectionPath, isItem, idParam } = analyze(op.path);
    let g = groups.get(collectionPath);
    if (!g) {
      g = { collectionPath, collection: lastStatic(collectionPath), methods: new Set() };
      groups.set(collectionPath, g);
    }
    if (isItem && idParam && !g.idParam) g.idParam = idParam;
    const m = op.method.toUpperCase();
    if (!isItem && m === 'GET') g.methods.add('list');
    else if (!isItem && m === 'POST') g.methods.add('create');
    else if (isItem && m === 'GET') g.methods.add('get');
    else if (isItem && m === 'PATCH') g.methods.add('update');
    else if (isItem && m === 'PUT') g.methods.add('replace');
    else if (isItem && m === 'DELETE') g.methods.add('delete');
  }

  for (const g of groups.values()) {
    if (opts?.only && !opts.only.includes(g.collection)) continue;
    if (g.methods.size === 0) continue;
    const basePath = toFastifyPath(g.collectionPath);
    registerCrud(app, store, {
      collection: g.collection,
      basePath,
      idParam: g.idParam ?? 'id',
      itemPath: g.idParam ? `${basePath.replace(/\/+$/, '')}/:${g.idParam}` : undefined,
      methods: [...g.methods],
    });
  }
}
