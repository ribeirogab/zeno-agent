---
status: draft
feature: channels-cli-first
created: 2026-05-11
shipped: null
---
# Channels CLI-First Rework — Spec

**Status:** Draft
**Scope:** Move every channel mutation (install, configure, test, rotate, uninstall) behind a new `zeno channel …` CLI subtree. Make the dashboard `/channels` page read-only and gated by `ZENO_API_WRITES`. Replace the boot-time one-shot Slack credential resolver with a `ChannelManager` that hot-reloads adapters on DB change (subsumes [#51](https://github.com/ribeirogab/zeno-agent/issues/51)). Slack is the only channel in the catalog today; the surface accommodates future channels (Discord, Telegram, WhatsApp) without rework.

## Context

Mirror two prior decisions that proved out the "CLI mutates · dashboard reads" model:

- **Spec 0067 (connectors CLI-first design, [PR #54](https://github.com/ribeirogab/zeno-agent/pull/54))** — locked 100% CLI-only mutations + dashboard `<CommandModal>` pattern + `ZENO_API_WRITES` gate + `X-Zeno-Origin: cli` bypass.
- **Spec 0072 (backend CLI-only management, [PR #56](https://github.com/ribeirogab/zeno-agent/pull/56))** — the same model applied to backends, but using **direct DB writes** instead of the connectors' async `commands` queue.

Channels today are still configured by hand-editing `~/.zeno/profiles/<name>/.env`, with credentials resolved once at worker boot by [`apps/worker/src/channels/slack/resolve-credentials.ts`](apps/worker/src/channels/slack/resolve-credentials.ts). There is no lifecycle (add / test / rotate / uninstall) the operator can run; rotating a Slack token requires editing `.env` and restarting the profile container. The dashboard `/channels` page bypasses the same gate connectors honour — inconsistent and untestable.

This spec brings channels under the same contract: CLI is the only mutation path, dashboard is a read surface, hot-reload happens via the `ChannelManager` polling the DB.

## Problem Statement

1. **No first-class channel lifecycle.** Operator must edit `.env` + restart container to add, rotate, or remove a channel. No `test`. No audit. No discoverability of required secrets.
2. **Dashboard `/channels` is the odd one out.** Connectors and (post-#56) backends already follow the "CLI mutates · dashboard reads" rule. Channels still have action buttons that bypass `ZENO_API_WRITES`.
3. **Hot-reload is missing ([#51](https://github.com/ribeirogab/zeno-agent/issues/51)).** Slack adapter resolves creds once at `start()` and never reacts to DB changes. Rotating a token requires `zeno restart <profile>`.
4. **Surface is Slack-shaped.** Adapter-specific knobs (App Home wiring, signing secret, scopes) leak into the operator surface. Adding Discord later would mean duplicating the surface.

## Non-Goals

- **Adapter implementations beyond Slack.** Discord, Telegram, and WhatsApp adapters are out of scope. The catalog file is structured to accept them later; this spec adds only the Slack entry.
- **Multi-instance channels.** A profile has at most one Slack workspace, one Discord guild set, etc. `instance_label` stays `null` for channels. Multi-instance is reserved for connectors (e.g. multiple Linear workspaces).
- **`zeno channel secret` subcommand.** Issue #57 lists 7 verbs (`list`, `show`, `install`, `configure`, `test`, `rotate`, `uninstall`). Bulk secret rotation lives inside `rotate`. Per-key reveal is not exposed at the channel surface; an operator who genuinely needs it can use `zeno connector secret reveal <slug>` since the underlying row is a `connectors` row with `kind='channel'`.
- **Onboarding `/onboarding/connect-channel` hero page.** Channels are not a hard gate (the worker boots without one, agent reasoning still works via cron + direct CLI). The empty state on `/channels` (single catalog row + INSTALL action chip) carries the affordance. The CH4 hero artboard explored during Paper review was deleted before approval.
- **Migration of legacy `.env`-based Slack credentials.** Per spec 0058, Slack credentials already live in `connector_secrets`; the `.env` fallback was removed. Zero migration code is needed.
- **Per-channel webhook receiver.** Slack uses Socket Mode (outbound WebSocket); no inbound HTTP endpoint to surface in the CLI.

## Constraints

- **Stack locked by the constitution** — TypeScript strict, Node 24 LTS, pnpm + Turborepo, vitest, biome, pino, zod, `@slack/bolt@4`, drizzle + better-sqlite3, citty for CLI.
- **DB is per-profile runtime SQLite at `<workspaceDir>/zeno.db`.** Channels reuse the existing `connectors` + `connector_secrets` tables (`kind='channel'`).
- **CLI talks to the worker over `http://127.0.0.1:<port>`** with `X-Zeno-Origin: cli` to bypass the `ZENO_API_WRITES=cli` gate. Same wire as connectors.
- **Single-user single-profile.** No multi-tenant concerns; `dm_owner_user_id` config remains profile-scoped.
- **No new dependencies.** Everything lands on existing packages.
- **Picker behaviour matches connectors.** TTY without positional → picker (even with one catalog entry). Non-TTY without positional → exit 1.

## Approach

### A1 — Mutation model: direct DB writes, no `commands` queue

**Decision: A — direct writes.** Mirror spec 0072 (backend), not spec 0067 (connectors).

**Reasoning.** Connectors use the async `commands` queue because each install/uninstall spawns or tears down an MCP subprocess with variable latency. Channels share that shape with backends: secret writes, optional one-shot test, no long-running per-command worker process. The `ChannelManager` polls the DB on its own cadence; the CLI does not need to track correlation IDs through a queue. `test` is a synchronous HTTP call returning the probe result directly; `rotate` is an atomic bulk PATCH of secrets.

**Trade-off.** Channels and connectors diverge in storage UX even though they share a table. Acceptable — domain semantics differ. The `ZENO_API_WRITES` gate and `X-Zeno-Origin: cli` bypass remain identical.

### A2 — Schema: reuse `connectors` table with `kind='channel'`; add `updatedAt` to `connector_secrets`

Spec 0058 already added the `kind` column to `connectors` and migrated Slack to a `connector` row. The `connectors` table needs no further changes. **One schema addition is required for hot-reload:** a new `updatedAt` column on `connector_secrets`, populated by every PATCH and queried by the `ChannelManager` poll. This lands as a new drizzle migration `packages/db/src/runtime/migrations/NNNN_connector_secrets_updated_at.sql` (number assigned at implementation time; the migration is idempotent — ALTER + backfill `updatedAt = createdAt`). The row layout for a channel:

```ts
connectors {
  id:            text PK,           // uuid
  slug:          text UNIQUE,       // e.g. 'slack' (single-instance → slug = catalog id)
  displayName:   text,              // 'Slack'
  catalogId:     text,              // 'slack' → agent/channels-catalog.json entry
  kind:          'channel',
  source:        'catalog',
  status:        'enabled' | 'disabled',
  instanceLabel: null,              // channels are single-instance
  lastError:     text | null,
  lastErrorAt:   text | null,
  lastVerifiedAt:text | null,
  createdAt, updatedAt: isoTimestamp,
}

connector_secrets {
  connectorId, key, valueEncrypted, iv, isPublic
}

// e.g. for slack:
//   ('<uuid>', 'SLACK_APP_TOKEN', <encrypted>, <iv>, 0)
//   ('<uuid>', 'SLACK_BOT_TOKEN', <encrypted>, <iv>, 0)
```

Channel **non-secret config** (e.g. `dm_owner_user_id`) is stored as a public secret (`isPublic=1`) under the same `connector_secrets` table. This keeps the storage path uniform and avoids introducing a `connector_config` table for a handful of fields.

### A3 — Catalog: extend `agent/channels-catalog.json`

The file already exists (spec 0057 added `GET /api/channels/catalog`). The Slack entry today carries only a `secrets` array — no public-flagged fields, no `dm_owner_user_id`. This spec replaces that `secrets` array with a single `fields` array carrying a `public` flag, so the storage path (`connector_secrets` with `isPublic` toggled from this flag) is uniform:

```json
[
  {
    "id": "slack",
    "displayName": "Slack",
    "transport": "socket-mode",
    "fields": [
      { "key": "SLACK_APP_TOKEN", "required": true, "public": false, "description": "App-level token (xapp-*)" },
      { "key": "SLACK_BOT_TOKEN", "required": true, "public": false, "description": "Bot user OAuth token (xoxb-*)" },
      { "key": "dm_owner_user_id", "required": false, "public": true, "description": "Restrict DMs to this Slack user id" }
    ],
    "testStrategy": "slack_auth_test"
  }
]
```

`public: false` → stored masked, prompted with hidden input. `public: true` → stored readable, prompted with visible input or passed via a typed CLI flag. The route handler reads the catalog at PATCH time and sets `connector_secrets.isPublic` from the matching field's `public` flag.

`testStrategy` is a string discriminator the worker resolves to a probe function (`slack_auth_test` → `app.client.auth.test()` returning `passed` / `auth_failed` / `timeout`). Adding a future channel means: append a catalog entry + add the matching `testStrategy` handler + ship the adapter implementation. None of those changes touch the CLI surface or the dashboard.

No `available: false` placeholder entries. A catalog entry exists if and only if an adapter exists. The picker shows whatever the catalog returns.

### A4 — `ChannelManager`: poll-based reconciler

New class in [`apps/worker/src/channels/manager.ts`](apps/worker/src/channels/manager.ts). Replaces the boot-time `resolveCredentials → new SlackChannel` pattern at [`apps/worker/src/index.ts:490-502`](apps/worker/src/index.ts) and owns the lifecycle of every channel adapter.

**Lifecycle:**

1. Worker boot: `ChannelManager.start()` reads `connectors WHERE kind='channel' AND status='enabled'`, instantiates each adapter, calls `adapter.start()`, registers the message handler.
2. Poll loop every **2 s** (matches the backend materializer in spec 0072): diff DB state vs running adapters → reconcile.
3. SIGTERM / shutdown: `ChannelManager.stop()` cascades `adapter.stop()` for every running adapter.

**Reconciliation matrix:**

| DB observation | Action |
|---|---|
| New row (install) | spawn adapter, register handler |
| Existing row, secret rotated | `adapter.stop()` → re-instantiate with new creds |
| Existing row, non-secret config changed | `adapter.stop()` → re-instantiate with new config |
| `status='disabled'` | `adapter.stop()`, drop reference |
| Row deleted (uninstall) | `adapter.stop()`, drop reference |
| `status='enabled'` after disabled | spawn adapter |

**Change detection.** Each `connectors` row has `updatedAt`. The `connector_secrets` table does not currently carry `updatedAt`; this spec adds it (single ALTER on the runtime DB, populated as `now` on every PATCH). The manager keeps a `Map<connectorId, { rowUpdatedAt, secretsMaxUpdatedAt }>`. On poll tick, query both timestamps and re-instantiate when either advances. No triggers, no FS watchers — better-sqlite3 has neither natively, and a 2 s lag is acceptable for hot-reload.

**Active-channel dependency for agent core.** The cron runner and the agent orchestrator each hold a single `Channel` reference for outbound `send()` / `react()` calls (see [`apps/worker/src/index.ts:496`](apps/worker/src/index.ts) — currently `slack ?? NoopChannel`). This spec replaces that direct reference with `manager.getActiveChannel()`, a method that returns the lone running adapter when one is installed and a `NoopChannel` singleton otherwise. The agent core resolves `getActiveChannel()` per call (cheap — a single map lookup), so reloads land without restart. `NoopChannel` therefore stays alive as the fallback when zero channels are installed; the spec is not removing it.

**Adapter contract.** The `Channel` interface in [`apps/worker/src/channels/types.ts`](apps/worker/src/channels/types.ts) stays unchanged. `SlackChannel` already implements `start()` / `stop()`; the only adapter-side change is making sure `stop()` is idempotent and resolves before the new instance starts (the existing tests in `boot-integration.test.ts` cover the happy path; an idempotency test will be added).

### A5 — CLI subtree: `zeno channel`

New file tree under [`apps/cli/src/commands/`](apps/cli/src/commands/):

```
channel.ts                 // umbrella defineCommand
channel-list.ts
channel-show.ts
channel-install.ts
channel-configure.ts
channel-test.ts
channel-rotate.ts
channel-uninstall.ts
```

Citty pattern matches `connector-*.ts`. Every subcommand resolves its profile through the same chain as backend and connectors (explicit `--profile` → sticky → picker (TTY) → exit 1 (non-TTY)). Every read command accepts `--json`. Every command accepts `--quiet`. Destructive commands (`uninstall`) require `--yes` in non-TTY.

**Verb semantics:**

| Verb | Wire | Behaviour |
|---|---|---|
| `list` | `GET /api/channels` | Table: slug, type, status, last event, scope. With `--json` emits `ChannelListItem[]`. |
| `show <slug\|uuid>` | `GET /api/channels/:slug` | Full row, secret values masked to last 4 (`xoxb-…1234`); public fields rendered unmasked. Last event + scope. |
| `install <type>` | `POST /api/connectors` with `kind: 'channel'` | Reuses the existing connectors install endpoint (the wire that channels-as-rows-in-`connectors` already uses; see [`apps/api/src/routes/channels.ts`](apps/api/src/routes/channels.ts) header). Resolves catalog entry, prompts every required field, writes the row + all fields in a single transaction. Optional `--secret KEY=VALUE` flags for scripting; positional `<type>` triggers picker only when omitted in TTY. |
| `configure <slug>` | `PATCH /api/channels/:slug/secrets` with `mode: 'merge'` | Sends only the `public: true` catalog fields the operator passed via typed flags (e.g. `--dm-owner-user-id U123`). Public and non-public fields share the storage path; the route handler sets `isPublic` from the catalog. |
| `test <slug>` | `POST /api/channels/:slug/test` | Synchronous probe. Returns `passed · Xms` or surfaces the upstream error (`auth_failed`, `timeout`, `not_implemented`). |
| `rotate <slug>` | `PATCH /api/channels/:slug/secrets` with `mode: 'merge'` | Walks every catalog field with `required: true, public: false`, prompts each (hidden input), submits a single atomic PATCH. Same wire as `configure`; only the prompted keys differ. |
| `uninstall <slug> [--yes]` | `DELETE /api/channels/:slug` | TTY prompts `uninstall channel '<slug>'? (y/N)`; `--yes` skips. Non-TTY without `--yes` → exit 1 with `error: destructive operation requires --yes in non-interactive mode`. Cascade-deletes secrets in the same transaction (FK CASCADE already present on `connector_secrets`). |

**Single-channel picker.** TTY without a positional opens a picker over the catalog (today: only Slack). The picker still appears with one entry — no special-case shortcut. Non-TTY without a positional → exit 1 with a clear `usage: zeno channel install <type>` message. Reasoning: forward-compatible. When Discord lands, the same CLI works without modification.

**JSON schemas.** Add `ChannelListItem`, `ChannelShowJson`, `ChannelCatalogJson`, `ChannelTestJson` to [`apps/cli/src/types/json-output.ts`](apps/cli/src/types/json-output.ts). Per-command shapes, no envelope, no version field — same contract as connectors.

### A6 — Worker API routes

The file [`apps/api/src/routes/channels.ts`](apps/api/src/routes/channels.ts) already exists (specs 0057 and 0059 landed the read surface plus `PATCH /:id/secrets` and `DELETE /:id`). This spec **retrofits** the existing routes with the `ZENO_API_WRITES` gate and adds exactly two new routes (`POST /:slug/test` and the catalog endpoint already present). The full surface after this spec lands:

| Route | Source | Gate | Status code |
|---|---|---|---|
| `GET /api/channels/catalog` | existing (spec 0057) | none | 200 |
| `GET /api/channels` | existing (spec 0057) | none | 200 list |
| `GET /api/channels/:slug` | existing (spec 0059) | none | 200 detail (secrets masked) |
| `GET /api/channels/catalog/setup/:catalogId` | existing (spec 0059) | none | 200 |
| `POST /api/connectors` with `kind: 'channel'` | existing (spec 0058) | retrofit with `ZENO_API_WRITES` + `X-Zeno-Origin: cli` | 201 |
| `PATCH /api/channels/:slug/secrets` | existing (spec 0059) | retrofit with gate **and** thread `isPublic` through repo | 204 No Content |
| `DELETE /api/channels/:slug` | existing (spec 0059) | retrofit with gate | 204 No Content |
| `POST /api/channels/:slug/test` | **new** | gated (side-effecting; writes `lastVerifiedAt` and `lastError`) | 200 + `{ status, latencyMs, error? }` |

**Gate semantics.** With `ZENO_API_WRITES=cli` (default), every mutation route returns `403 { error: 'mode_cli_only', action, cli }` unless `X-Zeno-Origin: cli` is present. The dashboard never sends that header; it surfaces the error in the `<CommandModal>` flow rather than retrying. The `test` route is also gated for the same reason — re-testing has side effects on the row and must remain a CLI action. The disconnected state on the dashboard `CH3` page does not auto-retest; it surfaces `lastError` and offers `ROTATE TOKEN`.

**Status codes.** Reads return 200, mutations return 204 (no body) to match the existing `PATCH /:id/secrets` and `DELETE /:id` handlers. The `test` endpoint is the only mutation that returns a response body, because the CLI displays the probe result.

**Install wire.** Channels are installed via the existing `POST /api/connectors` endpoint with `kind: 'channel'` in the payload (the comment block at the top of `channels.ts` documents this). The CLI command `zeno channel install <type>` calls that route; from the operator's point of view the command tree is cohesive (`zeno channel …`) even though the underlying wire is shared with connectors.

**Data-layer change on `PATCH /:slug/secrets`.** The existing route's body schema (`patchSecretsSchema` in `apps/api/src/routes/channels.ts`) accepts `{ key, value }` pairs and the current handler does not propagate `isPublic` to storage (it calls `replaceSecrets()` without the optional flag, so every row defaults to `isPublic: false`). The repository signature [`replaceSecrets(connectorId, secrets: { key, value, isPublic? }[])`](packages/db/src/runtime/repos/connectors.ts) already accepts the flag; only the channel-route handler needs to change — look up each submitted key against the resolved catalog entry's `fields[]` array and pass `isPublic = field.public` into `replaceSecrets()`. The connectors route stays unchanged. CLI bodies remain catalog-blind — the source of truth for `public`/`required` is the catalog file, not the request.

**Read-side projection change on `GET /:slug`.** The existing handler masks every secret unconditionally. After this spec, the `connector_secrets.is_public` column drives the projection: public fields render unmasked, secret fields render with `last4`. The route response gains an `isPublic: boolean` field on every secret entry so the CLI's `show` verb can decide how to format each row without a second catalog round-trip.

**Shared middleware.** The `blockIfCli` factory used by connectors becomes a top-level export so both `connectors.ts` and `channels.ts` register the same instance.

### A7 — Dashboard `/channels` page

Replace the form-based legacy page with the artboards already approved in Paper (`CH1`, `CH2`, `CH3` plus the `M-ch · CommandModal` variants). The new page:

- Reads `GET /api/mode` once at load to know which UI variant to render. With `ZENO_API_WRITES=cli` (default), the page is read-only: every action chip opens `<CommandModal>` with the corresponding `zeno channel …` command, identical UX to connectors.
- Renders one row per catalog entry (slack today). Status comes from the runtime: `CONNECTED` / `NOT INSTALLED` / `DISCONNECTED`.
- The disconnected state surfaces the red `<Banner>` from CH3 with a `ROTATE TOKEN` action chip when `lastError` indicates an auth failure (`401`, `invalid_auth`, `socket closed 1006`). The error string comes from the worker; the dashboard does not parse it.
- The footer line reflects the actual catalog size (`1 entry` today, grows as the catalog grows). No hard-coded counts.

The existing `<CommandModal>` component is reused unchanged. The five channel variants (install / configure / test / rotate / uninstall) live in the Paper file under `M-ch · CommandModal (channel variants)` for visual reference; in code they are configurations of the same component.

### A8 — `apps/docs` updates

Two changes:

- New `Channels` section in the CLI reference at `apps/docs/content/docs/cli.mdx`. Flag tables are generated automatically by `scripts/generate-cli-flag-tables.ts` from the citty schemas — no hand-written rows.
- New concept page (or update to the existing `channels.mdx`) covering: channel vs connector vs backend, single-instance constraint, hot-reload behaviour, the catalog file, the seven verbs, the `ZENO_API_WRITES` gate.

The docs E2E rehearsal runs every command in the doc against a running CLI before the docs PR merges — same gate that the connectors and backend docs follow.

## User Stories / Scenarios

### S1 — First-time install of Slack on a clean profile

1. Operator runs `zeno profile create personal --owner "Alice"` (existing flow).
2. Operator runs `zeno backend configure` (existing flow).
3. Operator runs `zeno channel install` (no positional, TTY). The picker opens with `slack` as the single entry; operator confirms.
4. CLI shows catalog metadata for Slack (transport, required secrets). Prompts hidden input for `SLACK_APP_TOKEN`, then `SLACK_BOT_TOKEN`. Optional `dm_owner_user_id` defaults to empty.
5. CLI calls `POST /api/channels` with the payload; worker writes the row + secrets atomically.
6. CLI calls `POST /api/channels/slack/test`; worker probes `auth.test`, returns `passed · 84ms`.
7. CLI prints `slack · connected`. `ChannelManager` poll picks up the new row within 2 s and spawns the adapter. Operator mentions `@zeno` in Slack — the bot responds.

### S2 — Rotating Slack tokens after a workspace owner regenerated them

1. Operator runs `zeno channel rotate slack` (TTY).
2. CLI walks the catalog's `secrets` array, prompts each (hidden input). Both `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` are required.
3. CLI submits `PATCH /api/channels/slack/secrets` with both values in one body; worker updates both rows in a single transaction, bumps `updatedAt`.
4. `ChannelManager` poll detects the secret change, stops the existing adapter, re-instantiates with the new tokens, calls `start()`. Total reload latency ≤ 4 s (one poll tick + adapter restart).
5. CLI immediately calls `POST /api/channels/slack/test` and prints the result.

### S3 — Slack disconnects mid-session (websocket closed 1006)

1. Slack websocket drops; `SlackChannel` emits an error.
2. Worker writes `lastError='socket closed 1006 · 401 invalid_auth'`, `lastErrorAt=now`, sets `status` unchanged (the row is still `enabled`; only the live adapter failed).
3. Dashboard `/channels` polls the API and renders the red `SLACK WEBSOCKET DISCONNECTED` banner from CH3.
4. Operator clicks `ROTATE TOKEN` chip → `<CommandModal>` shows `zeno channel rotate slack`. Operator runs the command; flow S2 resumes.

### S4 — Read-only dashboard rejects a mutation attempt

1. Dashboard mounted in `ZENO_API_WRITES=cli` mode.
2. Operator clicks `UNINSTALL` chip → `<CommandModal>` opens with the destructive variant (red border) showing `zeno channel uninstall slack --yes`.
3. Modal has no submit button; clicking `Copy` puts the command on the clipboard. No HTTP call happens from the browser.
4. If a previous dashboard build with the legacy form is still running, it issues `DELETE /api/channels/slack` without the `X-Zeno-Origin: cli` header; worker returns `403 { error: 'mode_cli_only', action: 'uninstall', cli: 'zeno channel uninstall slack --yes' }`.

### S5 — Adding Discord later (illustrative only, not part of this spec's acceptance)

Listed here only to validate that the design generalises beyond Slack. This scenario is **not** in the acceptance criteria; the only adapter this spec ships is Slack.

1. A future spec lands a `DiscordChannel` adapter, a `slack_auth_test`-style probe handler, and a new entry in `agent/channels-catalog.json`.
2. Without touching the CLI, the dashboard, or this spec's code, `zeno channel install` now shows two entries in the picker. The seven verbs all work. The dashboard `/channels` page renders two rows.

## Acceptance Criteria

### CLI

- [ ] `zeno channel list` on a profile with Slack installed prints exactly one row containing the slack slug, current status, last event timestamp, and the scope `aes-256-gcm`.
- [ ] `zeno channel list --json` emits a single-element array matching the exported `ChannelListItem` type in [`apps/cli/src/types/json-output.ts`](apps/cli/src/types/json-output.ts).
- [ ] `zeno channel show slack` masks both `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` to their last 4 characters; the unmasked value never appears in stdout or stderr.
- [ ] `zeno channel install` in TTY without a positional opens a picker showing one entry (`slack`) and waits for confirmation; pressing Enter installs.
- [ ] `zeno channel install` in non-TTY without a positional exits 1 with stderr `usage: zeno channel install <type>`.
- [ ] `zeno channel install slack --secret SLACK_APP_TOKEN=xapp-x --secret SLACK_BOT_TOKEN=xoxb-x` completes without any TTY prompt and exits 0.
- [ ] `zeno channel install slack` twice on the same profile returns a single connector row in the DB and exits 0 on the second run with stderr `slack already installed`.
- [ ] `zeno channel test slack` against a valid token prints `passed · <ms>` and exits 0 within 5 s.
- [ ] `zeno channel test slack` against an invalid token prints `failed · auth_failed` and exits 1.
- [ ] `zeno channel rotate slack` prompts both required secrets in order, then submits a single `PATCH` call (verified by network log); intermediate state never leaks (no partial DB row).
- [ ] `zeno channel uninstall slack` in TTY prompts `uninstall channel 'slack'? (y/N)`; answering `n` exits 0 without DB changes.
- [ ] `zeno channel uninstall slack` in non-TTY without `--yes` exits 1 with stderr `error: destructive operation requires --yes in non-interactive mode`.
- [ ] `zeno channel uninstall slack --yes` removes the connector row and every `connector_secrets` row for that `connectorId`, atomically.
- [ ] Every subcommand accepts `--quiet` and emits no spinners, no headers, no ANSI escape sequences.
- [ ] Every subcommand accepts `--profile <name>` and resolves to that profile's API URL; with no flag and no sticky profile in non-TTY, exits 1 with `no profile specified. use --profile <name>`.

### API

- [ ] `POST /api/connectors` with `kind: 'channel'` and **no** `X-Zeno-Origin: cli` header while `ZENO_API_WRITES=cli` returns `403 { error: 'mode_cli_only', action: 'install', cli: 'zeno channel install <type>' }`.
- [ ] `POST /api/connectors` with `kind: 'channel'`, `X-Zeno-Origin: cli`, and a valid body returns `201` with the created row and persists one `connectors` row plus N `connector_secrets` rows in a single transaction.
- [ ] `GET /api/channels` returns an array; every item carries `lastEventAt`, `lastError`, and `lastErrorAt` (nullable).
- [ ] `GET /api/channels/:slug` accepts either the slug or the UUID.
- [ ] `PATCH /api/channels/:slug/secrets` without `X-Zeno-Origin: cli` while `ZENO_API_WRITES=cli` returns `403 { error: 'mode_cli_only', action: 'rotate' | 'configure', cli: 'zeno channel rotate <slug>' }`.
- [ ] `PATCH /api/channels/:slug/secrets` with `mode: 'merge'` and a single public field (e.g. `dm_owner_user_id`) updates only that row's `connector_secrets` entry and leaves other secrets untouched.
- [ ] `PATCH /api/channels/:slug/secrets` rejects partial bodies in `mode: 'replace'` with `400 { error: 'missing_required_secrets', keys: [...] }` when a catalog field with `required: true` is omitted.
- [ ] `POST /api/channels/:slug/test` returns `{ status: 'passed' | 'failed', latencyMs: number, error?: string }` within 5 s; on timeout the call returns `{ status: 'failed', latencyMs: <elapsed>, error: 'timeout' }` instead of hanging.
- [ ] `POST /api/channels/:slug/test` without `X-Zeno-Origin: cli` while `ZENO_API_WRITES=cli` returns `403 { error: 'mode_cli_only', action: 'test', cli: 'zeno channel test <slug>' }`; the dashboard never calls this route.
- [ ] `POST /api/channels/:slug/test` updates `lastVerifiedAt` on `passed` and writes `lastError`+`lastErrorAt` on `failed` in the same transaction as the response.
- [ ] `DELETE /api/channels/:slug` cascade-deletes the row's secrets atomically (verified by `SELECT count(*) FROM connector_secrets WHERE connector_id = ?` returning 0 after the call).

### ChannelManager

- [ ] Worker boot with Slack installed: `manager.getActiveChannel()` returns the `SlackChannel` instance.
- [ ] Worker boot with **no** channels installed: `manager.getActiveChannel()` returns the `NoopChannel` singleton (fallback, not an error).
- [ ] A `PATCH /api/channels/slack/secrets` followed by no other action causes the running adapter to stop and restart within 4 s (≤ 2 × poll interval). Verified by observing one `channel_adapter_stopped` followed by one `channel_adapter_started` log entry within the window.
- [ ] `DELETE /api/channels/slack` causes the running adapter to stop within 4 s and `manager.getActiveChannel()` to return `NoopChannel` again.
- [ ] `SIGTERM` to the worker stops every running channel adapter before the process exits; observed by exactly one `channel_adapter_stopped` log entry per adapter.
- [ ] The manager does **not** re-instantiate an adapter whose row and secrets have not changed since the last poll: zero `channel_adapter_started` log entries during a 10 s idle observation window.
- [ ] Concurrent reconciliation is prevented: two manually injected back-to-back poll triggers fire `reconcile()` exactly once (verified by an in-process counter).

### Dashboard

- [ ] `/channels` with `ZENO_API_WRITES=cli` renders no submit buttons; every action chip opens `<CommandModal>` with the corresponding command string.
- [ ] The disconnected state renders the red banner from CH3 whenever `GET /api/channels/slack` returns a non-null `lastError`.
- [ ] Footer reads `catalog · agent/channels-catalog.json · 1 entry · pluggable surface` today; the count comes from the API response, not a hard-coded string.

### Docs

- [ ] `apps/docs/content/docs/cli.mdx` has a new `Channels` section with one subsection per verb; flag tables are imports from `@/generated/cli-flags/channel-*.mdx`.
- [ ] Every example command in the new Channels section runs against a live CLI without error during the docs E2E rehearsal.
- [ ] The concept page `apps/docs/content/docs/channels.mdx` is updated to describe single-instance channels, the seven verbs, hot-reload via `ChannelManager`, and the `ZENO_API_WRITES` gate.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| 2 s poll lag during hot-reload feels sluggish when rotating a token mid-incident. | CLI's `rotate` command issues an immediate `POST /test` after the PATCH; the operator sees a probe result inside the same command, before the manager poll fires. |
| `ChannelManager` race: two pollers running concurrently (e.g. supervisor restarts mid-tick). | Manager guards itself with an in-process `isReconciling` boolean; missed ticks are recoverable on the next poll. The worker process is a singleton per profile, so cross-process races do not apply. |
| Catalog file drift between worker and CLI. | Catalog is read **only** by the worker, never by the CLI. The CLI fetches catalog metadata via `GET /api/channels/catalog`. Single source of truth. |
| `auth.test` against Slack with an invalid token blocks for >5 s. | API handler wraps the probe in an `AbortController` with a 5 s timeout; on timeout returns `{ status: 'failed', error: 'timeout' }` rather than hanging the CLI. |
| Dashboard built against pre-CLI-first surface still ships, hits the gate. | Server returns `403 { cli: '...' }` with the exact command in the body; the dashboard logs the command to the console for the operator. No silent failure. |
| `dm_owner_user_id` stored as `isPublic=1` secret is awkward semantically. | Acceptable trade-off — keeps one storage path. A future migration to a `connector_config` table is straightforward (single INSERT, single SELECT). |

## Open Questions

None. Every decision listed in the design summary was answered during the brainstorm and validated against the existing connectors / backend specs and the approved Paper artboards (`CH1`, `CH2`, `CH3`, plus the `M-ch · CommandModal` variants).
