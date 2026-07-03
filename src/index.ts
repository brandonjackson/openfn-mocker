import { loadConfig } from './config.js';
import { buildServer, type RunningSystem } from './app.js';
import { DEFAULT_DATASET } from './datasets.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { app, running } = await buildServer(config);

  await app.listen({ port: config.port, host: '0.0.0.0' });

  printStartupTable(running, config.port, config.dataset ?? DEFAULT_DATASET);

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

function printStartupTable(running: RunningSystem[], port: number, dataset: string): void {
  const base = `http://localhost:${port}`;
  const lines = [
    '',
    `  openfn-mocker running on ${base}`,
    `  dataset: ${dataset}`,
    `  open ${base} in a browser for the API sandbox`,
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
