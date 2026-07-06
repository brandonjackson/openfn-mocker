# specs/adaptors/ — per-adaptor API spec registry

An automatically-maintained registry of OpenAPI specs, one per OpenFn adaptor,
plus the standalone **data-object schemas** each API exposes. Driven by
`pnpm specs` (`src/spec-registry/`). Intentionally self-contained so it can move
to its own repo later.

## Goal

Keep an up-to-date, standard **OpenAPI 3.x** spec for every adaptor in
[OpenFn/adaptors](https://github.com/OpenFn/adaptors), and from each spec extract
the **data objects** the system returns as a set of clean, standalone JSON
Schema files.

The data-object schemas are deliberately kept free of any mocker/seed-specific
shape. They serve two independent consumers, and neither should leak into the
other:

1. **Seed-data generation** (in mocker): assembles a seed dump
   (`{ collection: { id: record } }`, see `src/datasets.ts`) from these objects
   at generation time. That mapping lives in the mocker generation code, not
   in these files.
2. **Lightning tooling**: expected trigger payloads, data-mapping, type-checking
   and testing — all built on "what the data coming in looks like". This needs
   the object types to be pristine, which is why the seed envelope is not baked
   in here.

## Layout

```
specs/adaptors/
  _adaptors.json          cached adaptor list from openfn/adaptors
  manifest.json           aggregate coverage index (pnpm specs manifest)
  <adaptor>/
    openapi.json          the OpenAPI 3.x spec (found, converted, or generated)
    source.json           provenance: origin, upstream format, source URLs, date
    data-schemas/         one standalone JSON Schema per data object
      <Object>.json       e.g. Patient.json, Observation.json
      index.json          lists the objects + which are top-level resources
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
pnpm specs status                     # who has openapi.json + data-schemas/
pnpm specs missing                    # adaptors with no OpenAPI spec
pnpm specs instructions <a|--missing> # per-adaptor agentic work order (the finding step)
pnpm specs data-objects <a|--all>     # extract standalone data-object schemas
pnpm specs manifest                   # rebuild manifest.json
```

The **finding step is agentic**: `pnpm specs instructions` emits a precise work
order (which endpoints the adaptor calls, where to look for a spec, the required
OpenAPI shape, and where to save the files). An AI agent — or a human — executes
it, doing the web research a fixed scraper can't. The tool handles the
deterministic parts: listing, status, data-object extraction, and the manifest.

## Data objects

`pnpm specs data-objects` writes `data-schemas/<Object>.json` — one file per
data object — from `openapi.json`. The object set is the transitive `$ref`
closure of the API's **response resources**: every domain object an operation
returns, plus every nested type those objects reference. Request-body wrappers
and error shapes that aren't part of a returned resource are excluded.
`index.json` lists every object and flags which are top-level resources (vs.
nested types).

Each file is **JSON Schema 2020-12** (OpenAPI 3.0-isms like `nullable` are
normalised), self-identifying via `$id`/`title`/`x-openfn-adaptor`, with an
`x-source` pointer back to the originating `components.schemas` entry, and with
internal refs rewritten to sibling files (`{"$ref": "Organization.json"}`). The
verbatim OpenAPI form of every schema still lives in `openapi.json`, so both
dialects are available. Re-running the command rewrites `data-schemas/` from
scratch, so a shrunk object set leaves no stragglers.
