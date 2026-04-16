---
tags:
  - learning
  - tooling
  - pnpm
related:
  - "[[../specs/0005-database-foundation/spec|spec 0005]]"
created: 2026-04-16
---
# Use `pnpm.onlyBuiltDependencies` to allow native module builds non-interactively

pnpm v10+ blocks postinstall scripts by default for security. Native modules like `better-sqlite3` need their build script to compile or download a prebuilt binary. Without it: `pnpm install` succeeds but the package is unusable at import time.

The fix is *not* `pnpm approve-builds` (which is interactive and writes a per-machine answer file). It's a static field in `package.json` that works in CI, in Docker, and on every contributor's machine without prompts.

## Context

Discovered during spec 0005 when adding `better-sqlite3`. First boot of the dev container failed with `Could not locate the bindings file` because the native binary was never built. `pnpm approve-builds` worked locally but was interactive — wrong for Docker.

## How to Apply

Add to `package.json`:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "other-native-package"]
  }
}
```

Lock down the list to packages you've explicitly vetted. Avoid using `*` or anything that allows arbitrary postinstall scripts — defeats the security default. Re-run `pnpm install` after editing.

For pre-built binaries (most native modules these days, including better-sqlite3), this just allows the download step. Actual compilation is rare.
