import Fastify, { type FastifyInstance } from 'fastify';
import formbody from '@fastify/formbody';
import { DataStore } from './store.js';
import { RequestLog, summarizeBody, makeLogLevel } from './logger.js';
import { authPlugin } from './auth.js';
import { registerAdminRoutes } from './admin.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

/**
 * Build (but do not listen) a Fastify server for one mock system. Wires:
 *  - JSON (built-in) + form-urlencoded (@fastify/formbody) body parsing
 *  - text/xml, application/xml, text/plain -> raw string body (passthrough)
 *  - authPlugin (accept-all; sets request.mockAuth)
 *  - onResponse request logging into a RequestLog ring buffer
 *  - /_admin routes
 *  - plugin.overrides(app, store, config), then plugin.seed(store, config)
 *
 * Returns { app, store, requestLog }. The caller calls app.listen().
 */
export async function createSystemServer(
  plugin: MockSystemPlugin,
  config: SystemConfig,
  opts: { logLevel?: string }
): Promise<{ app: FastifyInstance; store: DataStore; requestLog: RequestLog }> {
  const app = Fastify({
    logger: { level: makeLogLevel(opts.logLevel) },
    disableRequestLogging: true,
    ignoreTrailingSlash: true,
    bodyLimit: 10 * 1024 * 1024,
  });

  const store = new DataStore();
  const requestLog = new RequestLog(100);
  const startedAt = Date.now();

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

  // Accept-all auth, applied directly (non-encapsulated) so it covers every route.
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
    port: config.port,
    requestLog,
    startedAt,
    reseed,
  });

  await plugin.overrides?.(app, store, config);
  plugin.seed(store, config);

  return { app, store, requestLog };
}
