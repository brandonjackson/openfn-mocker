import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { DataStore } from './store.js';
import type { MockSystemPlugin, SystemConfig } from './systems/types.js';

/**
 * Seed datasets. A "dataset" is a folder under `datasets/` holding one JSON
 * dump per system plus a copy of the generation config that produced it. The
 * running server picks one dataset (env `MOCKER_DATASET`, default `default`)
 * and seeds each system from it.
 *
 * `default` is special: it is served directly from each plugin's built-in
 * TypeScript `seed()` (canonical, deterministic IDs, fresh timestamps on every
 * boot) — this is what CI and the Docker image run, so it must never depend on
 * a generated file. Every other dataset is loaded from static JSON produced
 * ahead of time by `pnpm generate-seed`; the LLM is never called at boot.
 */

/** Name of the built-in, committed, CI-tested dataset. */
export const DEFAULT_DATASET = 'default';

/** Root dir holding all datasets (one folder each). Override with MOCKER_DATASETS_DIR. */
export function datasetsRoot(): string {
  return resolve(process.env.MOCKER_DATASETS_DIR ?? 'datasets');
}

/** Absolute path to a dataset's folder. */
export function datasetDir(name: string): string {
  return join(datasetsRoot(), name);
}

/** Absolute path to one system's dump file within a dataset. */
export function datasetSystemFile(name: string, system: string): string {
  return join(datasetDir(name), `${system}.json`);
}

/**
 * A serialized store dump: `collection -> { id -> record }`. This mirrors the
 * shape of a `DataStore` (a record's map key is its id), so loading is a dumb
 * iteration and generation just has to emit this shape. Insertion order is
 * preserved by both Map and plain-object key order, which the ordering-sensitive
 * tests rely on.
 */
export type DatasetDump = Record<string, Record<string, unknown>>;

/** Read + parse a system's dump file, or null if it is absent. */
export function readDatasetDump(name: string, system: string): DatasetDump | null {
  const file = datasetSystemFile(name, system);
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Dataset dump ${file} must be a JSON object of { collection: { id: record } }`);
  }
  return parsed as DatasetDump;
}

/** Turn a dump into a `seed(store, config)` function that loads it into the store. */
export function makeDumpSeed(dump: DatasetDump): (store: DataStore, config: SystemConfig) => void {
  return (store) => {
    for (const [collection, records] of Object.entries(dump)) {
      if (!records || typeof records !== 'object') continue;
      for (const [id, record] of Object.entries(records)) {
        store.create(collection, id, record);
      }
    }
  };
}

/**
 * Resolve the seed function a plugin should use under the active dataset:
 *  - `default` → the plugin's built-in TypeScript seed (never a file).
 *  - any other name → `datasets/<name>/<system>.json` if present, otherwise the
 *    built-in seed as a fallback so a partially-generated dataset still boots.
 */
export function seedForDataset(
  plugin: MockSystemPlugin,
  datasetName: string
): MockSystemPlugin['seed'] {
  if (datasetName === DEFAULT_DATASET) return plugin.seed;
  const dump = readDatasetDump(datasetName, plugin.name);
  return dump ? makeDumpSeed(dump) : plugin.seed;
}
