# specs/adaptors/ — per-adaptor API spec registry

An automatically-maintained registry of OpenAPI specs, one per OpenFn adaptor,
plus the seed-data schema mocker needs for each. Driven by `pnpm specs`
(`src/spec-registry/`). This is intentionally self-contained so it can move to
its own repo later.

## Goal

Keep an up-to-date, standard **OpenAPI 3.x** spec for every adaptor in
[OpenFn/adaptors](https://github.com/OpenFn/adaptors), and from each spec derive
a **seed-data schema** describing the records mocker must hold to impersonate
that system.

## Layout

```
specs/adaptors/
  _adaptors.json          cached adaptor list from openfn/adaptors
  manifest.json           aggregate coverage index (pnpm specs manifest)
  <adaptor>/
    openapi.json          the OpenAPI 3.x spec (found, converted, or generated)
    source.json           provenance: origin, upstream format, source URLs, date
    seed-schema.json      OpenAPI-format schema for the seed data mocker needs
```

`source.json.origin` is one of:

| origin           | meaning                                                              |
| ---------------- | -------------------------------------------------------------------- |
| `found-openapi`  | an official OpenAPI 3.x doc was found online and saved verbatim      |
| `converted`      | another machine spec (Swagger 2.0 / Discovery / Postman / WSDL / GraphQL) was converted to OpenAPI 3.x |
| `generated`      | no machine spec existed — authored from the vendor docs (documenting pass) |
| `synthesized`    | non-REST adaptor (DB / protocol / internal) — modelled from the adaptor's own operation surface |

## The loop

```
pnpm specs list                       # adaptor list from openfn/adaptors (cached)
pnpm specs status                     # who has openapi.json + seed-schema.json
pnpm specs missing                    # adaptors with no OpenAPI spec
pnpm specs instructions <a|--missing> # per-adaptor agentic work order (the finding step)
pnpm specs seed-schema <a|--all>      # derive seed schema from openapi.json
pnpm specs manifest                   # rebuild manifest.json
```

The **finding step is agentic**: `pnpm specs instructions` emits a precise work
order (which endpoints the adaptor calls, where to look for a spec, the required
OpenAPI shape, and where to save the files). An AI agent — or a human — executes
it, doing the web research a fixed scraper can't. The tool handles the
deterministic parts: listing, status, seed-schema derivation, and the manifest.

## Seed schema

`seed-schema.json` is an OpenAPI 3.0 document that re-declares the resource
schemas returned by the API and describes mocker's seed dump shape
(`{ collection: { id: record } }`, see `src/datasets.ts`) as a `SeedData`
schema, plus an `x-seed.collections` map from collection name to resource. It is
derived mechanically from `openapi.json`; hand-tune collection names or the
resource set where the heuristic guesses wrong.
