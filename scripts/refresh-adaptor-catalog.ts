/**
 * Refresh src/adaptor-catalog.json: every adaptor in the OpenFn adaptors
 * monorepo (packages/<name>), classified by whether an HTTP mock could even
 * stand in for it, plus which spec openfn-api-specs has for it. The /status
 * page uses it to say which adaptors the mocker does NOT represent.
 *
 * Reads the package list with a blob-less git clone of github.com/OpenFn/adaptors
 * (no auth, a few seconds), and spec provenance from the installed
 * openfn-api-specs. The classification below is hand-maintained: an adaptor
 * not listed is assumed to wrap an HTTP API (the common case).
 *
 *   pnpm catalog:refresh
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSource } from 'openfn-api-specs';
import type { AdaptorCatalog, CatalogKind } from '../src/adaptor-catalog.js';

const REPO = 'https://github.com/OpenFn/adaptors';

/** Adaptors an HTTP mock cannot (or need not) represent, and why. */
const NOT_HTTP: Record<string, { kind: Exclude<CatalogKind, 'http'>; note: string }> = {
  common: { kind: 'no-remote', note: 'shared helpers; no external system' },
  testing: { kind: 'no-remote', note: 'test harness; no external system' },
  ping: { kind: 'no-remote', note: 'connectivity probe; no external system' },
  'image-utils': { kind: 'no-remote', note: 'local image processing; no external system' },
  varo: { kind: 'no-remote', note: 'in-process cold-chain data transforms; makes no HTTP calls' },
  formsg: { kind: 'no-remote', note: 'verifies and decrypts FormSG webhooks locally; makes no outbound calls' },
  postgresql: { kind: 'protocol', note: 'SQL database wire protocol' },
  mysql: { kind: 'protocol', note: 'SQL database wire protocol' },
  mssql: { kind: 'protocol', note: 'SQL database wire protocol (TDS)' },
  mongodb: { kind: 'protocol', note: 'MongoDB driver protocol' },
  redis: { kind: 'protocol', note: 'Redis protocol' },
  sftp: { kind: 'protocol', note: 'SSH file transfer' },
  hive: { kind: 'protocol', note: 'Thrift/JDBC SQL client' },
  motherduck: { kind: 'protocol', note: 'DuckDB SQL client' },
};

function listPackages(): { names: string[]; commit: string; committedAt: string } {
  const dir = mkdtempSync(join(tmpdir(), 'openfn-adaptors-'));
  try {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', REPO, dir], { stdio: 'inherit' });
    const out = execFileSync('git', ['-C', dir, 'ls-tree', '--name-only', 'HEAD', 'packages/'], { encoding: 'utf8' });
    const commit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const committedAt = execFileSync('git', ['-C', dir, 'log', '-1', '--format=%cs'], { encoding: 'utf8' }).trim();
    return { names: out.split('\n').map((l) => l.replace(/^packages\//, '').trim()).filter(Boolean).sort(), commit, committedAt };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const { names, commit, committedAt } = listPackages();
const catalog: AdaptorCatalog = {
  source: `${REPO}/tree/${commit}/packages`,
  asOf: committedAt,
  adaptors: names.map((name) => {
    const cls = NOT_HTTP[name];
    const origin = getSource(name)?.origin;
    return { name, kind: cls?.kind ?? 'http', ...(cls ? { note: cls.note } : {}), ...(origin ? { specOrigin: origin } : {}) };
  }),
};
const out = fileURLToPath(new URL('../src/adaptor-catalog.json', import.meta.url));
writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`wrote ${catalog.adaptors.length} adaptor(s) as of ${committedAt} to src/adaptor-catalog.json`);
