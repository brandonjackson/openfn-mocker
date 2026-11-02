/**
 * Per-system conformance ledgers: `src/systems/<name>/conformance.json`.
 *
 * A ledger is two things in one file:
 *
 *   - a **snapshot** of the conformance yardstick for that system (every route
 *     the mock serves and its state against the adaptor's OpenAPI spec),
 *     written by `pnpm test:conformance -- --update-baseline` and checked in CI
 *     by `--check-baseline`, so it can never silently drift from reality;
 *   - the system's **accepted deviations**: places where the spec, not the
 *     mock, is wrong, each with a reason and evidence. Hand-written.
 *
 * The scorer lives in scripts/lib/yardstick.ts (it needs the dev-only
 * `openfn-api-specs` engine). This module only reads ledgers, so the running
 * server can render them (the /status page) with no spec dependency. The build
 * copies the JSON files next to the compiled plugins (scripts/copy-ledgers.mjs).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * conforming   a guide example hits it; every request and response passes the spec
 * deviating    hit; its only violations are accepted deviations, and its response was still schema-checked
 * unchecked    hit; nothing failed, but an accepted deviation means its response was never schema-checked
 *              (the spec has no such operation, documents no such status, or a different media type)
 * failing      hit; at least one violation not accepted
 * unexercised  no guide example reaches it
 *
 * Only conforming and deviating count as verified.
 */
export type RouteState = 'conforming' | 'deviating' | 'unchecked' | 'failing' | 'unexercised';

export const ROUTE_STATES: RouteState[] = ['conforming', 'deviating', 'unchecked', 'failing', 'unexercised'];

/** Violation kinds that, once accepted, leave the response body unvalidated. */
export const UNCHECKING_KINDS = ['unknown-operation', 'unknown-status', 'content-type', 'schema-error'];

export type DeviationCategory =
  /** The vendor's own spec disagrees with the real system (checked against the system's source or live traffic). */
  | 'vendor-spec-wrong'
  /** The spec is missing an endpoint or status the real system has; the fix belongs in openfn-api-specs. */
  | 'spec-gap'
  /** Mock and spec describe the same system through different APIs (XML-RPC vs REST, a FHIR facade, ...). */
  | 'modelling'
  /** A mock-only route with no real-world counterpart (e.g. a test helper). */
  | 'mock-only';

export interface Deviation {
  /** Mock route template, as the report prints it: 'GET /api/v2/assets/:uid/'. */
  route: string;
  /** Violation kind from the conformance engine ('response-schema', 'unknown-operation', ...). */
  kind: string;
  /** JSON pointer, array indices written as `*` (so one entry covers every row). Omit to accept every violation of `kind` on the route. */
  pointer?: string;
  /**
   * Substring the violation's message must contain ("must have required property 'errorCode'").
   * Required for a request- or response-schema deviation at the body root (no pointer, or '/'),
   * which would otherwise accept any future violation of the whole body.
   */
  message?: string;
  category: DeviationCategory;
  /** Why the spec, not the mock, is wrong. */
  reason: string;
  /** Where that was established: a source file URL, a captured exchange, an issue. */
  evidence: string;
}

/** Exchanges under `prefix` are checked against another adaptor's spec (e.g. an OpenMRS FHIR facade against `fhir`). */
export interface SpecMount {
  prefix: string;
  adaptor: string;
}

/**
 * Routes under `prefix` are the same endpoints as the routes under `canonical`
 * (openboxes serves `/products` and `/api/products`). An alias is not counted as
 * a separate route; traffic to it is scored against its canonical route.
 */
export interface RouteAlias {
  prefix: string;
  canonical: string;
}

export interface ConformanceLedger {
  /** Which spec the system was measured against, and how that spec was obtained. */
  spec?: { adaptor: string; origin?: string };
  /**
   * Snapshot: how much of the spec the guide traffic reached. `operations` is
   * every operation in the adaptor's openapi.json (the vendor's whole API, not
   * just what the mock serves); `exercised` is how many of them at least one
   * guide exchange matched. Spec mounts are not counted.
   */
  coverage?: SpecCoverage;
  /** Hand-written: other specs for parts of the system's surface. */
  specMounts?: SpecMount[];
  /** Hand-written: route prefixes that duplicate others. */
  routeAliases?: RouteAlias[];
  /** Snapshot: every route the mock serves, and its yardstick state. */
  routes: Record<string, RouteState>;
  /** Snapshot: for each failing route, its unaccepted violations ('kind /pointer: message'), deduplicated. */
  failures: Record<string, string[]>;
  /** Snapshot: guide requests no mock route served. */
  unrouted: string[];
  /** Hand-written: accepted deviations. */
  deviations: Deviation[];
}

export interface SpecCoverage {
  operations: number;
  exercised: number;
}

export const emptyLedger = (): ConformanceLedger => ({ routes: {}, failures: {}, unrouted: [], deviations: [] });

export const ledgerPath = (systemsDir: string, system: string): string => join(systemsDir, system, 'conformance.json');

/** Where the ledgers live relative to this module: src/systems under tsx, dist/systems once built. */
export const DEFAULT_SYSTEMS_DIR = fileURLToPath(new URL('./systems/', import.meta.url));

export function readLedger(system: string, systemsDir = DEFAULT_SYSTEMS_DIR): ConformanceLedger | undefined {
  const p = ledgerPath(systemsDir, system);
  if (!existsSync(p)) return undefined;
  const raw = JSON.parse(readFileSync(p, 'utf8')) as Partial<ConformanceLedger>;
  return { ...emptyLedger(), ...raw };
}

export const isVerified = (s: RouteState): boolean => s === 'conforming' || s === 'deviating';

export interface LedgerSummary {
  routes: number;
  verified: number;
  counts: Record<RouteState, number>;
  unrouted: number;
  /** Every route verified and nothing unrouted. */
  clean: boolean;
  /** Spec operations the guide traffic exercised, out of all operations in the spec. */
  coverage?: SpecCoverage;
}

export function summarizeLedger(l: ConformanceLedger): LedgerSummary {
  const counts: Record<RouteState, number> = { conforming: 0, deviating: 0, unchecked: 0, failing: 0, unexercised: 0 };
  for (const s of Object.values(l.routes)) counts[s]++;
  const routes = Object.keys(l.routes).length;
  const verified = counts.conforming + counts.deviating;
  return {
    routes,
    verified,
    counts,
    unrouted: l.unrouted.length,
    clean: routes > 0 && verified === routes && l.unrouted.length === 0,
    ...(l.coverage ? { coverage: l.coverage } : {}),
  };
}

/** One system's line in the repo-root `coverage.json`. */
export interface CoverageEntry {
  system: string;
  adaptor: string;
  /** Operations in the adaptor's openapi.json. */
  specOperations: number;
  /** Of those, how many the guide traffic exercised. */
  exercised: number;
  /** exercised / specOperations, as a percentage rounded to one decimal place. */
  percent: number;
  /** The yardstick: the mock's own routes and their states. */
  routes: number;
  verified: number;
  counts: Record<RouteState, number>;
}

export interface CoverageSummary {
  $comment: string;
  totals: { systems: number; specOperations: number; exercised: number; percent: number };
  systems: CoverageEntry[];
}

const percent = (n: number, d: number): number => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * The repo-root `coverage.json`: every ledger that records spec coverage,
 * flattened into one file other tools (adaptors-storybook) can fetch. A pure
 * function of the ledgers, so `--check-baseline` can re-derive it and fail on
 * drift, and an unchanged run rewrites it byte for byte.
 */
export function buildCoverageSummary(systemsDir = DEFAULT_SYSTEMS_DIR): CoverageSummary {
  const systems: CoverageEntry[] = [];
  for (const name of readdirSync(systemsDir).sort()) {
    const l = readLedger(name, systemsDir);
    if (!l?.coverage || !l.spec) continue;
    const s = summarizeLedger(l);
    systems.push({
      system: name,
      adaptor: l.spec.adaptor,
      specOperations: l.coverage.operations,
      exercised: l.coverage.exercised,
      percent: percent(l.coverage.exercised, l.coverage.operations),
      routes: s.routes,
      verified: s.verified,
      counts: s.counts,
    });
  }
  const specOperations = systems.reduce((n, s) => n + s.specOperations, 0);
  const exercised = systems.reduce((n, s) => n + s.exercised, 0);
  return {
    $comment:
      'Generated from src/systems/*/conformance.json by `pnpm test:conformance -- --update-baseline`; do not edit by hand. ' +
      'Mock coverage = spec operations the guide examples exercised / every operation in the adaptor\'s openapi.json.',
    totals: { systems: systems.length, specOperations, exercised, percent: percent(exercised, specOperations) },
    systems,
  };
}

export const coverageSummaryJson = (systemsDir = DEFAULT_SYSTEMS_DIR): string =>
  JSON.stringify(buildCoverageSummary(systemsDir), null, 2) + '\n';
