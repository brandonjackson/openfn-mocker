import type { FastifyInstance } from 'fastify';
import type { DataStore } from '../store.js';

/**
 * Per-system runtime configuration. `port` is always present; every other
 * key comes from the system's block in mock.config.yaml (e.g. `domain`,
 * `apiPath`, `account_sid`, `base_id`, `version`).
 */
export interface SystemConfig {
  port: number;
  seed?: string;
  [key: string]: any;
}

/**
 * A mock system plugin. Plugins are THIN: they declare identity + spec file,
 * register any custom / non-CRUD routes in `overrides`, and load seed data in
 * `seed`. The engine (route-registrar, response-generator, spec-parser) does
 * the heavy lifting; call those helpers from inside `overrides`.
 */
export interface MockSystemPlugin {
  /** Stable system key, e.g. 'dhis2' (matches the registry + config key). */
  name: string;
  /** Port used when config omits one. */
  defaultPort: number;
  /** Filename in specs/ (omit for spec-less catch-all systems like http-generic). */
  specFile?: string;
  /**
   * Register routes on the Fastify instance. `authPlugin`, admin routes and
   * request logging are already attached by createSystemServer before this
   * runs, so `request.mockAuth` is available in every handler.
   */
  overrides?(app: FastifyInstance, store: DataStore, config: SystemConfig): Promise<void> | void;
  /** Populate the store with seed data. Called at boot and on /_admin/reset|seed. */
  seed(store: DataStore, config: SystemConfig): void;
}
