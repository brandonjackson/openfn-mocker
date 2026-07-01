import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { SystemConfig } from './systems/types.js';

export interface MockerConfig {
  log_level: string;
  admin_port: number;
  systems: Record<string, SystemConfig & { enabled: boolean }>;
}

/**
 * Load mock.config.yaml (from `path`, then $MOCKER_CONFIG, then ./mock.config.yaml),
 * then apply environment overrides:
 *   - MOCKER_SYSTEMS=csv           -> only those systems enabled
 *   - MOCKER_<SYS>_PORT            -> override a system's port (SYS uppercased,
 *                                     dashes->underscores; http-generic -> HTTP_GENERIC)
 *   - MOCKER_LOG_LEVEL             -> override log level
 *   - MOCKER_ADMIN_PORT            -> override admin port
 *   - PORT (Railway convention)    -> if exactly one system is enabled, use it for that system
 */
export function loadConfig(path?: string): MockerConfig {
  const configPath = resolve(path ?? process.env.MOCKER_CONFIG ?? 'mock.config.yaml');
  const text = readFileSync(configPath, 'utf8');
  const raw = (parseYaml(text) ?? {}) as Record<string, any>;

  const config: MockerConfig = {
    log_level: typeof raw.log_level === 'string' ? raw.log_level : 'info',
    admin_port: Number(raw.admin_port ?? 4000),
    systems: {},
  };

  const rawSystems = (raw.systems ?? {}) as Record<string, any>;
  for (const [name, sysRaw] of Object.entries(rawSystems)) {
    const sys = (sysRaw ?? {}) as Record<string, any>;
    config.systems[name] = {
      ...sys,
      port: Number(sys.port),
      // Enabled unless explicitly `enabled: false`.
      enabled: sys.enabled !== false,
    };
  }

  applyEnvOverrides(config);
  return config;
}

/** MOCKER env-var suffix for a system key: 'http-generic' -> 'HTTP_GENERIC'. */
export function envKeyForSystem(name: string): string {
  return name.toUpperCase().replace(/-/g, '_');
}

function applyEnvOverrides(config: MockerConfig): void {
  const env = process.env;

  if (env.MOCKER_LOG_LEVEL) config.log_level = env.MOCKER_LOG_LEVEL;
  if (env.MOCKER_ADMIN_PORT) config.admin_port = Number(env.MOCKER_ADMIN_PORT);

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

  for (const name of Object.keys(config.systems)) {
    const key = `MOCKER_${envKeyForSystem(name)}_PORT`;
    const val = env[key];
    if (val) config.systems[name].port = Number(val);
  }

  // Railway / PaaS single-port convention.
  if (env.PORT) {
    const enabled = Object.values(config.systems).filter((s) => s.enabled);
    if (enabled.length === 1) enabled[0].port = Number(env.PORT);
  }
}
