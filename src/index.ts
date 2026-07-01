import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig } from './config.js';
import { createSystemServer } from './server.js';
import { plugins } from './systems/index.js';
import { makeLogLevel } from './logger.js';
import type { DataStore } from './store.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

interface RunningSystem {
  name: string;
  port: number;
  app: FastifyInstance;
  store: DataStore;
  plugin: MockSystemPlugin;
  config: SystemConfig;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const running: RunningSystem[] = [];

  for (const [name, sysConfig] of Object.entries(config.systems)) {
    if (!sysConfig.enabled) continue;
    const plugin = plugins[name];
    if (!plugin) continue; // e.g. salesforce placeholder — enabled but unimplemented
    if (!Number.isFinite(sysConfig.port)) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping "${name}": no valid port configured.`);
      continue;
    }

    const { app, store } = await createSystemServer(plugin, sysConfig, {
      logLevel: config.log_level,
    });
    await app.listen({ port: sysConfig.port, host: '0.0.0.0' });
    running.push({ name, port: sysConfig.port, app, store, plugin, config: sysConfig });
  }

  // Root admin server.
  const admin = Fastify({
    logger: { level: makeLogLevel(config.log_level) },
    disableRequestLogging: true,
  });
  admin.get('/_admin/systems', async () =>
    running.map((r) => ({ name: r.name, port: r.port, status: 'running' }))
  );
  admin.post('/_admin/reset-all', async () => {
    for (const r of running) {
      r.store.reset();
      r.plugin.seed(r.store, r.config);
    }
    return { ok: true, reset: running.map((r) => r.name) };
  });
  await admin.listen({ port: config.admin_port, host: '0.0.0.0' });

  printStartupTable(running, config.admin_port);

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await Promise.allSettled([admin.close(), ...running.map((r) => r.app.close())]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function printStartupTable(running: RunningSystem[], adminPort: number): void {
  const lines = [
    '',
    '  openfn-mocker running',
    '  ' + '─'.repeat(34),
    `  ${'admin'.padEnd(18)} http://localhost:${adminPort}`,
    ...running.map((r) => `  ${r.name.padEnd(18)} http://localhost:${r.port}`),
    '  ' + '─'.repeat(34),
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
