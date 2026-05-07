---
tags:
  - learning
  - reference
related:
  - "[[../specs/2026-05-07-zeno-cli/spec|Zeno CLI spec]]"
  - "[[citty-cli-gotchas]]"
created: 2026-05-07
---
# tsup must bundle deps for symlinked CLIs

For a CLI that gets symlinked into `~/.local/bin` from a workspace-managed `dist/index.js`, the bundle has to be **self-contained** — externalized `node_modules` won't resolve cleanly when invoked from arbitrary cwd.

## Context

Discovered while wiring `apps/cli` for spec `2026-05-07-zeno-cli`. The plan originally specified `external: []` (default tsup behavior, which still externalizes `node_modules` for ESM output). With that default, `dist/index.js` had `import { defineCommand } from 'citty'`. When the symlink at `~/.local/bin/zeno` is invoked from `/`, Node's module resolver walks up from the *real* file path (`$ZENO_HOME/apps/cli/dist/index.js`), not the symlink path, so `$ZENO_HOME/node_modules` does resolve. But this depends on:

1. The dist file living inside the workspace clone (true today; would break if anyone copies the bundle elsewhere).
2. `$ZENO_HOME/node_modules` actually containing `citty` (true after `pnpm install`, but fragile if someone runs `pnpm prune --prod` or moves the bundle).

The robust fix is `noExternal: ['citty']` — citty (and its zero deps) gets inlined into `dist/index.js`. Bundle size grows from ~20 B to ~33 KB; the runtime is now portable. Any other production dep added later should join the `noExternal` list unless there's a reason to keep it external.

## How to Apply

- For `apps/cli` and any future workspace-bundled CLIs, use `noExternal: ['citty', '<runtime-deps>']` in `tsup.config.ts`. Always.
- Only externalize node:* core modules (which tsup does automatically) and dev-only dependencies that won't be loaded at runtime.
- Verify after each new runtime dep: `cd / && node $ZENO_HOME/apps/cli/dist/index.js --help` should work even if `node_modules` is moved or pruned.
