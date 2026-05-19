---
tags:
  - learning
  - api
  - testing
related:
  - "[[../specs/2026-04-16-dashboard-crud/spec-dashboard-crud|spec 0013]]"
  - "[[../specs/2026-04-16-dashboard-logs/spec-dashboard-logs|spec 0014]]"
created: 2026-04-16
---
# Every new AppDeps field is a sweep of the api test files

`apps/api/src/server.ts`'s `createApp({ config, db, cronRepo, cronRunRepo, commandRepo, logRepo, claudeHome, profileDir, spaDir })` is the single entry point for the Hono app. Every test file builds its own `makeApp(db)` helper that calls `createApp`. Adding a new required field to `AppDeps` means updating **every** test file that uses it — currently 12 files under `apps/api/tests/`.

Forgetting even one test file is a typecheck failure that the next task inherits as a red tree.

## Context

Happened repeatedly through Phase B and C as new repos got injected:
- Phase B task 3.1 added `cronRepo` + `cronRunRepo` → 5 test files updated.
- Phase B task 3.2 added `commandRepo` → 6 files updated (5 prior + the new crons test).
- Phase B task 4.2 added `claudeHome` → 7 files.
- Phase B task 5.2 added `profileDir` → 8 files.
- Phase C task 4.1 added `logRepo` → 9 files.

Each task's subagent brief had to say "also update these N test files". Never just "add the field".

## How to Apply

- **When adding a new field to `AppDeps`**, grep for `createApp({` across `apps/api/tests/` and update each site in the same commit. Miss one → red tree → the next task's subagent has to decipher the stale error.
- **Template for the update**: find the test file's `makeApp` helper (or inline `createApp` call); add `<fieldName>: <sensible-default>` in the options object. Sensible defaults used so far:
  - `cronRepo` / `cronRunRepo` / `commandRepo` / `logRepo`: `new <Repo>(database)` with the test's DB.
  - `claudeHome` / `profileDir` / `spaDir`: `/tmp` or a per-test `mkdtempSync`.
- **Alternative worth considering (not done yet)**: extract a shared `makeTestApp(database, overrides?)` helper into `apps/api/tests/helpers/app.ts` and import it everywhere. Would isolate the field-growth pain to one place. Future cleanup spec candidate if this becomes a recurring source of friction.

## Detection

```bash
cd apps/api && pnpm typecheck 2>&1 | grep "createApp"
```

Missing field = explicit error like "`Property 'logRepo' is missing in type ...`". Easier than guessing.
