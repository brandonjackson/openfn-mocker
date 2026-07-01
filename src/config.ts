import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SystemConfig } from './systems/types.js';

export interface MockerConfig {
  log_level: string;
  /** Single port the whole mock listens on; every system is path-prefixed under it. */
  port: number;
  systems: Record<string, SystemConfig & { enabled: boolean }>;
}

const DEFAULT_PORT = 4000;

/**
 * Load mock.config.yaml (from `path`, then $MOCKER_CONFIG, then ./mock.config.yaml),
 * then apply environment overrides:
 *   - MOCKER_SYSTEMS=csv   -> only those systems enabled
 *   - MOCKER_LOG_LEVEL     -> override log level
 *   - MOCKER_PORT / PORT   -> override the single listen port (PORT is the
 *                             Railway / PaaS convention)
 *
 * Every enabled system is mounted at `/<name>` on this one shared port, so there
 * are no per-system ports. The resolved port is copied onto each system's config
 * so plugins that build self-referential URLs keep working.
 */
export function loadConfig(path?: string): MockerConfig {
  const configPath = resolve(path ?? process.env.MOCKER_CONFIG ?? 'mock.config.yaml');
  const text = readFileSync(configPath, 'utf8');
  const raw = (parseYaml(text) ?? {}) as Record<string, any>;

  const config: MockerConfig = {
    log_level: typeof raw.log_level === 'string' ? raw.log_level : 'info',
    // `admin_port` is accepted as a legacy alias for `port`.
    port: Number(raw.port ?? raw.admin_port ?? DEFAULT_PORT),
    systems: {},
  };

  const rawSystems = (raw.systems ?? {}) as Record<string, any>;
  for (const [name, sysRaw] of Object.entries(rawSystems)) {
    const sys = (sysRaw ?? {}) as Record<string, any>;
    config.systems[name] = {
      ...sys,
      // The shared listen port; re-synced after env overrides below.
      port: config.port,
      // Enabled unless explicitly `enabled: false`.
      enabled: sys.enabled !== false,
    };
  }

  applyEnvOverrides(config);

  // All systems share the single listen port; copy it onto each system config so
  // plugins that build absolute self-URLs (fhir, openmrs, kobotoolbox, mailgun,
  // dhis2) reference the right port.
  for (const sys of Object.values(config.systems)) {
    sys.port = config.port;
  }

  return config;
}

function applyEnvOverrides(config: MockerConfig): void {
  const env = process.env;

  if (env.MOCKER_LOG_LEVEL) config.log_level = env.MOCKER_LOG_LEVEL;

  // PORT is the Railway / PaaS convention; MOCKER_PORT is an explicit override.
  if (env.MOCKER_PORT) config.port = Number(env.MOCKER_PORT);
  else if (env.PORT) config.port = Number(env.PORT);

  if (env.MOCKER_SYSTEMS) {
    const only = new Set(
      env.MOCKER_SYSTEMS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const [name, sys] of Object.entries(config.systems)) {
      sys.enabled = only.has(name);
    }
  }
}
