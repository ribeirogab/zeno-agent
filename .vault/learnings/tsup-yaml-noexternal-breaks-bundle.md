---
tags:
  - learning
related:
  - "[[tsup-bundle-symlinked-cli]]"
  - "[[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile]]"
created: 2026-05-21
---
# tsup's bundle of `yaml` breaks at runtime — keep it external

Adding `yaml` to `noExternal` in `apps/cli/tsup.config.ts` produces a bundle that crashes at runtime with `Error: Dynamic require of "process" is not supported`. The `yaml` package's CJS internals call `require('process')` at module-init time; tsup's CJS-to-ESM wrap inlines a `__require2` shim that explicitly throws for dynamic requires. The bundle ships, the build is "successful", and every command crashes on the FIRST import of `@zeno/knowledge` (which transitively imports `yaml`).

## Context

Discovered while wiring `@zeno/knowledge` into the CLI bundle for spec [[../specs/2026-05-20-knowledge-folder-per-profile/spec-knowledge-folder-per-profile|2026-05-20-knowledge-folder-per-profile]]. Naively followed the pattern from [[tsup-bundle-symlinked-cli]] and added `'@zeno/knowledge'` AND `'yaml'` to `noExternal`. The bundle built fine; `node dist/index.js knowledge --help` died immediately:

```
Error: Dynamic require of "process" is not supported
    at file:///.../apps/cli/dist/index.js:12:9
    at .../yaml/dist/compose/composer.js
```

Removing `'yaml'` from `noExternal` and adding it as a direct dep of `apps/cli/package.json` fixed the issue: the bundle now imports `'yaml'` at runtime via standard Node resolution, which is fine because pnpm hoists `yaml` somewhere reachable from `apps/cli/node_modules`.

## How to Apply

When a new workspace package brings a transitive runtime dep that you also bundle into a tsup CLI:

1. **Keep the transitive dep external** (do NOT add it to `noExternal`).
2. **Add the transitive dep as a direct dependency** of the CLI's `package.json` so resolution doesn't depend on pnpm hoisting accidents.
3. Verify with `node dist/index.js --help` (not just `tsup` exit code) before declaring victory — tsup's "Build success" message is not a runtime guarantee.

The general rule: only put packages in `noExternal` that you have personally verified survive tsup's CJS-to-ESM wrapping. Pure ESM packages are safe. CJS packages that init via `require('process')`, `require('os')`, etc. are not.
