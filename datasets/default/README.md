# default dataset

A snapshot of the built-in seed data, generated from `src/systems/*/seed.ts` via
`pnpm snapshot-default`. It documents each system's shape and is the few-shot
template used by `pnpm generate-seed`.

**The running server does not load these files for `default`** — it seeds `default`
directly from the TypeScript seeds (so timestamps are always fresh). To change the
default data, edit the `seed.ts` files, not this folder. To generate a *new* dataset,
see the "Seed datasets" section of the top-level README.
