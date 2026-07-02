import { existsSync } from 'node:fs';
import { datasetDir, DEFAULT_DATASET } from '../datasets.js';
import { loadGenerationConfig } from './config.js';
import { generateDataset } from './generate.js';

/**
 * `pnpm setup` — start the server, generating the selected dataset first if it
 * doesn't exist yet. This is the "fold generation into setup" convenience:
 *
 *   pnpm setup                                   # default dataset, no generation
 *   MOCKER_DATASET=dr MOCKER_DATASET_CONFIG=./dr.yaml pnpm setup
 *       # generates datasets/dr (if missing) from ./dr.yaml, then serves it
 *   MOCKER_DATASET=dr pnpm setup                 # reuses datasets/dr if it already exists
 *
 * `default` never triggers generation, so CI and `node dist/index.js` are
 * unaffected. Requires ANTHROPIC_API_KEY only when generation actually runs.
 */
async function main(): Promise<void> {
  const name = process.env.MOCKER_DATASET?.trim() || DEFAULT_DATASET;

  if (name !== DEFAULT_DATASET && !existsSync(datasetDir(name))) {
    const configPath =
      process.env.MOCKER_DATASET_CONFIG?.trim() ||
      `${datasetDir(name)}/dataset.yaml`; // won't exist here, but gives a clear error path

    if (!process.env.MOCKER_DATASET_CONFIG && !existsSync(configPath)) {
      throw new Error(
        `Dataset "${name}" does not exist. Set MOCKER_DATASET_CONFIG to a generation ` +
          `config YAML to create it, or run: pnpm generate-seed --name ${name} --config <path>`
      );
    }

    // eslint-disable-next-line no-console
    console.log(`Dataset "${name}" not found — generating from ${configPath} ...`);
    const config = loadGenerationConfig(configPath);
    config.name = name;
    await generateDataset({ config });
  }

  // Boot the server; loadConfig() reads MOCKER_DATASET and seeds accordingly.
  await import('../index.js');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
