import { mkdirSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from '../config.js';
import { plugins } from '../systems/index.js';
import { datasetDir, datasetSystemFile, DEFAULT_DATASET, type DatasetDump } from '../datasets.js';
import type { SystemConfig } from '../systems/types.js';
import { dumpPluginSeed, dumpRecordCount } from './dump.js';
import { generateSystemDump, resolveModel } from './anthropic.js';
import { serializeGenerationConfig, type GenerationConfig } from './config.js';

/** Per-system runtime config from mock.config.yaml (so seeds read domain/port/etc). */
function systemConfigFor(name: string): SystemConfig {
  const mockConfig = loadConfig();
  const block = mockConfig.systems[name];
  return block ?? { port: mockConfig.port };
}

/** Systems that actually seed data (have a non-empty default dump) and can be generated. */
export function generableSystems(): string[] {
  return Object.keys(plugins).filter((name) => {
    try {
      return dumpRecordCount(dumpPluginSeed(plugins[name], systemConfigFor(name))) > 0;
    } catch {
      return false;
    }
  });
}

export interface GenerateDatasetOptions {
  config: GenerationConfig;
  /** Restrict to these systems (defaults to every generable system). */
  systems?: string[];
  model?: string;
  /** Build prompts + report the plan but make no API calls and write no dumps. */
  dryRun?: boolean;
  /** Progress sink (defaults to console.log). */
  log?: (msg: string) => void;
}

export interface GenerateDatasetResult {
  name: string;
  dir: string;
  model: string;
  systems: Array<{ system: string; records: number; exampleRecords: number }>;
  dryRun: boolean;
}

/**
 * Generate a full dataset: for every targeted system, dump its built-in default
 * as the few-shot example, ask the model to re-flavour it for the project, and
 * write the result to datasets/<name>/<system>.json. A copy of the generation
 * config is written to datasets/<name>/dataset.yaml. The LLM is called here, at
 * author time — never at server boot.
 */
export async function generateDataset(opts: GenerateDatasetOptions): Promise<GenerateDatasetResult> {
  const { config, model: modelArg, dryRun = false } = opts;
  const log = opts.log ?? ((m: string) => console.log(m)); // eslint-disable-line no-console
  const model = resolveModel(modelArg);

  if (config.name === DEFAULT_DATASET) {
    throw new Error(
      `Refusing to generate over the "${DEFAULT_DATASET}" dataset. Pick another name — ` +
        '`default` is the committed, CI-tested dataset served from the built-in seeds.'
    );
  }

  const all = generableSystems();
  const targets = opts.systems?.length
    ? opts.systems.filter((s) => {
        const ok = all.includes(s);
        if (!ok) log(`  skip ${s}: not a generable system (known: ${all.join(', ')})`);
        return ok;
      })
    : all;

  const dir = datasetDir(config.name);
  const summary: GenerateDatasetResult = { name: config.name, dir, model, systems: [], dryRun };

  if (dryRun) {
    log(`[dry-run] dataset "${config.name}" -> ${dir}`);
    log(`[dry-run] model: ${model}`);
    log(`[dry-run] systems: ${targets.join(', ')}`);
    for (const system of targets) {
      const example = dumpPluginSeed(plugins[system], systemConfigFor(system));
      const n = dumpRecordCount(example);
      summary.systems.push({ system, records: 0, exampleRecords: n });
      log(`[dry-run]   ${system}: would generate ~${n} records across ${Object.keys(example).length} collection(s)`);
    }
    return summary;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set. Export it before generating a dataset.');
  }

  const client = new Anthropic();
  mkdirSync(dir, { recursive: true });

  for (const system of targets) {
    const exampleDump = dumpPluginSeed(plugins[system], systemConfigFor(system));
    const exampleRecords = dumpRecordCount(exampleDump);
    log(`  generating ${system} (example: ${exampleRecords} records)...`);
    const dump: DatasetDump = await generateSystemDump({
      client,
      model,
      system,
      exampleDump,
      config,
      hint: config.systems?.[system],
    });
    const file = datasetSystemFile(config.name, system);
    writeFileSync(file, JSON.stringify(dump, null, 2) + '\n');
    const records = dumpRecordCount(dump);
    summary.systems.push({ system, records, exampleRecords });
    log(`    wrote ${file} (${records} records)`);
  }

  // Store a copy of the config that produced this dataset, next to the data.
  writeFileSync(`${dir}/dataset.yaml`, serializeGenerationConfig(config));
  log(`  wrote ${dir}/dataset.yaml`);

  return summary;
}
