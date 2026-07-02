import { DataStore } from '../store.js';
import type { DatasetDump } from '../datasets.js';
import type { MockSystemPlugin, SystemConfig } from '../systems/types.js';

/**
 * Run a plugin's built-in seed into a throwaway store and serialize it as a
 * `{ collection: { id: record } }` dump. This is the canonical way to capture a
 * system's default data — used to write the committed `default` snapshot and as
 * the few-shot example handed to the LLM when generating a new dataset. Because
 * it dumps whatever the seed actually produces, it stays correct no matter how
 * the seed files evolve.
 */
export function dumpPluginSeed(plugin: MockSystemPlugin, config: SystemConfig): DatasetDump {
  const store = new DataStore();
  plugin.seed(store, config);
  const dump: DatasetDump = {};
  for (const name of store.collections()) {
    dump[name] = Object.fromEntries(store.collection(name));
  }
  return dump;
}

/** Total record count across all collections in a dump. */
export function dumpRecordCount(dump: DatasetDump): number {
  return Object.values(dump).reduce((sum, records) => sum + Object.keys(records ?? {}).length, 0);
}
