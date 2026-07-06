import { existsSync, readFileSync } from 'node:fs';
import type { AdaptorInfo } from './adaptors.js';
import { dataSchemasIndexPath, openapiPath, sourcePath } from './paths.js';
import type { Manifest, ManifestEntry, SpecSource } from './types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** Count path+method operations in an OpenAPI doc. */
function countOperations(openapi: any): number {
  const paths = openapi?.paths ?? {};
  let n = 0;
  for (const item of Object.values(paths)) {
    if (item && typeof item === 'object') {
      for (const m of HTTP_METHODS) if ((item as any)[m]) n++;
    }
  }
  return n;
}

/** Build one adaptor's manifest row from whatever files exist on disk. */
export function buildEntry(info: AdaptorInfo): ManifestEntry {
  const openapi = readJson<any>(openapiPath(info.name));
  const source = readJson<SpecSource>(sourcePath(info.name));
  const index = readJson<{ objects?: unknown[]; resources?: unknown[] }>(
    dataSchemasIndexPath(info.name)
  );

  const entry: ManifestEntry = {
    adaptor: info.name,
    npm: info.npm,
    rest: info.rest,
    hasOpenapi: openapi !== undefined,
    hasDataSchemas: index !== undefined,
  };
  if (info.note) entry.note = info.note;
  if (openapi) {
    entry.operations = countOperations(openapi);
    entry.schemas = Object.keys(openapi?.components?.schemas ?? {}).length;
  }
  if (index) {
    entry.dataObjects = index.objects?.length ?? 0;
    entry.resources = index.resources?.length ?? 0;
  }
  if (source) {
    entry.origin = source.origin;
    entry.upstreamFormat = source.upstreamFormat;
    entry.capturedAt = source.capturedAt;
  }
  return entry;
}

/** Assemble the aggregate manifest over all adaptors. */
export function buildManifest(adaptors: AdaptorInfo[], generatedAt: string): Manifest {
  const entries = adaptors.map(buildEntry);
  const byOrigin: Record<string, number> = {};
  for (const e of entries) if (e.origin) byOrigin[e.origin] = (byOrigin[e.origin] ?? 0) + 1;

  return {
    generatedAt,
    source: 'https://github.com/OpenFn/adaptors (packages/*)',
    totals: {
      adaptors: entries.length,
      withOpenapi: entries.filter((e) => e.hasOpenapi).length,
      withDataSchemas: entries.filter((e) => e.hasDataSchemas).length,
      dataObjects: entries.reduce((n, e) => n + (e.dataObjects ?? 0), 0),
      byOrigin,
    },
    adaptors: entries,
  };
}
