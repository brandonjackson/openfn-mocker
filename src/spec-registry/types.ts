/** How an adaptor's OpenAPI spec was obtained. */
export type SpecOrigin =
  /** A published OpenAPI/Swagger document was found online and saved verbatim. */
  | 'found-openapi'
  /** A non-OpenAPI machine spec (Swagger 2.0, Google Discovery, Postman, WSDL,
   *  GraphQL SDL) was found and converted to OpenAPI 3.x. */
  | 'converted'
  /** No machine spec existed; the OpenAPI was authored from the vendor's docs
   *  (a "documenting pass"), covering the endpoints the adaptor calls. */
  | 'generated'
  /** The adaptor has no external REST API (protocol/util/internal); the spec is
   *  synthesized from the adaptor's own operation surface. */
  | 'synthesized';

/**
 * `source.json` — provenance for one adaptor's spec. Written alongside
 * `openapi.json` so a human (or a re-run of the loop) can see where the spec
 * came from and decide whether to refresh it.
 */
export interface SpecSource {
  adaptor: string;
  /** npm package the adaptor publishes as. */
  npm: string;
  origin: SpecOrigin;
  /** The upstream format before any conversion (e.g. 'openapi-3.1', 'swagger-2.0',
   *  'google-discovery', 'postman', 'graphql-sdl', 'docs', 'adaptor-surface'). */
  upstreamFormat: string;
  /** URLs consulted: the spec URL and/or the docs pages scraped. */
  sources: string[];
  /** ISO date (YYYY-MM-DD) the spec was captured. */
  capturedAt: string;
  /** Free-text notes: coverage scope, caveats, what was omitted. */
  notes?: string;
}

/** One adaptor's row in the aggregate manifest. */
export interface ManifestEntry {
  adaptor: string;
  npm: string;
  rest: boolean;
  hasOpenapi: boolean;
  hasDataSchemas: boolean;
  origin?: SpecOrigin;
  upstreamFormat?: string;
  /** Number of path+method operations in the OpenAPI spec. */
  operations?: number;
  /** Number of top-level component schemas in the OpenAPI spec. */
  schemas?: number;
  /** Number of standalone data-object files extracted (closure of resources). */
  dataObjects?: number;
  /** Number of those that are top-level response resources. */
  resources?: number;
  capturedAt?: string;
  note?: string;
}

export interface Manifest {
  generatedAt: string;
  source: string;
  totals: {
    adaptors: number;
    withOpenapi: number;
    withDataSchemas: number;
    dataObjects: number;
    byOrigin: Record<string, number>;
  };
  adaptors: ManifestEntry[];
}
