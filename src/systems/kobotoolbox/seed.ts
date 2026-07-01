import { randomUUID } from 'node:crypto';
import type { DataStore } from '../../store.js';
import type { SystemConfig } from '../types.js';

export const DEFAULT_PORT = 4016;

const UID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** KoboToolbox asset uids look like `a` + 13 alphanumerics (e.g. aKEj3xKFrZ5pDn). */
export function makeAssetUid(): string {
  let out = 'a';
  for (let i = 0; i < 13; i++) out += UID_CHARS[Math.floor(Math.random() * UID_CHARS.length)];
  return out;
}

/** Build the canonical self URL for an asset on this mock server. */
export function assetUrl(port: number, uid: string): string {
  return `http://localhost:${port}/api/v2/assets/${uid}/`;
}

interface SeedAsset {
  uid: string;
  name: string;
  owner: string;
  submissions: Array<Record<string, any>>;
}

/**
 * Seed 3 assets (survey forms) with ~10 submissions distributed across them.
 * Submissions carry a `_xform_id_string` pointing back at their asset uid; the
 * plugin derives `deployment__submission_count` from the live submission count.
 */
export function seed(store: DataStore, config: SystemConfig): void {
  const port = (config.port as number) || DEFAULT_PORT;

  // Fixed uids so tests / workflows are deterministic across reseeds.
  const assets: SeedAsset[] = [
    {
      uid: 'aHousehold01Q1',
      name: 'Household Survey Q1',
      owner: 'fieldteam',
      submissions: [
        { household_head_name: 'Jane Doe', household_size: 5, water_source: 'borehole', district: 'Bo' },
        { household_head_name: 'John Smith', household_size: 3, water_source: 'piped', district: 'Bo' },
        { household_head_name: 'Amina Kamara', household_size: 7, water_source: 'well', district: 'Kenema' },
        { household_head_name: 'Mohamed Sesay', household_size: 4, water_source: 'borehole', district: 'Kenema' },
        { household_head_name: 'Fatmata Bangura', household_size: 6, water_source: 'river', district: 'Bo' },
      ],
    },
    {
      uid: 'aClinicVisit02',
      name: 'Clinic Visit Log',
      owner: 'clinicteam',
      submissions: [
        { patient_name: 'Aisha Turay', age: 28, temperature: 37.2, diagnosis: 'malaria' },
        { patient_name: 'Samuel Koroma', age: 45, temperature: 36.8, diagnosis: 'hypertension' },
        { patient_name: 'Grace Williams', age: 12, temperature: 38.1, diagnosis: 'malaria' },
      ],
    },
    {
      uid: 'aWaterPoint03',
      name: 'Water Point Assessment',
      owner: 'fieldteam',
      submissions: [
        { point_name: 'Ngelehun Well 1', functional: 'yes', gps: '7.9465 -11.7382' },
        { point_name: 'Ngelehun Borehole 2', functional: 'no', gps: '7.9501 -11.7411' },
      ],
    },
  ];

  const baseTime = Date.UTC(2024, 0, 15, 8, 0, 0);
  let idCounter = 12000;

  for (const asset of assets) {
    store.create('assets', asset.uid, {
      uid: asset.uid,
      name: asset.name,
      asset_type: 'survey',
      deployment__active: true,
      // Live value is recomputed by the plugin; this is a sensible baseline.
      deployment__submission_count: asset.submissions.length,
      has_deployment: true,
      date_created: new Date(baseTime).toISOString(),
      date_modified: new Date(baseTime + 3_600_000).toISOString(),
      owner__username: asset.owner,
      url: assetUrl(port, asset.uid),
    });

    asset.submissions.forEach((fields, i) => {
      const id = ++idCounter;
      const submission = {
        _id: id,
        _uuid: randomUUID(),
        _submission_time: new Date(baseTime + (i + 1) * 900_000).toISOString(),
        _submitted_by: asset.owner,
        _xform_id_string: asset.uid,
        ...fields,
      };
      store.create('submissions', String(id), submission);
    });
  }
}
