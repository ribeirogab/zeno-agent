---
feature: backend-cli-only
spec: "[[spec-backend-cli-only]]"
created: 2026-05-10
---
# 0072 — Backend CLI-Only — Implementation Plan

> **For agentic workers:** Use the superpowers:subagent-driven-development sub-skill to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax in `tasks.md` for tracking.

**For this spec:** [[spec-backend-cli-only]]

**Goal:** Land issue [#56](https://github.com/ribeirogab/zeno-agent/issues/56) in a single PR (`feat/backend-cli-only`): move all backend (claude-code) configuration from the dashboard to a new `zeno backend` CLI subtree; make the dashboard `/backend` page read-only; rename onboarding to be backend-generic; nuke `process.env.ZENO_BACKEND` everywhere.

**Architecture:** A new shared workspace package `packages/backends` becomes the single source of truth for the catalog loader and the Claude token-test helper — both api and CLI import from there. The CLI talks DB-direct: `@zeno/db/host` for the profile lookup (workspace dir + master key), then `openRuntimeDatabase('<workspaceDir>/zeno.db')` from `@zeno/db/runtime` to operate on `BackendCredentialsRepo` and `BackendSettingsRepo`. OAuth ingestion uses `dockerode.exec` with `Tty: true` against the running profile container, proxying stdio both directions and capturing the OAuth URL/token via the regex strings in the catalog JSON. Dashboard mutation surfaces (component + hooks + api routes) get deleted in the same PR — zero transition window.

**Tech Stack:** TypeScript strict, Node 24 LTS, pnpm 10 workspaces, [citty](https://github.com/unjs/citty) (commands), [dockerode](https://github.com/apocas/dockerode) (Docker socket + exec PTY), [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (runtime DB), [drizzle-orm](https://orm.drizzle.team/) (schema), [vitest](https://vitest.dev/) (tests), [TanStack Router](https://tanstack.com/router) (dashboard routes), [biome](https://biomejs.dev/) (lint+format).

---

## Architecture

### Module boundaries

```
packages/backends/                  ← NEW shared workspace package
  src/
    catalog.ts                      ← moved from apps/api/src/lib/backends-catalog-loader.ts
    claude-test.ts                  ← moved from apps/api/src/lib/claude-test.ts
    index.ts                        ← public exports
  package.json
  tsconfig.json

apps/cli/src/
  lib/
    runtime-db.ts                   ← NEW: opens runtime DB by workspaceDir, returns repos w/ master key
    docker-exec-pty.ts              ← NEW: dockerode.exec + PTY proxy, ANSI strip, regex match
    claude-oauth.ts                 ← NEW: orchestrates docker-exec-pty + catalog auto_flow regex parsing
    backend-resolver.ts             ← NEW: picker for backend slug (codex greyed)
  commands/
    backend.ts                      ← NEW: parent command (citty subcommand registry)
    backend-list.ts                 ← NEW
    backend-show.ts                 ← NEW
    backend-configure.ts            ← NEW
    backend-rotate.ts               ← NEW
    backend-test.ts                 ← NEW
    backend-remove.ts               ← NEW
  index.ts                          ← MODIFY: register `backend` subtree

apps/api/src/
  lib/
    backends-catalog-loader.ts      ← DELETE (moved to packages/backends)
    claude-test.ts                  ← DELETE (moved)
    oauth-sessions.ts               ← DELETE (no longer needed; CLI owns OAuth)
  routes/
    backends.ts                     ← MODIFY: keep only GET / GET /:slug / POST /:slug/test; delete the rest
    settings.ts                     ← MODIFY: remove process.env.ZENO_BACKEND read

apps/worker/src/
  index.ts                          ← MODIFY: remove process.env.ZENO_BACKEND; read active_backend_id from runtime DB; fallback string literal 'claude-code'
  agent/backends/mock.ts            ← MODIFY: registered as catalog/DB-driven backend, no env read

apps/dashboard/src/
  routes/_authed/
    backend.tsx                     ← NEW: top-level page (Paper V2 compact rows)
    settings.tsx                    ← MODIFY: drop BACKEND tab; replace header copy
    settings/backend.tsx            ← DELETE (or convert to 301 redirect to /backend)
  routes/
    onboarding.connect-claude.tsx   ← RENAME → onboarding.connect-backend.tsx (CLI-first hero per Paper B4)
    onboarding.connect-claude.tsx   ← (replaced) one-line 301 redirect to /onboarding/connect-backend
  components/
    layout/dashboard-sidebar.tsx    ← MODIFY: add `backend` NavId + entry between home/crons + ⌘B label
    settings/active-backend-selector.tsx ← DELETE
    settings/configure-claude-modal.tsx  ← DELETE (and any sibling configure modals)
    backend/backend-row.tsx         ← NEW: one row in the Paper V2 compact-rows table
    backend/backend-action-modal.tsx ← NEW: CommandModal variant for backend.test/rotate/configure (CLI snippet + COPY + DOCS↗)
  lib/
    use-backends.ts                 ← MODIFY: drop useSaveBackendCredentials, useStartOAuth, useSetActiveBackend; keep read hooks; add { poll: 'fast' | 'normal' } variant for onboarding 2s vs page 30s

packages/db/src/runtime/
  (no schema changes — backend_credentials and backend_settings already exist)

tests/e2e/fixtures/
  mock-backend.ts                   ← NEW: inserts mock row into backend_credentials + backend_settings.active_backend_id='mock'
```

### Data flow — `zeno backend configure`

```
host                                                container (profile)
─────────────────────────────────────────────────────────────────────
zeno backend configure
   │
   ├─ resolveProfile()                              ─
   │  reads ~/.zeno/state.db (host)                 ─
   │  → { name, workspaceDir, masterKey }           ─
   │
   ├─ check container status via dockerode          ←→ container running?
   │  abort if not running                          ─
   │
   ├─ resolveBackend()                              ─
   │  loads catalog from packages/backends           ─
   │  picker: claude-code | codex (grey)            ─
   │
   ├─ runClaudeOAuth()                              ─
   │  dockerode.exec({ Tty: true, AttachStdin/Stdout: true, Cmd: ['claude', 'setup-token'] })
   │                                              →   spawn claude setup-token
   │                                              ←   stdout: ASCII art + OAuth URL
   │  ANSI-strip + new RegExp(catalog.stdout_url_regex).match()
   │  print URL inline locally                      ─
   │  prompt hidden "paste code:"                   ─
   │  forward bytes to docker exec stdin            →   claude reads code
   │                                              ←   stdout: token printed
   │  ANSI-strip + new RegExp(catalog.stdout_token_regex).match()
   │
   ├─ openRuntimeDatabase('<workspaceDir>/zeno.db') (host opens a file mounted from container)
   │  new BackendCredentialsRepo(db, { masterKey, profileId })
   │  repo.upsert({ backendId, fieldName: 'oauth_token', value: token })
   │   → encrypted aes-256-gcm + status='untested' implicit
   │
   ├─ testClaudeToken({ token, model: catalog.test.model })  (call live Anthropic API directly)
   │  → 'ok'
   │  repo.setStatus(backendId, 'active', Date.now())
   │
   └─ print "claude-code · active"                  ─

(materializer's next 5s poll re-writes ~/.claude/credentials.json — idempotent)
```

### Data flow — `zeno backend test`

```
zeno backend test
   │
   ├─ resolveProfile + resolveBackend
   ├─ openRuntimeDatabase + repo
   ├─ token = repo.getValue(backendId, 'oauth_token')   (decrypted in-process)
   ├─ testClaudeToken({ token, model: catalog.test.model })
   │   ok           → setStatus(active, now), exit 0
   │   unauthorized → setStatus(expired, now), exit 1
   │   network      → setStatus(untested, now), exit 2
```

### Dashboard `/backend` data flow

```
operator clicks `backend` in sidebar
   │
   ├─ TanStack Router → /backend
   ├─ useBackends({ poll: 'normal' })  (refetchInterval: 30000)
   ├─ render BackendRow per catalog backend
   │  status pill from /api/backends row.status
   │  action chips: TEST · ROTATE · CONFIGURE
   │     onClick → opens BackendActionModal
   │       modal shows CLI snippet + COPY button + DOCS↗ link
   │       NO mutation client-side
   │
   └─ poll convergence: CLI flips DB → /api/backends GET reflects → page re-renders
```

### Onboarding gate flow

```
/_authed/index.tsx beforeLoad:
   GET /api/backends
   if every row.status === 'not_configured':
      throw redirect({ to: '/onboarding/connect-backend' })

/onboarding/connect-backend renders Paper B4:
   useBackends({ poll: 'fast' })  (refetchInterval: 2000)
   on first row.status === 'active':
      navigate('/backend')

/onboarding/connect-claude (legacy URL):
   one-line 301 → /onboarding/connect-backend
```

## Phases

Phases are dependency-ordered: shared package first (everything depends on it), then CLI surface, then dashboard cleanup. Each phase ends with `pnpm run quality-gate` from the workspace root.

| # | Phase | Tasks | Why this order |
|---|---|---|---|
| 1 | `packages/backends` workspace package | 4 | Catalog loader + `testClaudeToken` move here; api re-imports. CLI Phase 3 needs this. |
| 2 | CLI helper modules | 4 | `runtime-db.ts`, `docker-exec-pty.ts`, `claude-oauth.ts`, `backend-resolver.ts`. Used by every backend command. |
| 3 | `zeno backend` CLI subtree | 7 | Six subcommands + parent registration in `index.ts`. |
| 4 | Dashboard `/backend` page + sidebar | 4 | New route, NavId expansion, sidebar entry, page UI per Paper V2. |
| 5 | `/settings` cleanup | 2 | Remove BACKEND tab + 301 redirect + header copy replacement. |
| 6 | Delete dashboard mutation surfaces | 3 | `ActiveBackendSelector`, hooks, configure modals. |
| 7 | Delete api mutation routes | 2 | `POST /credentials`, `POST /oauth/start`, `PUT /active`, plus `oauth-sessions.ts`. |
| 8 | Onboarding rename | 3 | Rename file, update gate, update hero copy + polling cadence, add legacy 301. |
| 9 | Drop `ZENO_BACKEND` env | 3 | Worker, api, mock; verify zero `grep` matches. |
| 10 | E2E mock fixture | 2 | DB-row fixture + update tests to use it. |
| 11 | E2E real (Slack DM) + clean reviews | 1 | Manual run + 3 rounds clean review per Paper artboard + final. |
| 12 | Quality gate + PR | 1 | Final `pnpm run quality-gate` + open PR via `/new-pr`. |

**Total: 36 tasks.** Each task ends with `git commit`. Phase boundaries map to commit clusters, not to PRs (single PR per spec).

## Risks / Open Decisions

| Risk | Decision / mitigation |
|---|---|
| `dockerode.exec` PTY proxy is net-new code with no in-repo precedent. | Phase 2 task for `docker-exec-pty.ts` includes a focused unit test (with a mock dockerode that streams a fake `setup-token` script) plus a manual test plan against a real container before Phase 3 starts. |
| Materializer race after CLI write. | Spec S2 step 11 + risks table cover it. CLI never reads from `~/.claude/credentials.json`; reads token from runtime DB directly. No coordination needed. |
| Removing `oauth-sessions.ts` deletes non-trivial code that has tests. | Confirm no other importers remain before deletion (`grep -R "oauth-sessions"`). Delete tests in same commit. |
| `useSetActiveBackend` hook removal breaks a settings/about page button. | Phase 6 task for `ActiveBackendSelector` includes grep audit + import cleanup before deletion. |
| Single PR is large. | Commit boundaries follow phase boundaries — reviewer can read in isolation. PR body lists the 12 phases as a TOC. |
| `backend.tsx` route file naming collision with TanStack Router conventions for the new top-level + redirect-from-old-path. | TanStack Router uses file-based routing under `apps/dashboard/src/routes/`. The new file `routes/_authed/backend.tsx` is the canonical page; `routes/onboarding.connect-claude.tsx` becomes a tiny redirect component. Both conventions verified against `routes/onboarding.connect-claude.tsx` already existing. |

## Self-review

| Spec section | Covered by |
|---|---|
| Constraints — CLI-first contract | Phases 6 + 7 (delete dashboard + api mutation surfaces) |
| Constraints — OAuth in container net-new pattern | Phase 2 task `docker-exec-pty.ts` + Phase 3 `backend-configure.ts` |
| Constraints — DB-direct from CLI runtime DB | Phase 2 `runtime-db.ts` |
| Constraints — Test ping via shared helper | Phase 1 `packages/backends/src/claude-test.ts` |
| Constraints — No `process.env.ZENO_BACKEND` reads | Phase 9 |
| Constraints — Branch naming | Phase 0 (branch already created in worktree) |
| S1 onboarding | Phase 8 |
| S2 configure | Phase 3 task `backend-configure.ts` |
| S3 test | Phase 3 task `backend-test.ts` |
| S4 rotate | Phase 3 task `backend-rotate.ts` |
| S5 remove | Phase 3 task `backend-remove.ts` |
| S6 list/show | Phase 3 tasks `backend-list.ts` + `backend-show.ts` |
| S7 dashboard `/backend` | Phase 4 |
| S8 `/settings` after BACKEND tab removal | Phase 5 |
| S9 mock backend | Phase 10 |
| AC: CLI surface (10) | Phase 3 + Phase 2 (helper unit tests) |
| AC: Dashboard `/backend` page (5) | Phase 4 |
| AC: `/settings` updates (3) | Phase 5 |
| AC: Onboarding rename (5) | Phase 8 |
| AC: API surface (3) | Phase 7 + Phase 9 |
| AC: Mock backend / E2E (3) | Phase 10 |
| AC: E2E Slack (5) | Phase 11 |
