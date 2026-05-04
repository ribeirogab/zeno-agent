---
status: draft
feature: backend-auth-dashboard
created: 2026-05-03
shipped: null
---
# Spec 0071 — Backend auth via dashboard (multi-backend ready)

**Status:** Draft
**Scope:** Move Claude (and future Codex/Gemini/etc) authentication 100% to the dashboard. Remove `CLAUDE_CODE_OAUTH_TOKEN` from `.env`. Storage = new encrypted `backend_credentials` table, profile-scoped, multi-backend. UI = `/settings/backend` tab redesign + dedicated first-run onboarding screen + re-auth flow. Worker boots gracefully without a configured backend; SDK token never enters `process.env` (per `vault/rules/integration-tokens-in-db-only.md`). Encryption Phase 0 introduces real envelope crypto for `backend_credentials` AND backfills `connector_secrets` (today plaintext — security gap).

## Context

Today, Claude is authenticated via `CLAUDE_CODE_OAUTH_TOKEN` env var loaded from `profiles/<name>/.env` at boot (`apps/worker/src/config.ts`). The token is minted via `claude setup-token` CLI inside the container. The token is read into `process.env` and the Claude Agent SDK picks it up implicitly. `agent/mcp.json` ships built-in MCPs; per-profile MCP credentials moved to DB long ago (spec 0058 `connector_secrets`); Slack credentials too (spec 0058 channels-as-connectors). Claude is the last credential still living in `.env`.

Owner intent (2026-05-03 chat):
> "quero q toda essa config/login do claude seja feita atraves do dashboard"
> "1. não manter, a config precisa ser feita pelo dashboard"
> "futuramente vou aceitar outros agents de IA além do claude, tipo codex, gemini e etc, a UI deve ser escalável pra ter N tipos"

The existing rule `vault/rules/integration-tokens-in-db-only.md` already declares that integration tokens belong in DB — but listed Claude OAuth as an explicit exception ("não é tool surface do agent"). The exception was a pragmatic boot-time concession; this spec retires it. The same security concern (anything in `process.env` is `env | grep`-readable by the agent's Bash) applies — so the migration path must NOT hydrate the token into `process.env` either. Token must be passed to the SDK only via the per-`query()` `env` opt OR materialized to `~/.claude/.credentials.json` at boot, with a per-profile `claude_home` volume to prevent cross-profile leakage.

Two parallel subagent counterpoints (security + UX) informed scope. Key adopted findings:
- **Security (CRITICAL):** `connector_secrets.value` is **plaintext today**. Mirroring "the existing pattern" would leak tokens. Spec must include real envelope encryption (per-profile DEK wrapped by master key from env) and backfill `connector_secrets` in the same change.
- **Security (CRITICAL):** Token in `process.env` = `env | grep CLAUDE` exfiltration via agent Bash. Pass via per-`query()` `env` only OR file (`~/.claude/.credentials.json`).
- **Security (HIGH):** `claude_home` shared volume = cross-profile transcript + auth-cache leak. Switch to per-profile `claude_home_<profile>`.
- **UX (HIGH):** First-paint must be a dedicated onboarding screen (no sidebar, single hero CTA), NOT a settings tab. Settings tab is for ongoing management.
- **UX (HIGH):** Failure feedback must distinguish `INVALID_FORMAT` (regex), `UNAUTHORIZED` (401), `RATE_LIMITED` (429), `NETWORK`. Generic "Connection failed" makes operators file issues instead of fixing.
- **UX (MEDIUM):** Re-auth Slack DM on auth failure (single channel notification = silent failure for crons).

## Problem Statement

Operators today must:
1. Open the container shell.
2. Run `claude setup-token`, complete OAuth in browser.
3. Copy the printed token, paste into `profiles/<name>/.env`.
4. Restart the container.

Every fresh setup, every token rotation, every multi-profile install. The dashboard — which already manages connector credentials, channel credentials, USER.md, capabilities, and skills — does NOT manage Claude auth, the most important credential. Worse, the only token still in `.env` violates the project's own DB-only rule (the exception is no longer justified).

Future backends (Codex, Gemini, etc.) need different credential shapes (API keys, OAuth refresh tokens, etc.). A schema and UI assuming "Claude is the only backend" would have to be rewritten the moment the second backend ships. Multi-backend is part of the spec from day one.

## Auth flow — primary (auto) + fallback (paste)

Owner decision (2026-05-03 design review): the operator must **not** type anything in the terminal. The dashboard backend spawns Anthropic's official `claude setup-token` CLI as a child process, streams the device-code URL into the UI as a clickable link, captures the token automatically when the CLI exits, and runs the verification handshake — all from inside the container. The operator's only step is **clicking the OAuth tab and finishing login at claude.ai**.

The flow has four states surfaced in the UI:

1. **idle** — gold "Connect Claude" CTA + collapsed "paste a token manually instead" advanced toggle.
2. **waiting oauth** — cobalt OAuth-link card showing the device-code URL + "open ↗" button + spinner + "listening for token from anthropic" status. Cancel button kills the child process.
3. **verifying** — cobalt verify card + spinner while the captured token is tested with a single Claude API handshake. Token lives in process memory only at this stage.
4. **done** — jade success card + "open dashboard" / "done" button. Token saved encrypted only after the verify step passes.

Failure modes (per error classifier):
- **CLI process error** (`claude setup-token` exits non-zero / unparseable stdout) — red, retry + paste fallback.
- **401 unauthorized** (Anthropic rejected the captured token — account suspended / lapsed / revoked) — red, retry OAuth + paste fallback.
- **429 rate-limited** (test handshake throttled) — gold, retry-test with countdown. Token NOT saved.
- **Network** (couldn't reach Anthropic for the verification handshake) — gold, retry-test or close-keep-untested. Token saved with `status='untested'`.

**Paste fallback** stays available behind the "paste manually instead" toggle as the explicit degradation path. Same token field + classifier, no auto-flow. Used when:
- Anthropic CLI behavior changes and the auto-flow parser breaks (mitigation against output-format drift).
- Operator already has a token in their password manager and wants to skip the OAuth round-trip.
- CI / scripted provisioning (one-shot `POST /api/backends/claude-code/credentials` endpoint accepts a pasted token).

The `INVALID_FORMAT` error classification (regex-fail before submit) is preserved for the paste-fallback path — it can't fire from auto-flow because the CLI emits a valid token shape, but it's the right gate for manual paste.

## Non-Goals

- **Building our own OAuth client against Anthropic.** We wrap Anthropic's official `claude setup-token` CLI (same OAuth client_id Anthropic ships in the CLI binary). We never speak the OAuth protocol ourselves — that would (a) violate Anthropic's stated policy on third-party OAuth use, (b) require a registered `client_id` we don't have, (c) add a redirect surface that the dashboard password gates anyway. The auto-flow is "shell out to Anthropic's CLI and stream its stdout," nothing more.
- **Headless / fully-automated token mint.** The operator must still complete the OAuth flow at claude.ai in their browser — that's Anthropic's device flow, not optional. The auto-flow removes only the terminal copy-paste step, not the human-in-loop OAuth confirmation.
- **Spawning the CLI from the worker container.** The CLI runs from the **api** container (or wherever the dashboard backend lives). The worker stays read-only on credentials.
- **Backend-type picker UI in this spec.** Multi-backend SCHEMA is in scope; multi-backend SELECTOR (active backend radio) is in scope; but installing alternate backends (Codex/Gemini) is a separate spec — this spec ships with `claude-code` as the only catalog entry.
- **Model picker.** SDK default model continues. Future spec.
- **Token rotation automation.** Re-auth is operator-initiated via dashboard. No background refresh / no scheduled rotation. (`auth_expired` triggers UI banner + Slack DM; operator pastes new token.)
- **`docker compose exec zeno claude setup-token` removal.** The CLI helper stays as the way to mint a token. Only its destination changes (paste in dashboard, not write to `.env`).
- **Migration of `connector_secrets` to per-tenant key store / KMS.** Encryption uses a master key from env (`ZENO_MASTER_KEY`). Future spec can layer KMS / OS keychain integration if needed.
- **Multi-user dashboard auth.** Dashboard remains password-protected single-operator (per constitution).
- **Backend health observability beyond status pill + last-tested-at.** No metrics dashboard, no historical charts. (Future spec.)

## Constraints

- **Owner-locked:** no `.env` fallback. `CLAUDE_CODE_OAUTH_TOKEN` is removed from the env-var schema. Migration writes any existing env value to DB once at boot, then refuses to read it again.
- **Constitution:** ports & adapters — new backend types must be additive (catalog entry + auth-form variant), never a modification to the Agent Core.
- **Multi-profile isolation (spec 0050):** each profile's container has its own DB, own credentials, own `claude_home` volume. No sharing between profiles.
- **Stack:** TypeScript strict, Node 24, better-sqlite3, Bolt 4 Slack channel, Claude Agent SDK `^0.2.110`, React + TanStack Router for dashboard, biome, vitest.
- **Imperial Terminal design system** (`DESIGN.md`): dark only, gold (`#d9b362`) primary accent, mono-first labels, sharp radii (`md=4px`, `lg=8px`).
- **Crypto primitives:** Node `crypto` module only. No `libsodium`, no `tweetnacl`. AES-256-GCM with random IV per record. Master key from env, derived per-profile DEK using HKDF.
- **No agent token in `process.env`:** spec 0071's reason for existing — the SDK call must receive the token via per-`query()` `env` opt OR via a `~/.claude/.credentials.json` file written at boot; the parent worker process must NOT have the token in `process.env`.

## User Stories / Scenarios

### S1 — First-time setup (fresh clone, auto-flow)

1. Operator clones repo, fills `.env` (Slack tokens, GH PAT, dashboard password). `CLAUDE_CODE_OAUTH_TOKEN` is no longer in `.env.example` — owner-locked decision.
2. `pnpm run docker:up`. Worker boots, dashboard at `localhost:3000`, NO Claude token.
3. Operator opens dashboard → password gate → lands on `/onboarding/connect-claude` (no sidebar, no nav, single hero — "Welcome to Zeno." + gold "→ CONNECT CLAUDE" CTA + helper "opens claude.ai oauth · token stored encrypted (aes-256-gcm)" + collapsed "› paste a token manually instead" toggle).
4. Operator clicks **Connect Claude**. Dashboard backend spawns `claude setup-token` as a child process inside the api container. Stdout streamed to the UI via SSE.
5. UI flips to **waiting oauth** state: cobalt OAuth-link card showing the device-code URL + "open ↗" button + spinner + "listening for token from anthropic". Cancel kills the child process.
6. Operator clicks **open ↗** → browser tab opens claude.ai OAuth page → operator completes login.
7. CLI captures the token, prints it, exits 0. Dashboard parses the printed token from stdout, saves it to in-memory state, flips UI to **verifying** state (cobalt verify card + spinner).
8. Dashboard runs a single Claude API handshake to confirm the token works. On success, encrypts and persists to `backend_credentials`, materializes `~/.claude/.credentials.json` atomically, flips UI to **done** state (jade success card + gold "open dashboard" button).
9. Operator clicks → lands on `/` (regular dashboard).
10. Mention the bot in Slack → it works.

### S1.alt — Paste fallback (advanced)

1. From the onboarding hero, operator clicks "› paste a token manually instead". Hero swaps for a paste-token form (current MVP design — token field, "Save & Test" button, classification kicker).
2. Operator runs `docker compose exec zeno claude setup-token` themselves, copies the printed token, pastes, hits Save & Test.
3. Same verification handshake → same `done` end state.
4. Used when: auto-flow CLI parser breaks after Anthropic version bump, operator already has a token they want to import, CI provisioning hits the API directly.

### S2 — Token expires mid-use

1. Operator already configured. Slack mention triggers `query()`, SDK returns `auth_expired` (classified by existing `classifyError` in `apps/worker/src/agent/backends/claude-code.ts`).
2. Worker:
   - Replies in Slack: "Claude auth expired. Re-authenticate via the dashboard: <dashboard-url>/settings/backend"
   - Sends a Slack DM to the operator (single message, not threaded) with the same message + clickable link
   - Updates `backend_credentials.status='expired'` for the active backend
   - Sidebar badge in dashboard turns red (status indicator)
3. Operator opens dashboard, sees red badge, clicks → lands on `/settings/backend` → sees Claude card with red `expired` pill + "Re-authenticate" button.
4. Click → opens Configure modal (paste-token form, same as first-run but inline, not full-screen).
5. Paste new token → Save & Test → on success, status flips back to `ok`, sidebar badge clears.

### S3 — Bad token paste

Operator pastes:
- (a) **Empty / wrong format** (regex fails: not `sk-ant-` prefix or wrong length) → inline error BEFORE submit: "This doesn't look like a Claude OAuth token. Tokens start with `sk-ant-`. Re-run `claude setup-token` and copy the full output."
- (b) **Wrong account / 401** → "This token was rejected by Anthropic (401 Unauthorized). It may be revoked or for the wrong account. Re-mint via `claude setup-token`."
- (c) **Rate-limited / 429** → "Anthropic is throttling test requests (429). Wait ~30 seconds and try again." (does NOT save the token in this case — could be a valid token that we just can't verify yet)
- (d) **Network failure** → "Couldn't reach Anthropic. Check your container's outbound network and retry." (saves the token optimistically + flags `status='untested'` so operator can retry from the card)

### S4 — Multi-profile (personal + work)

Operator runs two profiles. Each has its own dashboard at its own port, its own DB, its own `claude_home_<profile>` volume. Operator must paste a token in each dashboard separately. (Documented friction; sharing is not in scope — it would break multi-profile isolation.)

### S5 — Future Codex install (out-of-scope but enabled)

When the Codex backend ships (separate spec):
- `agent/backends-catalog.json` gains a `codex-cli` entry with its own `auth_schema` (e.g. `[{field: "api_key", label: "OpenAI API key", type: "password"}]`).
- `/settings/backend` shows two cards (Claude + Codex). Operator picks active backend via radio.
- Configure modal renders the codex auth form variant.
- Same encrypted storage, same boot-graceful behavior.

## Acceptance Criteria

### Storage + crypto

- [ ] `backend_credentials` table exists with columns `(id TEXT PK, profile_id TEXT, backend_id TEXT, field_name TEXT, value_encrypted BLOB, iv BLOB, created_at INTEGER, updated_at INTEGER, UNIQUE(profile_id, backend_id, field_name))`.
- [ ] `connector_secrets` migrated: `value TEXT` → `value_encrypted BLOB` + `iv BLOB`. Existing rows are encrypted-in-place by the migration script (idempotent — running twice yields same DB).
- [ ] `ZENO_MASTER_KEY` env var validated by zod (32-byte hex, fails fast at boot if missing). `pnpm run docker:setup` first-run script writes a generated value into `profiles/<name>/.env` automatically when `.env` is created from template.
- [ ] All read/write of credentials goes through `packages/storage/src/crypto.ts` (new file): `encrypt(masterKey, profileId, plaintext) → {iv, ciphertext}` and `decrypt(masterKey, profileId, iv, ciphertext) → plaintext`. AES-256-GCM. Per-profile DEK derived via HKDF from `(masterKey, profileId)`.
- [ ] No plaintext credential value appears in any DB column post-migration. `sqlite3 zeno.db "SELECT value_encrypted FROM connector_secrets LIMIT 1"` returns binary blob.
- [ ] `backend_credentials.value_encrypted` is never logged. The dashboard API response shape for `GET /api/backends/:id` returns `{configured: bool, status, last_tested_at}` — never `value`, `value_encrypted`, length, prefix, or sha256.

### Boot + token plumbing

- [ ] Worker starts WITHOUT a configured Claude backend. `pnpm run docker:up` → boot completes, Slack adapter connects, dashboard reachable. Health-check log shows `claude_backend_unconfigured` instead of failing.
- [ ] When a turn fires without configured backend, worker replies in Slack: "Claude is not configured. Open the dashboard and finish setup." (No exception thrown, no crash.)
- [ ] Crons whose backend is unconfigured skip silently (status `skipped_no_backend`) and log once per cron firing.
- [ ] `process.env.CLAUDE_CODE_OAUTH_TOKEN` is **never set** by the worker. Verified by: `cat /proc/$WORKER_PID/environ | tr '\0' '\n' | grep CLAUDE` returns empty inside container.
- [ ] Token is materialized to `/home/node/.claude/.credentials.json` at boot via atomic write (`writeFile(tempPath, …); rename(tempPath, finalPath)`). Re-materialized on every backend-credential change (DB watcher).
- [ ] `claude_home` volume is per-profile in `infra/docker-compose.<profile>.yml` — `claude_home_default`, `claude_home_fn`, etc. Old shared `claude_home` volume is migrated by `infra/migrate-claude-home.sh` (one-shot script: copy contents to per-profile volume on first up).

### UI — first-run onboarding (auto-flow)

- [ ] When NO backend is configured, dashboard root (`/`) redirects to `/onboarding/connect-claude`.
- [ ] `/onboarding/connect-claude` renders WITHOUT sidebar, WITHOUT topstrip — single full-page hero on `canvas`.
- [ ] **idle state:** serif italic display "Welcome to Zeno." + subtitle "One step left: connect Claude. We'll open Anthropic's OAuth in a new tab — no terminal needed." + gold "→ CONNECT CLAUDE" button + helper line + collapsed "› paste a token manually instead" toggle.
- [ ] **waiting oauth state:** cobalt OAuth-link card with device-code URL + "open ↗" button (target="_blank") + spinner + "listening for token from anthropic" status + cancel link. Triggered by Connect Claude click; backend spawns `claude setup-token` and streams stdout via SSE.
- [ ] **verifying state:** cobalt verify card + spinner + "testing token with claude api · a quick handshake to confirm the token before saving" + helper "token in memory · saved only if test passes".
- [ ] **done state:** jade success card "claude-code · active · Token saved encrypted. Backend ready." + gold "open dashboard →" button → routes to `/`.
- [ ] Visiting `/onboarding/connect-claude` after Claude is configured 302-redirects to `/settings/backend`.
- [ ] Paste fallback: clicking "› paste a token manually instead" replaces the hero CTA with the original MVP paste form (token field + Save & Test). Same verify→done sequence post-submit.

### UI — Configure modal (auto-flow + 4 error variants)

- [ ] Configure modal opens when clicking the "configure" / "re-authenticate" button on a backend card. Same 4-state sequence as onboarding hero, condensed to modal density.
- [ ] **idle:** title bar (logo + "configure backend · claude-code" + close X), body "Re-authenticate Claude. We'll open Anthropic's OAuth in a new tab — no terminal needed." + gold "→ CONNECT CLAUDE" button + paste fallback toggle.
- [ ] **waiting oauth:** OAuth-link card + listening status (compact version of onboarding state).
- [ ] **verifying:** verify card + spinner.
- [ ] **done:** success card + gold "DONE" button → closes modal, refreshes the backend card to `active`.
- [ ] **cli error variant:** red error card "cli process · exit 1 — claude setup-token exited non-zero or returned no token. Likely CLI version mismatch or aborted device flow." + retry + paste fallback toggle.
- [ ] **401 unauthorized variant:** red error card "anthropic · 401 unauthorized — Anthropic rejected the captured token. Account may be suspended, plan may have lapsed, or the token was revoked. Token NOT saved." + retry-oauth + paste fallback.
- [ ] **429 rate-limited variant:** gold error card "anthropic · 429 rate-limited — Anthropic is throttling test requests. Wait ~30 seconds and retry. Token NOT saved." + retry-test + countdown timer.
- [ ] **network variant:** gold error card "network · couldn't reach anthropic — Token captured but Anthropic is unreachable. Saved with status 'untested' — retry from the card when the network recovers." + retry-test + close-keep-untested.
- [ ] All error variants surface the failure WITHOUT logging the token value (first/last chars / length / sha256 are never exposed).

### UI — `/settings/backend` redesign

- [ ] `/settings/backend` lists ALL backends from `agent/backends-catalog.json` (today: just `claude-code`). Each = a card with logo + name + description + status pill (`active` / `expired` / `not_configured` / `failed` / `untested`) + "Configure" button (or "Re-authenticate" if `expired`).
- [ ] At top of list: "Active backend: <NAME>" with radio selector (today only one option). Active backend persists in `backend_settings` table (`(profile_id, key='active_backend_id', value)`).
- [ ] Click "Configure" → opens Configure modal (Center modal, dialog-surface, gold-line border, mono-caps title).
- [ ] Configure modal renders fields per backend's `auth_schema` (today: single `oauth_token` password field). Below: "How to mint: `docker compose exec zeno …`" with copy button. Save button is gold primary, disabled while testing.
- [ ] Granular error states render inline below the field with the four classifications (`INVALID_FORMAT`, `UNAUTHORIZED`, `RATE_LIMITED`, `NETWORK`).
- [ ] On save success, modal closes, card pill flips to `active`, toast "Claude connected."

### UI — re-auth flow

- [ ] Sidebar has a small status indicator (8×8 dot) next to the brand mark — green when active backend is `active`, red when `expired` or `failed`. Tooltip on hover.
- [ ] When sidebar dot is red, clicking it routes to `/settings/backend` and auto-opens the Configure modal for the failing backend.
- [ ] When `auth_expired` fires server-side: Slack reply (in-thread or DM as appropriate) AND a separate Slack DM to operator with link.

### Migration + ops

- [ ] `infra/migrate-claude-home.sh` exists; running on first up copies any existing `~/.claude/` contents from the old shared volume to the per-profile volume. Idempotent.
- [ ] If `CLAUDE_CODE_OAUTH_TOKEN` is set in `.env` at boot, worker writes it to DB once (with a one-time log line `claude_token_imported_from_env_legacy`) and the env var is then ignored on subsequent boots. Dashboard shows a one-time banner "Token imported from your old `.env` — you can remove `CLAUDE_CODE_OAUTH_TOKEN` from `.env` now." (Owner already approved removing the fallback; this is the safe one-shot migration helper, not a permanent fallback.)
- [ ] `.env.example` has `CLAUDE_CODE_OAUTH_TOKEN` REMOVED. New `ZENO_MASTER_KEY` is present with comment + auto-generation note.
- [ ] `vault/rules/integration-tokens-in-db-only.md` is updated: Claude OAuth token moves from "continua válido em .env" to the rule body. The rationale paragraph cites this spec.
- [ ] README "Setup" section rewritten: removes step 4 ("Claude OAuth token") and replaces with "After first boot, open the dashboard at localhost:3000 and follow onboarding."

### E2E (per cleanup contract Rule 1)

- [ ] In Slack channel `https://acme.slack.com/archives/C0EXAMPLE000`: mention `@zeno` after fresh boot with no token → bot replies "Claude is not configured…" (graceful, no crash).
- [ ] Configure via dashboard onboarding screen (paste a fresh token) → mention `@zeno` again → bot replies normally with tool listing.
- [ ] Manually corrupt the token in DB (set `value_encrypted` to garbage) → mention → bot replies "Claude auth expired" + DM lands.
- [ ] Re-paste valid token via `/settings/backend` Configure modal → mention → works again.
- [ ] All four error states (INVALID_FORMAT, UNAUTHORIZED, RATE_LIMITED, NETWORK) verified manually in the Configure modal with crafted inputs.

### Quality + tests

- [ ] `pnpm run quality-gate` passes (lint + typecheck + test) on the spec branch.
- [ ] Crypto unit tests cover encrypt/decrypt round-trip, IV uniqueness, master-key rotation safety (encrypted with key A → decrypt with key A succeeds, decrypt with key B fails noisily).
- [ ] Storage repo tests cover `backend_credentials` CRUD, `backend_settings` active-backend toggle, migration idempotency.
- [ ] Worker integration tests cover boot-without-token, boot-with-token, hot-reload on credential change.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Anthropic changes `claude setup-token` stdout format → auto-flow parser breaks.** | Paste fallback is always one click away (idle state shows "› paste manually instead"). Auto-flow CLI parser uses a tolerant regex with explicit failure mode → falls back to paste with a one-line "auto-flow couldn't read token, paste it below" hint. Pin the `claude` CLI version in the Dockerfile and bump deliberately. |
| **Spawned `claude setup-token` child process leaks the token in api container logs.** | Stream stdout to memory only — never logger. Redact known token shape (`sk-ant-*`) at the SSE forwarder boundary as belt-and-suspenders. Child process stdout pipe is closed and buffer wiped after token is captured + verified. |
| **Long-running OAuth (operator walks away mid-flow).** | 5-minute hard timeout on the spawned CLI. Cancel button kills the subprocess. After timeout, dashboard returns to idle state with "OAuth timed out — try again." |
| **Encryption migration corrupts existing `connector_secrets`.** | Migration is wrapped in a transaction. Pre-migration backup written to `profiles/<name>/zeno.db.pre-0071-backup`. Migration tested with seeded fixtures + idempotency assertion. |
| **`ZENO_MASTER_KEY` lost = all credentials unrecoverable.** | First-boot script auto-generates the key into `profiles/<name>/.env`, prints a "BACKUP THIS KEY OFFLINE" warning + adds a README ops section. Operator must keep `.env` backed up — same trust model as today's `.env`-stored tokens. |
| **`claude_home` per-profile migration loses session history.** | One-shot `infra/migrate-claude-home.sh` copies all `~/.claude/projects/<id>/` directories to the per-profile volume. Old shared volume stays in place (operator deletes manually after verifying). |
| **`.credentials.json` write race condition.** | Atomic write via `tempfile + rename`. SDK reads on session start; the watcher pauses queries during rewrite using a per-process mutex. |
| **Operator forgets to set `ZENO_MASTER_KEY` and DB ends up unreadable on second boot.** | Boot fails fast with a clear error: "ZENO_MASTER_KEY not set — run `pnpm run docker:setup` to generate one, or restore from your backup." NOT graceful. |
| **`auth_expired` Slack DM spams operator if many crons fire.** | DM throttled to once per 24h per backend per profile, debounced via `last_auth_alert_at` column on `backend_credentials`. |
| **Existing `.env`-token operators don't notice the migration banner.** | Banner is dismissable but persists across reloads until acked; `dashboard.local_storage` flag only clears on explicit dismiss. |
| **Future Codex/Gemini auth shapes don't fit `auth_schema` JSON contract.** | `auth_schema` is intentionally generic (`[{field, label, type}]`). If a backend needs OAuth (e.g. Google), spec 0071 won't cover it — that backend's spec will extend the schema (possibly add `field.type='oauth-flow'` with a server-mediated handshake). Out of scope here, but the JSON shape is forward-compatible. |
| **Dashboard `connector_secrets` UI breaks when underlying column type changes.** | API repo migrates first (returns the same `{configured: bool}` shape post-decrypt), then UI no-op. Confirm via existing connector tests + manual UI check after migration. |

## Open Questions

- [NEEDS CLARIFICATION: should the active-backend radio default to "no backend" when nothing is configured, or should it pre-select the only catalog entry (claude-code) and let the user just configure it? Lean: pre-select; today there's only one option, and pre-selecting reduces friction. Revisit when a 2nd backend ships.]
- [NEEDS CLARIFICATION: should auth-expired Slack DMs use the operator's user_id from `USER.md` or a configured operator-DM channel? Lean: USER.md `slack_user_id` field (or fall back to the channel where the failure originated as a thread reply only). Add to `USER.md.example` template if we go DM route.]
- [NEEDS CLARIFICATION: should we ship `ZENO_MASTER_KEY` rotation tooling now or defer? Lean: defer. Rotation requires re-encrypting every row; a separate spec when needed.]

## References

- Constitution: [`vault/constitution.md`](../../constitution.md) §"Architecture principles" + §"Tooling and workflow principles" (OAuth-not-API-key constraint).
- Existing rule: [`vault/rules/integration-tokens-in-db-only.md`](../../rules/integration-tokens-in-db-only.md) — this spec retires the Claude exception in §"O que continua válido em `.env`".
- Existing learnings:
  - [`vault/learnings/claude-code-oauth-token.md`](../../learnings/claude-code-oauth-token.md) — Anthropic policy, why we use OAuth not API key.
  - [`vault/learnings/connectors-only-pivot.md`](../../learnings/connectors-only-pivot.md) — connectors-only ergonomics, applied here to backends.
  - [`vault/learnings/channel-vs-connector.md`](../../learnings/channel-vs-connector.md) — same triplet pattern (channel / connector / now backend).
- Storage:
  - `packages/storage/src/migrations.ts` — where the new migration lands.
  - `packages/storage/src/repos/connectors.ts` — the file that needs a crypto wrapper layer.
- Worker:
  - `apps/worker/src/agent/backends/claude-code.ts` — `query()` SDK options, where the per-call `env` opt lives.
  - `apps/worker/src/config.ts` — env validation, where `CLAUDE_CODE_OAUTH_TOKEN` is removed and `ZENO_MASTER_KEY` is added.
  - `apps/worker/src/index.ts` — boot flow, health checks, where graceful-no-token behavior gates SDK calls.
- API:
  - `apps/api/src/routes/` — new `backends.ts` endpoint module, mirrors `connectors.ts`.
- Dashboard:
  - `apps/dashboard/src/routes/settings/backend.tsx` — existing tab gets the redesign.
  - `apps/dashboard/src/routes/onboarding/connect-claude.tsx` — new file for first-run.
- Catalog:
  - `agent/backends-catalog.json` — new file. Mirrors `agent/connectors-catalog.json` and `agent/channels-catalog.json` patterns.
- Paper:
  - `https://app.paper.design/file/01KPYCJ6QXK8Z1PEVQME9262RP` — design lives in the `settings` container artboard (extend) + new `onboarding` container artboard (create).
- Slack channel for E2E: `https://acme.slack.com/archives/C0EXAMPLE000`.
