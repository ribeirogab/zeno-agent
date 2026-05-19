---
status: draft
feature: backend-cli-only
created: 2026-05-10
shipped: null
---
# 0072 — Backend CLI-Only — Spec

**Status:** Draft
**Scope:** Single PR, single feature branch (`feat/backend-cli-only`). Move all backend (claude-code) configuration from the dashboard to a new `zeno backend` CLI subtree. Make the dashboard `/backend` page read-only. Rename onboarding to be backend-generic.

## Context

Spec [[../2026-05-03-backend-auth-dashboard/spec-backend-auth-dashboard|0071 — Backend Auth via Dashboard]] landed code that put backend (claude-code) credential management *inside* the dashboard: a `/settings/backend` tab with `ActiveBackendSelector`, configure modals, OAuth-via-SSE flow, and POST routes that mutate `backend_credentials` in the host DB. It works, but it splits the mutation surface in two awkward ways:

1. **Connectors are CLI-first** ([[../2026-05-08-connectors-cli-first-design/spec|0068]]). Backend is the only persistence-touching subsystem with no CLI path. Operators pivot between paradigms inside the same product.
2. **Backend creds are sensitive.** Browser tabs, React Query caches, and SSE OAuth flows expand the threat surface for no functional reason. A terminal command run by the profile owner is the right actuator.

GitHub issue [#56](https://github.com/ribeirogab/zeno-agent/issues/56) captures the request: "manage agent backend (Claude) only via CLI + dedicated dashboard menu + onboarding gate." Paper artboards (B1-B5 in artboard `1AZG-0` and updated `/settings` screens in `16B7-0`) ship the visual contract.

## Problem Statement

Today, configuring/rotating/removing the agent backend lives entirely in the dashboard, and there is no CLI surface for it. This:

- Forces the operator into a browser for an action that is otherwise terminal-driven (profile management, connectors, lifecycle).
- Couples credential mutation to the api container's HTTP surface (must be `zeno start`-ed before first credentials can land — chicken-and-egg).
- Mixes mutation and read responsibilities in the same dashboard route, contradicting the CLI-mutates / dashboard-reads pattern set by connectors.
- Buries `backend` as a sub-tab of `/settings`, hiding a top-level concern (which runtime drives every agent run).

The fix: introduce `zeno backend` (mutation), promote `/backend` to a top-level dashboard page (read-only), and rename onboarding so it's backend-generic.

## Non-Goals

- **No second backend driver.** `claude-code` stays the only real driver. `codex` remains a *visual placeholder* in Paper artboards (catalog `_doc` comment + Paper logo) to telegraph pluggability — zero code, zero registry entry, zero catalog row.
- **No catalog file changes** (`agent/backends-catalog.json` keeps its current single entry).
- **No DB schema changes.** `backend_credentials` and `backend_settings` tables stay as-is — they were designed for this in 0071.
- **No CI/scripting OAuth bypass** in this PR. `zeno backend configure` is interactive-only (no `--token` flag, no `--from-stdin`). Future spec if the use case appears.
- **No `zeno backend use <slug>`** subcommand. With a single backend, it is a no-op. Add when a second driver lands.
- **No 401-from-SDK auto-`expired` flip.** Worker keeps current behavior; status changes happen on `zeno backend test` or via the existing dashboard polling against the test endpoint. Auto-flip is its own follow-up if it doesn't fall out for free.
- **No analytics, no audit log entries.** Spec 0071 chose not to log; we keep that.
- **No `apps/docs` updates** in this PR. Onboarding hero copy and `--help` strings carry the operator instructions; doc site catches up after.

## Constraints

- **CLI-first contract.** After this PR, the dashboard MUST have zero code paths that mutate `backend_credentials` or `backend_settings`. The only non-`GET` API surface that survives is `POST /api/backends/:slug/test` (a live ping that updates `last_tested_at` / `status` — does not write credentials).
- **Single PR.** Owner explicit decision. One feature branch, one PR, one merge. Internal sequencing inside the PR is fine but no incremental PRs.
- **OAuth in container — net-new pattern.** Today the api uses `node-pty` LOCALLY inside its own container to spawn `claude setup-token` (`apps/api/src/lib/oauth-sessions.ts`). The CLI cannot do that — it runs on the host. The CLI MUST use `dockerode.exec` with `Tty: true` and `AttachStdin/Stdout: true` against the running profile container, spawning the command from `agent/backends-catalog.json`'s `auto_flow.command` array (today: `["claude", "setup-token"]`) and proxying stdio both directions. URL/token discovery uses the SAME regex strings the api already reads from the catalog: `auto_flow.stdout_url_regex`, `auto_flow.stdout_token_regex`, `auto_flow.stdout_awaiting_code_regex`. The catalog JSON is the single source of truth — both api and CLI instantiate `new RegExp(...)` from catalog values at call-site. The catalog *loader* (today private at `apps/api/src/lib/backends-catalog-loader.ts`) MUST move to the same shared package as `testClaudeToken` (proposal: `packages/backends/src/catalog.ts`) so both api and CLI import the same parser/validator/path-resolver — neither side parses the JSON by hand. There is no precedent for `dockerode.exec` + PTY proxy elsewhere in this repo; this is genuinely new code, called out so the implementer doesn't waste time looking for a PTY-over-docker pattern that doesn't exist.
- **DB-direct from CLI — runtime DB, not host DB.** `backend_credentials` and `backend_settings` live in the **runtime DB** (`@zeno/db/runtime`, file at `<workspaceDir>/zeno.db`), NOT the host DB. The CLI MUST: (1) resolve the target profile via the existing `@zeno/db/host` lookup (gets workspace dir + master key), (2) open the runtime DB by file path via `openRuntimeDatabase(workspaceDir + '/zeno.db')` from `@zeno/db/runtime`, (3) instantiate `BackendCredentialsRepo` + `BackendSettingsRepo` against that connection. It MUST NOT talk to the api HTTP surface. The CLI talks directly to two SQLite files — host (`~/.zeno/state.db`) for profile lookup, runtime (`<workspaceDir>/zeno.db`) for backend ops.
- **Test ping via shared helper.** `apps/api/src/lib/claude-test.ts` exports `testClaudeToken({ token, model })` — used today by the api's POST `/test` route. Required signature: both `token` and `model` are mandatory; `model` value comes from `catalog.backends[].test.model` (today: `"claude-haiku-4-5-20251001"`). To let the CLI run the same ping without going through HTTP, this helper MUST move verbatim into a shared package (proposal: `packages/backends/src/claude-test.ts`). API and CLI both import from there with no logic changes. The CLI `test` subcommand: (1) reads the decrypted token via `BackendCredentialsRepo.getValue('claude-code', 'oauth_token')` (the repo decrypts in-process using the master key passed in the constructor), (2) reads `model` from the catalog entry, (3) calls `testClaudeToken({ token, model })`, (4) writes the result via `BackendCredentialsRepo.setStatus(backendId, status, lastTestedAt)`.
- **No `process.env.ZENO_BACKEND` reads anywhere.** All current callers (worker boot, api settings route, mock backend) drop the env var. Mock backend selection moves to a DB row inserted by the E2E fixture.
- **Existing onboarding gate stays gated on `backend_count == 0`** (no semantic change — only the redirect target name changes from `/onboarding/connect-claude` to `/onboarding/connect-backend`).
- **Branch naming:** `feat/backend-cli-only`. No `claude/*` prefix (per repo rule).
- **English-only spec/plan/tasks** (per vault language rule).

## User Stories / Scenarios

**S1 — First-run onboarding (zero backend creds):**

1. Operator runs `zeno profile create default` then `zeno start default`.
2. Operator opens dashboard via `zeno open default`.
3. `_authed/index.tsx` `beforeLoad` calls `GET /api/backends`. All entries report `status='not_configured'` → throws `redirect({ to: '/onboarding/connect-backend' })`.
4. Onboarding page renders the CLI-first hero (Paper B4 design): hero copy ("Welcome to Zeno."), command card with `$ zeno backend configure` + COPY + DOCS↗ buttons, helper line "claude-code · codex · gemini · pluggable surface", waiting indicator "polls every 2s".
5. Operator runs `zeno backend configure` in another terminal. Once the credential lands and tests OK, the page's poll sees `status='active'` and auto-redirects to `/backend`.

**S2 — Configure a backend via CLI (interactive):**

1. Operator runs `zeno backend configure`.
2. CLI resolves the profile (sticky → picker if no sticky).
3. CLI shows backend picker. `claude-code` is selectable; `codex` appears greyed out with `(coming soon)` and is non-selectable. (Driven by the `available` field added to the catalog reader for this spec — no JSON schema change, in-code only since the JSON only lists `claude-code`.)
4. CLI verifies the profile container is running. If not: prints `error: profile '<name>' container not running. start it first: zeno start <name>` and exits 1.
5. CLI runs `dockerode.exec` against the profile container: `claude setup-token` with `Tty: true`, `AttachStdin/Stdout: true`. CLI applies the shared `URL_REGEX` to the streamed stdout, captures the OAuth URL, and prints it locally in a clean format (not the raw PTY output).
6. CLI prompts hidden `paste code from browser:` and writes the typed code into the docker exec stdin stream (followed by `\r`).
7. `claude setup-token` exchanges code → token. The CLI captures the token from stdout via the shared `TOKEN_REGEX` (same regex as `oauth-sessions.ts`). `claude setup-token` also writes `~/.claude/credentials.json` inside the container as a side effect — the CLI does NOT read the file, the regex on stdout is the source of truth.
8. CLI opens the runtime DB via `openRuntimeDatabase(<workspaceDir>/zeno.db)`, instantiates `BackendCredentialsRepo` with `{ masterKey, profileId }` (resolved from the host DB lookup in step 2), and writes the captured plaintext token via `BackendCredentialsRepo.upsert({ backendId: 'claude-code', fieldName: 'oauth_token', value: token })`. The repo encrypts with `aes-256-gcm` internally and resets `status='untested'`, `last_tested_at=null` as part of the upsert (no separate call needed).
9. CLI reads `model` from the catalog entry (`catalog.backends.find(b => b.id === 'claude-code').test.model`) and calls `testClaudeToken({ token, model })` directly against the live Anthropic API. On success: writes `status='active'`, `last_tested_at=now` via `BackendCredentialsRepo.setStatus('claude-code', 'active', Date.now())`.
10. CLI prints `claude-code · active` and exits 0.
11. Materializer (already running in the worker container) sees the new row in `backend_credentials` on its next 5-second poll. It decrypts the token and writes `~/.claude/credentials.json` — overwriting the file from step 7 with the same content. Idempotent.

**S3 — Test (no creds change):**

1. Operator runs `zeno backend test`.
2. CLI resolves profile + backend (picker if more than one configured; in this spec only `claude-code` is real).
3. CLI opens runtime DB and reads the decrypted token via `BackendCredentialsRepo.getValue('claude-code', 'oauth_token')` — repo decrypts in-process using the master key passed to its constructor (resolved from the host DB profile record).
4. CLI reads `model` from the catalog entry (`catalog.backends.find(b => b.id === 'claude-code').test.model`) and calls the shared `testClaudeToken({ token, model })` helper (extracted from `apps/api/src/lib/claude-test.ts` to `packages/backends/src/claude-test.ts`) — runs a single live Anthropic API call against the cheapest endpoint (max_tokens=1, single-digit prompt). Cost: one API call (negligible).
5. On success: writes `last_tested_at = now`, `status = 'active'`. Prints `claude-code · ok · 84ms` (with `--quiet`: prints nothing on success). Exit 0.
6. On 401: writes `status = 'expired'`. Prints `claude-code · expired · run zeno backend rotate`. Exit 1.
7. On network/transient: writes `status = 'untested'`. Prints `claude-code · network error · 120s timeout`. Exit 2.

**S4 — Rotate:**

1. Operator runs `zeno backend rotate claude-code` (or just `zeno backend rotate` for picker).
2. CLI prompts `rotate claude-code creds for profile=default? (y/N)`. Operator confirms.
3. Same flow as `configure` from step 4 onward. Existing row is overwritten.

**S5 — Remove:**

1. Operator runs `zeno backend remove claude-code`.
2. CLI prompts `remove claude-code from profile=default? this clears credentials. (y/N)`. Operator confirms.
3. CLI deletes the row from `backend_credentials`. Materializer next poll sees the row gone and removes `~/.claude/credentials.json`.
4. Status reverts to `not_configured`. Dashboard `/backend` re-renders the row in zero-state.

**S6 — List / Show:**

1. `zeno backend list` prints a table per profile: slug, status, last test ts, scope. Supports `--json`, `--quiet`, `--profile`.
2. `zeno backend show [slug]` prints a detail block: status, scope (profile · aes-256-gcm), last test (ts + ms + result), rotated (ts).

**S7 — Dashboard `/backend` (read-only):**

1. Operator clicks `backend` in the sidebar (between `home` and `crons`).
2. `/backend` route renders the Paper V2 compact-rows table (artboard `1B8A-0`): one row per backend in the catalog. `claude-code` shows `ACTIVE` / `EXPIRED` / `NOT CONFIGURED` per current state. `codex` always shows `NOT CONFIGURED` (never has creds, codex is visual-only).
3. Action chips per row: TEST · ROTATE · CONFIGURE. Clicking any chip opens a `CommandModal` (existing dashboard component pattern) with the equivalent CLI command pre-filled, COPY button, and DOCS↗ link. **No chip mutates anything client-side.**
4. The page polls `GET /api/backends` every 30 seconds (existing `useBackends` hook) so CLI-driven changes converge without a manual refresh.

**S8 — `/settings` after BACKEND tab removal:**

1. Operator opens `/settings`. Sub-nav now shows `PROFILE · CAPABILITIES · ABOUT` (no BACKEND).
2. The page header description is updated to: "Edit USER.md inline; flip capabilities. Worker auto-reloads on profile changes. Backend lives at /backend."
3. The route `/settings/backend` returns a 301 redirect to `/backend`.

**S9 — Mock backend (E2E, no env):**

1. E2E fixture inserts a row into `backend_credentials` with `backend_id='mock'` (matching the `mock.ts` driver's id) and a placeholder credential blob.
2. Worker boot reads the active backend from `backend_settings.active_backend_id`. The fixture also inserts `('active_backend_id', 'mock')`.
3. No `ZENO_BACKEND=...` is set anywhere in the test compose / CI step. `process.env.ZENO_BACKEND` reads are deleted from the codebase.

## Acceptance Criteria

Tick each `[x]` when verified.

### CLI surface

- [ ] `zeno backend --help` lists exactly: `list`, `show`, `configure`, `rotate`, `test`, `remove` (no `use`).
- [ ] `zeno backend configure` with no flags resolves profile via `resolveProfile()` (sticky → picker), then shows a backend picker that includes `codex` greyed out as `(coming soon)` and selecting it prints `error: codex backend not implemented yet` and exits 1.
- [ ] `zeno backend configure` aborts with stderr `error: profile '<name>' container not running. start it first: zeno start <name>` (exit 1) when the docker container for the resolved profile is not in state `running`.
- [ ] After a successful `zeno backend configure`, the runtime DB at `<workspaceDir>/zeno.db` (opened via `openRuntimeDatabase` from `@zeno/db/runtime`) has a row in `backend_credentials` for `(profile_id, 'claude-code', 'oauth_token')` with a non-empty encrypted value, `status='active'`, `last_tested_at` within the last 5 seconds.
- [ ] `zeno backend configure --profile <name>` with a non-existent name exits 1 with stderr `error: profile '<name>' not found`.
- [ ] `zeno backend configure` rejects `--token` and `--from-stdin` as unknown flags (no scripting bypass).
- [ ] `zeno backend test --json` on a configured profile prints a single-line JSON object: `{"slug":"claude-code","status":"active","ms":<int>,"ts":<iso8601>}` and exits 0.
- [ ] `zeno backend test` against an `expired` token writes `status='expired'` to DB and exits 1.
- [ ] `zeno backend rotate <slug>` requires `(y/N)` confirmation and aborts on `n` (exit 130) without touching DB.
- [ ] `zeno backend remove <slug>` requires `(y/N)` confirmation, deletes the row(s) from `backend_credentials`, and the materializer's next poll cycle removes `~/.claude/credentials.json` from the container.
- [ ] `zeno backend list --json` returns a JSON array with one entry per catalog backend; the `claude-code` entry includes `slug`, `status`, `last_tested_at`, `scope`.

### Dashboard `/backend` page

- [ ] `apps/dashboard/src/routes/_authed/backend.tsx` exists and renders the Paper V2 compact-rows layout (header `runtime` kicker · `backend` title · description with linked `/backend` mention dropped, since this IS `/backend`).
- [ ] Sidebar (`dashboard-sidebar.tsx`) shows a `backend` entry between `home` and `crons` with the `Cpu` icon. The label `⌘B` appears as a visual hint; pressing `⌘B` does NOT trigger navigation (label-only convention, matching the other shortcut labels).
- [ ] Clicking `backend` in the sidebar navigates to `/backend` and the entry shows the active marker (gold left border + gold label + gold icon stroke).
- [ ] Clicking any action chip (TEST · ROTATE · CONFIGURE) opens a modal showing the equivalent CLI command, a COPY button, and a DOCS↗ link. Closing the modal does not call any mutation.
- [ ] `grep -R "useSaveBackendCredentials\|useStartOAuth\|useSetActiveBackend" apps/dashboard/src` returns zero matches.
- [ ] `grep -R "ActiveBackendSelector" apps/dashboard/src` returns zero matches.
- [ ] The `NavId` union in `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` includes `'backend'`. `navIdForPath` has a `/backend` → `'backend'` branch. TypeScript exhaustiveness check on the sidebar component passes (`tsc --noEmit` clean).
- [ ] `CommandModal` (or the equivalent existing component used to show CLI snippets in the dashboard) has new variant entries for `backend.test`, `backend.rotate`, `backend.configure`. TypeScript exhaustiveness on the `kind` union passes.

### `/settings` updates

- [ ] `/settings` sub-nav shows exactly `PROFILE · CAPABILITIES · ABOUT` — no `BACKEND` entry.
- [ ] The page header description on every `/settings/*` tab is REPLACED (not appended) with the verbatim string: `Edit USER.md inline; flip capabilities. Worker auto-reloads on profile changes. Backend lives at /backend.` The previous copy ("Mostly read-only. Configuration knobs live in .env and profile/...") is removed.
- [ ] Navigating to `/settings/backend` returns a 301 redirect to `/backend`.

### Onboarding rename

- [ ] File `apps/dashboard/src/routes/onboarding.connect-claude.tsx` is renamed to `apps/dashboard/src/routes/onboarding.connect-backend.tsx`. Old file path returns nothing on `git ls-files`.
- [ ] `_authed/index.tsx` `beforeLoad` redirects to `/onboarding/connect-backend` (not `/connect-claude`) when `backend_count == 0`.
- [ ] Hitting `/onboarding/connect-claude` returns a 301 redirect to `/onboarding/connect-backend` (one-line route definition for backwards compat with any cached browser bookmarks).
- [ ] The hero matches Paper B4 (artboard `1AWS-0`): "Welcome to Zeno." · subtitle · command card with `$ zeno backend configure` + COPY + DOCS↗ · helper "claude-code · codex · gemini · pluggable surface" · waiting indicator "polls every 2s".
- [ ] Polling cadence on `/onboarding/connect-backend` is 2 seconds (per-route `refetchInterval`); polling on `/backend` stays at 30 seconds (default).
- [ ] Once any backend in `GET /api/backends` reports `status='active'`, the onboarding page redirects to `/backend` within one poll cycle.

### API surface

- [ ] `apps/api/src/routes/backends.ts` exposes exactly: `GET /api/backends`, `GET /api/backends/:slug`, `POST /api/backends/:slug/test`. All other handlers (`POST /credentials`, `POST /oauth/start`, `PUT /active`) are deleted.
- [ ] `grep -R "process.env.ZENO_BACKEND" apps/ packages/` returns zero matches.
- [ ] Worker boot (`apps/worker/src/index.ts`) selects the active backend by querying `backendSettingsRepo.get('active_backend_id')` and falling back to `'claude-code'` (string literal, not env). Mock-backend tests must insert this row themselves.

### Mock backend / E2E

- [ ] `tests/e2e/fixtures/mock-backend.ts` exists. It inserts a `backend_credentials` row with `backend_id='mock'` and a `backend_settings` row with `('active_backend_id', 'mock')` before the test boots the worker.
- [ ] All E2E tests under `tests/e2e/` pass without `ZENO_BACKEND` ever being set in the environment (verify by `grep -R "ZENO_BACKEND" tests/` returning zero matches outside of an explicit deletion comment).
- [ ] `pnpm run quality-gate` passes (lint + typecheck + tests across all workspaces).

### E2E (Slack)

- [ ] On a freshly-reset profile (`backend_credentials` empty), opening the dashboard redirects to `/onboarding/connect-backend`.
- [ ] After `zeno backend configure` succeeds in another terminal, the onboarding page auto-redirects to `/backend` within 5 seconds.
- [ ] Sending a message to Zeno on Slack after `configure` triggers an agent run that uses the freshly stored claude-code creds (visible in worker logs: `backend=claude-code`).
- [ ] Manually expiring the OAuth token in the DB (`UPDATE backend_credentials SET status='expired'`) and reloading `/backend` shows the EXPIRED banner per Paper B3.
- [ ] Running `zeno backend rotate claude-code` and completing the OAuth flow flips status back to `active` and the next Slack DM succeeds.
- [ ] Three consecutive clean reviews (no diffs against Paper) per artboard (B1, B2, B3, B4, B5) plus one final consolidated review — per the cleanup contract.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `claude setup-token` interactive prompts inside `dockerode.exec` PTY proxy garble characters or fight with the host TTY. This is net-new code (no existing pattern in repo). | Use `dockerode.exec` with `Tty: true` + `AttachStdin/Stdout: true`; pipe through `process.stdin.setRawMode(true)` and proxy bytes both directions until `setup-token` exits. Apply the same ANSI-stripping the api's `oauth-sessions.ts` already does before running URL/TOKEN regexes. Test on macOS + Linux before merging. Fallback: if PTY proxy fails, print recovery instruction pointing the operator at `docker exec -it <container> claude setup-token` as a manual escape hatch. |
| Materializer race: CLI writes to runtime DB, materializer (5s poll) writes cred file to container, but `zeno backend test` runs in parallel against an unrelated DB read. | No race in practice. `claude setup-token` already wrote `~/.claude/credentials.json` inside the container *before* the CLI's regex captured the token (step 7 of S2 happens during `setup-token` execution, not after). When materializer's next poll fires, it overwrites the file with content decrypted from the same row — byte-for-byte identical. `zeno backend test` after `configure` reads the token directly from the runtime DB (decrypts in-process), not from the materialized file, so there is no dependency on the materializer at all. Documented in S2 step 11 + S3 step 3. |
| Removing `process.env.ZENO_BACKEND` breaks operators with `ZENO_BACKEND=mock` set in personal `.env` files. | Pre-merge: `zeno doctor` check that flags `ZENO_BACKEND` in env and prints `warn: ZENO_BACKEND env is no longer read; mock backend now configured via DB. see migration notes.`. Add a one-line note in the PR body and a `BREAKING CHANGE` footer in the merge commit. |
| Operator runs `zeno backend test` while a Slack DM is mid-agent-run — concurrent calls to Anthropic might hit rate limits. | Worker rate-limit budget is per-token, not per-process. The test endpoint adds at most one extra call per minute (manual usage). Acceptable. Document. |
| Test logic divergence: extracting `testClaudeToken` from `apps/api/src/lib/claude-test.ts` to a shared package risks accidental behavior change between api and CLI. | Move the file verbatim with no logic changes (preserve required `{ token, model }` signature); api re-imports from the new location. Add an integration test against a known-bad token ensuring both surfaces produce identical `ClaudeTestResult` shapes. |
| OAuth regex divergence: api and CLI could drift if they hardcode different regex strings. | The catalog JSON (`agent/backends-catalog.json`) is the single source of truth for `auto_flow.stdout_*_regex` strings. The loader currently lives at `apps/api/src/lib/backends-catalog-loader.ts` (private to the api app). It moves to `packages/backends/src/catalog.ts` (alongside `testClaudeToken`); api re-imports from the new location, CLI imports from there too. Both surfaces instantiate `new RegExp(...)` from catalog values at call-site. No string is duplicated. |
| Single PR is large and risks scope creep / hard-to-review diff. | Internal sequencing inside the PR is preserved as commit boundaries (`feat: cli backend subtree`, `chore: remove dashboard mutation surfaces`, `feat: dashboard /backend page`, `chore: rename onboarding`, `chore: drop ZENO_BACKEND env`, `test: e2e`). Each commit is self-contained and reviewable in isolation. |
| Renaming the onboarding route breaks any external doc, Slack template, or browser bookmark pointing at `/onboarding/connect-claude`. | Add a one-line redirect from `/onboarding/connect-claude` → `/onboarding/connect-backend` in TanStack Router. Audit indicates zero external references in the repo; this is purely defensive. |
| Codex appearing in the picker (greyed out) confuses operators who try to select it. | Selection is hard-blocked with `error: codex backend not implemented yet`. Spec acceptance criterion covers this. |

## Open Questions

None blocking. All decisions locked during brainstorming:

- **OAuth ingestion**: docker exec into profile container running `claude setup-token` (locked Q1).
- **F1 transition window**: collapsed — CLI lands and dashboard mutation deletes in the same PR (locked Q2).
- **Env removal**: total nuke including the `mock` path; mock migrates to a DB row inserted by the E2E fixture (locked Q3).
- **Single PR**: confirmed by owner — one branch, one merge.
- **Codex**: visual-only in Paper, zero code in this spec.
