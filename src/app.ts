import Fastify, { type FastifyInstance } from 'fastify';
import { registerSystem, fastifyServerOptions } from './server.js';
import { plugins } from './systems/index.js';
import { makeLogLevel, type RequestLog } from './logger.js';
import { renderSandboxPage, wantsHtml } from './sandbox.js';
import { seedForDataset, DEFAULT_DATASET } from './datasets.js';
import type { MockerConfig } from './config.js';
import type { DataStore } from './store.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

/** A system mounted on the shared app. */
export interface RunningSystem {
  name: string;
  mountPath: string;
  store: DataStore;
  requestLog: RequestLog;
  plugin: MockSystemPlugin;
  config: SystemConfig;
}

/**
 * Build the shared Fastify app: every enabled system mounted at /<name>, the
 * root index (browser sandbox / JSON), and the aggregated root admin routes.
 * Does NOT listen — callers (the entrypoint, tests) drive that. Returns the app
 * and the list of running systems.
 */
export async function buildServer(
  config: MockerConfig
): Promise<{ app: FastifyInstance; running: RunningSystem[] }> {
  const running: RunningSystem[] = [];
  const datasetName = config.dataset || DEFAULT_DATASET;

  const app = Fastify({
    logger: { level: makeLogLevel(config.log_level) },
    ...fastifyServerOptions,
  });

  // Mount every enabled system as an encapsulated plugin at /<name>. Each
  // system keeps its real internal routes (e.g. dhis2's /api/...), so they
  // become /dhis2/api/... on the one shared port — no cross-system collisions.
  for (const [name, sysConfig] of Object.entries(config.systems)) {
    if (!sysConfig.enabled) continue;
    const plugin = plugins[name];
    if (!plugin) {
      // An enabled block with no registered plugin is a typo'd name or an
      // unimplemented placeholder — say so instead of silently not mounting.
      app.log.warn(
        `config enables system "${name}" but no plugin is registered under that name; skipping ` +
          `(known systems: ${Object.keys(plugins).join(', ')})`
      );
      continue;
    }
    const mountPath = `/${name}`;

    // Seed from the active dataset: `default` uses the plugin's built-in seed,
    // any other dataset loads its JSON dump (falling back to the built-in seed
    // if that system wasn't generated). Everything else about the plugin is
    // unchanged, so custom routes and admin re-seed keep working.
    const datasetSeed = seedForDataset(plugin, datasetName);
    const seededPlugin = datasetSeed === plugin.seed ? plugin : { ...plugin, seed: datasetSeed };

    await app.register(
      async (instance) => {
        const { store, requestLog } = await registerSystem(instance, seededPlugin, sysConfig, {
          mountPath,
        });
        running.push({ name, mountPath, store, requestLog, plugin: seededPlugin, config: sysConfig });
      },
      { prefix: mountPath }
    );
  }

  const systemList = () =>
    running
      .map((r) => ({ name: r.name, path: r.mountPath }))
      .sort((a, b) => a.name.localeCompare(b.name));

  // Root index. Browsers (Accept: text/html) get the interactive API sandbox;
  // API clients (curl, adaptors) keep the documented JSON { name, systems }.
  app.get('/', async (request, reply) => {
    if (wantsHtml(request.headers.accept)) {
      const html = renderSandboxPage(
        running.map((r) => ({ name: r.name, mountPath: r.mountPath, config: r.config })),
        { name: 'openfn-mocker' }
      );
      reply.type('text/html; charset=utf-8');
      return html;
    }
    return { name: 'openfn-mocker', systems: systemList() };
  });

  // Root admin API, aggregated across systems.
  app.get('/_admin/systems', async () =>
    running.map((r) => ({ name: r.name, path: r.mountPath, status: 'running' }))
  );

  // Aggregated request log across every mounted system, most-recent FIRST. Each
  // system keeps its own 100-entry ring buffer (served at /<system>/_admin/requests,
  // oldest-first); this merges them into one strictly-ordered timeline using the
  // process-wide sequence id. Powers the sandbox "Request log" view, which polls
  // it to live-update. `?limit=` caps how many recent entries come back
  // (default 200); `?system=` narrows to a single system.
  app.get('/_admin/requests', async (request) => {
    const q = (request.query ?? {}) as { limit?: string; system?: string };
    const limit = Math.min(2000, Math.max(1, Number.parseInt(q.limit ?? '', 10) || 200));
    const source = q.system ? running.filter((r) => r.name === q.system) : running;
    const all = source.flatMap((r) => r.requestLog.list());
    all.sort((a, b) => b.id - a.id);
    return all.slice(0, limit);
  });
  app.post('/_admin/reset-all', async () => {
    for (const r of running) {
      r.store.reset();
      r.plugin.seed(r.store, r.config);
    }
    return { ok: true, reset: running.map((r) => r.name) };
  });

  return { app, running };
}
