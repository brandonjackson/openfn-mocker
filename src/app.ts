import Fastify, { type FastifyInstance } from 'fastify';
import { registerSystem, fastifyServerOptions } from './server.js';
import { plugins } from './systems/index.js';
import { makeLogLevel } from './logger.js';
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
    if (!plugin) continue; // e.g. salesforce placeholder — enabled but unimplemented
    const mountPath = `/${name}`;

    // Seed from the active dataset: `default` uses the plugin's built-in seed,
    // any other dataset loads its JSON dump (falling back to the built-in seed
    // if that system wasn't generated). Everything else about the plugin is
    // unchanged, so custom routes and admin re-seed keep working.
    const datasetSeed = seedForDataset(plugin, datasetName);
    const seededPlugin = datasetSeed === plugin.seed ? plugin : { ...plugin, seed: datasetSeed };

    await app.register(
      async (instance) => {
        const { store } = await registerSystem(instance, seededPlugin, sysConfig, { mountPath });
        running.push({ name, mountPath, store, plugin: seededPlugin, config: sysConfig });
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
  app.post('/_admin/reset-all', async () => {
    for (const r of running) {
      r.store.reset();
      r.plugin.seed(r.store, r.config);
    }
    return { ok: true, reset: running.map((r) => r.name) };
  });

  return { app, running };
}
