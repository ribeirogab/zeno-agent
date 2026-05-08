---
status: draft
feature: unify-db-as-drizzle
created: 2026-05-08
shipped: null
---
# Unify DB Stack as Drizzle — Spec

**Status:** Draft
**Scope:** Migrate the runtime DB layer (`@zeno/storage`, raw `better-sqlite3`, 14 class-repos) into `@zeno/db/runtime` (drizzle), eliminating the dual SQL convention so the repo runs a single ORM across host (CLI) and runtime (worker/api) databases.

## Context

The repo currently ships two SQL conventions:

- `@zeno/db/host` — drizzle ORM for the host SQLite (`~/.zeno/state.db`), used by `apps/cli`. Introduced by [[../2026-05-07-multi-profile-cli/spec-multi-profile-cli|multi-profile-cli]].
- `@zeno/storage` — raw `better-sqlite3` with hand-rolled `prepare/run/all`, used by `apps/worker` and `apps/api` for the runtime SQLite (`~/.zeno/profiles/<name>/runtime.db`).

Dual conventions were acceptable while multi-profile-cli was in flight, but always temporary. After unification:

- Single mental model for SQL across the codebase.
- One migration tooling path (`drizzle-kit generate`).
- Schema-as-code for runtime DB, with typed query builders replacing manual `as SessionRow` row casts and hand-written `rowToSession` mappers.

Triggered by issue [#44](https://github.com/ribeirogab/zeno-agent/issues/44). The owner is the only operator today, so no live-data-preservation constraint applies — wipe-and-recreate is acceptable for dev profiles. The encryption module from [[../../learnings/]] (spec 0071, AES-256-GCM envelope) must survive the move with byte-identical behavior.

## Problem Statement

Two SQL conventions in one repo permanently. Every runtime-schema change forces the contributor to switch mental models between drizzle (host) and raw better-sqlite3 (runtime); tooling differs (`drizzle-kit generate` vs hand-edit `migrations.ts`). The runtime DB layer also lacks typed query results: rows are cast manually via `as SessionRow` and converted with hand-written mappers in every repo.

## Non-Goals

- **Host DB changes.** `@zeno/db/host` is already drizzle. Untouched.
- **`@zeno/crypto` standalone package.** Crypto helpers stay inside `@zeno/db/runtime` since only `connectors` and `backend-credentials` repos consume them. Promote to a separate package when a third consumer appears.
- **Performance benchmarks.** No before/after micro-benchmarks for hot paths. Drizzle uses prepared statements internally; we trust that until prod regression is observed and fall back to `sql\`raw\`` inline at the affected method if needed.
- **Multi-DB support.** SQLite-only. No Postgres/MySQL preparation in schema or config.
- **Data preservation across upgrade.** Existing dev profiles must be deleted and recreated post-merge. No legacy bootstrap shim, no schema-drift verification, no `__drizzle_migrations` backfill for legacy DBs.
- **Slicing into multiple PRs.** Big-bang single PR.
- **Touching dashboard, docs, web, cli apps.** They do not consume `@zeno/storage` directly.
- **New tables, columns, indexes, or features.** Spec scope is unifying the existing runtime DB layer; no schema additions ride along. The one explicit subtraction is the dead `connector_secrets.value` (legacy nullable plaintext) column, retired together with the `migrateConnectorSecretsEncryption` helper — it is not part of the new baseline schema.
- **Promoting `migrateConnectorSecretsEncryption` data migration.** Decided dropped — its idempotent steady-state has been zero rows on every existing profile and the function is dead code in the new layout.

## Constraints

- **Stack:** TypeScript strict, Node 24 LTS, pnpm + Turborepo. Drizzle pinned at the exact same version as `@zeno/db/host` currently uses (`drizzle-orm@^0.45.2`, `drizzle-kit@^0.31.10`).
- **Encryption:** AES-256-GCM via Node `crypto` (spec 0071) — `encrypt`, `decrypt`, `EncryptedBlob` exported with byte-identical behavior. HKDF salt and `info` strings unchanged so existing-profile master keys (in dev) still round-trip if reused.
- **Public API parity:** the 14 class-repos exported by `@zeno/storage` (`SessionRepo`, `LogRepo`, `CommandRepo`, `ConnectorRepo`, `ConnectorAppRepo`, `ConnectorSkillRepo`, `CronRepo`, `CronRunRepo`, `CronConnectorRepo`, `CronSkillRepo`, `BackendCredentialsRepo`, `BackendSettingsRepo`, `AgentCapabilityRepo`, `SkillRepo`) must keep their constructor signatures and method signatures unchanged. Callers (~83 files across worker, api, tests) update only the import path: `@zeno/storage` → `@zeno/db/runtime`. The 14 repos collectively cover 17 SQLite tables (`ConnectorRepo` alone owns 4: `connectors`, `connector_secrets`, `connector_tool_permissions`, `connector_invocations`).
- **Idempotent boot:** `runRuntimeMigrations` and `seedDefaultConnectors` must be safe to invoke on every boot. Both worker and api invoke them; SQLite serializes via drizzle's transaction lock.
- **Single-PR cap:** all changes (schema authoring, baseline generation, repo port, callers, tests, deletion of `@zeno/storage`) ship in one PR.

## User Stories / Scenarios

1. **Maintainer adds a runtime-schema column.** Edits `packages/db/src/runtime/schema.ts`, runs `pnpm db:runtime:generate`, drizzle-kit produces `0001_<name>.sql` plus updated `meta/_journal.json` and `meta/0001_snapshot.json`. Worker boot applies the new migration idempotently next start.
2. **Operator upgrades zeno after merge.** `zeno upgrade` rebuilds the image. On `zeno start <profile>`, worker boot fails because the legacy `runtime.db` schema collides with the drizzle baseline. Operator reads CHANGELOG, runs `zeno profile delete <profile> && zeno profile create <profile>`, restarts. Dashboard and Slack channel come up clean.
3. **Worker boot, fresh profile.** `runtime.db` does not exist. `openRuntimeDatabase` creates the file. `runRuntimeMigrations` applies `0000_baseline.sql` and inserts a row in `__drizzle_migrations`. `seedDefaultConnectors` upserts catalog defaults (Playwright). Repos instantiate. Slack channel ready to accept mentions.
4. **Worker boot, profile previously created on this build.** Same code path as #3; `migrate()` no-ops because `__drizzle_migrations` lists the baseline. `seedDefaultConnectors` upserts (idempotent — zero net inserts). Repos instantiate.
5. **Slack mention end-to-end.** User mentions `@zeno hello`. `SessionRepo.upsert(threadId, sessionId)` compiles drizzle's `INSERT … ON CONFLICT DO UPDATE`. `LogRepo.create` writes log lines. `CommandRepo` polls. Backend reasoning runs. Reply sent to Slack.
6. **API serves dashboard endpoint.** `GET /api/sessions` invokes `sessionRepo.list()` → drizzle `select().from(sessions).orderBy(desc(sessions.lastUsedAt))`. Response payload identical to current behavior.
7. **Connector secret encryption round-trip.** Operator saves a connector secret via dashboard. `ConnectorRepo.setSecret` calls `crypto.encrypt(masterKey, profileId, plaintext)` and inserts ciphertext + IV. On agent invocation, `getSecret` decrypts and returns plaintext.
8. **Test suite run.** `pnpm run quality-gate` invokes vitest in `packages/db`, `apps/worker`, `apps/api`. Tests use the migrated `makeTestDb` helper (drizzle in-memory DB) and pass.

## Architecture

```
packages/db/
  src/
    host/                          ← unchanged
    runtime/                       ← NEW
      index.ts                     ← public exports for `@zeno/db/runtime`
      schema.ts                    ← canonical drizzle schema, all 17 runtime tables
      crypto.ts                    ← AES-256-GCM helpers (moved from @zeno/storage, byte-identical)
      seed.ts                      ← seedDefaultConnectors(db), idempotent
      migrations/
        0000_baseline.sql          ← generated by `drizzle-kit generate`
        meta/
          _journal.json
          0000_snapshot.json
      repos/                       ← 14 class-repos, drizzle-backed, public-API-identical
        sessions.ts
        logs.ts
        commands.ts
        connectors.ts
        connector-apps.ts
        connector-skills.ts
        crons.ts
        cron-runs.ts
        cron-connectors.ts
        cron-skills.ts
        backend-credentials.ts
        backend-settings.ts
        agent-capabilities.ts
        skills.ts
    shared/                        ← unchanged
  drizzle.host.config.ts           ← unchanged
  drizzle.runtime.config.ts        ← NEW
  package.json                     ← `"./runtime"` export, new scripts, build copies migrations into dist
```

**`packages/db/package.json` build wiring (mirrors host pattern):**

- `exports`: add `"./runtime": { "types": "./dist/runtime/index.d.ts", "import": "./dist/runtime/index.js" }`.
- `scripts.build`: chain `tsc -b && pnpm run copy-migrations` (existing) **plus** a new `copy-runtime-migrations` step: `rm -rf dist/runtime/migrations && cp -R src/runtime/migrations dist/runtime/migrations`. Without this, `migrate()` throws "no such file" in any non-test execution because worker and api both run from `dist/`.
- `scripts.db:runtime:generate`: `drizzle-kit generate --config drizzle.runtime.config.ts`.
- `scripts.db:runtime:check`: `drizzle-kit check --config drizzle.runtime.config.ts`.

`packages/storage/` is deleted in the same PR.

**Boot flow (worker and api, identical):**

```ts
import {
  openRuntimeDatabase,
  runRuntimeMigrations,
  seedDefaultConnectors,
  SessionRepo, LogRepo, ConnectorRepo, /* ... */
} from '@zeno/db/runtime';

const { db, drizzle } = openRuntimeDatabase(profile.runtimePath);
runRuntimeMigrations(drizzle);          // idempotent — drizzle skips applied migrations
seedDefaultConnectors(drizzle);         // idempotent — onConflictDoNothing

const sessionRepo = new SessionRepo(drizzle);
const logRepo = new LogRepo(drizzle);
const connectorRepo = new ConnectorRepo(drizzle, { masterKey, profileId });
// ...remaining repos instantiated, injected into consumers
```

**Repo internals (example, `SessionRepo.upsert`):**

```ts
upsert(threadId: string, sessionId: string): void {
  this.db.insert(sessions)
    .values({ threadId, sessionId })
    .onConflictDoUpdate({
      target: sessions.threadId,
      set: { sessionId, lastUsedAt: sql`CURRENT_TIMESTAMP` },
    })
    .run();
}
```

Public method signature unchanged. `Buffer` ↔ SQLite `BLOB` mapped via drizzle column type `blob({ mode: 'buffer' })` for `connector_secrets.value_encrypted` and `iv`.

**Encryption flow (`ConnectorRepo` simplified):**

```ts
setSecret(connectorId, key, plaintext) {
  const { iv, ciphertext } = encrypt(this.masterKey, this.profileId, plaintext);
  this.db.insert(connectorSecrets)
    .values({ connectorId, key, valueEncrypted: ciphertext, iv })
    .onConflictDoUpdate({ target: [connectorSecrets.connectorId, connectorSecrets.key], set: { valueEncrypted: ciphertext, iv } })
    .run();
}
getSecret(connectorId, key) {
  const row = this.db.select().from(connectorSecrets)
    .where(and(eq(connectorSecrets.connectorId, connectorId), eq(connectorSecrets.key, key)))
    .get();
  return row ? decrypt(this.masterKey, this.profileId, row.iv, row.valueEncrypted) : null;
}
```

**Test infrastructure (`apps/worker/tests/connectors-e2e/helpers/test-db.ts`):**

```ts
export function makeTestDb(): TestDb {
  const { db, drizzle } = openRuntimeDatabase(':memory:');
  runRuntimeMigrations(drizzle);
  // Skip seed in tests that assert empty baselines
  return {
    db: drizzle,
    connectorRepo: new ConnectorRepo(drizzle, { masterKey: TEST_KEY, profileId: 'test' }),
    commandRepo: new CommandRepo(drizzle),
    agentCapabilityRepo: new AgentCapabilityRepo(drizzle),
    close: () => db.close(),
  };
}
```

## Error Handling

| Failure | Behavior |
|---|---|
| `openRuntimeDatabase` (FS error, locked file) | Throw `RuntimeDbOpenError` with the offending path. Worker boot logs and exits non-zero. |
| `runRuntimeMigrations` (SQL error) | Bubble up the raw drizzle error. Boot exits non-zero; operator inspects logs and recreates the profile. |
| Missing `ZENO_MASTER_KEY` | Caught by the existing zod env schema. Boot exits before the DB opens. |
| Decrypt failure (auth-tag mismatch) | `crypto.decrypt` throws; the calling repo catches and surfaces a `DecryptError` with `{ connectorId, key }`. Caller (`mcp-build` for connector secrets, `agent/credentials` for backend credentials) logs and marks the connector as `error` status; raw exception is not propagated to Slack replies. |
| Drizzle constraint violation | Bubble up unchanged. Repos do not silence (rule 12, fail noisily). |
| Concurrent `migrate()` from worker and api on same first boot | Drizzle's `migrate()` runs inside a SQLite transaction, which serializes writes. The second invocation observes the migration already applied and no-ops. Idempotency verified by an acceptance test. |

## Acceptance Criteria

- [ ] `packages/storage/` directory deleted; `@zeno/storage` no longer appears in any `dependencies` block, `pnpm-workspace.yaml`, or `tsconfig` reference.
- [ ] `packages/db/src/runtime/` exists with: `index.ts`, `schema.ts`, `crypto.ts`, `seed.ts`, `migrations/0000_baseline.sql`, `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`, and `repos/` containing exactly 14 files (one per repo enumerated in Constraints).
- [ ] `packages/db/package.json` exposes `"./runtime"` in `exports`, ships scripts `db:runtime:generate` and `db:runtime:check`, and the `build` script copies `src/runtime/migrations/` into `dist/runtime/migrations/` (parallel to the existing `copy-migrations` step for host).
- [ ] After `pnpm -F @zeno/db build`, the directory `packages/db/dist/runtime/migrations/` exists and contains `0000_baseline.sql` plus the `meta/` snapshots.
- [ ] `pnpm db:runtime:check` exits 0 (drizzle-kit reports schema and migrations are in sync).
- [ ] `grep -rE "from ['\"]@zeno/storage['\"]"` in `apps/` and `packages/` (including `packages/mcp-discover/`) returns zero matches.
- [ ] `grep -rE "from ['\"]better-sqlite3['\"]"` in `apps/` and `packages/` (excluding `packages/db/`) returns zero matches; the only direct consumer is inside `packages/db/`.
- [ ] All 14 class-repos exported by `@zeno/db/runtime` have constructor signatures and method signatures identical to their `@zeno/storage` counterparts: existing call sites compile after a mechanical import-path swap with no other changes (verified by TypeScript build with `--noEmit`).
- [ ] `pnpm run quality-gate` exits 0 on the PR branch (lint, typecheck, vitest across all workspaces).
- [ ] A vitest test asserts `runRuntimeMigrations` is idempotent: invoking it twice on a fresh `:memory:` DB yields exactly one row in `__drizzle_migrations` and zero diffs in `sqlite_master` between the two invocations.
- [ ] A vitest test asserts `seedDefaultConnectors` is idempotent: invoking it twice on a fresh `:memory:` DB produces zero net `connectors` row inserts on the second call.
- [ ] A vitest test ports `crypto.encrypt`/`crypto.decrypt` round-trip cases from `packages/storage/tests/crypto.test.ts` to `packages/db/tests/runtime/crypto.test.ts` with identical inputs and identical expected outputs.
- [ ] Manual smoke E2E recorded in PR description: commands run, output excerpts pasted: `zeno profile delete dev-test`, `zeno profile create dev-test --owner test`, `zeno start dev-test`, `@zeno hello` Slack mention with bot reply, `sqlite3 ~/.zeno/profiles/dev-test/runtime.db ".tables"` showing `__drizzle_migrations` populated and all 17 runtime tables present (`sessions`, `logs`, `commands`, `crons`, `cron_runs`, `cron_connectors`, `cron_skills`, `connectors`, `connector_secrets`, `connector_tool_permissions`, `connector_invocations`, `connector_apps`, `connector_skills`, `skills`, `agent_capabilities`, `backend_credentials`, `backend_settings`).
- [ ] CHANGELOG / release notes carry a `BREAKING (dev only)` entry instructing operators to delete and recreate every profile on this version.
- [ ] No file under `apps/` imports `prepare` or calls `.run()` / `.all()` / `.get()` on a raw `Database` (`better-sqlite3`) instance — only on drizzle query builders.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Big-bang PR is too large to review confidently. | Internal work order in commits (Authoring → Setup → Generate → Move crypto → Boot helpers → Repos by waves → Mass rename → Delete) keeps each commit focused. PR description links every commit to the work-order item. |
| Drizzle query ergonomics differ from raw better-sqlite3, breaking subtle behavior (e.g., `Buffer` column coercion, `CURRENT_TIMESTAMP` formatting, `ON CONFLICT` semantics with composite keys). | All repos have existing tests in `packages/storage/tests/` (mostly flat, a subset under `tests/repos/`); they port to `packages/db/tests/runtime/` and must pass with identical fixtures. Any behavior change forces a fix before merge. |
| Hot-path latency regression (logs.create, cron-runs.insert, sessions.upsert). | Accepted risk. If observed in dev usage post-merge, fall back to drizzle's `sql\`raw\`` template tag inline at the affected repo method without changing the public API. |
| Generated `0000_baseline.sql` differs from the live schema in profiles already on disk. | Wipe-and-recreate policy. Documented in CHANGELOG. No runtime detection needed. |
| Tests in `apps/worker/tests/` and `apps/api/tests/` rely on raw-SQL helpers (e.g., `db.prepare("DELETE FROM connectors WHERE slug = 'playwright'").run()` in `test-db.ts`). | Each such helper is migrated to drizzle (`drizzle.delete(connectors).where(eq(connectors.slug, 'playwright'))`) or replaced by not invoking `seedDefaultConnectors` in the test setup. |
| Existing `packages/storage/tests/` is mostly flat (only a subset under `tests/repos/`); plan-time enumeration could miss tests at the top level. | Plan task explicitly enumerates the full file list under `packages/storage/tests/` (flat + nested) and ports each one to the corresponding location under `packages/db/tests/runtime/`. |
| `crypto.ts` is no longer re-exported publicly, breaking an external caller missed in the audit. | Pre-deletion audit: `grep -rE "from ['\"]@zeno/storage['\"].*\b(encrypt\|decrypt\|EncryptedBlob)\b"` in `apps/` and `packages/`. Currently only repo internals consume it (confirmed in brainstorm). If audit finds an external consumer, re-export from `@zeno/db/runtime/index.ts`. |
| Drizzle version drift between host and runtime. | Pin runtime to the exact same drizzle and drizzle-kit versions as host. Single dependency entries in `packages/db/package.json` cover both subpaths. |
| Concurrent `migrate()` from worker and api on first boot. | Drizzle's `migrate()` runs inside a SQLite transaction; second invocation observes the migration already applied and no-ops. Verified by acceptance test. |
| 21 historical migrations consolidate into `0000_baseline.sql`, losing granular history. | Acceptable: no users, no data preservation requirement. Future migrations track granularly via drizzle from `0001` onward. |

## Open Questions

None — all design decisions resolved during brainstorm.
