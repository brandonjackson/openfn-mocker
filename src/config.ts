import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SystemConfig } from './systems/types.js';

export interface MockerConfig {
  log_level: string;
  /** Single port the whole mock listens on; every system is path-prefixed under it. */
  port: number;
  /** Which seed dataset to load at boot (folder under datasets/). Default `default`. */
  dataset: string;
  /**
   * Optional top-level defaults for stochastic behavior (latency + error_rate +
   * rate_limit). Copied onto every system that does not set its own, so you can
   * slow down, flake out, or throttle the whole mock in one place. A per-system
   * block overrides it.
   */
  latency?: Record<string, any>;
  error_rate?: number;
  rate_limit?: Record<string, any>;
  systems: Record<string, SystemConfig & { enabled: boolean }>;
}

const DEFAULT_PORT = 4000;
const DEFAULT_DATASET = 'default';

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
    dataset: typeof raw.dataset === 'string' && raw.dataset.trim() ? raw.dataset.trim() : DEFAULT_DATASET,
    latency: raw.latency && typeof raw.latency === 'object' ? raw.latency : undefined,
    error_rate: raw.error_rate !== undefined ? Number(raw.error_rate) : undefined,
    rate_limit: raw.rate_limit && typeof raw.rate_limit === 'object' ? raw.rate_limit : undefined,
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
  // dhis2) reference the right port. Also cascade the optional top-level behavior
  // defaults (latency / error_rate): a system inherits them unless it sets its
  // own, and latency is merged key-by-key so a system can override just `mean_ms`.
  for (const sys of Object.values(config.systems)) {
    sys.port = config.port;
    if (config.latency) sys.latency = { ...config.latency, ...(sys.latency ?? {}) };
    if (config.error_rate !== undefined && sys.error_rate === undefined) {
      sys.error_rate = config.error_rate;
    }
    if (config.rate_limit) sys.rate_limit = { ...config.rate_limit, ...(sys.rate_limit ?? {}) };
  }

  return config;
}

function applyEnvOverrides(config: MockerConfig): void {
  const env = process.env;

  if (env.MOCKER_LOG_LEVEL) config.log_level = env.MOCKER_LOG_LEVEL;

  // Select the seed dataset (folder under datasets/). `default` is served from
  // the built-in TypeScript seeds; any other name loads generated JSON dumps.
  if (env.MOCKER_DATASET && env.MOCKER_DATASET.trim()) config.dataset = env.MOCKER_DATASET.trim();

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
