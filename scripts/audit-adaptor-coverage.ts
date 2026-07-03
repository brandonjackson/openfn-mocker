/**
 * Adaptor-function coverage audit.
 *
 * Answers one question, mechanically and repeatably: does every function an
 * OpenFn adaptor exposes have a corresponding usage example in this mock?
 *
 * It derives the authoritative function surface straight from the PUBLISHED
 * adaptor on npm (via the jsDelivr CDN), so the check tracks the real adaptors
 * rather than a hand-maintained list — re-run it whenever an adaptor is
 * released and it will surface any newly-added function that lacks a mock
 * example. For each system with a live plugin it:
 *
 *   1. resolves the system key to its `@openfn/language-<name>` package (the
 *      same mapping `test:usage` uses; only exceptions are listed below);
 *   2. fetches `ast.json` (the doc generator's list of public `operations`) and
 *      the TypeScript `types/*.d.ts` for the API-calling namespaces (`http`,
 *      `fhir`, `tracker`) it re-exports — the pure helper namespaces (`util`)
 *      and the `@openfn/language-common` re-exports (fn, each, field, merge, …)
 *      are intentionally excluded, since those transform data and never call the
 *      API, so they need no mock endpoint; and
 *   3. compares that surface against the `fn` names declared in the system's
 *      `usage.ts` (read from the plugin's `usage`, the same source the sandbox
 *      and `test:usage` read), normalising parenthetical labels like
 *      `getSubmissions (filtered)` down to the bare function name.
 *
 * A system is "complete" when every API-calling function has at least one usage
 * example. The process exits non-zero if any system has a gap (so it can gate
 * CI), unless `--json` is passed (machine-readable report, always exits 0).
 *
 * Network-gated (reaches the CDN). If a package can't be fetched the system is
 * reported as `skipped` rather than failing the run, so an offline invocation
 * degrades gracefully instead of blocking.
 *
 * Usage:
 *   pnpm audit:adaptors                 # audit every system, human-readable
 *   pnpm audit:adaptors -- --system dhis2,primero   # just these
 *   pnpm audit:adaptors -- --json       # machine-readable report on stdout
 *   pnpm audit:adaptors -- --all        # also list the excluded util/common fns
 */
import { plugins } from '../src/systems/index.js';

/* System key -> npm adaptor short name. Mirrors ADAPTOR_NAMES in
 * scripts/test-usage-examples.ts; almost every key matches 1:1. */
const ADAPTOR_NAMES: Record<string, string> = {
  'http-generic': 'http',
};
const adaptorFor = (system: string): string => ADAPTOR_NAMES[system] ?? system;

/* Namespaces re-exported by an adaptor that make API calls (and so need mock
 * endpoints + examples). Everything else a namespace might hold — `util` and
 * friends — is pure data-shaping and deliberately out of scope. */
const API_NAMESPACES = ['http', 'fhir', 'tracker'];

const CDN = 'https://cdn.jsdelivr.net/npm';

interface Args {
  systems?: string[];
  json: boolean;
  all: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    else if (a === '--json') args.json = true;
    else if (a === '--all') args.all = true;
    else if (a === '--system' || a === '--systems') {
      args.systems = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

/** Public `operations` from an adaptor's ast.json. */
async function fetchOperations(adaptor: string): Promise<string[] | undefined> {
  const txt = await fetchText(`${CDN}/@openfn/language-${adaptor}/ast.json`);
  if (txt === undefined) return undefined;
  try {
    const ast = JSON.parse(txt) as { operations?: Array<{ name: string }> };
    return (ast.operations ?? []).map((o) => o.name).filter(Boolean);
  } catch {
    return undefined;
  }
}

/** `export * as <ns> from './<file>.js'` re-exports declared in index.d.ts. */
function parseNamespaceReexports(indexDts: string): Array<{ ns: string; file: string }> {
  const out: Array<{ ns: string; file: string }> = [];
  const re = /export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+['"]\.\/([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexDts))) out.push({ ns: m[1], file: m[2].replace(/\.js$/, '') });
  return out;
}

/** `export function <name>(` declarations in a namespace's .d.ts. */
function parseExportedFunctions(dts: string): string[] {
  const out = new Set<string>();
  const re = /export\s+(?:declare\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dts))) out.add(m[1]);
  return [...out];
}

/** The full API-calling surface: public operations + API-namespace members. */
async function fetchSurface(
  adaptor: string
): Promise<{ ops: string[]; nsFns: string[] } | undefined> {
  const ops = await fetchOperations(adaptor);
  if (ops === undefined) return undefined;
  const indexDts = await fetchText(`${CDN}/@openfn/language-${adaptor}/types/index.d.ts`);
  const nsFns: string[] = [];
  if (indexDts) {
    const namespaces = parseNamespaceReexports(indexDts).filter((n) => API_NAMESPACES.includes(n.ns));
    await Promise.all(
      namespaces.map(async ({ ns, file }) => {
        const dts = await fetchText(`${CDN}/@openfn/language-${adaptor}/types/${file}.d.ts`);
        if (dts) for (const fn of parseExportedFunctions(dts)) nsFns.push(`${ns}.${fn}`);
      })
    );
  }
  return { ops, nsFns };
}

/** Bare fn names declared in a system's usage.ts (labels like " (filtered)" stripped). */
function coveredFns(system: string): string[] {
  const usage = plugins[system]?.usage ?? [];
  return usage.map((u) => u.fn.replace(/\s*\(.*$/, '').trim());
}

interface SystemReport {
  system: string;
  adaptor: string;
  status: 'complete' | 'gaps' | 'skipped';
  surface: string[];
  covered: string[];
  missing: string[];
  detail?: string;
}

async function auditSystem(system: string): Promise<SystemReport> {
  const adaptor = adaptorFor(system);
  const surface = await fetchSurface(adaptor);
  const covered = coveredFns(system);
  if (surface === undefined) {
    return { system, adaptor, status: 'skipped', surface: [], covered, missing: [], detail: 'could not fetch adaptor metadata' };
  }
  const all = [...surface.ops, ...surface.nsFns];
  const missing = all.filter((fn) => !covered.includes(fn));
  return {
    system,
    adaptor,
    status: missing.length ? 'gaps' : 'complete',
    surface: all,
    covered,
    missing,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const all = Object.keys(plugins).sort();
  const targets = args.systems ? all.filter((s) => args.systems!.includes(s)) : all;

  const reports = await Promise.all(targets.map(auditSystem));

  if (args.json) {
    console.log(JSON.stringify(reports, null, 2));
    return;
  }

  const mark = { complete: '✓', gaps: '✗', skipped: '–' } as const;
  for (const r of reports) {
    const head = `${mark[r.status]} ${r.system.padEnd(14)} (${r.adaptor}) — ${r.surface.length} API fn(s), ${r.covered.length} example(s)`;
    console.log(head);
    if (r.status === 'gaps') console.log(`    missing: ${r.missing.join(', ')}`);
    if (r.status === 'skipped') console.log(`    skipped: ${r.detail}`);
    if (args.all && r.surface.length) console.log(`    surface: ${r.surface.join(', ')}`);
  }

  const gaps = reports.filter((r) => r.status === 'gaps');
  const skipped = reports.filter((r) => r.status === 'skipped');
  const complete = reports.filter((r) => r.status === 'complete');
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${complete.length} complete, ${gaps.length} with gaps, ${skipped.length} skipped`);
  if (gaps.length) {
    console.log('  Gaps:');
    for (const r of gaps) console.log(`    ✗ ${r.system}: ${r.missing.join(', ')}`);
  }
  console.log('═'.repeat(60));

  process.exit(gaps.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
