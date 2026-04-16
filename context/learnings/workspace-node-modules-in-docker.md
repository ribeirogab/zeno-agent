---
tags:
  - learning
  - docker
  - pnpm
  - gotcha
created: 2026-04-16
---
# Each pnpm workspace's `node_modules` needs to land in the runtime Docker image

pnpm workspaces create a symlink farm. When you depend on `@zeno/storage` from `apps/worker`, pnpm puts a symlink at `apps/worker/node_modules/@zeno/storage` → `../../packages/storage`. At runtime, Node resolves `@zeno/storage` from `apps/worker/node_modules/` (closest to the importing file).

The gotcha in Docker multi-stage: copying only the root `node_modules/` from the `deps` stage into `runtime` is **not enough**. Each workspace's own `node_modules/` has the symlinks Node needs. If they're missing, the import fails with `ERR_MODULE_NOT_FOUND` at boot — the package exists on disk but the resolution path doesn't.

## Context

Hit this in Phase A task 1.7 (first Dockerfile refactor with the monorepo). The boot error was:
```
Error: Cannot find module '@zeno/logger' imported from /app/apps/worker/dist/index.js
```
even though `/app/packages/logger/dist/index.js` existed. Root cause: the runtime stage had `/app/node_modules/` but not `/app/apps/worker/node_modules/`.

Same pattern re-applied in each subsequent Dockerfile update (Task 2.2 when api was added, Task 5.9 for dashboard).

## How to Apply

In the `runtime` stage of `infra/Dockerfile`, for every workspace you want to run, copy **both** its `dist/` (built code) **and** its `node_modules/` (symlink farm) from the builder stage:

```dockerfile
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/storage/dist ./packages/storage/dist
COPY --from=builder /app/packages/storage/package.json ./packages/storage/
COPY --from=builder /app/packages/storage/node_modules ./packages/storage/node_modules
# ... same pattern for each workspace ...
```

**Exception**: workspaces that are static build artifacts (like `apps/dashboard/dist/` served by the api) don't need their `node_modules/` at runtime. The dashboard's assets are consumed as static files, not require()'d.

## Gotcha within the gotcha

`packages/<name>/node_modules/` may or may not exist depending on whether the package has its own deps that pnpm didn't hoist. If it doesn't exist, the `COPY` line fails the build. Handling:
- Either use `COPY --from=builder /app/packages/<name>/node_modules ./packages/<name>/node_modules/` (trailing slash tolerates missing source)
- Or add a trivial dep to the package so the dir always exists.

We've always had enough per-workspace deps to make this non-issue, but keep it in mind when creating a new leaf package.

## Detection

`ERR_MODULE_NOT_FOUND` for a workspace package at container boot. Almost always this.
