import type { FastifyInstance } from 'fastify';
import type { DataStore } from './store.js';
import type { RequestLog } from './logger.js';

/**
 * Mount the per-system admin API under /_admin. Registered by registerSystem on
 * every system instance, so when a system is mounted at a prefix the routes are
 * served at /<prefix>/_admin/*.
 *
 *   GET  /_admin/status    -> { system, mountPath, uptime, recordCounts }
 *   GET  /_admin/requests  -> LoggedRequest[]   (oldest first)
 *   GET  /_admin/store     -> { collection: [records...] }
 *   POST /_admin/reset     -> clear store + reseed -> { ok:true }
 *   POST /_admin/seed      -> reseed (no clear)    -> { ok:true }
 */
export function registerAdminRoutes(
  app: FastifyInstance,
  ctx: {
    store: DataStore;
    systemName: string;
    /** Path the system is mounted at (e.g. '/dhis2'); '' when standalone. */
    mountPath: string;
    requestLog: RequestLog;
    startedAt: number;
    reseed: () => void;
  }
): void {
  app.get('/_admin/status', async () => {
    const recordCounts: Record<string, number> = {};
    for (const name of ctx.store.collections()) {
      recordCounts[name] = ctx.store.count(name);
    }
    return {
      system: ctx.systemName,
      mountPath: ctx.mountPath,
      uptime: Math.round((Date.now() - ctx.startedAt) / 1000),
      recordCounts,
    };
  });

  app.get('/_admin/requests', async () => ctx.requestLog.list());

  app.get('/_admin/store', async () => ctx.store.dump());

  app.post('/_admin/reset', async () => {
    ctx.store.reset();
    ctx.reseed();
    return { ok: true };
  });

  app.post('/_admin/seed', async () => {
    ctx.reseed();
    return { ok: true };
  });
}
