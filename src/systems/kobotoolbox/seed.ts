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

/** A deterministic Kobo-style version id (`v` + 22 chars) derived from a seed. */
export function versionId(seed: string): string {
  let h = 0;
  let out = 'v';
  for (let i = 0; out.length < 23; i++) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) >>> 0;
    out += UID_CHARS[h % UID_CHARS.length];
  }
  return out;
}

/** Parse a KoboToolbox `gps` string ("lat lon [alt acc]") into `[lat, lon]`. */
function parseGeo(gps: unknown): [number | null, number | null] {
  if (typeof gps !== 'string') return [null, null];
  const [lat, lon] = gps.trim().split(/\s+/).map(Number);
  return [Number.isFinite(lat) ? lat : null, Number.isFinite(lon) ? lon : null];
}

/**
 * Standard KoboToolbox submission metadata (the `_`- and slash-prefixed system
 * fields every real submission carries alongside its survey answers). Merged
 * into a submission by the seed and the create-submission route so a customer
 * sees the same shape from either path.
 */
export function koboSubmissionMeta(opts: {
  id: number;
  uuid: string;
  submissionTime: string;
  submittedBy: string;
  xformId: string;
  version: string;
  formhubUuid: string;
  fields?: Record<string, any>;
}): Record<string, any> {
  const instanceId = `uuid:${opts.uuid}`;
  const submitted = new Date(opts.submissionTime);
  const start = new Date(submitted.getTime() - 5 * 60_000).toISOString();
  return {
    _id: opts.id,
    'formhub/uuid': opts.formhubUuid,
    __version__: opts.version,
    'meta/instanceID': instanceId,
    'meta/rootUuid': instanceId,
    _xform_id_string: opts.xformId,
    _uuid: opts.uuid,
    _attachments: [],
    _status: 'submitted_via_web',
    _geolocation: parseGeo(opts.fields?.gps),
    _submission_time: opts.submissionTime,
    _tags: [],
    _notes: [],
    _validation_status: {},
    _submitted_by: opts.submittedBy,
    start,
    end: opts.submissionTime,
  };
}

/**
 * Expand a stored asset's core fields into the full KoboToolbox Asset serializer
 * a real `/api/v2/assets/` response returns: the derived self/data/xform links,
 * the owner + permission scaffolding, the `summary`, and the live `deployment__*`
 * rollups computed from `submissions`. Pure in (core, submissions, port) so both
 * the seed (bakes it into the store) and the plugin (rebuilds it on every read,
 * refreshing counts/port) share one definition. Only the stable core fields of
 * `core` are read; any already-derived fields are recomputed.
 */
export function buildAsset(
  core: Record<string, any>,
  submissions: Array<Record<string, any>>,
  port: number
): Record<string, any> {
  const uid = core.uid;
  const url = assetUrl(port, uid);
  const apiV2 = url.slice(0, url.indexOf('/assets/')); // http://host:port/api/v2
  const collection = `${apiV2}/assets/`;
  const username = core.owner__username ?? 'apiuser';
  const ownerUrl = `${apiV2}/users/${username}/`;

  const count = submissions.length;
  const lastSubmission =
    submissions
      .map((s) => s._submission_time)
      .filter(Boolean)
      .sort()
      .pop() ?? null;
  const columns = [...new Set(submissions.flatMap((s) => Object.keys(s)))]
    .filter((k) => !k.startsWith('_') && !k.includes('/') && k !== 'meta')
    .sort();

  const active = core.deployment__active ?? false;
  const hasDeployment = core.has_deployment ?? false;
  const deploymentStatus = hasDeployment ? (active ? 'deployed' : 'archived') : 'draft';
  const version = core.version_id ?? versionId(uid);
  const deploymentUuid = core.deployment__uuid ?? versionId(`fh-${uid}`).slice(1);

  return {
    url,
    owner: ownerUrl,
    owner__username: username,
    owner_label: username,
    parent: null,
    uid,
    kind: 'asset',
    name: core.name ?? 'Untitled asset',
    asset_type: core.asset_type ?? 'survey',
    version_id: version,
    deployed_version_id: hasDeployment ? version : null,
    version__content_hash: versionId(`h-${uid}`).slice(1),
    version_count: 1,
    date_created: core.date_created,
    date_modified: core.date_modified,
    date_deployed: hasDeployment ? core.date_modified ?? null : null,
    summary: {
      geo: columns.includes('gps'),
      labels: core.name ? [core.name] : [],
      columns,
      lock_all: false,
      lock_any: false,
      languages: [null],
      row_count: columns.length,
      default_translation: null,
    },
    settings: {
      sector: { label: 'Public Health', value: 'Public Health' },
      country: [{ label: 'Sierra Leone', value: 'SLE' }],
      description: '',
      organization: '',
    },
    data_sharing: {},
    xform_link: `${collection}${uid}.xml`,
    xls_link: `${collection}${uid}.xls`,
    hooks_link: `${url}hooks/`,
    data: `${url}data/`,
    exports: `${url}exports/`,
    export_settings: [],
    paired_data: `${url}paired-data/`,
    files: [],
    downloads: [
      { format: 'xls', url: `${collection}${uid}.xls` },
      { format: 'xml', url: `${collection}${uid}.xml` },
    ],
    embeds: [
      { format: 'xls', url: `${url}xls/` },
      { format: 'xform', url: `${url}xform/` },
    ],
    assignable_permissions: [
      { url: `${apiV2}/permissions/view_asset/`, label: 'View form' },
      { url: `${apiV2}/permissions/change_asset/`, label: 'Edit form' },
      { url: `${apiV2}/permissions/view_submissions/`, label: 'View submissions' },
      { url: `${apiV2}/permissions/add_submissions/`, label: 'Add submissions' },
    ],
    permissions: [
      {
        url: `${url}permission-assignments/1/`,
        user: ownerUrl,
        permission: `${apiV2}/permissions/manage_asset/`,
        label: 'Manage project',
      },
    ],
    effective_permissions: [{ codename: 'manage_asset' }, { codename: 'view_asset' }, { codename: 'change_asset' }],
    tag_string: '',
    access_types: null,
    children: { count: 0 },
    subscribers_count: 0,
    status: 'shared',
    analysis_form_json: { engines: {}, additional_fields: [] },
    report_styles: { default: {}, specified: {}, kuid_names: {} },
    report_custom: {},
    map_styles: {},
    map_custom: {},
    advanced_features: {},
    advanced_submission_schema: {},
    created_by: username,
    last_modified_by: username,
    project_ownership: null,
    content: {},
    has_deployment: hasDeployment,
    deployed_versions: { count: hasDeployment ? 1 : 0, next: null, previous: null, results: [] },
    deployment__identifier: hasDeployment ? url : null,
    deployment__active: active,
    deployment_status: deploymentStatus,
    deployment__links: {},
    deployment__data_download_links: hasDeployment
      ? { xls: `${url}data.xls`, csv: `${url}data.csv` }
      : {},
    deployment__submission_count: count,
    deployment__last_submission_time: lastSubmission,
    deployment__uuid: deploymentUuid,
    deployment__encrypted: false,
  };
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
    const version = versionId(asset.uid);
    const formhubUuid = versionId(`fh-${asset.uid}`).slice(1);

    // Build the submission records first so the asset's summary/rollups derive
    // from real data.
    const submissions = asset.submissions.map((fields, i) => {
      const id = ++idCounter;
      const submissionTime = new Date(baseTime + (i + 1) * 900_000).toISOString();
      return {
        ...koboSubmissionMeta({
          id,
          uuid: randomUUID(),
          submissionTime,
          submittedBy: asset.owner,
          xformId: asset.uid,
          version,
          formhubUuid,
          fields,
        }),
        ...fields,
      };
    });

    const core = {
      uid: asset.uid,
      name: asset.name,
      asset_type: 'survey',
      deployment__active: true,
      has_deployment: true,
      version_id: version,
      deployment__uuid: formhubUuid,
      date_created: new Date(baseTime).toISOString(),
      date_modified: new Date(baseTime + 3_600_000).toISOString(),
      owner__username: asset.owner,
    };
    store.create('assets', asset.uid, buildAsset(core, submissions, port));
    for (const submission of submissions) store.create('submissions', String(submission._id), submission);
  }
}
