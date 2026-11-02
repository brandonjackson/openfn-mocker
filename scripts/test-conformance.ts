/**
 * Spec-conformance check: does what the mock *sends* match what the adaptor's
 * OpenAPI spec (in `openfn-api-specs`) says the real system sends?
 *
 * `pnpm test` asserts the mock against its own assumptions and `pnpm test:usage`
 * proves the real adaptor can *drive* it (paths, methods, signatures). Neither
 * looks at response *shape*. This script does: for each system it
 *
 *   1. boots the mock in-process and fires every example request from the
 *      system's sandbox guide (`guide.ts`) at it, capturing full request and
 *      response bodies (see scripts/lib/conformance.ts) — or reads exchanges
 *      previously captured to a JSON Lines file (`--exchanges`), e.g. real
 *      adaptor traffic recorded by `pnpm test:usage -- --capture=<dir>`;
 *   2. hands them to `createConformer` from `openfn-api-specs`, which matches
 *      each exchange to a spec operation (behind the spec's `servers[]` path
 *      prefixes if needed), picks the response schema for the status that came
 *      back, and validates the body;
 *   3. reports violations grouped by operation, plus which spec operations the
 *      traffic did and did not exercise;
 *   4. scores the **yardstick** (scripts/lib/yardstick.ts): of the routes the
 *      mock serves, how many are verified against the spec, after applying the
 *      system's accepted-deviations ledger (`src/systems/<name>/conformance.json`).
 *
 * The specs are read from the installed `openfn-api-specs` dev dependency (a
 * fixed snapshot, so runs are deterministic and offline); `--latest` fetches
 * the current copy from jsDelivr instead. `http-generic` and any system whose
 * adaptor has no spec are reported as skipped.
 *
 * Exit code: with `--check-baseline`, non-zero only when the yardstick moved
 * away from the committed baseline (a verified route regressed, a gain is not
 * yet recorded, or a deviation went stale); that is the CI gate. Otherwise
 * non-zero on any unaccepted violation, unless `--json`.
 *
 * Usage:
 *   pnpm test:conformance                          # every system with guide examples
 *   pnpm test:conformance -- --system dhis2,primero
 *   pnpm test:conformance -- --list                # what would run, and against which spec
 *   pnpm test:conformance -- --json                # machine-readable report on stdout
 *   pnpm test:conformance -- --verbose             # also list the spec operations never hit
 *   pnpm test:conformance -- --export=<dir>        # also write <dir>/<system>.jsonl exchange captures
 *   pnpm test:conformance -- --system dhis2 --exchanges=<file.jsonl>
 *                                                  # check a capture file instead of driving the guide
 *   pnpm test:conformance -- --strict-additional   # flag fields the spec does not list
 *   pnpm test:conformance -- --no-requests         # skip request-body checks
 *   pnpm test:conformance -- --latest              # specs from the jsDelivr mirror, not the snapshot
 *   pnpm test:conformance -- --check-baseline      # the CI gate: fail if the yardstick moved off the baseline
 *   pnpm test:conformance -- --update-baseline     # record the current verified routes (and spec coverage) as the
 *                                                  # baseline, and rebuild coverage.json from the ledgers
 *   pnpm test:conformance -- --routes              # also list every route with its yardstick state
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createConformer,
  fetchOpenapi,
  getOpenapi,
  getSource,
  groupViolations,
  parseExchangesJsonl,
  toExchangesJsonl,
  type Coverage,
  type Violation,
} from 'openfn-api-specs';

import { coverageSummaryJson } from '../src/conformance-ledger.js';
import { plugins } from '../src/systems/index.js';
import { guideExchanges, harnessConfig, type Exchange } from './lib/conformance.js';
import {
  diffBaseline,
  loadLedger,
  pct,
  saveLedger,
  scoreSystem,
  snapshotOf,
  type BaselineDiff,
  type SystemScore,
} from './lib/yardstick.js';

const SYSTEMS_DIR = fileURLToPath(new URL('../src/systems', import.meta.url));
const COVERAGE_PATH = fileURLToPath(new URL('../coverage.json', import.meta.url));

const adaptorFor = (system: string): string => plugins[system]?.adaptorName ?? system;

interface Args {
  systems?: string[];
  list: boolean;
  json: boolean;
  verbose: boolean;
  exportDir?: string;
  exchanges?: string;
  strictAdditional: boolean;
  checkRequests: boolean;
  latest: boolean;
  checkBaseline: boolean;
  updateBaseline: boolean;
  routes: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, json: false, verbose: false, strictAdditional: false, checkRequests: true, latest: false, checkBaseline: false, updateBaseline: false, routes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (flag: string): string => (a.includes('=') ? a.slice(a.indexOf('=') + 1) : argv[++i] ?? '') || fail(`${flag} needs a value`);
    if (a === '--') continue;
    else if (a === '--list') args.list = true;
    else if (a === '--json') args.json = true;
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--strict-additional') args.strictAdditional = true;
    else if (a === '--no-requests') args.checkRequests = false;
    else if (a === '--latest') args.latest = true;
    else if (a === '--check-baseline') args.checkBaseline = true;
    else if (a === '--update-baseline') args.updateBaseline = true;
    else if (a === '--routes') args.routes = true;
    else if (a === '--system' || a === '--systems' || a.startsWith('--system=') || a.startsWith('--systems=')) {
      args.systems = value('--system').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--export' || a.startsWith('--export=')) args.exportDir = value('--export');
    else if (a === '--exchanges' || a.startsWith('--exchanges=')) args.exchanges = value('--exchanges');
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

function fail(msg: string): never {
  throw new Error(msg);
}

interface SystemResult {
  system: string;
  adaptor: string;
  /** checked; skipped (no spec / no traffic); error (the mock threw while being driven) */
  status: 'checked' | 'skipped' | 'error';
  reason?: string;
  specOrigin?: string;
  exchanges: number;
  /** Violations not accepted by the system's deviations ledger. */
  violations: Violation[];
  coverage?: Coverage;
  /** The yardstick. Absent for --exchanges runs (no route list) and skipped systems. */
  score?: SystemScore;
  baseline?: BaselineDiff;
}

async function loadSpec(adaptor: string, latest: boolean): Promise<any | undefined> {
  return latest ? fetchOpenapi(adaptor) : getOpenapi(adaptor);
}

function printSystem(r: SystemResult, verbose: boolean, showRoutes = false): void {
  const head = `── ${r.system}  (spec: ${r.adaptor}${r.specOrigin ? `, ${r.specOrigin}` : ''}, ${r.exchanges} exchange(s))`;
  if (r.status === 'skipped') {
    console.log(`${head}\n   ↷ skipped: ${r.reason}`);
    return;
  }
  if (r.status === 'error') {
    console.log(`${head}\n   ‼ error while driving the mock: ${r.reason}`);
    return;
  }
  const cov = r.coverage!;
  const total = cov.hit.length + cov.missed.length;
  const mark = r.violations.length ? '✗' : '✓';
  console.log(`${head}\n   ${mark} ${r.violations.length} violation(s); ${cov.hit.length}/${total} spec operation(s) exercised; ${cov.unmatched.length} exchange(s) matched no operation`);
  if (r.score) {
    const c = r.score.counts;
    console.log(
      `   yardstick: ${c.verified}/${c.routes} route(s) verified (${pct(c.verified, c.routes)}): ` +
        `${c.conforming} conforming, ${c.deviating} deviating, ${c.unchecked} unchecked, ${c.failing} failing, ${c.unexercised} unexercised`
    );
    for (const u of r.score.unrouted) console.log(`     ! no mock route served ${u.exchange}`);
    for (const d of r.score.stale) console.log(`     ! stale deviation (matches nothing): ${d.route} [${d.kind}]${d.pointer ? ` ${d.pointer}` : ''}`);
    for (const { deviation: d, reason } of r.score.invalid) console.log(`     ! invalid deviation ${d.route} [${d.kind}]: ${reason}`);
    if (showRoutes) for (const rr of r.score.routes) console.log(`     ${rr.state.padEnd(11)} ${rr.route}`);
  }
  for (const [op, list] of groupViolations(r.violations)) {
    console.log(`     ${op}`);
    const byExchange = new Map<string, Violation[]>();
    for (const v of list) byExchange.set(v.exchange, [...(byExchange.get(v.exchange) ?? []), v]);
    for (const [ex, vs] of byExchange) {
      if (ex !== op) console.log(`       ${ex}`);
      for (const v of vs) {
        const where = v.pointer && v.pointer !== '/' ? ` ${v.pointer}` : '';
        console.log(`         [${v.kind}]${where}: ${v.message}`);
      }
    }
  }
  if (verbose && cov.missed.length) {
    console.log('     not exercised by the guide:');
    for (const m of cov.missed) console.log(`       ${m}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const discovered = Object.keys(plugins)
    .filter((name) => (plugins[name].guide?.examples.length ?? 0) > 0)
    .sort();
  let targets = args.systems ? args.systems : discovered;
  if (args.systems) {
    const unknown = args.systems.filter((s) => !plugins[s]);
    if (unknown.length) throw new Error(`Unknown system(s): ${unknown.join(', ')}`);
  }
  if (args.exchanges) {
    if (!args.systems || args.systems.length !== 1) throw new Error('--exchanges needs exactly one --system');
    targets = args.systems;
  }

  if (args.list) {
    for (const system of targets) {
      const adaptor = adaptorFor(system);
      const spec = await loadSpec(adaptor, args.latest);
      const n = plugins[system].guide?.examples.length ?? 0;
      const origin = getSource(adaptor)?.origin;
      console.log(`${system.padEnd(16)} ${n.toString().padStart(3)} example(s)  spec: ${spec ? `${adaptor} (${origin ?? '?'}, ${Object.keys(spec.paths ?? {}).length} path(s))` : 'none'}`);
    }
    return;
  }

  const results: SystemResult[] = [];
  for (const system of targets) {
    const plugin = plugins[system];
    const adaptor = adaptorFor(system);
    const spec = await loadSpec(adaptor, args.latest);
    const base: SystemResult = { system, adaptor, status: 'checked', exchanges: 0, violations: [], specOrigin: getSource(adaptor)?.origin };

    if (!spec) {
      results.push({ ...base, status: 'skipped', reason: `no openapi.json for adaptor '${adaptor}' in openfn-api-specs` });
      if (!args.json) printSystem(results[results.length - 1], args.verbose);
      continue;
    }

    let exchanges: Exchange[];
    let routes: string[] | undefined;
    let routeOf: (string | undefined)[] = [];
    try {
      if (args.exchanges) {
        exchanges = parseExchangesJsonl(readFileSync(args.exchanges, 'utf8'));
      } else {
        const run = await guideExchanges(plugin, harnessConfig(system));
        ({ exchanges, routes, routeOf } = run);
      }
    } catch (err) {
      // A mock that throws while its own guide examples run is a finding in its
      // own right (and a bug in the plugin, not the spec): report it and move on.
      const e = err instanceof Error ? err : new Error(String(err));
      results.push({ ...base, status: 'error', reason: args.verbose ? e.stack ?? e.message : e.message });
      if (!args.json) printSystem(results[results.length - 1], args.verbose);
      continue;
    }
    if (args.exportDir) {
      mkdirSync(args.exportDir, { recursive: true });
      writeFileSync(join(args.exportDir, `${system}.jsonl`), toExchangesJsonl(exchanges));
    }
    if (!exchanges.length) {
      results.push({ ...base, status: 'skipped', reason: 'no exchanges to check' });
      if (!args.json) printSystem(results[results.length - 1], args.verbose);
      continue;
    }

    const conformer = createConformer(spec, {
      strictAdditional: args.strictAdditional,
      checkRequests: args.checkRequests,
    });
    // Spec mounts: parts of the surface measured against another adaptor's spec
    // (an OpenMRS FHIR facade against `fhir`), declared in the system's ledger.
    const ledger = loadLedger(SYSTEMS_DIR, system);
    const mounts: { prefix: string; conformer: ReturnType<typeof createConformer> }[] = [];
    for (const m of ledger.specMounts ?? []) {
      const mountSpec = await loadSpec(m.adaptor, args.latest);
      if (!mountSpec) throw new Error(`${system}: specMounts names '${m.adaptor}', which has no openapi.json in openfn-api-specs`);
      mounts.push({
        prefix: m.prefix,
        conformer: createConformer(mountSpec, { strictAdditional: args.strictAdditional, checkRequests: args.checkRequests, serverPrefixes: [m.prefix] }),
      });
    }
    const conformerFor = (ex: Exchange) =>
      mounts.find((m) => ex.path === m.prefix || ex.path.startsWith(m.prefix + '/') || ex.path.startsWith(m.prefix + '?'))?.conformer ?? conformer;
    const violationsOf = exchanges.map((ex) => conformerFor(ex).check(ex));
    let violations = violationsOf.flat();
    let score: SystemScore | undefined;
    let baseline: BaselineDiff | undefined;
    if (routes) {
      const specRef = { adaptor, ...(base.specOrigin ? { origin: base.specOrigin } : {}) };
      score = scoreSystem({ system, routes, exchanges, routeOf, violationsOf, deviations: ledger.deviations, routeAliases: ledger.routeAliases });
      violations = [...score.routes.flatMap((rr) => rr.violations), ...score.unrouted.flatMap((u) => u.violations)];
      const cov = conformer.coverage();
      const specCoverage = { operations: cov.hit.length + cov.missed.length, exercised: cov.hit.length };
      baseline = diffBaseline(score, ledger, specRef, specCoverage);
      if (args.updateBaseline) {
        saveLedger(SYSTEMS_DIR, system, {
          ...snapshotOf(score, specRef, specCoverage),
          specMounts: ledger.specMounts,
          routeAliases: ledger.routeAliases,
          deviations: ledger.deviations,
        });
      }
    }
    const r: SystemResult = { ...base, exchanges: exchanges.length, violations, coverage: conformer.coverage(), score, baseline };
    results.push(r);
    if (!args.json) printSystem(r, args.verbose, args.routes);
  }

  const checked = results.filter((r) => r.status === 'checked');
  const errored = results.filter((r) => r.status === 'error').length;
  const totalViolations = checked.reduce((n, r) => n + r.violations.length, 0);
  const clean = checked.filter((r) => r.violations.length === 0).length;

  const scored = checked.filter((r) => r.score).map((r) => r.score!);
  const yardstick = {
    routes: scored.reduce((n, s) => n + s.counts.routes, 0),
    verified: scored.reduce((n, s) => n + s.counts.verified, 0),
    conforming: scored.reduce((n, s) => n + s.counts.conforming, 0),
    deviating: scored.reduce((n, s) => n + s.counts.deviating, 0),
    failing: scored.reduce((n, s) => n + s.counts.failing, 0),
    unexercised: scored.reduce((n, s) => n + s.counts.unexercised, 0),
    unchecked: scored.reduce((n, s) => n + s.counts.unchecked, 0),
    systems: scored.length,
    systemsClean: scored.filter((s) => s.clean).length,
  };
  const regressions = checked.filter((r) => r.baseline?.regressed.length);
  const unrecorded = checked.filter((r) => r.baseline && (r.baseline.gained.length || r.baseline.stale));
  const stale = scored.filter((s) => s.stale.length);
  const invalid = scored.filter((s) => s.invalid.length);

  if (args.json) {
    console.log(
      JSON.stringify(
        { results, summary: { checked: checked.length, clean, violations: totalViolations, errors: errored, yardstick } },
        null,
        2
      )
    );
    return;
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${'system'.padEnd(16)} ${'exch'.padStart(5)} ${'viol'.padStart(5)} ${'unmatched'.padStart(9)}  ${'spec ops hit'.padEnd(12)}  verified routes`);
  for (const r of results) {
    if (r.status !== 'checked') {
      const note = r.status === 'error' ? `ERROR (${(r.reason ?? '').split('\n')[0]})` : `skipped (${r.reason})`;
      console.log(`  ${r.system.padEnd(16)} ${'—'.padStart(5)} ${'—'.padStart(5)} ${'—'.padStart(9)}  ${note}`);
      continue;
    }
    const cov = r.coverage!;
    console.log(
      `  ${r.system.padEnd(16)} ${String(r.exchanges).padStart(5)} ${String(r.violations.length).padStart(5)} ${String(cov.unmatched.length).padStart(9)}  ${`${cov.hit.length}/${cov.hit.length + cov.missed.length}`.padEnd(12)}  ` +
        (r.score ? `${r.score.counts.verified}/${r.score.counts.routes}${r.score.clean ? '' : ' ✗'}` : '—')
    );
  }
  const skipped = results.length - checked.length - errored;
  console.log(
    `\n  ${clean}/${checked.length} system(s) conform; ${totalViolations} violation(s) in total` +
      (errored ? `; ${errored} errored` : '') +
      (skipped ? `; ${skipped} skipped` : '')
  );
  if (scored.length) {
    console.log(
      `\n  YARDSTICK: ${yardstick.verified}/${yardstick.routes} mock routes verified against the spec (${pct(yardstick.verified, yardstick.routes)})\n` +
        `             ${yardstick.conforming} conforming; ${yardstick.deviating} deviating (accepted); ${yardstick.unchecked} unchecked; ${yardstick.failing} failing; ${yardstick.unexercised} unexercised\n` +
        `             ${yardstick.systemsClean}/${yardstick.systems} system(s) fully verified`
    );
  }
  console.log('═'.repeat(72));

  // coverage.json is derived from every ledger on disk, so a --system run
  // still rewrites (or checks) the whole file consistently.
  let coverageDrift = false;
  if (args.updateBaseline) {
    console.log(`\nLedger snapshots updated for ${scored.length} system(s) (src/systems/<name>/conformance.json).`);
    if (!args.exchanges) {
      writeFileSync(COVERAGE_PATH, coverageSummaryJson(SYSTEMS_DIR));
      console.log('coverage.json rebuilt from the ledgers.');
    }
  } else if (args.checkBaseline && !args.exchanges) {
    const current = existsSync(COVERAGE_PATH) ? readFileSync(COVERAGE_PATH, 'utf8') : '';
    coverageDrift = current !== coverageSummaryJson(SYSTEMS_DIR);
    if (coverageDrift) console.log('\n✗ coverage.json is out of date with the ledgers; run pnpm test:conformance -- --update-baseline');
  }
  if (args.checkBaseline || args.updateBaseline) {
    for (const r of regressions) console.log(`\n✗ ${r.system}: ${r.baseline!.regressed.length} verified route(s) regressed:\n    ${r.baseline!.regressed.join('\n    ')}`);
    for (const s of stale) console.log(`\n✗ ${s.system}: ${s.stale.length} stale deviation(s); delete them from src/systems/${s.system}/conformance.json`);
    for (const s of invalid) console.log(`\n✗ ${s.system}: ${s.invalid.length} deviation(s) too broad to accept; add a \`message\` (see AGENTS.md)`);
    if (!args.updateBaseline) {
      for (const r of unrecorded) {
        const gained = r.baseline!.gained.length;
        console.log(
          `\n✗ ${r.system}: ledger snapshot is out of date` +
            (gained ? ` (${gained} newly verified route(s) to lock in)` : '') +
            `; run pnpm test:conformance -- --system ${r.system} --update-baseline`
        );
      }
    }
    const failed = coverageDrift || regressions.length > 0 || stale.length > 0 || invalid.length > 0 || errored > 0 || (!args.updateBaseline && unrecorded.length > 0);
    if (!failed) console.log('\n✓ yardstick matches the baseline');
    process.exit(failed ? 1 : 0);
  }

  process.exit(totalViolations || errored ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
