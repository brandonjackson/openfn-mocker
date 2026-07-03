import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { DataStore } from './store.js';
import { RequestLog, summarizeBody, makeLogLevel } from './logger.js';
import { authPlugin, enforceAuth } from './auth.js';
import { registerBehavior } from './behavior.js';
import { registerAdminRoutes } from './admin.js';
import { externalOrigin, isProxied, rewriteToExternalOrigin } from './systems/shared/self-url.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

/**
 * Collapse runs of `/` in a URL path (keeping the query string intact). Real
 * deployments of these systems sit behind a proxy (nginx `merge_slashes on`),
 * so some OpenFn adaptors build paths with doubled slashes (e.g. kobotoolbox
 * emits `/api/v2//assets/{id}/data//`) and rely on the proxy normalizing them.
 * Normalizing here keeps the mock faithful to that behavior.
 */
export function collapseSlashes(url: string): string {
  const qIdx = url.indexOf('?');
  const path = qIdx === -1 ? url : url.slice(0, qIdx);
  const query = qIdx === -1 ? '' : url.slice(qIdx);
  return path.replace(/\/{2,}/g, '/') + query;
}

/** Server-level Fastify options shared by the standalone and single-port modes. */
export const fastifyServerOptions = {
  disableRequestLogging: true,
  ignoreTrailingSlash: true,
  bodyLimit: 10 * 1024 * 1024,
  rewriteUrl(req: { url?: string }) {
    return collapseSlashes(req.url ?? '/');
  },
} as const;

/**
 * Wire one mock system onto an existing Fastify instance (which may be an
 * encapsulated, path-prefixed child created via `app.register(fn, { prefix })`).
 * Everything registered here is scoped to that instance, so mounting many
 * systems under different prefixes on one app never collides. Wires:
 *  - JSON (built-in) + form-urlencoded (@fastify/formbody) body parsing
 *  - text/xml, application/xml, text/plain -> raw string body (passthrough)
 *  - authPlugin (sets request.mockAuth) + enforceAuth (401 when the plugin
 *    declares auth.required and no credentials are sent; open systems unaffected)
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

  // Parse auth into request.mockAuth on every route (never rejects here)...
  await authPlugin(app);
  // ...then enforce the plugin's auth requirement: systems that declare
  // `auth.required` return 401 when no credentials are sent, while open systems
  // (no declaration, or required:false) stay accept-all. Runs after authPlugin
  // so request.mockAuth is populated; admin routes and exemptPaths are skipped.
  enforceAuth(app, plugin.auth, { system: plugin.name, mountPath });

  // Optional stochastic behavior (latency + error injection) from the system's
  // config block. No-ops when the config leaves the knobs at their defaults.
  registerBehavior(app, config);

  // Rewrite internal self-referential URLs (http://localhost:<port>/...) to the
  // public origin when the request came through a reverse proxy, so paging
  // links, FHIR fullUrls, Location headers, etc. are reachable from a deployed
  // instance (Railway, Render, Fly, ...) and carry the /<system> mount prefix.
  // Gated on X-Forwarded-Host: direct/local/test traffic is left untouched, so
  // this never changes behavior when the mock is hit directly.
  const internalOrigin = `http://localhost:${config.port}`;
  app.addHook('onSend', async (request, reply, payload) => {
    if (!isProxied(request)) return payload;
    const origin = externalOrigin(request, config.port);
    if (origin === internalOrigin) return payload;

    const location = reply.getHeader('location');
    if (typeof location === 'string' && location.includes(internalOrigin)) {
      reply.header('location', rewriteToExternalOrigin(location, internalOrigin, origin, mountPath));
    }

    if (typeof payload === 'string' && payload.includes(internalOrigin)) {
      return rewriteToExternalOrigin(payload, internalOrigin, origin, mountPath);
    }
    return payload;
  });

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

/** A default Authorization header value matching a system's first accepted scheme. */
function defaultAuthHeader(plugin: MockSystemPlugin): string {
  const scheme = plugin.auth?.schemes?.[0] ?? 'basic';
  switch (scheme) {
    case 'bearer':
      return 'Bearer mock-token';
    case 'token':
      return 'Token mock-token';
    case 'apikey':
      return 'ApiKey mock:mock-key';
    case 'basic':
    default:
      return 'Basic ' + Buffer.from('mock:mock').toString('base64');
  }
}

/** Does an inject-options object already carry an auth credential? */
function injectHasAuth(headers: Record<string, any> | undefined): boolean {
  if (!headers) return false;
  const lower = Object.keys(headers).map((k) => k.toLowerCase());
  return ['authorization', 'apikey', 'x-api-key', 'api_key', 'api-key'].some((h) =>
    lower.includes(h)
  );
}

/**
 * Build (but do not listen) a standalone Fastify server for a single mock
 * system with routes at the instance root (no prefix). Used by the test suite;
 * the running server (src/index.ts) instead mounts every system onto one shared
 * app via `registerSystem` with a `/<name>` prefix.
 *
 * By default, when the plugin requires auth, `app.inject` is wrapped to attach a
 * default credential to any request that doesn't already send one — so tests
 * that don't care about auth exercise the authorized path without boilerplate,
 * while the real enforcement code still runs. Pass `{ autoAuth: false }` to turn
 * this off and drive the 401 path directly (see test/auth.test.ts).
 */
export async function createSystemServer(
  plugin: MockSystemPlugin,
  config: SystemConfig,
  opts: { logLevel?: string; autoAuth?: boolean }
): Promise<{ app: FastifyInstance; store: DataStore; requestLog: RequestLog }> {
  const app = Fastify({
    logger: { level: makeLogLevel(opts.logLevel) },
    ...fastifyServerOptions,
  });

  const { store, requestLog } = await registerSystem(app, plugin, config);

  const autoAuth = opts.autoAuth ?? true;
  if (autoAuth && plugin.auth?.required) {
    const header = defaultAuthHeader(plugin);
    const rawInject = app.inject.bind(app);
    // Only string-URL and options-object call shapes are used in the suite.
    (app as any).inject = (arg?: any) => {
      if (typeof arg === 'string') {
        return rawInject({ url: arg, headers: { authorization: header } });
      }
      if (arg && typeof arg === 'object' && !injectHasAuth(arg.headers)) {
        return rawInject({ ...arg, headers: { ...arg.headers, authorization: header } });
      }
      return rawInject(arg);
    };
  }

  return { app, store, requestLog };
}
