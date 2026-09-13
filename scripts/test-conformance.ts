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
 *      traffic did and did not exercise.
 *
 * The specs are read from the installed `openfn-api-specs` dev dependency (a
 * fixed snapshot, so runs are deterministic and offline); `--latest` fetches
 * the current copy from jsDelivr instead. `http-generic` and any system whose
 * adaptor has no spec are reported as skipped.
 *
 * Exits non-zero on any violation (so it can gate a branch) unless `--json`.
 * It is NOT part of `pnpm test`: many specs were authored independently of the
 * mocks, so the first runs are a diagnostic, not a regression gate.
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
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

import { plugins } from '../src/systems/index.js';
import { guideExchanges, harnessConfig, type Exchange } from './lib/conformance.js';

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
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, json: false, verbose: false, strictAdditional: false, checkRequests: true, latest: false };
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
  violations: Violation[];
  coverage?: Coverage;
}

async function loadSpec(adaptor: string, latest: boolean): Promise<any | undefined> {
  return latest ? fetchOpenapi(adaptor) : getOpenapi(adaptor);
}

function printSystem(r: SystemResult, verbose: boolean): void {
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
    try {
      if (args.exchanges) {
        exchanges = parseExchangesJsonl(readFileSync(args.exchanges, 'utf8'));
      } else {
        exchanges = (await guideExchanges(plugin, harnessConfig(system))).exchanges;
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
    const violations = conformer.checkAll(exchanges);
    const r: SystemResult = { ...base, exchanges: exchanges.length, violations, coverage: conformer.coverage() };
    results.push(r);
    if (!args.json) printSystem(r, args.verbose);
  }

  const checked = results.filter((r) => r.status === 'checked');
  const errored = results.filter((r) => r.status === 'error').length;
  const totalViolations = checked.reduce((n, r) => n + r.violations.length, 0);
  const clean = checked.filter((r) => r.violations.length === 0).length;

  if (args.json) {
    console.log(JSON.stringify({ results, summary: { checked: checked.length, clean, violations: totalViolations, errors: errored } }, null, 2));
    return;
  }

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  ${'system'.padEnd(16)} ${'exch'.padStart(5)} ${'viol'.padStart(5)} ${'unmatched'.padStart(9)}  spec ops hit`);
  for (const r of results) {
    if (r.status !== 'checked') {
      const note = r.status === 'error' ? `ERROR (${(r.reason ?? '').split('\n')[0]})` : `skipped (${r.reason})`;
      console.log(`  ${r.system.padEnd(16)} ${'—'.padStart(5)} ${'—'.padStart(5)} ${'—'.padStart(9)}  ${note}`);
      continue;
    }
    const cov = r.coverage!;
    console.log(
      `  ${r.system.padEnd(16)} ${String(r.exchanges).padStart(5)} ${String(r.violations.length).padStart(5)} ${String(cov.unmatched.length).padStart(9)}  ${cov.hit.length}/${cov.hit.length + cov.missed.length}`
    );
  }
  const skipped = results.length - checked.length - errored;
  console.log(
    `\n  ${clean}/${checked.length} system(s) conform; ${totalViolations} violation(s) in total` +
      (errored ? `; ${errored} errored` : '') +
      (skipped ? `; ${skipped} skipped` : '')
  );
  console.log('═'.repeat(72));

  process.exit(totalViolations || errored ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
