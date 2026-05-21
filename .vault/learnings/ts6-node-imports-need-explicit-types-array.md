---
tags:
  - learning
related:
  - "[[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile]]"
created: 2026-05-21
---
# TS6 + `node:` imports need explicit `types: ["node"]` in fresh package tsconfigs

A brand-new workspace package with `@types/node` in `devDependencies` still fails `tsc` with `error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node?` until the package's `tsconfig.json` adds `"types": ["node"]` to `compilerOptions`. The TS6 behavior is to skip resolution of any specifier that "looks like an absolute URI" (e.g. `node:fs`, `node:path`) unless the types resolution picks up the node ambient declarations from somewhere — and a fresh package has nowhere for them to leak in from.

## Context

Surfaced while scaffolding `packages/knowledge` for spec [[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile|2026-05-20-knowledge-folder-per-profile]]. The package imports `node:fs`, `node:path`, and `node:os`. `tsc --noEmit` failed with TS2591 even though `@types/node` was listed in `devDependencies` and installed under `packages/knowledge/node_modules/@types/node`. The sibling package `@zeno/logger` does **not** declare `@types/node` directly and still typechecks fine — its `pino` dep pulls `undici-types` (which has triple-slash references that transitively register `node` as an ambient types package). The new package had no such transitive pull, so the node types never registered. Adding `"types": ["node"]` to `compilerOptions` makes the registration explicit.

## How to Apply

When scaffolding any new TypeScript package in this monorepo:

1. List `@types/node` in `devDependencies`.
2. In `tsconfig.json` add `"types": ["node"]` to `compilerOptions` — do not rely on transitive type pickup.

Diff of the minimum-viable `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

Existing packages that happen to typecheck without this line do so by accident; if their transitive types dep ever drops node, they will break the same way.
