---
status: shipped
feature: github-app-v2-backend
created: 2026-04-27
shipped: 2026-04-27
---
# GitHub App v2 — Backend Foundation Spec

**Status:** Draft
**Scope:** Backend changes that unblock specs 0045/0046 to deliver the GitHub App v2 dashboard UI. New `connector_apps` table (atomic credential rotation), 1-shot SQL migration of existing 4 `github-app-*` rows, surgical mutations on `GitHubAppAuth` for hot-reload, dedicated install/test/discover/rotate endpoints under `/catalog/github-app/*`, JWT signing + GitHub API client extracted to a new `packages/github-app/` workspace, comprehensive test coverage including live GitHub API e2e tests, health check on `github-mcp-server` binary at boot.

This spec ships strictly behind 0043 (visual design) and is the foundation for 0045 (install + listing UI), 0046 (lifecycle UI). It is independent of 0047/0048.

## Brainstorm Q&A

User invoked `/brainstorming` and answered Q1-Q5 explicitly.

### Q1 — Modelo de dados: refatorar `connector_apps` ou manter dedup nas 5 reserved-key secrets?

**Decision: Option B — new `connector_apps` table.**

Rationale:
- Schema honesto: App é uma entidade única; modelar como tal evita o "miente" de 4 cópias do mesmo PEM.
- Atomic rotation: `UPDATE connector_apps SET pem = ? WHERE id = ?` é 1 write atômico vs 4 não-atômicos no shape antigo.
- Audit limpo: 1 entry "PEM rotated" em vez de 4 secret updates encadeados.
- Schema migration é única; trade-off único (~30 LOC SQL + test).
- Permite multi-app no futuro sem refactor (apenas `connector_apps.id` deixa de ser singleton).

### Q2 — Migração das 4 linhas existentes

**Decision: Option A — 1-shot SQL migration no boot.**

Rationale:
- Single user (operator) com 4 linhas conhecidas. Migration roda 1× no boot do worker, never again.
- Idempotente: checa se a linha em `connector_apps` já existe antes de inserir.
- Risco real (migration tem bug) é mitigado pelo backup do `.db` em volume Docker (`workspace-fn`).
- Lazy migration (Option B) duplicaria code paths permanentemente sem ganho real.
- Re-install manual (Option C) é fricção operacional gratuita.

### Q3 — Hot-reload do GitHubAppAuth

**Decision: Option B — surgical mutations, 5 métodos**:
- `addInstallation({name, id, envVar})` — append + mint inicial assíncrono
- `removeInstallation(name)` — drop, limpa cache, `delete process.env[envVar]`
- `renameInstallation(name, oldEnvVar, newEnvVar)` — preserva cache, só re-aliases env var
- `rotatePem(newPem)` — substitui chave em memória, invalida TODOS os caches
- `appUninstall()` — tear down completo (cache, env vars, refresh interval)

Rationale:
- Cada método tem semântica clara → testes isolados são naturais (cobre brechas 21+22)
- Preserva cache em mutations que não invalidam tokens (rename de env_var)
- Full reload (Option A) perde cache desnecessariamente
- Polling DB (Option C) tem latency baseline ruim e wasteful
- Roteamento dos handlers para os métodos é explícito no callsite (cada handler chama o método específico)

### Q4 — Cobertura de testes

**Decision: Option C — Unit + integration + e2e com GitHub API real.**

Rationale:
- Spec 0042 shippado SEM testes para o intercept ou install endpoint — gap real reconhecido pelo usuário.
- Unit only (Option A) perde bugs de wiring (handler → GitHubAppAuth).
- Unit+integration (Option B) cobre realistic surface mas perde contract bugs com a GitHub API.
- C catches API breaking changes (raros mas reais — GitHub mudou shapes em 2022).
- Trade-off da C aceito: 1-2 testes flaky em CI (network, secrets). Mitigação: tag `@live` que pode ser pulado em CI ofuscado e rodado manualmente em pre-release.

### Q5 — JWT signing + GitHub API client: onde mora?

**Decision: Option B — extract to `packages/github-app/`.**

Rationale:
- Single source of truth (worker + api precisam dos mesmos building blocks).
- `GitHubAppAuth` (worker) vira wrapper stateful em cima de funções stateless da package.
- Padrão já estabelecido no monorepo (`mcp-discover`, `storage`, `logger`).
- Testes centralizam num único set de mock-fetch.
- Duplicate (Option A) eventualmente diverge.
- Cross-process (Option C) é overengineering pra single-process scenario.

## Context

After spec 0042 shipped (commit `dcfcd2a`), 4 `github-app-*` connectors live on the `fn` profile DB with all 5 reserved-key secrets duplicated per row. The dashboard has no UI for managing them; spec 0043 defined that visual design across 10 artboards. This spec implements the **backend foundation** that 0045/0046 will drive from the UI.

Beyond schema cleanup and hot-reload, this spec also extracts JWT signing into a shared package — both the worker (token cache) and the API (install/test/discover endpoints) need the same primitives. Current state: `apps/worker/src/github/app-auth.ts` owns everything; API has no access.

## Problem Statement

The backend can't currently support the v2 dashboard UI:
1. No atomic PEM rotation (would be 4 writes, not 1).
2. No hot-reload of `GitHubAppAuth` after dashboard mutations (operator must restart container).
3. No install-time JWT validation (user can install garbage and only find out at runtime).
4. No auto-discover endpoint (`GET /app/installations` not exposed via the API layer).
5. No way to mint installation tokens from the API process (PEM only readable in worker).
6. Refresh-tools button broken on `github-app-*` connectors (calls `discoverTools` with raw secrets that get stripped, leaving no `GITHUB_PERSONAL_ACCESS_TOKEN`).
7. No tests for the github-app intercept in `mcp-build.ts` or the install endpoint (regression magnet).

This spec resolves all of the above before any UI work begins.

## Non-Goals

1. **UI implementation** (specs 0045/0046).
2. **always_sensitive table refactor** (spec 0047).
3. **Klaviyo classification override** + log noise reduction + dashboard refresh-failure surfacing (spec 0048).
4. **Multi-App support.** Single App per Zeno install. The schema (`connector_apps` as a row, not a singleton) leaves the door open but v1 enforces 1.
5. **OAuth App flow.** Different auth model; future spec.
6. **App-level uninstall UI.** A new modal (`M12 — Uninstall App confirm`) is needed in spec 0046, but the backend handler is in scope here (`appUninstall()` method).
7. **Encryption-at-rest for PEM.** Same security model as other secrets (plain in DB). Tracked as a separate hardening spec.

## Constraints

- **Backward compatibility window: zero.** Migration is 1-shot at boot. The yaml fallback in `loadGitHubAppFromYaml` is removed (the `fn` profile yaml was already moved to `tmp/legacy-github-app/` in spec 0042; no other profile uses it).
- **Sequential dependency on spec 0043.** Visual SOT for artboards exists before this spec ships.
- **No breaking changes to existing `connector_*` shape.** New columns are additive: `connectors.app_id` is added as nullable FK. Standard catalog connectors leave it null.
- **Single transaction** for all multi-write operations: install (creates `connector_apps` row + N connector rows + N×3 secret rows in one BEGIN…COMMIT), uninstall (cascade via FK).
- **Public/secret distinction in schema.** New column `connector_secrets.is_public BOOLEAN DEFAULT false`. App ID becomes a secret with `is_public=true`. UI uses this flag to skip masking. (Alternative considered: separate `connector_app_config` table for non-secret App data. Rejected: smaller schema delta to keep public flag.)
- **JWT signing isolated.** New `packages/github-app/` exports stateless functions; no caching or timer logic in the package. `GitHubAppAuth` (worker) wraps it.

## Schema Changes

### New table: `connector_apps`

```sql
CREATE TABLE connector_apps (
  id              TEXT PRIMARY KEY,                  -- UUID
  catalog_id      TEXT NOT NULL,                     -- 'github-app' for now (multi-app future)
  app_id          TEXT NOT NULL,                     -- '12345'
  app_slug        TEXT NOT NULL,                     -- 'acme-bot' (from /app endpoint)
  app_name        TEXT NOT NULL,                     -- 'Acme Bot'
  pem             TEXT NOT NULL,                     -- full PEM, plain (same model as other secrets)
  pem_sha256      TEXT NOT NULL,                     -- precomputed for fingerprint display
  pem_rotated_at  TEXT,                              -- nullable, ISO timestamp
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (catalog_id, app_id)                        -- prevents duplicate App registration
);
```

### Altered table: `connectors`

```sql
ALTER TABLE connectors ADD COLUMN app_id TEXT REFERENCES connector_apps(id) ON DELETE CASCADE;
```

`github-app-*` rows get `app_id` populated (FK to `connector_apps.id`). Standard catalog connectors keep `app_id` null. The `ON DELETE CASCADE` lets `appUninstall()` drop the App + all its installations atomically.

### Altered table: `connector_secrets`

```sql
ALTER TABLE connector_secrets ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0;
```

Used by the dashboard install modal to skip masking on public fields.

### Migration script

The repo uses a hardcoded TS array migration system at `packages/storage/src/migrations.ts` (NOT a file-based loader). Existing migrations are id 1-5. This spec adds **id 6** as a new entry at the end of the `MIGRATIONS` array.

**Idempotency**: handled by the migration runner — id 6 is only applied once (recorded in the `migrations` table). The migration body itself does NOT need defensive `IF NOT EXISTS` checks (and SQLite doesn't support `ALTER TABLE … ADD COLUMN IF NOT EXISTS` anyway).

Migration `id: 6, name: 'github_app_v2_dedup'`, body:

1. `CREATE TABLE connector_apps (...)` — full schema as documented above.
2. `ALTER TABLE connectors ADD COLUMN app_id TEXT REFERENCES connector_apps(id) ON DELETE CASCADE;`
3. `ALTER TABLE connector_secrets ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0;`
4. **Data migration** (inline SQL — runs in same transaction):
   - Pick the first `github-app-*` connector via subquery: `SELECT id FROM connectors WHERE slug LIKE 'github-app-%' LIMIT 1`.
   - Read `__GITHUB_APP_ID__` and `__GITHUB_APP_PEM__` from its secrets via subquery.
   - `INSERT INTO connector_apps (id, catalog_id, app_id, app_slug, app_name, pem, pem_sha256, …) VALUES (lower(hex(randomblob(16))) ||  -- generate UUID-like id, 'github-app', <app_id from secret>, '',  -- app_slug populated post-migration on first boot, '',  -- app_name populated post-migration, <pem from secret>, '',  -- pem_sha256 populated post-migration, …)`
   - For each `github-app-*` connector: `UPDATE connectors SET app_id = <new connector_apps.id> WHERE slug LIKE 'github-app-%'`.
   - `DELETE FROM connector_secrets WHERE key IN ('__GITHUB_APP_ID__', '__GITHUB_APP_PEM__') AND connector_id IN (SELECT id FROM connectors WHERE slug LIKE 'github-app-%')`.
   - Remaining 3 reserved keys stay (`__GITHUB_INSTALLATION_ID__`, `__GITHUB_INSTALLATION_NAME__`, `__GITHUB_ENV_VAR__`) — per-installation.
   - The data-migration step is gated by `WHERE NOT EXISTS (SELECT 1 FROM connector_apps WHERE catalog_id = 'github-app')` — if `connector_apps` already has a row for github-app (e.g., re-running migrations on a partially-migrated DB), it's a no-op.
5. **Post-migration backfill** (runs at worker boot, NOT in migration SQL): after migration completes, if any `connector_apps` row has `app_slug = ''` or `app_name = ''` or `pem_sha256 = ''`, the worker calls `fetchAppMetadata(jwt)` once at boot and computes `pem_sha256` locally, then `UPDATE connector_apps SET app_slug = ?, app_name = ?, pem_sha256 = ? WHERE id = ?`. This is a one-time post-migration step in `loadGitHubAppFromDb`. Subsequent installs/rotations populate these fields at write time so the empty-string state never recurs.

Migration test: `apps/worker/tests/migrations/github-app-v2-migration.test.ts` takes a fixture DB matching the OLD shape (4 connectors with the 5 reserved keys each), runs migrations through id 6, asserts the NEW shape (1 row in `connector_apps`, 4 connectors with `app_id` FK populated, only 3 reserved-key secrets per connector). Also asserts:
- Idempotency by running migrations a second time and asserting no change.
- **`loadGitHubAppFromDb` survives the empty-string post-migration window**: on a freshly-migrated DB (where `app_slug`/`app_name`/`pem_sha256` are still empty strings, before backfill runs), `loadGitHubAppFromDb(connectorRepo)` returns a valid `GitHubAppAuth` instance and does NOT crash. The backfill happens lazily inside that same call before the instance is returned.

## Files Created

- `packages/github-app/package.json` — workspace package
- `packages/github-app/src/index.ts` — exports
- `packages/github-app/src/jwt.ts` — `signAppJwt(appId, pem): string`
- `packages/github-app/src/github-api.ts` — `fetchAppMetadata(jwt)`, `fetchInstallations(jwt)`, `mintInstallationToken(jwt, instId)`
- `packages/github-app/src/types.ts` — `AppMetadata`, `Installation`, `AppInstallation` types
- `packages/github-app/tests/jwt.test.ts` — unit tests with mock crypto
- `packages/github-app/tests/github-api.test.ts` — unit tests with mock fetch
- `packages/github-app/tests/live-github-api.test.ts` — `@live` tag, runs against real GitHub with `tmp/legacy-github-app/github-app.pem`
- (no new route file — new endpoints go INSIDE `apps/api/src/routes/connectors.ts` at the existing `buildConnectorsRoute` to keep `/api/connectors/*` routing in one place; see "API Endpoints" section)
- `apps/worker/src/commands/handlers/app-install.ts` — new handler. API endpoint validates + enqueues `app_install` command. Handler creates `connector_apps` row + bootstraps `GitHubAppAuth` singleton via `deps.bootstrapGithubApp()`.
- `apps/worker/src/commands/handlers/app-pem-rotated.ts` — new handler. Validates new PEM (sign JWT, call /app, mint test tokens for ALL installations; rollback if any fail), then atomic UPDATE on `connector_apps` + `deps.githubApp.rotatePem()`.
- `apps/worker/src/commands/handlers/app-uninstall.ts` — new handler. Calls `deps.githubApp.appUninstall()` (tear-down) then DELETEs `connector_apps` row (CASCADE removes connectors).
- (migration goes inside `packages/storage/src/migrations.ts` as id 6, not a separate file — see Schema Changes section)
- `apps/worker/tests/migrations/github-app-v2-migration.test.ts` — migration e2e test
- `apps/worker/tests/github/github-app-auth-mutations.test.ts` — surgical mutation unit tests
- `apps/worker/tests/agent/mcp-build-github-app-intercept.test.ts` — intercept unit tests
- `apps/api/tests/routes/catalog-github-app.test.ts` — integration tests (mock fetch + real DB writes)
- `apps/api/tests/routes/catalog-github-app-live.test.ts` — `@live` e2e tests

## Files Modified

- `apps/worker/src/github/app-auth.ts` — refactor:
  - Remove `loadGitHubAppFromYaml` (yaml fallback).
  - `loadGitHubAppFromDb(connectorRepo)` reads `connector_apps` + joins to `github-app-*` connectors.
  - `GitHubAppAuth` class: add 5 surgical mutation methods.
  - JWT/fetch logic moved to `packages/github-app/`.
- `apps/worker/src/agent/mcp-build.ts` — refactor:
  - github-app-* intercept also runs for refresh-tools path (currently only mcpServersMap).
  - Token mint is now via `githubApp.getCachedToken()` synchronously OR fallback to fresh mint via `mintInstallationToken()` if cache is stale (recovers from "cache miss during outage" scenario).
- `apps/worker/src/commands/handlers/index.ts` — extend `HandlerDeps` interface with `githubApp: GitHubAppAuth | null`. The instance is wired in `apps/worker/src/index.ts` `main()` and passed to `buildHandlerMap({ ..., githubApp })`. Handlers receive it via dep-injection, no global singleton.
- `apps/worker/src/commands/handlers/connector-create.ts` — when slug starts with `github-app-`, call `deps.githubApp?.addInstallation()` after creating the row.
- `apps/worker/src/commands/handlers/connector-update.ts` — when env_var changes for a `github-app-*` connector, call `deps.githubApp?.renameInstallation()`.
- `apps/worker/src/commands/handlers/connector-uninstall.ts` — when slug starts with `github-app-`, call `deps.githubApp?.removeInstallation()` after deleting the row.
- `apps/worker/src/index.ts` — boot: run migration first, then check `github-mcp-server --version` health (fail-fast if binary missing).
- `apps/api/src/routes/connectors.ts` — remove the v1 `POST /catalog/github-app/install` endpoint (replaced by the new dedicated route file). Update connector create handler dispatch for `is_public` flag.
- `apps/api/src/lib/catalog-loader.ts` — extend `catalogSecretSchema` with `isPublic?: boolean`.
- `agent/connectors-catalog.json` — `github-app` entry's secrets array updated: `__GITHUB_APP_ID__` gets `isPublic: true`. (Cosmetic for future-proofing; v1 doesn't use it directly since App secrets are in `connector_apps`.)

## API Endpoints (new)

**Mount point**: all new endpoints are added INSIDE `buildConnectorsRoute` in `apps/api/src/routes/connectors.ts`. The existing comment at the top of `connectors.ts` warns that route registration order matters (Hono matches in order). The new static routes go BEFORE any `:id` dynamic route (i.e., before line ~325 in current file). This keeps `/api/connectors/*` routing centralized and respects the existing order requirement.

The existing v1 `POST /catalog/github-app/install` (lines ~301-373 of current `connectors.ts`) is REPLACED by the v2 install endpoint below. Behavior inversion documented inline: v1 created N installation rows directly with composite secrets; v2 creates ONLY a `connector_apps` row and lets the user add installations separately via the new `/installations` endpoint.

All new endpoints under `/api/connectors/catalog/github-app/`:

| Method | Path | Purpose | Body | Returns |
|---|---|---|---|---|
| POST | `/test` | Validate {appId, pem} without writing | `{appId, pem}` | `{ok, appName, appSlug, installationsAvailable: [{name, id}]}` or `{ok: false, errorKind, error}` |
| POST | `/install` | Install App (creates `connector_apps` row) — does NOT add installations | `{appId, pem}` | `{ok, appUuid, appName, appSlug}` (worker boots `GitHubAppAuth` instance on command processing) |
| POST | `/installations/discover` | List installations from GitHub API + filter already-wired | (uses existing app's PEM) | `{installations: [{name, id, repoCount, scopes, alreadyWired: bool}]}` |
| POST | `/installations` | Add installation (creates connector row + adds to `GitHubAppAuth`) | `{installationId, displayName, envVar}` | `{ok, connectorId, slug}` |
| POST | `/rotate-pem` | Rotate PEM (validates, then atomic update + invalidate caches) | `{newPem, confirmAppId}` | `{ok}` |
| POST | `/uninstall-app` | Tear down App + all installations (CASCADE) | `{confirmAppId}` | `{ok}` |

Existing endpoints (`POST /test`, `POST /:id/test`, install) remain unchanged.

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| BG1 | Migration | Worker boots, migration runs idempotently. 4 existing rows now have `app_id` populated; `connector_apps` has 1 row; only 3 reserved keys per connector remain. |
| BG2 | Boot health | Worker boot calls `github-mcp-server --version`. If binary missing, log fatal and exit. |
| BG3 | Install API | `POST /catalog/github-app/test` with valid {appId, pem} → returns {ok, appName, installationsAvailable: [4]}. `POST /install` writes `connector_apps`. Worker hot-reload bootstraps `GitHubAppAuth` via `connector_create_app` command. |
| BG4 | Add installation | `POST /catalog/github-app/installations` with {installationId, displayName, envVar} → enqueues `connector_create` command → worker handler creates row → calls `githubApp.addInstallation()` → first token mints async → connector becomes usable on next agent turn. |
| BG5 | Remove installation | `DELETE /api/connectors/:id` (existing endpoint) for a `github-app-*` connector → `connector_uninstall` handler → calls `githubApp.removeInstallation()` → cache cleared, env var unset. always_sensitive entries auto-cleaned via cascade trigger (deferred to spec 0047). |
| BG6 | Rotate PEM | `POST /catalog/github-app/rotate-pem` validates new PEM (sign JWT, call /app, verify app_id matches), mints test token for ALL installations (rollback if any fail). On success: atomic UPDATE `connector_apps`, call `githubApp.rotatePem()`, all caches invalidated. |
| BG7 | Refresh-tools per-row | `POST /api/connectors/:id/test` for a `github-app-*` connector → handler detects slug → mints fresh token via `mintInstallationToken()` → calls `discoverTools` with synthesized `GITHUB_PERSONAL_ACCESS_TOKEN` secret → returns tool list (resolves brecha 7). |
| BG8 | Refresh failure recovery | If GitHub API is down at scheduled refresh time, cached tokens stay until they expire; warn log per failure but no exception. Once API recovers, next refresh tick succeeds. (Surface to dashboard deferred to spec 0048.) |

## Success Criteria

- Migration test passes (fixture DB with old shape → new shape, data intact).
- `connector_apps` table exists; FK from `connectors.app_id` works (FK constraint enforced by SQLite if `PRAGMA foreign_keys = ON`).
- All 5 surgical mutations have unit tests.
- `mcp-build.ts` intercept has unit test (fixture connector + mock githubApp).
- All new endpoints have integration tests (mock fetch).
- 1-2 `@live` e2e tests against real GitHub API pass when run with `LIVE_TESTS=1` and the PEM available.
- `quality-gate` green: 26/26 tasks, ~230+ tests passing (currently 208).
- Migration is idempotent (running twice doesn't fail or duplicate data).
- yaml fallback removed; `loadGitHubAppFromYaml` deleted.
- `github-mcp-server --version` health check at boot.
- All 8 user stories pass smoke (`fn` profile, redeploy after migration ships).
- Spec passes 3 review rounds.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Migration fails mid-flight, DB ends up in mixed state | Wrap in `BEGIN EXCLUSIVE; … COMMIT;`. `.db` backup in volume `workspace-fn` allows rollback. Migration test catches before ship. |
| `packages/github-app/` adds tooling overhead | Pattern already established (`mcp-discover`, `storage`, `logger`). Marginal cost. |
| Live GitHub API tests flaky in CI | Tag `@live` and skip in default CI; run manually in pre-release. Document in package README. |
| Hot-reload races: handler runs before `GitHubAppAuth` exists (first install) | Bootstrap on first install: `app_install` command handler creates and stores the instance in worker-singleton. Subsequent commands find it via the singleton. |
| Worker uses cached token AFTER PEM rotation but BEFORE cache invalidation finishes | `rotatePem` is synchronous: substitute key, clear all cache slots, return. Next `getCachedToken` call returns null → falls into `mintInstallationToken` path with new PEM. No race in practice. |
| GitHub API breaking change | `@live` test catches in pre-release. Package can be patched independently of worker/api. |
| App-level uninstall not in scope (defer M12 + handler implementation) | Backend handler IS in scope (`appUninstall()` method); UI deferred to 0046. v1 ships with API endpoint but no UI surface. |

## Open Questions

All resolved during brainstorming.

- **(Resolved Q1)** `connector_apps` table dedicated.
- **(Resolved Q2)** 1-shot SQL migration.
- **(Resolved Q3)** 5 surgical mutations.
- **(Resolved Q4)** Unit + integration + e2e with live GitHub API.
- **(Resolved Q5)** Extract to `packages/github-app/`.

## Coverage gaps (acknowledged)

- **Encryption-at-rest for PEM**: same model as other secrets. Tracked as separate hardening spec.
- **Refresh failure dashboard surfacing**: deferred to 0048.
- **always_sensitive auto-cleanup on remove installation**: noted in user stories but actual implementation is in 0047 (which moves always_sensitive to DB and adds cascade triggers).
- **App-level uninstall UI**: M12 deferred to 0046.
- **Multi-App support**: schema supports, v1 enforces single.

## Review procedure

3 consecutive review rounds without findings. Same protocol as 0036/0037/0038/0042/0043. R1 cold reviewer (verify schema design against existing tables), R2 cross-check vs the actual codebase (handler patterns, package structure), R3 fresh independent.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews (this).
2. **Phase 1**: Create `packages/github-app/` package — JWT signing + GitHub API client + types + unit tests.
3. **Phase 2**: Schema migration — write migration SQL + migration test (using a fixture DB matching the current `fn` shape).
4. **Phase 3**: Refactor `apps/worker/src/github/app-auth.ts`:
   - Use `packages/github-app` for JWT/API.
   - Add 5 surgical mutation methods.
   - `loadGitHubAppFromDb(connectorRepo)` reads new shape.
   - Remove `loadGitHubAppFromYaml`.
   - Unit tests for each mutation.
5. **Phase 4**: Refactor `mcp-build.ts` — intercept covers both runtime spawn + refresh-tools paths. Unit tests with fixture echo MCP.
6. **Phase 5**: Wire handlers — `connector_create`/`connector_update`/`connector_uninstall` invoke surgical mutations for `github-app-*` slugs. New handlers for `app_install`, `app_pem_rotated`, `app_uninstall`.
7. **Phase 6**: New API routes under `/catalog/github-app/*` — test, install, discover, installations, rotate-pem, uninstall-app. Integration tests (mock fetch).
8. **Phase 7**: Health check at boot — `github-mcp-server --version` runs in the existing `healthChecks` flow; fail-fast if missing.
9. **Phase 8**: `@live` e2e tests — 1-2 tests using `tmp/legacy-github-app/github-app.pem` against real GitHub API.
10. **Phase 9**: Quality gate green. Smoke against `fn` profile (migration runs, refresh-tools works, install endpoint validates, rotate updates atomically).
11. **Phase 10**: `status: shipped`, commit on feature branch, PR.

## Definition of Done

- All schema changes shipped; migration green on `fn` profile DB.
- `packages/github-app/` published as workspace package.
- 5 surgical mutations + intercept + 6 endpoints implemented + tested.
- 3 clean reviews.
- Smoke green: install via API works (creates `connector_apps`), refresh-tools per-row works, rotate-pem works (atomic + invalidates caches), `gh` CLI still works (env vars sourced from new shape).
- Quality gate: 230+ tests passing.
