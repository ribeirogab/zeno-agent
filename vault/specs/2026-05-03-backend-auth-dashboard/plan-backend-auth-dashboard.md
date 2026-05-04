---
feature: backend-auth-dashboard
spec: "[[spec-backend-auth-dashboard]]"
created: 2026-05-03
---
# 0071 — Backend auth via dashboard — Plan

**For this spec:** `[[spec-backend-auth-dashboard]]`

## Approach

The change touches every layer (storage, worker, api, dashboard, infra, docs). It must land in a strict order or fail open: the crypto layer must exist before any encrypted column is written; the catalog + storage tables must exist before the api endpoints can read or write them; the api endpoints must exist before the dashboard UI can call them; the dashboard UI must exist before E2E. Each phase ends with the entire codebase still booting + `pnpm run quality-gate` green.

**Phase 0 (crypto + env)** introduces `packages/storage/src/crypto.ts` with AES-256-GCM envelope encryption and a per-profile DEK derived via HKDF from a single `ZENO_MASTER_KEY`. The master key is validated by zod at boot. We add a one-shot generator (`pnpm run docker:setup`) that writes a fresh hex value into `profiles/<name>/.env` when missing, with a `BACKUP THIS KEY OFFLINE` warning. No DB column is touched yet — the crypto module is pure.

**Phase A (storage)** adds two tables: `backend_credentials (id, profile_id, backend_id, field_name, value_encrypted BLOB, iv BLOB, status, last_tested_at, last_auth_alert_at, created_at, updated_at, UNIQUE(profile_id, backend_id, field_name))` and `backend_settings (profile_id, key, value)` (used today only for `active_backend_id`). Same migration backfills `connector_secrets` from `value TEXT` to `value_encrypted BLOB + iv BLOB` in a single transaction with a pre-write backup of `zeno.db` to `zeno.db.pre-0071-backup`. Both repos go through the new crypto module — no plaintext is ever passed to SQL.

**Phase B (catalog)** adds `agent/backends-catalog.json` mirroring the existing `connectors-catalog.json` and `channels-catalog.json` patterns. Today's only entry is `claude-code` with `auth_schema: [{field: "oauth_token", type: "password", label: "OAuth token"}]` and a logo path pointing at the already-vendored `agent/assets/backends/claude-code.png`. A small loader in `apps/api/src/lib/backends-catalog.ts` reads + zod-validates the catalog at boot and exposes it to the api routes.

**Phase C (worker)** removes `CLAUDE_CODE_OAUTH_TOKEN` from `apps/worker/src/config.ts`'s zod schema and from the runtime entirely. Boot becomes graceful: if no row exists in `backend_credentials` for the active backend, the worker logs `claude_backend_unconfigured` and continues. A new module `apps/worker/src/agent/credentials.ts` reads the encrypted token from DB at query time (cached in-process for the request lifetime, never written to `process.env`), and a separate `apps/worker/src/agent/credentials-materializer.ts` writes the decrypted token to `~/.claude/.credentials.json` at boot + every credential change (atomic temp+rename, mutex-guarded). The `ClaudeCodeBackend.query()` SDK call passes the token via per-call `env` opt — `process.env.CLAUDE_CODE_OAUTH_TOKEN` is **never set**. A chokidar watcher on `backend_credentials` table file (or polling, since SQLite doesn't expose row events natively) fires the materializer. When a turn fires without a configured backend, the worker returns a typed error caught by the channel adapter, which posts "Claude is not configured. Open the dashboard and finish setup." Crons in the same situation skip silently with `status='skipped_no_backend'`.

**Phase D (infra)** changes the docker-compose volume from a single shared `claude_home` to per-profile `claude_home_<profile>`. A one-shot `infra/migrate-claude-home.sh` copies the existing volume's contents to the per-profile volume on first up — idempotent, leaves the old shared volume in place for manual cleanup.

**Phase E (api)** adds `apps/api/src/routes/backends.ts` mirroring `connectors.ts` patterns. Endpoints: `GET /api/backends` (list catalog + per-backend status), `GET /api/backends/:id`, `POST /api/backends/:id/credentials` (paste-token path: validates regex, calls verification handshake, writes encrypted row on success), `POST /api/backends/:id/oauth/start` (spawns `claude setup-token` as child process, returns session id), `GET /api/backends/:id/oauth/:session/stream` (SSE: device-code URL frame, status frames, terminal frame with token or error), `POST /api/backends/:id/oauth/:session/cancel` (kills child + cleans up), `POST /api/backends/:id/test` (verification handshake). The OAuth-flow process registry lives in-memory keyed by session id, with a 5-minute hard timeout. The verification handshake calls Claude with a minimal prompt (`{ model: 'claude-haiku-4-5', max_tokens: 1, messages: [{role:'user', content:'1'}] }`) and classifies the response into `{ ok | invalid_format | unauthorized | rate_limited | network }` per the spec's classifier.

**Phase F (dashboard — settings/backend)** rebuilds `apps/dashboard/src/routes/_authed/settings.tsx`'s backend tab per the Paper artboards (`0071 · /settings/backend (default | claude expired | not configured)`). New components: `<ActiveBackendSelector>`, `<BackendCard>` (with status pill + Configure/Re-authenticate button), `<ConfigureModal>` (8 states: idle / waiting-oauth / verifying / done / cli-error / 401 / 429 / network + paste-fallback expanded). The modal's auto-flow uses a `useOAuthSession` hook backed by `EventSource` against the SSE endpoint. The paste path uses the existing mutation pattern with the new `POST /api/backends/:id/credentials` endpoint. The sidebar gets a small status dot (8×8) next to the brand mark — green when active backend `status === 'active'`, red when `expired` / `failed`.

**Phase G (dashboard — onboarding)** adds a new route `apps/dashboard/src/routes/onboarding/connect-claude.tsx` outside the `_authed` tree (still gated by dashboard password but no sidebar/topstrip). Hero per Paper artboards. Root route (`/`) gets a redirect: when no backend is configured, push to `/onboarding/connect-claude`. The onboarding route reverse-redirects to `/settings/backend` when a backend is already configured.

**Phase H (re-auth flow)** wires the existing `classifyError` `auth_expired` branch to: (a) write `status='expired'` to `backend_credentials`, (b) post a Slack DM to the operator (debounced via `last_auth_alert_at` to once per 24h per backend), (c) reply in the originating thread with the same message + dashboard link. The dashboard polls backend status every 30s and flips the sidebar dot to red when any backend is `expired` or `failed`.

**Phase I (migration + ops)** strips `CLAUDE_CODE_OAUTH_TOKEN` from `profiles/default/.env.example`, adds `ZENO_MASTER_KEY=<generate-with-openssl-rand-hex-32>`, rewrites the README setup section, updates `vault/rules/integration-tokens-in-db-only.md` (removes the Claude exception, cites this spec), and adds the one-time legacy import: at worker boot, if `CLAUDE_CODE_OAUTH_TOKEN` is in `process.env`, write it to DB once, log `claude_token_imported_from_env_legacy`, and ignore the env on subsequent boots. The dashboard surfaces a one-time dismissable banner: "Token imported from your old `.env` — you can remove `CLAUDE_CODE_OAUTH_TOKEN` from `.env` now."

**Phase J (verification)** runs the cleanup contract's 3-round clean review on the whole batch + E2E in the Slack channel `https://acme.slack.com/archives/C0EXAMPLE000` covering all 5 scenarios from the spec (S1 fresh boot, S1.alt paste fallback, S2 token expires mid-use, S3 bad-paste classifications, S4 multi-profile sanity).

## Architecture

```
packages/storage/src/
  ├─ crypto.ts                          # NEW: AES-256-GCM + HKDF DEK derivation
  ├─ migrations.ts                      # +0071 migration: backend_credentials, backend_settings, encrypt connector_secrets
  └─ repos/
     ├─ backend-credentials.ts          # NEW: get/upsert/delete (always through crypto)
     ├─ backend-settings.ts             # NEW: KV for active_backend_id
     └─ connectors.ts                   # MODIFIED: read/write through crypto

agent/
  ├─ backends-catalog.json              # NEW: { backends: [{ id, name, description, logo, auth_schema, setup_doc_url }] }
  └─ assets/backends/claude-code.png    # already vendored

apps/api/src/
  ├─ lib/backends-catalog.ts            # NEW: loader + zod schema
  ├─ lib/oauth-sessions.ts              # NEW: in-memory registry (sessionId → child process + SSE clients)
  ├─ lib/claude-test.ts                 # NEW: verification handshake against Claude API + classifier
  └─ routes/backends.ts                 # NEW: REST + SSE endpoints

apps/worker/src/
  ├─ config.ts                          # MODIFIED: drop CLAUDE_CODE_OAUTH_TOKEN, add ZENO_MASTER_KEY
  ├─ agent/credentials.ts               # NEW: read decrypted token from DB on demand (in-memory cache)
  ├─ agent/credentials-materializer.ts  # NEW: atomic write ~/.claude/.credentials.json from DB
  ├─ agent/credentials-watcher.ts       # NEW: poll backend_credentials.updated_at → re-materialize
  ├─ agent/backends/claude-code.ts      # MODIFIED: pass token via per-call env opt; never set process.env
  ├─ index.ts                           # MODIFIED: graceful no-token boot + legacy env import
  └─ channels/.../*                     # MODIFIED: catch typed "no backend" error → user-facing reply

apps/dashboard/src/
  ├─ routes/onboarding/connect-claude.tsx    # NEW: hero with 4 states + paste fallback
  ├─ routes/_authed/settings.tsx             # MODIFIED: backend tab redesign (active selector + cards)
  ├─ routes/_authed/layout.tsx               # MODIFIED: sidebar status dot + root redirect to onboarding
  ├─ components/backend/active-selector.tsx  # NEW
  ├─ components/backend/backend-card.tsx     # NEW
  ├─ components/backend/configure-modal.tsx  # NEW: 4 + 4 + 1 = 9 states
  ├─ components/backend/oauth-link-card.tsx  # NEW: device-code URL + Open btn + spinner
  ├─ components/backend/paste-token-form.tsx # NEW: paste fallback (extracted)
  ├─ hooks/use-oauth-session.ts              # NEW: EventSource wrapper
  ├─ hooks/use-backends.ts                   # NEW: TanStack Query
  └─ lib/mutations.ts                        # +useSaveBackendCredentials, +useTestBackend, +useCancelOAuth

infra/
  ├─ docker-compose.default.yml         # MODIFIED: claude_home → claude_home_default
  ├─ docker-compose.<example>.yml              # MODIFIED: claude_home → claude_home_<example>
  ├─ migrate-claude-home.sh             # NEW: one-shot copy from shared volume to per-profile
  └─ Dockerfile                         # MODIFIED if needed (pin claude CLI version)

profiles/default/
  └─ .env.example                       # MODIFIED: remove CLAUDE_CODE_OAUTH_TOKEN, add ZENO_MASTER_KEY

vault/rules/
  └─ integration-tokens-in-db-only.md   # MODIFIED: drop Claude exception, cite this spec

README.md                               # MODIFIED: setup section
```

Data flow — onboarding auto-flow:

```
Operator opens dashboard (no backend configured)
  ↓
GET /api/backends → status: not_configured
  ↓
Root route redirects → /onboarding/connect-claude (idle state)
  ↓
Operator clicks "Connect Claude"
  ↓
POST /api/backends/claude-code/oauth/start
  ↓
api spawns child: `claude setup-token`
api stores session in OAuthSessionRegistry { sessionId, childProcess, subscribers }
api returns { sessionId }
  ↓
Dashboard opens EventSource → GET /api/backends/claude-code/oauth/:sessionId/stream
  ↓
api streams stdout lines, classified into events:
  - { type: 'device_code_url', url: 'claude.ai/oauth/...' }
  - { type: 'status', text: 'waiting for browser auth' }
  - { type: 'token_captured' } (no value!)
  - { type: 'verifying' }
  - { type: 'success' } | { type: 'error', kind: 'cli'|'401'|'429'|'network' }
  ↓
Dashboard renders state per event (waiting → verifying → done)
  ↓
On 'success': api encrypted-writes backend_credentials, materializer fires, ~/.claude/.credentials.json updated atomically
  ↓
Dashboard "Open Dashboard" button → router.navigate('/')
  ↓
Operator mentions @zeno → ClaudeCodeBackend.query() reads encrypted token from DB → passes via per-call env opt → SDK works
```

Data flow — paste fallback:

```
Operator clicks "› paste manually instead" (idle or any error state)
  ↓
UI swaps to <PasteTokenForm />
  ↓
Operator pastes token, hits Save & Test
  ↓
Client-side regex check: ^sk-ant-oat\d{2}-[A-Za-z0-9_-]{50,}$
  - fail → INVALID_FORMAT inline error
  - pass → POST /api/backends/claude-code/credentials { token }
  ↓
api runs same verification handshake (claude-test.ts)
  - 401 → return { error: 'unauthorized' }
  - 429 → return { error: 'rate_limited' } (NOT saved)
  - network → encrypted-write with status='untested', return { ok: true, status: 'untested' }
  - ok → encrypted-write with status='active', return { ok: true, status: 'active' }
  ↓
Modal flips to done state OR error variant
```

Data flow — token expires mid-use:

```
ClaudeCodeBackend.query() → SDK throws → classifyError returns 'auth_expired'
  ↓
worker:
  ├─ updateBackendStatus({ id: 'claude-code', status: 'expired', last_auth_alert_at: maybeNow })
  ├─ if (now - last_auth_alert_at > 24h):
  │    slack.postDM(operator.user_id, "Claude auth expired. Re-authenticate at <dashboard>/settings/backend")
  │    update last_auth_alert_at
  └─ slack.postMessage(thread, "Claude auth expired. <dashboard link>")
  ↓
dashboard polls /api/backends every 30s
  ↓
sidebar dot turns red
  ↓
operator clicks dot → /settings/backend → red EXPIRED pill on Claude card
  ↓
Click Re-authenticate → Configure modal (auto-flow as in onboarding)
  ↓
On success: status='active', last_auth_alert_at=null, materializer re-writes file, next agent turn works
```

## File Structure

| File | Change |
|---|---|
| `packages/storage/src/crypto.ts` | **NEW** — AES-256-GCM `encrypt(masterKey, profileId, plaintext)` / `decrypt(...)` + HKDF DEK |
| `packages/storage/src/migrations.ts` | +0071 migration block (3 statements: create `backend_credentials`, create `backend_settings`, alter `connector_secrets` to encrypt-in-place) |
| `packages/storage/src/repos/backend-credentials.ts` | **NEW** |
| `packages/storage/src/repos/backend-settings.ts` | **NEW** |
| `packages/storage/src/repos/connectors.ts` | MODIFIED — wrap value reads/writes through `crypto.ts` |
| `packages/storage/tests/crypto.test.ts` | **NEW** — round-trip, IV uniqueness, wrong-key fail |
| `packages/storage/tests/repos/backend-credentials.test.ts` | **NEW** |
| `packages/storage/tests/repos/backend-settings.test.ts` | **NEW** |
| `packages/storage/tests/migrations.test.ts` | + idempotency test for 0071 (run twice, identical schema) |
| `agent/backends-catalog.json` | **NEW** |
| `apps/api/src/lib/backends-catalog.ts` | **NEW** — loader + zod |
| `apps/api/src/lib/oauth-sessions.ts` | **NEW** — in-memory registry + 5min timeout |
| `apps/api/src/lib/claude-test.ts` | **NEW** — handshake + classifier |
| `apps/api/src/routes/backends.ts` | **NEW** |
| `apps/api/src/index.ts` or `routes/index.ts` | MODIFIED — register `backends.ts` |
| `apps/api/tests/routes/backends.test.ts` | **NEW** |
| `apps/api/tests/lib/oauth-sessions.test.ts` | **NEW** |
| `apps/api/tests/lib/claude-test.test.ts` | **NEW** — mocked Claude API responses for each classification |
| `apps/worker/src/config.ts` | MODIFIED — drop `CLAUDE_CODE_OAUTH_TOKEN`, add `ZENO_MASTER_KEY` (32-byte hex) |
| `apps/worker/src/agent/credentials.ts` | **NEW** — `getActiveBackendToken({ profileId, backendId })` reads encrypted DB row, returns plaintext (in-process; never logged) |
| `apps/worker/src/agent/credentials-materializer.ts` | **NEW** — `materializeClaudeCredentials({ profileId, claudeHome })` atomic temp+rename |
| `apps/worker/src/agent/credentials-watcher.ts` | **NEW** — poll `backend_credentials.updated_at` every 5s; re-materialize on change |
| `apps/worker/src/agent/backends/claude-code.ts` | MODIFIED — read token via `credentials.getActiveBackendToken`; pass via per-call `env` opt; remove any reliance on `process.env.CLAUDE_CODE_OAUTH_TOKEN` |
| `apps/worker/src/index.ts` | MODIFIED — `healthChecks` skips claude OAuth check if no DB row; legacy env import block; wire materializer + watcher; pass typed "no_backend" error to channels |
| `apps/worker/src/channels/slack/handlers.ts` (or equiv) | MODIFIED — catch `no_backend` typed error → reply with onboarding link |
| `apps/worker/src/cron/runner.ts` | MODIFIED — skip cron firing if `getActiveBackendToken` returns null; log `cron_skipped_no_backend` once |
| `apps/worker/tests/agent/credentials.test.ts` | **NEW** |
| `apps/worker/tests/agent/credentials-materializer.test.ts` | **NEW** — temp+rename atomicity |
| `apps/worker/tests/agent/backends/claude-code.test.ts` | + test that token is passed via opt.env, not process.env |
| `apps/worker/tests/index.test.ts` (or boot.test.ts) | + boot-without-token test |
| `apps/dashboard/src/routes/onboarding/connect-claude.tsx` | **NEW** |
| `apps/dashboard/src/routes/__root.tsx` (or auth layout) | MODIFIED — root redirect to onboarding when no backend |
| `apps/dashboard/src/routes/_authed/settings.tsx` | MODIFIED — backend tab body replaced with new components |
| `apps/dashboard/src/components/backend/active-selector.tsx` | **NEW** |
| `apps/dashboard/src/components/backend/backend-card.tsx` | **NEW** |
| `apps/dashboard/src/components/backend/configure-modal.tsx` | **NEW** — 9 states |
| `apps/dashboard/src/components/backend/oauth-link-card.tsx` | **NEW** |
| `apps/dashboard/src/components/backend/paste-token-form.tsx` | **NEW** |
| `apps/dashboard/src/components/sidebar/status-dot.tsx` | **NEW** |
| `apps/dashboard/src/hooks/use-oauth-session.ts` | **NEW** — EventSource wrapper |
| `apps/dashboard/src/hooks/use-backends.ts` | **NEW** — TanStack Query, 30s refetch |
| `apps/dashboard/src/lib/mutations.ts` | + `useSaveBackendCredentials`, `useTestBackend`, `useStartOAuth`, `useCancelOAuth`, `useSetActiveBackend` |
| `apps/dashboard/tests/routes/onboarding-connect-claude.test.tsx` | **NEW** |
| `apps/dashboard/tests/components/backend/configure-modal.test.tsx` | **NEW** |
| `apps/dashboard/tests/hooks/use-oauth-session.test.ts` | **NEW** |
| `infra/docker-compose.default.yml` | MODIFIED — `claude_home` → `claude_home_default` (rename volume + remove `external: true`) |
| `infra/docker-compose.<example>.yml` | MODIFIED — same rename for `<example>` profile |
| `infra/migrate-claude-home.sh` | **NEW** — one-shot copy from old shared volume to per-profile |
| `infra/Dockerfile` | + pin `@anthropic-ai/claude-code` CLI version |
| `profiles/default/.env.example` | MODIFIED — remove `CLAUDE_CODE_OAUTH_TOKEN`, add `ZENO_MASTER_KEY` |
| `infra/docker.sh` | + `setup` subcommand (generates `ZENO_MASTER_KEY` if missing) |
| `package.json` | + `docker:setup` script alias |
| `vault/rules/integration-tokens-in-db-only.md` | MODIFIED — drop Claude exception, cite spec 0071 |
| `README.md` | MODIFIED — setup section rewrite |

## Phase Ordering

1. **Phase 0 — crypto + env** (smallest blast radius; pure module + new env var; no DB write)
2. **Phase A — storage** (depends on 0; idempotent migration; new repos)
3. **Phase B — catalog** (depends on A; static config + loader)
4. **Phase C — worker plumbing** (depends on A + B; biggest single phase; graceful boot + materializer)
5. **Phase D — per-profile claude_home** (orthogonal to C but must land before E2E to avoid cross-profile leakage)
6. **Phase E — api routes** (depends on A + B + C; the surface dashboard calls)
7. **Phase F — dashboard settings/backend redesign** (depends on E)
8. **Phase G — dashboard onboarding** (depends on E + F; root-redirect logic)
9. **Phase H — re-auth flow** (depends on C + F; wiring across worker + dashboard)
10. **Phase I — migration + docs** (depends on everything; .env, README, rule, legacy import)
11. **Phase J — verification** (3-round clean review + E2E + open PR)

Each phase ends with `pnpm run quality-gate` green and a single conventional commit (or commit per task in big phases like C, E, F). Branches: one feature branch `feat/spec-2026-05-03-backend-auth-dashboard` for the whole spec; PR opened only at end per cleanup contract.

## Risks / Open Decisions

- **`ZENO_MASTER_KEY` first-boot generation**: `infra/docker.sh setup` writes the key to `.env`; if `.env` already exists with the key, no-op. If `.env` exists WITHOUT the key, append it. The script must NEVER overwrite an existing key (would brick all encrypted rows). Add a unit-shell-test to verify.
- **Claude CLI version pinning**: spec lists this as a risk. Pinning in the Dockerfile means we control when the CLI's stdout format can change underneath us. Mitigation: the OAuth-flow stdout parser is a tolerant regex; if the regex fails, we surface the `cli` error variant + paste fallback is one click away.
- **`zeno-default_claude_home` rename**: Docker treats `claude_home` as a top-level volume name. Renaming to `claude_home_default` requires `docker volume rm claude_home` after migration (operator does this manually after verifying their data is in the new volume). The migration script copies, doesn't move.
- **Verification handshake cost**: 1 token of generated text per save → cheapest possible. Use `claude-haiku-4-5-20251001` for the handshake to minimize spend.
- **Multi-profile isolation of OAuth sessions**: the in-memory `OAuthSessionRegistry` is per-api-process. Each profile has its own api process (one container per profile per spec 0050) → no cross-talk possible. Confirm in the test suite by spawning two registries and asserting session ids don't collide / can't be looked up across instances.
- **SSE through reverse proxies**: future deployment behind nginx/traefik may buffer SSE. For local Docker the api serves directly on port 3000, no proxy. Document that SSE-friendly proxy config is operator's responsibility if they ever front the dashboard with one.
- **Sidebar status dot polling vs server-sent events**: 30s polling is the simplest. SSE could push, but adds another long-lived connection per dashboard session. 30s latency is fine for "your token expired 2 hours ago" (you'd see it in the next minute).
- **Slack DM operator user_id source**: the spec defers this — lean on the `slack_user_id` field in `USER.md` (parse via existing USER.md parser); fall back to a thread reply only when the field is absent.
- **Rule of "never log the token"**: enforced via a `_redactToken` helper inside the crypto module + a logger redactor on `value_encrypted` and `oauth_token` field names. Add a test that logs a token and asserts the captured stream contains no substring of the original.
- **Legacy env import idempotency**: import only fires when the env is set AND no DB row exists for `(profile, claude-code, oauth_token)`. After the first import, the row exists; subsequent boots see it and skip the env. Operator may keep the env var around for now; we just won't read it. Banner persists until dismissed via dashboard local-storage flag.
- **Pre-migration backup retention**: `zeno.db.pre-0071-backup` stays in `profiles/<name>/` indefinitely; document that operators can delete it after a successful boot. Don't auto-delete.
- **Token rotation when materializer is mid-write**: per-process mutex around the `temp + rename` block. SDK's read of `~/.claude/.credentials.json` happens at session-start time; mid-session rotations don't impact in-flight queries (SDK already has the token in process memory). Worst case: a query fires during a rotation and reads the old credentials file (still valid until rejected); the next query reads the new file.
