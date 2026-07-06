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
 * Reads resolve against the installed package's shipped specs. Everything is
 * synchronous file reads except `listAdaptors`, which may hit the network to
 * refresh the adaptor list.
 */
export {
  listAdaptors,
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
