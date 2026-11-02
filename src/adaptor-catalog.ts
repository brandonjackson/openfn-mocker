/**
 * The full list of OpenFn adaptors (src/adaptor-catalog.json, refreshed by
 * `pnpm catalog:refresh`), so the /status page can say plainly which adaptors
 * the mocker does not represent at all, and why some never will be.
 */
import catalogJson from './adaptor-catalog.json' with { type: 'json' };

/**
 * http       wraps an HTTP API, so a mock could stand in for it
 * protocol   speaks a non-HTTP protocol (SQL, SFTP, Redis, ...): out of scope for an HTTP mock
 * no-remote  talks to no external system at all, so there is nothing to mock
 */
export type CatalogKind = 'http' | 'protocol' | 'no-remote';

export interface CatalogEntry {
  name: string;
  kind: CatalogKind;
  note?: string;
  /** How openfn-api-specs obtained this adaptor's spec, if it has one. */
  specOrigin?: string;
}

export interface AdaptorCatalog {
  /** Where the list was read from (the monorepo tree at a commit). */
  source: string;
  /** Date of that commit. */
  asOf: string;
  adaptors: CatalogEntry[];
}

export const adaptorCatalog = catalogJson as AdaptorCatalog;
