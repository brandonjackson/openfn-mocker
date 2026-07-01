import Fastify from 'fastify';
import { loadConfig } from './config.js';
import { registerSystem, fastifyServerOptions } from './server.js';
import { plugins } from './systems/index.js';
import { makeLogLevel } from './logger.js';
import type { DataStore } from './store.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

interface RunningSystem {
  name: string;
  mountPath: string;
  store: DataStore;
  plugin: MockSystemPlugin;
  config: SystemConfig;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const running: RunningSystem[] = [];

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

    await app.register(
      async (instance) => {
        const { store } = await registerSystem(instance, plugin, sysConfig, { mountPath });
        running.push({ name, mountPath, store, plugin, config: sysConfig });
      },
      { prefix: mountPath }
    );
  }

  // Friendly index at the root so hitting the bare domain lists what's mounted.
  app.get('/', async () => ({
    name: 'openfn-mocker',
    systems: running
      .map((r) => ({ name: r.name, path: r.mountPath }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

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

  await app.listen({ port: config.port, host: '0.0.0.0' });

  printStartupTable(running, config.port);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function printStartupTable(running: RunningSystem[], port: number): void {
  const base = `http://localhost:${port}`;
  const lines = [
    '',
    `  openfn-mocker running on ${base}`,
    '  ' + '─'.repeat(44),
    ...running.map((r) => `  ${r.name.padEnd(16)} ${base}${r.mountPath}`),
    `  ${'admin'.padEnd(16)} ${base}/_admin/systems`,
    '  ' + '─'.repeat(44),
    '',
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start openfn-mocker:', err);
  process.exit(1);
});
