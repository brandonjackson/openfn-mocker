import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataStore } from '../src/store.js';
import { makeDumpSeed, seedForDataset, readDatasetDump, type DatasetDump } from '../src/datasets.js';
import { loadConfig } from '../src/config.js';
import { buildServer } from '../src/app.js';
import fhir from '../src/systems/fhir/plugin.js';

/** Set env for the duration of a callback, restoring prior values after. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const tmpDirs: string[] = [];
function makeDatasetsRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mocker-datasets-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('makeDumpSeed', () => {
  it('loads a { collection: { id: record } } dump into the store', () => {
    const dump: DatasetDump = {
      Patient: {
        'pat-x': { resourceType: 'Patient', id: 'pat-x', name: [{ family: 'Custom' }] },
        'pat-y': { resourceType: 'Patient', id: 'pat-y' },
      },
      Condition: { 'cond-x': { resourceType: 'Condition', id: 'cond-x' } },
    };
    const store = new DataStore();
    makeDumpSeed(dump)(store, { port: 0 });

    expect(store.count('Patient')).toBe(2);
    expect(store.count('Condition')).toBe(1);
    expect(store.get('Patient', 'pat-x')).toMatchObject({ name: [{ family: 'Custom' }] });
  });
});

describe('seedForDataset', () => {
  it('returns the built-in seed unchanged for the default dataset', () => {
    expect(seedForDataset(fhir, 'default')).toBe(fhir.seed);
  });

  it('loads a dataset dump for a non-default dataset', async () => {
    const root = makeDatasetsRoot();
    mkdirSync(join(root, 'demo'), { recursive: true });
    writeFileSync(
      join(root, 'demo', 'fhir.json'),
      JSON.stringify({ Patient: { 'pat-demo': { resourceType: 'Patient', id: 'pat-demo' } } })
    );

    await withEnv({ MOCKER_DATASETS_DIR: root }, () => {
      const seed = seedForDataset(fhir, 'demo');
      expect(seed).not.toBe(fhir.seed);
      const store = new DataStore();
      seed(store, { port: 0 });
      expect(store.count('Patient')).toBe(1);
      expect(store.get('Patient', 'pat-demo')).toBeDefined();
    });
  });

  it('falls back to the built-in seed when a system has no dump in the dataset', async () => {
    const root = makeDatasetsRoot();
    mkdirSync(join(root, 'partial'), { recursive: true }); // no fhir.json
    await withEnv({ MOCKER_DATASETS_DIR: root }, () => {
      expect(seedForDataset(fhir, 'partial')).toBe(fhir.seed);
      expect(readDatasetDump('partial', 'fhir')).toBeNull();
    });
  });
});

describe('config dataset selection', () => {
  it('defaults to "default"', async () => {
    await withEnv({ MOCKER_DATASET: undefined }, () => {
      expect(loadConfig().dataset).toBe('default');
    });
  });

  it('honors the MOCKER_DATASET env override', async () => {
    await withEnv({ MOCKER_DATASET: 'dominican-republic' }, () => {
      expect(loadConfig().dataset).toBe('dominican-republic');
    });
  });
});

describe('buildServer with a custom dataset', () => {
  it('seeds each system from datasets/<name>/<system>.json instead of the built-in seed', async () => {
    const root = makeDatasetsRoot();
    mkdirSync(join(root, 'demo'), { recursive: true });
    writeFileSync(
      join(root, 'demo', 'fhir.json'),
      JSON.stringify({
        Patient: {
          'pat-demo': {
            resourceType: 'Patient',
            id: 'pat-demo',
            name: [{ use: 'official', family: 'Demo', given: ['Custom'] }],
          },
        },
      })
    );

    await withEnv(
      { MOCKER_SYSTEMS: 'fhir', MOCKER_DATASET: 'demo', MOCKER_DATASETS_DIR: root },
      async () => {
        const config = loadConfig();
        expect(config.dataset).toBe('demo');
        const { app } = await buildServer(config);
        try {
          const custom = await app.inject({ method: 'GET', url: '/fhir/Patient/pat-demo' });
          expect(custom.statusCode).toBe(200);
          expect(custom.json()).toMatchObject({ id: 'pat-demo', name: [{ family: 'Demo' }] });

          // The built-in seed's pat-1 must NOT be present — the dataset replaced it.
          const builtin = await app.inject({ method: 'GET', url: '/fhir/Patient/pat-1' });
          expect(builtin.statusCode).toBe(404);
        } finally {
          await app.close();
        }
      }
    );
  });
});
