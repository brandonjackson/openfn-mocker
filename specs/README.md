# specs/ — reference documents

These OpenAPI / JSON-schema files are **reference material for authoring and
reviewing mocks**: focused subsets of each real API covering the endpoints the
OpenFn adaptor calls. They are *not* runtime configuration — a plugin's routes
are hand-written Fastify handlers, and nothing loads these files automatically.
(One plugin, mailgun, chooses to load its spec at runtime for response shaping
via `loadSpec`/`parseSpec`; that is the exception, not the pattern.)

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
