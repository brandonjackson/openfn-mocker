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

/** A single runnable example request shown under a system (the sandbox "API" tab). */
export interface SandboxExample {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to the system mount, e.g. '/api/organisationUnits'. */
  path: string;
  /** One-line description of what the request demonstrates. */
  label: string;
  /** Optional request body, sent verbatim (already formatted). */
  body?: string;
  /** Content-Type for the body (default application/json). */
  contentType?: string;
  /**
   * Stable id, unique within the system. Lets a `usage` example link to the
   * API request its adaptor function calls (the "Run the request" cross-link on
   * the Usage tab). Optional — omit for examples nothing links to.
   */
  id?: string;
}

/**
 * Demo content for one system: the prose and runnable examples shown on its
 * sandbox page. Authored in a co-located `guide.ts` (like `seed` and `usage`)
 * and imported onto the plugin (see `MockSystemPlugin.guide`). The *credential*
 * is NOT here — it is declared on the system's plugin (`MockSystemPlugin.credential`)
 * and read straight from there, so the plugin stays the single source of truth
 * for its auth.
 */
export interface SystemGuide {
  /** Human-friendly title. */
  title: string;
  /** One or two sentences: what the system is + notable quirks. */
  blurb: string;
  /** Auth style, shown on the card (e.g. 'Basic', 'Bearer', 'none'). */
  auth: string;
  /** Link to this system's OpenFn adaptor documentation. */
  docs?: string;
  /**
   * Defaults for `{{token}}` placeholders used in paths/bodies (e.g.
   * `{{domain}}`). Overridden by the matching key in the system's live config.
   */
  vars?: Record<string, string>;
  /** Runnable example requests (the "API" tab). */
  examples: SandboxExample[];
}

/**
 * One adaptor *function*, shown on a system's sandbox "Usage" tab: the OpenFn
 * job code a user writes to call it, plus a link to the underlying API request
 * it fires (the matching `SandboxExample.id` on the guide). This is what turns
 * the sandbox from "here are the endpoints" into "here is how each adaptor
 * function maps onto them". Declared per adaptor on its plugin (see
 * `MockSystemPlugin.usage`), the same way the spec and credential are — so the
 * plugin stays the single source of truth for everything about the adaptor, and
 * `pnpm test:usage` can drive these snippets end to end through the real adaptor.
 */
export interface UsageExample {
  /** Adaptor function name, e.g. 'getGroup'. */
  fn: string;
  /** Full call signature, e.g. 'getGroup(sppId, callback?)'. */
  signature: string;
  /** One line: what the function does. */
  description: string;
  /** Example OpenFn job code (a short, self-contained snippet). */
  code: string;
  /** id of the SandboxExample this function exercises, for the API cross-link. */
  apiRef?: string;
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
  /**
   * npm adaptor short name, when it differs from `name` (the CLI expands it to
   * `@openfn/language-<adaptorName>`). Omit when they match — almost always.
   * Read by `pnpm test:usage` and `pnpm audit:adaptors`, so the mapping lives
   * on the plugin instead of being duplicated across scripts.
   */
  adaptorName?: string;
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
   * Per-adaptor-function usage examples for the sandbox "Usage" tab: the OpenFn
   * job code for each function this adaptor exposes and a link to the API
   * request it calls. Authored in a co-located `usage.ts` (like `seed`) and
   * imported here, so the plugin stays thin while fully describing its adaptor;
   * the sandbox renders these and `pnpm test:usage` runs each snippet against
   * the mock. Omit while a system's usage examples have not been authored yet —
   * the Usage tab then shows a "coming soon" placeholder that links to the docs.
   */
  usage?: UsageExample[];
  /**
   * Demo content for the sandbox page: the system's blurb and the runnable
   * example requests shown on its "API" tab. Authored in a co-located `guide.ts`
   * (like `seed` and `usage`) and imported here, so the plugin fully describes
   * everything the sandbox renders for the system while staying thin. Omit for a
   * system with no authored guide — the sandbox then falls back to a bare card.
   */
  guide?: SystemGuide;
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
