# specs/ — reference documents

These OpenAPI / JSON-schema files are **reference material for authoring and
reviewing mocks**: focused subsets of each real API. A plugin's routes are
hand-written Fastify handlers, and nothing rewrites plugin behavior from these
files. Two opt-in runtime uses exist:

- **Response shaping** — mailgun loads its spec via `loadSpec`/`parseSpec` to
  shape event records.
- **The spec-backed fallback tier** — a plugin that sets `specFallback: true`
  has requests *no hand-written route matches* answered from its spec subset
  (schema-shaped, store-backed, tagged `fidelity: 'spec'` in the request log).
  Hand-written routes always win, so the spec extends the modeled surface but
  can never contradict it. See `src/engine/spec-fallback.ts` and
  `docs/decisions/001-long-tail-endpoint-coverage.md`.

For systems with fallback enabled, a spec earns its keep by covering
**documented endpoints the plugin does not model** — that is the long tail the
fallback serves. Give identity and envelope fields good `example` values: the
fallback's payloads are only as faithful as the spec's examples.

When authoring or extending a mock, pair a spec here with the **published
adaptor's own surface**, which is the source of truth for what the mock must
cover:

- `ast.json` — the adaptor's public operations, as published to npm, e.g.
  `https://cdn.jsdelivr.net/npm/@openfn/language-<name>/ast.json`
- `types/*.d.ts` — the TypeScript surface of the API-calling namespaces the
  adaptor re-exports (`http`, `fhir`, `tracker`, ...)

`pnpm audit:adaptors` reads exactly these sources to check that every
API-calling adaptor function has a usage example in the mock.

Keep specs focused: a faithful subset beats a vendored multi-megabyte document.
A plugin may point at its spec via `MockSystemPlugin.specFile` so maintainers
can find it; omitting both the file and the field is fine for systems whose
surface is simple or spec-less (http-generic).
