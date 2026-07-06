/**
 * End-to-end test for the sandbox "Usage" examples.
 *
 * Every system's Usage tab (see `MockSystemPlugin.usage`, authored per adaptor
 * next to its seed data) ships a set of adaptor-function snippets — the exact
 * OpenFn job code a user would write, e.g. `getIndividual('IND_AMINA001')`. This
 * script proves those snippets actually run: for each system that has usage
 * examples, it
 *
 *   1. boots a single-system mock mounted at the server ROOT on an ephemeral
 *      port (via `createSystemServer` + a real `listen`), so an adaptor that
 *      ignores the URL path — like openspp's odoo-await, which builds its
 *      XML-RPC client from host+port and hardcodes `/xmlrpc/2/...` — still
 *      reaches the mock (the `/<system>` mount prefix would otherwise be lost);
 *   2. resolves the OpenFn credential the sandbox would hand out (from the
 *      plugin's `credential` spec — the single source of truth) into a concrete
 *      `state.configuration`, with its URL field pointed at the mock origin;
 *   3. writes each usage snippet to a job file, runs it through the real OpenFn
 *      CLI (`openfn <job> -a <adaptor> -s <state> -o <out>`), which
 *      auto-installs the real published adaptor from npm; and
 *   4. verifies the run succeeded — a non-zero/killed exit, a thrown/compile
 *      error, a CLI-reported error marker, or a non-empty `state.errors` in the
 *      output state all count as a failure (the CLI exits 0 even when a job
 *      aborts, so the output state is the reliable signal). Each example has a
 *      short hard timeout so a doomed run fails fast instead of hanging.
 *
 * The mock is reset to pristine seed between examples so each snippet runs
 * independently and the suite is deterministic on re-run.
 *
 * The set of systems under test is discovered automatically, so any system that
 * gains a `usage` block is covered without touching this file. Adaptors that
 * can't yet be driven end to end against the mock (the gaps tracked in the
 * README's Roadmap — Twilio/Mailgun ignore the base URL, OAuth systems need a
 * token handshake) will surface here as failures, which is the point: this is
 * the empirical check behind that Roadmap.
 *
 * Run with `pnpm test:usage` (see package.json). Requires network access (to
 * install the CLI's adaptors from npm) and the `openfn` CLI on PATH, or set
 * $OPENFN_CLI / pass --cli. It is intentionally NOT part of `pnpm test`: it
 * spawns real subprocesses and hits npm, which is too heavy and network-bound
 * for the unit suite.
 *
 * Before the timed loop it warms the adaptor cache (see `warmUp`): a one-time
 * download of the CLI and every target adaptor, moved out of the per-example
 * timeout so that cap only ever measures a job's execution, never a cold npm
 * install. Skip it with `--no-warmup` if the cache is already warm.
 *
 * Usage:
 *   pnpm test:usage                     # every system with usage examples
 *   pnpm test:usage -- --system openspp # one system (comma-separated for more)
 *   pnpm test:usage -- --list           # list discovered examples, run nothing
 *   pnpm test:usage -- --keep           # keep the temp job/state/log files
 *   pnpm test:usage -- --no-warmup      # skip the adaptor-cache warm-up
 *   pnpm test:usage -- --cli "npx -y @openfn/cli"   # override the CLI command
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createSystemServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';
import { plugins } from '../src/systems/index.js';
import { resolveCredentialValues, systemVars } from '../src/credentials.js';
import type { MockSystemPlugin, SystemConfig, UsageExample } from '../src/systems/types.js';

/* The CLI expands a short name like `openspp` to `@openfn/language-openspp`
 * and auto-installs it. The mapping lives on each plugin (`adaptorName`,
 * defaulting to the system key), so scripts never carry their own copy. */
const adaptorFor = (system: string): string => plugins[system]?.adaptorName ?? system;

/**
 * A system's usage examples, read from its plugin (`MockSystemPlugin.usage`) —
 * the single source of truth the sandbox renders too, so the systems under test
 * stay in lockstep with what the Usage tab documents.
 */
const usageFor = (system: string): UsageExample[] => plugins[system]?.usage ?? [];

interface Args {
  systems?: string[];
  list: boolean;
  keep: boolean;
  warmup: boolean;
  cli?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, keep: false, warmup: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // arg separator (pnpm forwards it through)
    else if (a === '--list') args.list = true;
    else if (a === '--keep') args.keep = true;
    else if (a === '--no-warmup') args.warmup = false;
    else if (a === '--system' || a === '--systems') {
      args.systems = (argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--cli') args.cli = argv[++i];
    else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return args;
}

/**
 * Resolve the plugin's credential spec into a concrete `state.configuration`,
 * exactly as the sandbox would generate one (shared helpers in
 * src/credentials.ts) — except the URL field points at the root-mounted mock
 * origin (no `/<system>` prefix, since the system owns this whole port).
 * Systems with no credential just get a `baseUrl`.
 */
function resolveConfiguration(
  plugin: MockSystemPlugin,
  origin: string,
  config: SystemConfig
): Record<string, unknown> {
  const vars = { ...systemVars(plugin.guide, config), ORIGIN: origin };
  return resolveCredentialValues(plugin.credential, { url: origin, vars });
}

/** Boot one system, mounted at the root, on an ephemeral loopback port. */
async function startSystem(system: string, plugin: MockSystemPlugin) {
  const fromFile = (() => {
    try {
      return loadConfig().systems[system];
    } catch {
      return undefined;
    }
  })();
  // port is only used for self-referential URL rewriting, which is gated on a
  // reverse-proxy header we never send — so its value is irrelevant here.
  const config: SystemConfig = { ...(fromFile ?? {}), port: 0 };

  // Neutralize the fault-injection knobs from mock.config.yaml (e.g. the demo
  // `dhis2.error_rate: 0.02`). A usage snippet runs exactly once, so an injected
  // random 500 — or a 429 from rate_limit — would fail an otherwise-healthy
  // example at random, making the suite nondeterministic and spawning spurious
  // "it broke" investigations. This check verifies the snippet + mock behavior,
  // not the mock's simulated flakiness, so faults must be off. Latency is kept:
  // it's not a fault and stays well inside the per-example timeout.
  delete config.error_rate;
  delete config.error_status;
  delete config.rate_limit;

  const { app } = await createSystemServer(plugin, config, { logLevel: 'warn', autoAuth: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const origin = `http://127.0.0.1:${port}`;
  return { app, origin, config };
}

interface CliCmd {
  command: string;
  baseArgs: string[];
}

/**
 * Resolve the OpenFn CLI command: an explicit --cli / $OPENFN_CLI wins, then a
 * plain `openfn` on PATH, then `npx -y @openfn/cli` as a (slower) fallback.
 */
function resolveCli(explicit?: string): CliCmd {
  const configured = explicit ?? process.env.OPENFN_CLI;
  if (configured) {
    const [command, ...baseArgs] = configured.split(/\s+/).filter(Boolean);
    return { command, baseArgs };
  }
  const onPath = spawnSync('openfn', ['--version'], { stdio: 'ignore' });
  if (onPath.status === 0) return { command: 'openfn', baseArgs: [] };
  const npx = spawnSync('npx', ['--version'], { stdio: 'ignore' });
  if (npx.status === 0) return { command: 'npx', baseArgs: ['--yes', '@openfn/cli'] };
  throw new Error(
    'Could not find the OpenFn CLI. Install it with `npm i -g @openfn/cli`, or set $OPENFN_CLI / pass --cli.'
  );
}

/** Per-example hard cap: fail a hung run fast instead of waiting ~80s (see below). */
const EXAMPLE_TIMEOUT_MS = 20_000;

interface RunResult {
  system: string;
  fn: string;
  ok: boolean;
  ms: number;
  detail: string;
}

/**
 * Error messages the CLI attached to the final state (`state.errors`, keyed by
 * job id). The CLI exits 0 even when a job aborts, writing the failure here
 * instead — so this file, not the exit code, is the reliable failure signal.
 * Returns [] when the output state is missing, unparseable, or error-free.
 */
function stateErrors(outPath: string): string[] {
  try {
    const state = JSON.parse(readFileSync(outPath, 'utf8'));
    const errs = state?.errors;
    if (errs && typeof errs === 'object') {
      return Object.values(errs).map((e: any) =>
        e && typeof e.message === 'string' ? e.message : String(e)
      );
    }
  } catch {
    /* no output file written (e.g. killed run) or unparseable — no state errors */
  }
  return [];
}

/** Run one usage example through the CLI and judge whether it worked. */
function runExample(
  cli: CliCmd,
  adaptor: string,
  ex: UsageExample,
  configuration: Record<string, unknown>,
  dir: string,
  repoDir: string
): Promise<RunResult> {
  const safe = ex.fn.replace(/[^a-zA-Z0-9_-]/g, '_');
  const jobPath = join(dir, `${safe}.js`);
  const statePath = join(dir, `${safe}.state.json`);
  const outPath = join(dir, `${safe}.out.json`);
  writeFileSync(jobPath, ex.code + '\n');
  writeFileSync(statePath, JSON.stringify({ configuration, data: {} }, null, 2));

  const args = [...cli.baseArgs, jobPath, '-a', adaptor, '-s', statePath, '-o', outPath];
  const started = Date.now();

  return new Promise((resolve) => {
    // `detached` puts the child in its own process group so the timeout can
    // SIGKILL the whole tree. `npx` spawns the CLI (and the CLI a runtime) as
    // grandchildren; killing only the direct child would orphan them, and they
    // keep the stdout pipe open, so `close` wouldn't fire until they self-abort
    // (~80s) — defeating the timeout.
    const child = spawn(cli.command, args, {
      detached: true,
      env: { ...process.env, OPENFN_REPO_DIR: repoDir },
    });
    let out = '';
    const collect = (buf: Buffer) => {
      out += buf.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    // Hard cap per example so a hung run can't stall the whole suite. A doomed
    // example otherwise sits on a slow client-side timeout (e.g. CommCare's
    // submitXls/bulk can't send their multipart body — the request never even
    // reaches the mock, so the adaptor waits ~80s before aborting; see the
    // README Roadmap). 20s fails those fast while still covering a cold `openfn`
    // adaptor install on the first run (installs are cached in repoDir after).
    let timedOut = false;
    const killTree = () => {
      // Kill the whole process group (negative pid); fall back to the direct
      // child if the group is already gone.
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree();
    }, EXAMPLE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(join(dir, `${safe}.log`), out);
      // Judge failure from three independent signals, most reliable first:
      //   1. the CLI wrote a non-empty `state.errors` — it exits 0 even when a
      //      job aborts, so exit code alone silently passes those runs;
      //   2. a stdout error marker — the runtime prints `×` (U+00D7), the CLI
      //      `✗` (U+2717), plus "aborted with error" / "Errors reported";
      //   3. a non-zero or killed exit (thrown/compile errors, or our timeout).
      const errs = stateErrors(outPath);
      const cliError =
        /[✗×]/.test(out) ||
        /CRITICAL ERROR|Workflow failed|aborted with error|Errors reported/i.test(out);
      const ok = code === 0 && !cliError && errs.length === 0;
      const detail = timedOut
        ? `timed out after ${EXAMPLE_TIMEOUT_MS / 1000}s`
        : ok
          ? firstLine(out.match(/ℹ[^\n]*|[✔√][^\n]*completed[^\n]*/)?.[0] ?? 'ok')
          : firstLine(errs[0] ?? out.match(/[✗×][^\n]*/)?.[0] ?? `exit code ${code}`);
      resolve({ system: '', fn: ex.fn, ok, ms: Date.now() - started, detail });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ system: '', fn: ex.fn, ok: false, ms: Date.now() - started, detail: err.message });
    });
  });
}

function firstLine(s: string): string {
  const line = s.split('\n')[0].trim();
  return line.length > 100 ? line.slice(0, 97) + '...' : line;
}

/** Reset a root-mounted mock back to pristine seed between examples. */
async function resetMock(origin: string): Promise<void> {
  try {
    await fetch(`${origin}/_admin/reset`, { method: 'POST' });
  } catch {
    /* best effort — a failed reset only risks cross-example bleed, not a crash */
  }
}

/**
 * Pre-install the CLI and every target adaptor into the repo cache *before* the
 * timed loop, so `EXAMPLE_TIMEOUT_MS` only ever measures a job's execution.
 *
 * That per-example cap exists to fail a hung run fast — but on a cold machine
 * the first example also pays to download the CLI (when we fall back to `npx
 * @openfn/cli`, which — unlike adaptors — isn't cached in the repo dir) plus its
 * adaptor from npm. That one-time cost routinely blows past the cap and reports
 * a misleading "timed out" on an otherwise-healthy example, which then gets
 * re-investigated on every fresh run. Doing the install here moves it out of the
 * timed loop. It's a single CLI invocation (positional package names install
 * together) and a fast no-op once the cache is warm.
 *
 * A warm-up failure is non-fatal: we warn and let each example install on
 * demand, exactly as before this step existed. `--no-warmup` skips it entirely.
 */
async function warmUp(cli: CliCmd, adaptors: string[], repoDir: string): Promise<void> {
  if (!adaptors.length) return;
  const packages = adaptors.map((a) => `@openfn/language-${a}`);
  // Generous cap covering a possible cold CLI download plus one npm install of
  // every adaptor; scales with the count and is never the tight per-example cap.
  const timeoutMs = Math.max(120_000, adaptors.length * 15_000);
  const started = Date.now();
  process.stdout.write(`Warming adaptor cache (${adaptors.length}: ${adaptors.join(', ')}) … `);

  const ok = await new Promise<boolean>((resolve) => {
    // `detached` so the timeout can SIGKILL the whole tree (npx spawns the CLI
    // as a grandchild), mirroring runExample's kill strategy.
    const child = spawn(
      cli.command,
      [...cli.baseArgs, 'repo', 'install', ...packages, '--repo-dir', repoDir],
      { detached: true, stdio: 'ignore', env: { ...process.env, OPENFN_REPO_DIR: repoDir } }
    );
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
      resolve(false);
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    ok
      ? `done in ${secs}s`
      : `WARN: failed after ${secs}s — examples will install on demand (the first may hit the ${EXAMPLE_TIMEOUT_MS / 1000}s cap).`
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Discover every system that has authored usage examples AND a live plugin.
  const discovered = Object.keys(plugins)
    .filter((name) => usageFor(name).length > 0)
    .sort();
  const targets = args.systems ? discovered.filter((s) => args.systems!.includes(s)) : discovered;

  if (args.systems) {
    const missing = args.systems.filter((s) => !discovered.includes(s));
    if (missing.length) {
      console.error(`No usage examples for: ${missing.join(', ')} (known: ${discovered.join(', ') || 'none'})`);
    }
  }

  if (!targets.length) {
    console.log('No systems with usage examples to test.');
    console.log(`(Systems that have usage examples: ${discovered.join(', ') || 'none'})`);
    return;
  }

  if (args.list) {
    for (const system of targets) {
      const usage = usageFor(system);
      console.log(`\n${system}  (adaptor: ${adaptorFor(system)})  — ${usage.length} example(s)`);
      for (const u of usage) console.log(`  • ${u.fn.padEnd(22)} ${u.code}`);
    }
    return;
  }

  const cli = resolveCli(args.cli);
  // Cache adaptor installs across runs so only the first run pays the npm cost.
  const repoDir = process.env.OPENFN_REPO_DIR ?? join(tmpdir(), 'openfn-mocker-adaptors');
  mkdirSync(repoDir, { recursive: true });
  const workDir = join(tmpdir(), `openfn-mocker-usage-${process.pid}`);

  console.log(`OpenFn CLI: ${[cli.command, ...cli.baseArgs].join(' ')}`);
  console.log(`Adaptor cache: ${repoDir}`);
  console.log(`Testing: ${targets.join(', ')}\n`);

  // Install the CLI + adaptors up front so the per-example timeout below only
  // measures execution, never a one-time cold npm install (see warmUp).
  if (args.warmup) {
    await warmUp(cli, [...new Set(targets.map(adaptorFor))], repoDir);
    console.log('');
  }

  const results: RunResult[] = [];

  for (const system of targets) {
    const plugin = plugins[system];
    const usage = usageFor(system);
    const adaptor = adaptorFor(system);
    const dir = join(workDir, system);
    mkdirSync(dir, { recursive: true });

    const { app, origin, config } = await startSystem(system, plugin);
    const configuration = resolveConfiguration(plugin, origin, config);
    console.log(`── ${system} @ ${origin}  (adaptor: ${adaptor}, ${usage.length} example(s))`);

    try {
      for (const ex of usage) {
        await resetMock(origin);
        const r = await runExample(cli, adaptor, ex, configuration, dir, repoDir);
        r.system = system;
        results.push(r);
        const mark = r.ok ? '✓ PASS' : '✗ FAIL';
        console.log(`   ${mark}  ${ex.fn.padEnd(22)} ${String(r.ms).padStart(5)}ms  ${r.detail}`);
      }
    } finally {
      await app.close();
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${passed}/${results.length} passed` + (failed ? `, ${failed} FAILED` : ''));
  if (failed) {
    console.log('  Failures:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`    ✗ ${r.system}/${r.fn}: ${r.detail}`);
    }
  }
  console.log('═'.repeat(60));

  if (!args.keep) rmSync(workDir, { recursive: true, force: true });
  else console.log(`\nKept job/state/log files under ${workDir}`);

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
