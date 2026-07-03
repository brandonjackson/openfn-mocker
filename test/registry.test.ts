import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { plugins } from '../src/systems/index.js';
import { loadConfig } from '../src/config.js';

/**
 * Drift guards for the system registry. Every mock system is keyed by one
 * string that must agree across the plugin directory, the registry in
 * src/systems/index.ts, the plugin's own `name`, and (via loadConfig's
 * defaulting) the resolved config — these tests make any mismatch a test
 * failure instead of a silently missing system.
 */

const SYSTEMS_DIR = fileURLToPath(new URL('../src/systems', import.meta.url));

/** System directories under src/systems (everything but the shared helpers). */
function systemDirs(): string[] {
  return readdirSync(SYSTEMS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'shared')
    .map((d) => d.name)
    .sort();
}

describe('system registry', () => {
  it('registers every src/systems/<name>/ directory', () => {
    const registered = Object.keys(plugins).sort();
    expect(registered).toEqual(systemDirs());
  });

  it('keys every plugin by its own name (registry key == plugin.name == mount path)', () => {
    for (const [key, plugin] of Object.entries(plugins)) {
      expect(plugin.name, `registry key "${key}" must equal its plugin's name`).toBe(key);
    }
  });

  it('loadConfig gives every registered plugin a config block (enabled by default)', () => {
    const config = loadConfig();
    for (const name of Object.keys(plugins)) {
      expect(config.systems[name], `config block for "${name}"`).toBeDefined();
      expect(config.systems[name].port).toBe(config.port);
    }
  });
});
