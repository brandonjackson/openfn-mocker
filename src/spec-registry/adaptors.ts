import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registryRoot } from './paths.js';

/**
 * The canonical list of OpenFn adaptors lives in the monorepo
 * https://github.com/OpenFn/adaptors under `packages/<name>`. We read the
 * directory listing through the jsDelivr GitHub file tree API (no auth, CDN
 * cached) rather than the GitHub REST API, which keeps this tool usable from
 * any environment. The resolved list is cached on disk so subsequent runs are
 * offline-fast; pass `refresh` to re-fetch.
 */
const TREE_URL = 'https://data.jsdelivr.com/v1/packages/gh/openfn/adaptors@main?structure=flat';

/** Cache file for the resolved adaptor list. */
function listCachePath(): string {
  return join(registryRoot(), '_adaptors.json');
}

/**
 * Adaptors that are not thin clients over an external HTTP API and therefore
 * have no vendor OpenAPI document to find. They are still tracked (so coverage
 * is honest) but the spec for them is generated from the adaptor's own surface,
 * describing the operations/protocol rather than a REST API. `kind` explains
 * why so the instructions and reports can say something useful.
 */
export const NON_REST_ADAPTORS: Record<string, string> = {
  common: 'utility — shared helpers, no external system',
  http: 'generic HTTP client, no single vendor API',
  collections: 'OpenFn Collections (internal Lightning API)',
  openfn: 'OpenFn platform (internal Lightning API)',
  testing: 'test/dev harness, no external system',
  ping: 'connectivity probe, no external system',
  dagu: 'workflow engine, thin surface',
  memento: 'note-taking app, thin surface',
  postgresql: 'SQL database (protocol adaptor, not REST)',
  mysql: 'SQL database (protocol adaptor, not REST)',
  mssql: 'SQL database (protocol adaptor, not REST)',
  mongodb: 'document database (driver adaptor, not REST)',
  redis: 'key-value store (protocol adaptor, not REST)',
  sftp: 'file transfer (protocol adaptor, not REST)',
};

export interface AdaptorInfo {
  /** Short name, e.g. `dhis2` — the folder name in openfn/adaptors/packages. */
  name: string;
  /** npm package, e.g. `@openfn/language-dhis2`. */
  npm: string;
  /** True when the adaptor wraps an external HTTP API worth an OpenAPI doc. */
  rest: boolean;
  /** For non-REST adaptors, a short reason string; undefined otherwise. */
  note?: string;
}

/** Parse the jsDelivr flat file tree into the set of `packages/<name>` dirs. */
function extractPackages(tree: { files?: Array<{ name: string }> }): string[] {
  const names = new Set<string>();
  for (const f of tree.files ?? []) {
    const parts = f.name.split('/'); // e.g. ['', 'packages', 'dhis2', 'package.json']
    if (parts[1] === 'packages' && parts[2] && parts.length > 3) names.add(parts[2]);
  }
  return [...names].sort();
}

/** Fetch the adaptor names from openfn/adaptors (via jsDelivr), or throw. */
async function fetchAdaptorNames(): Promise<string[]> {
  const res = await fetch(TREE_URL);
  if (!res.ok) throw new Error(`Failed to fetch adaptor tree: ${res.status} ${res.statusText}`);
  const tree = (await res.json()) as { files?: Array<{ name: string }> };
  const names = extractPackages(tree);
  if (names.length === 0) throw new Error('Adaptor tree returned no packages/<name> entries.');
  return names;
}

function toInfo(name: string): AdaptorInfo {
  const note = NON_REST_ADAPTORS[name];
  return { name, npm: `@openfn/language-${name}`, rest: note === undefined, note };
}

/**
 * The full adaptor list. Reads the on-disk cache unless `refresh` is set (or the
 * cache is missing), in which case it fetches and rewrites the cache.
 */
export async function loadAdaptors(refresh = false): Promise<AdaptorInfo[]> {
  const cache = listCachePath();
  if (!refresh && existsSync(cache)) {
    const names = JSON.parse(readFileSync(cache, 'utf8')) as string[];
    return names.map(toInfo);
  }
  const names = await fetchAdaptorNames();
  mkdirSync(registryRoot(), { recursive: true });
  writeFileSync(cache, JSON.stringify(names, null, 2) + '\n');
  return names.map(toInfo);
}
