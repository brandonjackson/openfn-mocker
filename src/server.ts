import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { DataStore } from './store.js';
import { RequestLog, summarizeBody, makeLogLevel } from './logger.js';
import { authPlugin } from './auth.js';
import { registerAdminRoutes } from './admin.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

/** Server-level Fastify options shared by the standalone and single-port modes. */
export const fastifyServerOptions = {
  disableRequestLogging: true,
  ignoreTrailingSlash: true,
  bodyLimit: 10 * 1024 * 1024,
} as const;

/**
 * Wire one mock system onto an existing Fastify instance (which may be an
 * encapsulated, path-prefixed child created via `app.register(fn, { prefix })`).
 * Everything registered here is scoped to that instance, so mounting many
 * systems under different prefixes on one app never collides. Wires:
 *  - JSON (built-in) + form-urlencoded (@fastify/formbody) body parsing
 *  - text/xml, application/xml, text/plain -> raw string body (passthrough)
 *  - authPlugin (accept-all; sets request.mockAuth)
 *  - onResponse request logging into a RequestLog ring buffer
 *  - /_admin routes (relative to the instance, so /<prefix>/_admin/* when prefixed)
 *  - plugin.overrides(app, store, config), then plugin.seed(store, config)
 *
 * Returns { store, requestLog }.
 */
export async function registerSystem(
  app: FastifyInstance,
  plugin: MockSystemPlugin,
  config: SystemConfig,
  opts: { mountPath?: string } = {}
): Promise<{ store: DataStore; requestLog: RequestLog }> {
  const store = new DataStore();
  const requestLog = new RequestLog(100);
  const startedAt = Date.now();
  const mountPath = opts.mountPath ?? '';

  // form-urlencoded bodies.
  await app.register(formbody);

  // XML / plain text: keep the raw string as the body (passthrough).
  const rawStringParser = (
    _req: unknown,
    body: string,
    done: (err: Error | null, body?: any) => void
  ) => done(null, body);
  app.addContentTypeParser('text/xml', { parseAs: 'string' }, rawStringParser);
  app.addContentTypeParser('application/xml', { parseAs: 'string' }, rawStringParser);
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, rawStringParser);

  // Accept-all auth, applied directly so it covers every route on this instance.
  await authPlugin(app);

  // Record every response into the ring buffer for /_admin/requests.
  app.addHook('onResponse', async (request, reply) => {
    requestLog.record({
      method: request.method,
      path: (request.url ?? '').split('?')[0],
      statusCode: reply.statusCode,
      auth: request.mockAuth ?? { type: 'none' },
      bodySummary: summarizeBody(request.body),
      timestamp: new Date().toISOString(),
    });
  });

  const reseed = () => plugin.seed(store, config);

  registerAdminRoutes(app, {
    store,
    systemName: plugin.name,
    mountPath,
    requestLog,
    startedAt,
    reseed,
  });

  await plugin.overrides?.(app, store, config);
  plugin.seed(store, config);

  return { store, requestLog };
}

/**
 * Build (but do not listen) a standalone Fastify server for a single mock
 * system with routes at the instance root (no prefix). Used by the test suite;
 * the running server (src/index.ts) instead mounts every system onto one shared
 * app via `registerSystem` with a `/<name>` prefix.
 */
export async function createSystemServer(
  plugin: MockSystemPlugin,
  config: SystemConfig,
  opts: { logLevel?: string }
): Promise<{ app: FastifyInstance; store: DataStore; requestLog: RequestLog }> {
  const app = Fastify({
    logger: { level: makeLogLevel(opts.logLevel) },
    ...fastifyServerOptions,
  });

  const { store, requestLog } = await registerSystem(app, plugin, config);
  return { app, store, requestLog };
}
