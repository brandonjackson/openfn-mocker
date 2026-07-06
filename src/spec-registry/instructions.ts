import type { AdaptorInfo } from './adaptors.js';
import { openapiPath, seedSchemaPath, sourcePath } from './paths.js';

/**
 * The "finding" step is deliberately agentic: this module does not scrape the
 * web itself. It emits a precise, self-contained work order that an AI agent
 * (or a human) executes to produce one adaptor's spec. The loop driver prints
 * one of these per missing adaptor; the agent does the research and writes the
 * files described here.
 *
 * Keeping the intelligence in the agent (rather than a brittle scraper) is the
 * whole point — vendor docs vary wildly, and an agent can read a docs site,
 * recognise a Swagger/Postman/Discovery doc, or author a faithful subset from
 * prose, where a fixed parser cannot.
 */
export function instructionsFor(adaptor: AdaptorInfo): string {
  const { name, npm, rest, note } = adaptor;
  const lines: string[] = [];

  lines.push(`# Spec work order: ${name}`);
  lines.push('');
  lines.push(`Adaptor: ${name}  (npm: ${npm})`);
  if (!rest) lines.push(`Classification: NON-REST — ${note}`);
  lines.push('');
  lines.push('## Goal');
  lines.push(
    'Produce an OpenAPI 3.x document describing the external API this adaptor talks to, ' +
      'covering (at minimum) every endpoint the adaptor actually calls. Then derive the ' +
      'seed-data schema mocker needs. Save three files:'
  );
  lines.push('');
  lines.push(`  - ${openapiPath(name)}`);
  lines.push(`  - ${sourcePath(name)}`);
  lines.push(`  - ${seedSchemaPath(name)}   (or run \`pnpm specs seed-schema ${name}\` after)`);
  lines.push('');
  lines.push('## Step 1 — understand what the adaptor calls');
  lines.push(
    'Read the adaptor surface from the CDN (no auth): these tell you which endpoints matter.'
  );
  lines.push(`  - https://cdn.jsdelivr.net/npm/${npm}/ast.json          (public operations)`);
  lines.push(`  - https://cdn.jsdelivr.net/npm/${npm}/types/index.d.ts   (re-exported namespaces)`);
  lines.push(`  - https://github.com/OpenFn/adaptors/tree/main/packages/${name}  (source, README, docs)`);
  lines.push('');
  lines.push('## Step 2 — find an existing machine spec (preferred)');
  lines.push('Search for an official spec, in this order of preference:');
  lines.push('  1. OpenAPI 3.x (JSON or YAML) — save verbatim. origin="found-openapi".');
  lines.push('  2. Swagger 2.0, Google API Discovery doc, Postman collection, WSDL, or GraphQL SDL');
  lines.push('     — save the converted OpenAPI 3.x. origin="converted", upstreamFormat=the source kind.');
  lines.push('Good hunting grounds: the vendor developer portal, apis.guru, the vendor GitHub org,');
  lines.push('SwaggerHub, and Postman public workspaces. Verify the spec matches the endpoints from Step 1.');
  lines.push('');
  lines.push('## Step 3 — if no machine spec exists, do a documenting pass');
  lines.push(
    'Read the vendor API docs and author a focused OpenAPI 3.x by hand, covering the endpoints ' +
      'from Step 1. Prefer a faithful subset over a sprawling vendored document. origin="generated", ' +
      'upstreamFormat="docs", and list the docs URLs you used in sources[].'
  );
  if (!rest) {
    lines.push('');
    lines.push('## Non-REST note');
    lines.push(
      'This adaptor has no vendor REST API. Synthesize an OpenAPI 3.x document from the adaptor ' +
        'surface (Step 1): model each public operation as a path (e.g. POST /sql for query(), ' +
        'POST /upload for a file put) with request/response schemas that reflect the operation ' +
        'arguments and return shape. origin="synthesized", upstreamFormat="adaptor-surface".'
    );
  }
  lines.push('');
  lines.push('## OpenAPI requirements');
  lines.push('  - openapi: "3.0.3" (or 3.1.0). info.title, info.version, info.description set.');
  lines.push(`  - info.x-openfn-adaptor: "${name}" so the file is self-identifying.`);
  lines.push('  - servers[0].url: the real API base URL (or a mock placeholder for synthesized specs).');
  lines.push('  - Each operation: an operationId, a 2xx response, and a JSON response schema.');
  lines.push('  - Reusable resource shapes under components.schemas (these become seed collections).');
  lines.push('  - Valid JSON. Keep it focused; do not vendor multi-megabyte specs — subset them.');
  lines.push('');
  lines.push('## source.json shape');
  lines.push(
    JSON.stringify(
      {
        adaptor: name,
        npm,
        origin: rest ? 'found-openapi | converted | generated' : 'synthesized',
        upstreamFormat: rest ? 'openapi-3.1 | swagger-2.0 | google-discovery | postman | docs' : 'adaptor-surface',
        sources: ['https://…'],
        capturedAt: 'YYYY-MM-DD',
        notes: 'coverage scope and caveats',
      },
      null,
      2
    )
  );
  lines.push('');
  lines.push('## Step 4 — seed schema');
  lines.push(
    `After openapi.json exists, run \`pnpm specs seed-schema ${name}\` to derive the seed-data ` +
      'schema from the response component schemas. Review it; hand-edit if the resource set is off.'
  );

  return lines.join('\n');
}
