import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { datasetDir } from '../datasets.js';
import { loadGenerationConfig } from './config.js';
import { generateDataset, generableSystems } from './generate.js';

/**
 * `pnpm generate-seed` — author-time generation of a custom seed dataset.
 *
 *   pnpm generate-seed --name dominican-republic --config ./dr.yaml
 *   pnpm generate-seed --name dominican-republic            # reuse datasets/<name>/dataset.yaml
 *   pnpm generate-seed --name dr --config ./dr.yaml --systems dhis2,fhir,twilio
 *   pnpm generate-seed --name dr --config ./dr.yaml --dry-run
 *
 * Requires ANTHROPIC_API_KEY (unless --dry-run). Never called at server boot.
 */

interface Args {
  name?: string;
  config?: string;
  systems?: string[];
  model?: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--name': args.name = argv[++i]; break;
      case '--config': args.config = argv[++i]; break;
      case '--systems': args.systems = argv[++i]?.split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--model': args.model = argv[++i]; break;
      case '--dry-run': args.dryRun = true; break;
      case '-h':
      case '--help': args.help = true; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

const USAGE = `Usage: pnpm generate-seed --name <dataset> [--config <path>] [options]

  --name <dataset>    Dataset folder to create under datasets/ (required).
  --config <path>     Generation config YAML. Defaults to datasets/<name>/dataset.yaml.
  --systems <csv>     Only generate these systems (default: all). Generable: ${generableSystems().join(', ')}
  --model <id>        Anthropic model (default: ANTHROPIC_MODEL or claude-opus-4-8).
  --dry-run           Show the plan and make no API calls.
  -h, --help          Show this help.

Requires ANTHROPIC_API_KEY unless --dry-run.`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE); // eslint-disable-line no-console
    return;
  }
  if (!args.name) throw new Error(`--name is required.\n\n${USAGE}`);

  const configPath = args.config ?? join(datasetDir(args.name), 'dataset.yaml');
  if (!existsSync(configPath)) {
    throw new Error(
      `No generation config found. Pass --config <path>, or create ${configPath}.\n\n${USAGE}`
    );
  }

  const config = loadGenerationConfig(configPath);
  config.name = args.name; // the folder name wins, so a config can be reused under a new name

  const result = await generateDataset({
    config,
    systems: args.systems,
    model: args.model,
    dryRun: args.dryRun,
  });

  // eslint-disable-next-line no-console
  console.log(
    `\n${result.dryRun ? '[dry-run] ' : ''}dataset "${result.name}" ${result.dryRun ? 'planned' : 'ready'} at ${result.dir}` +
      (result.dryRun ? '' : `\nRun it with:  MOCKER_DATASET=${result.name} pnpm start`)
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
