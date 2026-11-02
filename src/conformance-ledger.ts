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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export type RouteState = 'conforming' | 'deviating' | 'failing' | 'unexercised';

export const ROUTE_STATES: RouteState[] = ['conforming', 'deviating', 'failing', 'unexercised'];

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
  category: DeviationCategory;
  /** Why the spec, not the mock, is wrong. */
  reason: string;
  /** Where that was established: a source file URL, a captured exchange, an issue. */
  evidence: string;
}

export interface ConformanceLedger {
  /** Which spec the system was measured against, and how that spec was obtained. */
  spec?: { adaptor: string; origin?: string };
  /** Snapshot: every route the mock serves, and its yardstick state. */
  routes: Record<string, RouteState>;
  /** Snapshot: for each failing route, its unaccepted violations ('kind /pointer: message'), deduplicated. */
  failures: Record<string, string[]>;
  /** Snapshot: guide requests no mock route served. */
  unrouted: string[];
  /** Hand-written: accepted deviations. */
  deviations: Deviation[];
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
}

export function summarizeLedger(l: ConformanceLedger): LedgerSummary {
  const counts: Record<RouteState, number> = { conforming: 0, deviating: 0, failing: 0, unexercised: 0 };
  for (const s of Object.values(l.routes)) counts[s]++;
  const routes = Object.keys(l.routes).length;
  const verified = counts.conforming + counts.deviating;
  return { routes, verified, counts, unrouted: l.unrouted.length, clean: routes > 0 && verified === routes && l.unrouted.length === 0 };
}
