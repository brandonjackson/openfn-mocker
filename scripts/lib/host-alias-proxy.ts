/**
 * Local-only network aliasing for `pnpm test:usage`.
 *
 * A handful of adaptors call hostnames the mock can't otherwise be reached at:
 * either a literal public hostname the adaptor hardcodes and never reads from
 * configuration (Mailgun's `api.mailgun.net`), or per-service hosts it derives
 * from the credential's own `domain`/`host` field (OpenCRVS's
 * `auth.<domain>`, `register.<domain>`, …). A plugin declares these as
 * `MockSystemPlugin.hostAliases` (see src/systems/types.ts); this module is
 * the ONLY thing that acts on that declaration — it is not wired into the
 * multi-system server, docker-compose, or a hosted deployment. See the
 * README's "Local network aliasing" section for what each of those actually
 * supports and why the ones that can't use this mechanism can't be fixed by
 * adding more code here (they need control of DNS this process doesn't have).
 *
 * For each aliased hostname this:
 *   1. adds a `127.0.0.1` line to /etc/hosts (removed again on close — only the
 *      lines this run added, never anything that was already there);
 *   2. terminates TLS locally (a cached, once-generated self-signed cert — the
 *      CLI subprocess is run with `NODE_TLS_REJECT_UNAUTHORIZED=0` so it trusts
 *      it) and reverse-proxies the plaintext request to the system's real mock
 *      origin, unchanged — the mock itself routes by path, not by `Host`
 *      header, so no per-alias logic is needed on that side.
 *
 * Both steps require root (binding :443 for a hardcoded-hostname adaptor, and
 * writing /etc/hosts) or, for adaptors with a `host`-role credential field, at
 * least a free ephemeral port and a writable hosts file. Either can fail on a
 * locked-down machine — that's reported as a warning and the caller gets
 * `undefined` back, so the affected system's examples fail exactly as they did
 * before this mechanism existed, not the whole suite.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MockSystemPlugin } from '../../src/systems/types.js';

const HOSTS_FILE = '/etc/hosts';
const MARKER = '# openfn-mocker: pnpm test:usage alias (safe to delete)';
const CERT_DIR = join(tmpdir(), 'openfn-mocker-alias-cert');

export interface AliasProxyHandle {
  /** Value for the credential's `host`-role field (bare `host:port`), when it needed one. */
  hostValue?: string;
  /** Extra env vars the CLI subprocess needs (trusting the local self-signed cert). */
  env: Record<string, string>;
  close(): Promise<void>;
}

/** Resolve a plugin's `hostAliases` templates against the bind host, deduped. */
function resolveAliasHosts(plugin: MockSystemPlugin, bindHost: string): string[] {
  const raw = plugin.hostAliases ?? [];
  return [...new Set(raw.map((t) => t.replace('{host}', bindHost)))];
}

/** Generate a self-signed cert once and cache it across runs (subject/SANs don't matter — see module doc). */
function ensureCert(): { cert: string; key: string } {
  const certPath = join(CERT_DIR, 'cert.pem');
  const keyPath = join(CERT_DIR, 'key.pem');
  if (!existsSync(certPath) || !existsSync(keyPath)) {
    mkdirSync(CERT_DIR, { recursive: true });
    const result = spawnSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '3650',
      '-nodes',
      '-subj',
      '/CN=openfn-mocker',
    ]);
    if (result.status !== 0) {
      throw new Error(`openssl cert generation failed: ${result.stderr?.toString() ?? result.error?.message}`);
    }
  }
  return { cert: readFileSync(certPath, 'utf8'), key: readFileSync(keyPath, 'utf8') };
}

/** Add `127.0.0.1 <host>` lines for any alias not already present; returns the exact lines added (for cleanup). */
function addHostsEntries(aliasHosts: string[]): string[] {
  const current = readFileSync(HOSTS_FILE, 'utf8');
  const toAdd = aliasHosts.filter((h) => !current.split('\n').some((line) => line.trim() === `127.0.0.1 ${h}`));
  if (!toAdd.length) return [];
  const lines = toAdd.map((h) => `127.0.0.1 ${h} ${MARKER}`);
  writeFileSync(HOSTS_FILE, current.replace(/\n?$/, '\n') + lines.join('\n') + '\n');
  return lines;
}

/** Remove exactly the lines this run added, leaving everything else (including other runs' stale entries) untouched. */
function removeHostsEntries(lines: string[]): void {
  if (!lines.length) return;
  const current = readFileSync(HOSTS_FILE, 'utf8');
  const remaining = current.split('\n').filter((line) => !lines.includes(line));
  writeFileSync(HOSTS_FILE, remaining.join('\n'));
}

/** Reverse-proxy one TLS request to the plain-http mock, streaming both directions unchanged. */
function proxyRequest(backendPort: number, req: http.IncomingMessage, res: http.ServerResponse): void {
  const upstream = http.request(
    { host: '127.0.0.1', port: backendPort, method: req.method, path: req.url, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

function listen(server: https.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.removeListener('error', reject);
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}

/**
 * Start the alias proxy for one system, if it declares `hostAliases`. Returns
 * `undefined` (after logging why) when the mechanism can't be set up here —
 * the caller should proceed without it, reproducing the pre-existing failure.
 */
export async function startAliasProxy(
  plugin: MockSystemPlugin,
  backendPort: number
): Promise<AliasProxyHandle | undefined> {
  if (!plugin.hostAliases?.length) return undefined;

  const bindHost = '127.0.0.1';
  const aliasHosts = resolveAliasHosts(plugin, bindHost);
  const needsExplicitPort = plugin.credential?.fields.some((f) => f.role === 'host') ?? false;

  let addedLines: string[] = [];
  try {
    addedLines = addHostsEntries(aliasHosts);
  } catch (err: any) {
    console.log(
      `   ⚠ ${plugin.name}: can't write ${HOSTS_FILE} (${err.code ?? err.message}) — needs root locally; ` +
        `skipping host aliasing, its examples will fail as if this mechanism didn't exist.`
    );
    return undefined;
  }

  let cert: { cert: string; key: string };
  try {
    cert = ensureCert();
  } catch (err: any) {
    console.log(`   ⚠ ${plugin.name}: ${err.message} — skipping host aliasing.`);
    removeHostsEntries(addedLines);
    return undefined;
  }

  const server = https.createServer({ cert: cert.cert, key: cert.key }, (req, res) =>
    proxyRequest(backendPort, req, res)
  );

  const listenPort = needsExplicitPort ? 0 : 443;
  let actualPort: number;
  try {
    actualPort = await listen(server, listenPort);
  } catch (err: any) {
    console.log(
      `   ⚠ ${plugin.name}: can't bind TLS proxy on ${listenPort === 443 ? ':443' : 'an ephemeral port'} ` +
        `(${err.code ?? err.message})${listenPort === 443 ? ' — needs root locally' : ''}; ` +
        `skipping host aliasing, its examples will fail as if this mechanism didn't exist.`
    );
    removeHostsEntries(addedLines);
    return undefined;
  }

  return {
    hostValue: needsExplicitPort ? `${bindHost}:${actualPort}` : undefined,
    // NODE_TLS_REJECT_UNAUTHORIZED trusts our self-signed cert. NO_PROXY/no_proxy
    // bypasses any outbound HTTP(S) proxy the environment sets (some sandboxes
    // and corporate networks route all HTTPS through one that resolves DNS
    // itself, ignoring /etc/hosts entirely) — without it, a literal alias like
    // `api.mailgun.net` would still leave the machine instead of hitting the
    // local mock.
    env: {
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      NO_PROXY: [process.env.NO_PROXY, ...aliasHosts].filter(Boolean).join(','),
      no_proxy: [process.env.no_proxy, ...aliasHosts].filter(Boolean).join(','),
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      removeHostsEntries(addedLines);
    },
  };
}
