/**
 * Exchange capture for spec-conformance checks.
 *
 * The conformance engine lives in `openfn-api-specs` (`createConformer`) and
 * is transport-agnostic: it takes recorded request/response pairs
 * (`Exchange`) and returns violations against the adaptor's OpenAPI spec.
 * This module is the mock's side of that contract — it *produces* exchanges:
 *
 *   - `attachExchangeCapture(app)` records every non-admin response a Fastify
 *     instance sends (full bodies, not the request log's truncated summaries).
 *     Works for in-process `inject` traffic and for a listening server driven
 *     by the real adaptor (`pnpm test:usage -- --capture=<dir>`).
 *   - `guideExchanges(plugin)` boots one system in-process and fires every
 *     example request from its sandbox guide (`guide.ts`) through the mock,
 *     returning the captured exchanges. No network, no CLI, deterministic.
 *
 * Nothing here imports the engine at runtime; the `Exchange` type is the only
 * coupling, so this file also serves `pnpm test` without touching api-specs.
 */
import type { FastifyInstance } from 'fastify';
import type { Exchange } from 'openfn-api-specs';

import { createSystemServer } from '../../src/server.js';
import { loadConfig } from '../../src/config.js';
import { interpolate, systemVars } from '../../src/credentials.js';
import type { MockSystemPlugin, SandboxExample, SystemConfig } from '../../src/systems/types.js';

export type { Exchange };

const isJsonMedia = (ct: string): boolean => {
  const mt = ct.split(';')[0].trim().toLowerCase();
  return mt === 'application/json' || mt.endsWith('+json') || mt === 'text/json';
};

/**
 * Record every response the instance sends as an `Exchange` (full request and
 * response bodies). Must be called before the app is ready (i.e. right after
 * `createSystemServer`, before `listen`/`inject`). The mock's own `/_admin`
 * API is skipped: it is not part of the impersonated system's surface.
 */
export function attachExchangeCapture(app: FastifyInstance): { exchanges: Exchange[] } {
  const exchanges: Exchange[] = [];
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url;
    const pathOnly = path.split(/[?#]/)[0];
    if (pathOnly === '/_admin' || pathOnly.startsWith('/_admin/') || pathOnly.includes('/_admin/')) return payload;

    const ex: Exchange = { method: request.method, path, status: reply.statusCode };
    const ct = reply.getHeader('content-type');
    if (ct !== undefined) ex.contentType = String(ct);

    // Request body: Fastify's lenient parser turns an empty body into {}, which
    // for a GET/DELETE is noise, so only keep bodies on methods that carry one.
    if (request.body !== undefined && !['GET', 'HEAD', 'DELETE', 'OPTIONS'].includes(request.method)) {
      ex.requestBody = request.body;
    }

    const text =
      typeof payload === 'string' ? payload : Buffer.isBuffer(payload) ? payload.toString('utf8') : undefined;
    if (text !== undefined && text !== '') {
      if (ex.contentType === undefined || isJsonMedia(ex.contentType)) {
        try {
          ex.responseBody = JSON.parse(text);
        } catch {
          ex.responseBody = text;
        }
      } else {
        ex.responseBody = text;
      }
    }
    exchanges.push(ex);
    return payload;
  });
  return { exchanges };
}

/**
 * The config a single-system harness boots a plugin with: the system's block
 * from mock.config.yaml (so `domain`, `apiPath`, ... match the shipped setup)
 * with the fault-injection knobs removed — an injected 500 or 429 would be a
 * violation of the mock's own making, not the spec's.
 */
export function harnessConfig(system: string): SystemConfig {
  let fromFile: Record<string, unknown> | undefined;
  try {
    fromFile = loadConfig().systems[system] as Record<string, unknown> | undefined;
  } catch {
    fromFile = undefined;
  }
  const config: SystemConfig = { ...(fromFile ?? {}), port: 0 };
  delete config.error_rate;
  delete config.error_status;
  delete config.rate_limit;
  delete config.latency;
  return config;
}

/** Resolve a guide's examples the way the sandbox does (`{{token}}` interpolation). */
export function resolveGuideExamples(plugin: MockSystemPlugin, config: SystemConfig): SandboxExample[] {
  const vars = { ...systemVars(plugin.guide, config), ORIGIN: 'http://localhost', HOST: 'localhost' };
  return (plugin.guide?.examples ?? []).map(
    (ex) => JSON.parse(interpolate(JSON.stringify(ex), vars)) as SandboxExample
  );
}

/**
 * Boot `plugin` in-process (mounted at the root, default credential attached)
 * and fire every guide example at it in authored order, so stateful sequences
 * (create, then read back) behave as they do on the sandbox page. Returns the
 * captured exchanges — one per example, plus any the mock issues internally.
 */
export async function guideExchanges(
  plugin: MockSystemPlugin,
  config: SystemConfig = harnessConfig(plugin.name)
): Promise<{ exchanges: Exchange[]; examples: SandboxExample[] }> {
  const examples = resolveGuideExamples(plugin, config);
  const { app } = await createSystemServer(plugin, config, { logLevel: 'silent' });
  const capture = attachExchangeCapture(app);
  try {
    for (const ex of examples) {
      const headers: Record<string, string> = {};
      if (ex.body !== undefined) headers['content-type'] = ex.contentType ?? 'application/json';
      // An empty path means the system root (e.g. a FHIR transaction Bundle POSTed to the base).
      await app.inject({ method: ex.method, url: ex.path || '/', payload: ex.body, headers });
    }
  } finally {
    await app.close();
  }
  return { exchanges: capture.exchanges, examples };
}
