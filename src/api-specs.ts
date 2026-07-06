/**
 * Adaptor API specs, sourced from the `openfn-api-specs` package.
 *
 * The per-adaptor OpenAPI specs and standalone data-object schemas used to live
 * in this repo under `specs/adaptors/` (maintained by a `pnpm specs` tool).
 * They were extracted into their own repo — https://github.com/brandonjackson/openfn-api-specs —
 * so they can be a shared source of truth (mocker seed generation here, plus
 * Lightning tooling). This module is mocker's single import point for them.
 *
 * Maintenance of the specs (find/generate/refresh) now happens in that repo;
 * `pnpm specs` here just delegates to its CLI (installed as the `api-specs` bin).
 *
 * Prefer the async `fetch*` variants: they pull the live specs from the CDN
 * (jsDelivr mirror of the openfn-api-specs repo) so mocker always serves the
 * latest without a dependency bump, falling back to the version bundled in
 * node_modules when the CDN is unreachable. The synchronous `get*` readers
 * return only that bundled snapshot — use them for offline/deterministic paths.
 */
export {
  listAdaptors,
  // async, CDN-first (latest) with bundled fallback — the default for runtime use:
  fetchOpenapi,
  fetchManifest,
  fetchDataObjects,
  fetchDataObject,
  fetchDataObjectIndex,
  // sync, bundled snapshot only:
  getManifest,
  getOpenapi,
  getSource,
  getDataObjects,
  getDataObject,
  getDataObjectIndex,
} from 'openfn-api-specs';

export type {
  AdaptorInfo,
  Manifest,
  ManifestEntry,
  SpecSource,
  SpecOrigin,
} from 'openfn-api-specs';
