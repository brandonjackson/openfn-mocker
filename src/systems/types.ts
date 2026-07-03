import type { FastifyInstance } from 'fastify';
import type { DataStore } from '../store.js';
import type { AuthRequirement, CredentialSpec } from '../auth.js';

/**
 * Per-system runtime configuration. `port` is the single shared listen port
 * (copied onto every system by loadConfig) so plugins can build self-referential
 * URLs; every other key comes from the system's block in mock.config.yaml
 * (e.g. `domain`, `apiPath`, `account_sid`, `version`).
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
  /** Filename in specs/ (omit for spec-less catch-all systems like http-generic). */
  specFile?: string;
  /**
   * How this system treats authentication. Enforced automatically by
   * registerSystem (via `enforceAuth`) before any route runs. Omit — or set
   * `{ required: false }` — for systems that accept unauthenticated requests
   * (e.g. generic http, or FHIR where auth is optional). Set
   * `{ required: true, schemes: [...] }` for systems that must reject requests
   * with no credentials; the mock still never validates the credential's value.
   */
  auth?: AuthRequirement;
  /**
   * The OpenFn credential a user pastes into OpenFn to reach this system: its
   * field names (matching the adaptor's configuration-schema.json), which fields
   * are secrets, and how to shape a generated suggestion for each. The browser
   * sandbox reads this to visualise the credential, label it (username/password
   * vs API key vs OAuth), and generate ready-to-paste suggestions. Omit for a
   * system with no meaningful credential.
   */
  credential?: CredentialSpec;
  /**
   * Register routes on the Fastify instance. `authPlugin`, admin routes and
   * request logging are already attached by registerSystem before this runs, so
   * `request.mockAuth` is available in every handler. When the system is mounted
   * at a prefix (e.g. /dhis2), routes registered here are prefixed automatically.
   */
  overrides?(app: FastifyInstance, store: DataStore, config: SystemConfig): Promise<void> | void;
  /** Populate the store with seed data. Called at boot and on /_admin/reset|seed. */
  seed(store: DataStore, config: SystemConfig): void;
}
