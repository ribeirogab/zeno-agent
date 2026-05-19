---
tags:
  - learning
  - typescript
  - tooling
created: 2026-04-16
---
# `moduleResolution`: `NodeNext` in packages, `Bundler` in apps

The project's root `tsconfig.base.json` sets `moduleResolution: "NodeNext"`. That's correct for **packages** (`@zeno/storage`, `@zeno/logger`) whose output will be consumed by Node at runtime — NodeNext requires explicit `.js` extensions on relative imports, which matches Node's native ESM resolution rules.

For **apps** (`apps/worker`, `apps/api`, `apps/dashboard`) the story is different:

- **`apps/worker`** and **`apps/api`** compile TS to JS and run the output with `node`. They *could* use `NodeNext`, but we override to `module: "ESNext"` + `moduleResolution: "Bundler"` so we can use path aliases (`@/foo`) without `.js` suffixes, and then run `tsc-alias --resolve-full-paths` during build to rewrite aliases to relative paths.
- **`apps/dashboard`** runs through Vite, not Node directly. `Bundler` is the correct setting — Vite handles resolution. NodeNext here would require `.js` suffixes on imports that Vite doesn't need.

## Context

This came up repeatedly in the Phase A/B/C implementation. Subagents unfamiliar with the project sometimes added `.js` suffixes to `@/` imports in `apps/worker/src/*` expecting NodeNext behavior, which is wrong — the override to `Bundler` handles those.

## How to Apply

- **New `packages/*`** (libraries): extend `tsconfig.base.json` directly. `NodeNext` applies. Use `.js` suffixes on all relative imports.
- **New `apps/*`** (deployable processes): extend the base, then override in its `tsconfig.json`:
  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "baseUrl": ".",
      "paths": { "@/*": ["./src/*"] }
    }
  }
  ```
- **Build script for Node apps** (`worker`, `api`) must include `tsc-alias --resolve-full-paths` to rewrite `@/foo` → relative paths + `.js` extensions at compile-time. Dashboard doesn't need this because Vite handles it.
- **Check before assuming**: run `grep moduleResolution apps/<name>/tsconfig.json` to know which mode the app is in before adding imports.

## Signal you got it wrong

- **Worker/API at runtime**: `ERR_MODULE_NOT_FOUND: Cannot find module '/app/apps/worker/dist/foo'` — missing `.js` at the import site OR `tsc-alias` not run. The moment you see this post-`docker:build`, check the build script.
- **Package at consumer time**: `Cannot find module '@zeno/storage/dist/repos/commands'` — missing `.js` in a relative import inside the package source. NodeNext rejected it silently at publish time.

## Related

- `packages/storage/src/index.ts` uses `.js` suffixes on every relative import.
- `apps/worker/tsconfig.json` overrides to Bundler + uses `@/` aliases.
- `apps/dashboard/tsconfig.json` is Bundler-mode with Vite plugin-generated `route-tree.gen.ts`.
