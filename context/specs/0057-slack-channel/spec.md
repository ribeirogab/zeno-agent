---
status: draft
feature: slack-channel-connector-code
created: 2026-04-29
shipped: null
---
# Spec 0057 — Slack as channel connector (code)

**Status:** Draft
**Branch:** `feat/spec-0057-slack-channel` (worktree: `../zeno-agent-worktrees/0057-slack-channel/`)
**Scope:** Refactor Zeno's Slack listener so it's a registrable **channel** of `kind: 'channel'` (vs existing `kind: 'mcp'` connectors), with credentials read from the DB `connector_secrets` table (managed via dashboard) instead of hardcoded `SLACK_APP_TOKEN`/`SLACK_BOT_TOKEN` envvars in `profiles/<name>/.env`. **Code-only** — `profiles/fn` is NOT migrated in this spec; the `.env` path stays working as backward-compat fallback. Validation is in-process (unit + integration with mocked Slack). Live cutover of `profiles/fn` is the next spec (0058). Stacked on `main`.

## Context

Today's Zeno has a clean ports-and-adapters core for channels (`apps/worker/src/channels/types.ts` defines the `Channel` interface; `apps/worker/src/channels/slack/adapter.ts` implements `SlackChannel`). The adapter is fully functional — it speaks Slack Bolt, handles socket-mode events, downloads attachments, and reaches the agent core via the `MessageHandler` callback. But the **bootstrap path** is hardcoded:

- `apps/worker/src/config.ts:4-5` declares `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` as required envvars (Zod-validated `xapp-` / `xoxb-` prefixes).
- `apps/worker/src/index.ts:362` does `new SlackChannel({...config.slack, workspaceDir: config.workspaceDir})` — credentials flow directly from `process.env` → `config.slack` → constructor.
- The Slack credentials live in `profiles/fn/.env`; if missing, the worker fails to boot.

Every other integration (Sentry, Linear, GitHub, Klaviyo, Swarmia, Playwright) is managed via the dashboard:

- An entry in `agent/connectors-catalog.json` describes the connector (id, name, transport, transport config, secrets, tools, icon, docs URL, etc.).
- The user installs it via `/connectors` UI; the install creates a row in `connectors` table and writes secrets to `connector_secrets`.
- The worker boots dynamic MCP servers from `connectors` rows (see `apps/api/src/lib/mcp-snapshot.ts` and `apps/worker/src/agent/mcp.ts`).

Slack is the lone exception. This is an architectural inconsistency that gets worse with every future channel (Telegram, WhatsApp). Each new channel today would need its own envvars and bootstrap branch — exactly the divergence we want to prevent.

The goal of spec 0057 is to make Slack a **first-class registrable channel**, governed by the same catalog + secrets + dashboard mechanism as everything else. Once 0057 ships, adding Telegram is "new entry in the channels catalog + new adapter class + register in worker" — pure data + adapter, no fork in the bootstrap logic.

## Problem Statement

Two problems, both rooted in the same architectural inconsistency:

1. **Slack credentials are envvars while everything else is DB-managed.** A new user cloning the repo today must edit `profiles/<name>/.env` to add Slack tokens — they get a pure dashboard onboarding for everything else but a manual file edit for the most fundamental piece (the channel they'll talk to Zeno through).

2. **The bootstrap forks per channel kind.** Adding Telegram tomorrow means duplicating the envvar pattern (`TELEGRAM_BOT_TOKEN` etc.) plus the bootstrap branch. Two channels = two forks. Five channels = five forks. The right answer is one bootstrap path that iterates over a list of installed channels from the catalog.

Spec 0057 fixes the architecture without breaking anyone — `profiles/fn` keeps working untouched on the existing `.env` path until spec 0058 cuts over.

## Non-Goals

The following are explicitly OUT of scope for spec 0057:

- **Migrating `profiles/fn` to the new path.** That is spec 0058 (production cutover, executed live with rollback plan + backup of `.env`).
- **Removing the `.env` fallback from code.** The fallback stays in this PR; a follow-up commit (or spec 0058's optional last commit) removes it after cutover stabilizes.
- **Adding Telegram, WhatsApp, or any new channel.** Those are future specs (0066+ TBD). 0057 ships the *infrastructure* to register channels — the only registered channel after 0057 is Slack.
- **Slack-side feature changes.** No new Slack capabilities (no slash commands, no DMs to other users, no new event handlers). The adapter behavior is identical to today; only its bootstrap path changes.
- **Changing the `Channel` interface.** `apps/worker/src/channels/types.ts` already defines a clean port — no API surface changes.
- **Routing changes.** Mention-triggered agent dispatch stays the same. Future "skill X handles channel Y" routing is out of scope.
- **Real Slack workspace validation.** Tests are in-process (mocked Slack). Live boot against the FN workspace is intentionally deferred to spec 0058 (because two socket-mode connections to the same Slack app conflict — running 0057's sandbox against the live Slack would compete with `profiles/fn`'s active container).
- **Refactoring connectors-catalog.json itself.** The MCP catalog stays as-is. Channels get a separate file (see Approach Q3).
- **Multi-channel support.** Worker boots ONE channel for now (Slack). Iterating over a list of installed channels is naturally enabled but only Slack populates the list in this spec.

## Approach

The refactor has 4 parallel tracks of change, gated by tests at each step. Each track is independently testable.

### Track 1 — Storage layer

Extend the existing `connectors` table with a `kind` discriminator. **No new tables** — channels and MCP connectors share storage so dashboard CRUD (install / uninstall / update secrets / view secrets) works identically for both kinds without code duplication.

Schema change (migration):

```sql
ALTER TABLE connectors ADD COLUMN kind TEXT NOT NULL DEFAULT 'mcp'
  CHECK (kind IN ('mcp', 'channel'));
```

Existing rows get `kind = 'mcp'` automatically (default). The current `transport CHECK (transport IN ('stdio','remote'))` constraint is **kept** — channels don't use `transport` (no MCP server spawn), so for channel rows we'll insert `transport = 'remote'` as a placeholder to satisfy the existing constraint without altering it. (SQLite ALTER COLUMN is awkward; sticking with the existing constraint and using `'remote'` semantically meaning "not an MCP server, runtime-managed adapter" is the lowest-risk path. Schema cleanup of `transport` for channels can come later if it bothers anyone — it's invisible to the user via dashboard.)

`Connector` TypeScript type (`packages/storage/src/types.ts`) gains:

```ts
export type ConnectorKind = 'mcp' | 'channel';

export interface Connector {
  // ... existing fields ...
  kind: ConnectorKind;
}
```

`ConnectorRepo` (`packages/storage/src/repos/connectors.ts`) methods that read/write rows handle the new field. New helper: `ConnectorRepo.listByKind(kind: ConnectorKind): Connector[]`.

### Track 2 — Catalog: `agent/channels-catalog.json`

New file `agent/channels-catalog.json`, parallel to `agent/connectors-catalog.json`. Shape:

```json
{
  "_doc": "Curated channel adapters offered to the operator in the dashboard. Each channel is a transport that delivers messages to the agent core. Adding an entry here makes it appear under /channels (or wherever the dashboard surfaces channel install). The runtime stores channel configuration in the connectors table (kind=channel) after install — this file is the directory.",
  "version": 1,
  "channels": [
    {
      "id": "slack",
      "name": "Slack",
      "description": "Talk to Zeno from a Slack workspace. The bot listens via socket-mode and replies in the same channel/thread.",
      "icon": "slack.svg",
      "docsUrl": "https://api.slack.com/apis/socket-mode",
      "secrets": [
        {
          "key": "SLACK_APP_TOKEN",
          "label": "App Token",
          "help": "Starts with `xapp-`. Generate at api.slack.com → your app → Basic Information → App-Level Tokens. Required scope: `connections:write`.",
          "required": true
        },
        {
          "key": "SLACK_BOT_TOKEN",
          "label": "Bot Token",
          "help": "Starts with `xoxb-`. Found at api.slack.com → your app → OAuth & Permissions → Bot User OAuth Token. Required scopes: `app_mentions:read`, `chat:write`, `files:read`, `files:write`, `im:history`, `im:read`, `im:write`, `reactions:read`, `reactions:write`.",
          "required": true
        }
      ]
    }
  ]
}
```

(Slack icon file goes to `agent/assets/icons/slack.svg` — already part of the convention.)

A loader in `apps/api/src/lib/channels-catalog-loader.ts` (parallel to `catalog-loader.ts` for connectors) reads + parses + validates the file. Both loaders share helpers where reasonable.

### Track 3 — Worker boot wiring (DB-first with `.env` fallback)

Refactor `apps/worker/src/index.ts:362` to:

1. Query `connectors` table for `kind='channel' AND slug='slack' AND status='enabled'`.
2. If a row exists: load secrets from `connector_secrets` (keys `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`); construct `SlackChannel` with those. Log `slack_creds_source: 'connector_secrets'`.
3. If no row exists OR row exists but secrets are missing **and** `.env` has the legacy envvars: construct `SlackChannel` from `.env`. Log `slack_creds_source: 'env_fallback'`.
4. If row exists with empty secrets (installed but credentials never saved): **hard error** (`Slack channel installed but credentials missing — fix via dashboard or uninstall`). Do NOT silently fall back to `.env` in this case — empty secrets after install is operator misconfiguration, not "uninstalled".
5. If neither path yields creds: hard error (`Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env`).

The `config.ts` Zod schema for `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` becomes **optional**:

```ts
SLACK_APP_TOKEN: z.string().startsWith('xapp-').optional(),
SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),
```

(Worker boot still loads `config.slack` with the optional values; the new resolver in `index.ts` handles the DB-first / env-fallback / error logic.)

**Logging discipline:** every boot logs the credential source explicitly. This prevents the spec 0058 cutover from being a "did the install work?" guess — the worker logs say which path won.

### Track 4 — Dashboard endpoints (read-only catalog)

Channels need to appear in the dashboard for the operator to install. Endpoint pattern matches the existing connectors flow:

- `GET /api/channels/catalog` → list of catalog entries (read-only).
- `GET /api/channels` → list of installed channels (i.e., `connectors` rows filtered by `kind='channel'`).
- Install / uninstall / secrets management: **reuse the existing connectors endpoints** (`POST /api/connectors`, `DELETE /api/connectors/:id`, etc.) since channels are stored in the same table. The existing endpoints either gain a `kind` parameter or auto-derive from the catalog being installed (TBD at implementation time — minor).

Dashboard UI changes are NOT in scope for spec 0057. The endpoints are added so spec 0058 can install Slack via dashboard, but the UI section "Channels" itself is a follow-up (or part of 0058's pre-flight). The endpoints work via direct curl / API calls in the meantime.

### Q1 — Migration strategy: DECIDED (DB-first with `.env` fallback)

Inside spec 0057 (code-only), the worker resolves Slack credentials with this priority:

1. DB (`connector_secrets` of installed Slack channel)
2. `.env` (legacy `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN`)
3. Hard error

**Counterpoint subagent endorsed this** with 3 callouts incorporated:
- Log explicit source per boot (`slack_creds_source: 'connector_secrets' | 'env_fallback'`).
- Document precedence direction: installing via dashboard OVERRIDES `.env`. (This is intentional — once an operator installs via dashboard, the dashboard becomes authoritative; `.env` is the legacy crutch.)
- Empty `connector_secrets` row = hard error, NOT silent fallback. An installed-but-empty channel is misconfiguration, not "uninstalled".

### Q2 — Routing model: DECIDED (unchanged)

Today, an `@zeno-agent` mention received via the Slack adapter triggers the agent core directly via `MessageHandler`. After spec 0057, the adapter still delivers `MessageHandler` events directly to the agent core. **No routing-table layer**. Multiple channels in the future (Telegram, WhatsApp) all dispatch the same way. Per-skill / per-channel routing rules are out of scope (would be a separate future spec if and when the operator needs them).

### Q3 — Catalog model: DECIDED (parallel `channels-catalog.json`, shared storage)

After counterpoint review, channels deserve a **separate catalog file** (`agent/channels-catalog.json`) because they are ontologically distinct from MCP connectors:

- A connector is something the agent **calls** (outbound MCP tool invocation).
- A channel is something the agent **runs inside of** (inbound transport, lifecycle, identity).

But storage is **shared** — the `connectors` table reused with a `kind` discriminator. Pragmatic compromise: clean separation where it matters (catalog file, dashboard UI sections, type system), shared infrastructure where duplication would be wasteful (CRUD, secrets management).

This avoids the discriminated-union mess (where every consumer has to branch on `entry.type === 'mcp' | 'channel'`) AND avoids duplicating `connector_secrets` / install endpoints / UI flows for what is fundamentally the same "configurable third-party integration" lifecycle.

## Architecture

### Component map (after spec 0057)

```
agent/
├── connectors-catalog.json        # MCP-tool connectors (existing) — unchanged
├── channels-catalog.json          # NEW: channel transports (Slack initially)
└── assets/icons/
    ├── sentry.svg, linear.svg, ...   # existing
    └── slack.svg                  # NEW

packages/storage/
├── src/migrations.ts              # new migration: ALTER TABLE connectors ADD COLUMN kind
├── src/types.ts                   # Connector.kind: 'mcp' | 'channel'
└── src/repos/connectors.ts        # listByKind(kind), filter helpers

apps/api/src/
├── lib/channels-catalog-loader.ts # NEW: load + validate channels-catalog.json
├── routes/channels.ts             # NEW: GET /api/channels/catalog, GET /api/channels
└── routes/connectors.ts           # extend POST/PATCH/DELETE to handle kind=channel rows

apps/worker/src/
├── config.ts                      # SLACK_*_TOKEN become optional
├── channels/
│   ├── types.ts                   # unchanged
│   └── slack/                     # unchanged
└── index.ts                       # NEW resolver: DB → env → error, with explicit logging
```

### Data flow at boot

```
[ Worker boot (apps/worker/src/index.ts main()) ]
        |
        v
[ Load config (env-only, validates required envs other than SLACK_*) ]
        |
        v
[ Open DB ] -----> [ ConnectorRepo.listByKind('channel') ]
                              |
                              v
                  [ row(slug='slack', enabled)? ]
                  /                            \
                YES                             NO
                 |                               |
                 v                               v
       [ load secrets from DB ]      [ legacy .env path? ]
                 |                       /            \
                 v                     YES             NO
       [ secrets present? ]             |              |
        /            \                  v              v
       YES            NO         [ build SlackChannel ]   [ throw ]
        |              |          [ from .env ]
        v              v          [ log: env_fallback ]
[ build SlackChannel ]   [ throw "Slack installed but
[ from DB secrets   ]      empty secrets" ]
[ log: connector_secrets ]
        |
        v
[ slack.start(messageHandler) ]
[ worker ready ]
```

Note: only ONE channel is bootstrapped in 0057 (Slack). Future channels iterate the same loop over `listByKind('channel')` and instantiate per `slug` via a registry — out of scope here, naturally enabled by the structure.

### Test strategy (in-process, no Docker, no real Slack)

**Unit tests:**

- `ConnectorRepo.listByKind` — verifies filter behavior, indexing, edge cases (no rows, all rows wrong kind).
- Migration test — inserts pre-migration rows, runs migration, verifies `kind = 'mcp'` populated; verifies new constraint allows `mcp` and `channel` only.
- `channels-catalog-loader.ts` — valid file parses; malformed JSON errors; missing required fields error; unknown `kind` error.
- Worker boot resolver (extracted to a function `resolveSlackCredentials({ db, env, logger })` for testability) — covers all 5 cases:
  1. DB row present + secrets → returns DB creds, logs `connector_secrets`.
  2. No DB row + env present → returns env creds, logs `env_fallback`.
  3. DB row present + empty secrets → throws (hard error).
  4. No DB row + no env → throws (hard error).
  5. DB row disabled + env present → falls back to env (disabled rows ignored as "not installed").

**Integration tests:**

- API `GET /api/channels/catalog` → returns catalog entries.
- API `GET /api/channels` (empty / with one installed) → returns expected shape.
- API `POST /api/connectors` with `kind=channel` payload → row inserted with `kind='channel'`.
- Worker boot in-process (against in-memory DB) — using `SlackChannel` with mocked Bolt client. Verifies the channel `start()` is called; verifies `MessageHandler` wired correctly.

**No real Slack interaction.** The Bolt `App` client is mocked at the integration boundary (the existing `SlackChannel` constructor accepts opts; we pass a wrapped App for tests). This intentionally leaves "real Slack workspace test" to spec 0058.

### Error handling

| Failure mode | Behavior | Log signal |
|---|---|---|
| DB unreachable at boot | Crash with clear error (existing behavior) | `db_open_failed` |
| Migration fails | Crash with clear error (existing behavior) | `migration_failed` |
| `channels-catalog.json` malformed | API logs warning, returns empty list; worker boot uses fallback | `channels_catalog_invalid` |
| Slack DB row present, secrets missing | Hard error at worker boot (config error) | `slack_creds_empty_after_install` |
| No DB row + no env | Hard error at worker boot (must configure) | `slack_creds_missing` |
| Slack `start()` fails (network / bad token) | Existing behavior (worker exits, container restarts) | `slack_start_failed` |

## Test plan / Success criteria

This spec ships when ALL the following pass on the branch:

**Code quality (in-process, run from worktree):**
- [ ] `pnpm run quality-gate` (lint + typecheck + test across all workspaces) — green.
- [ ] New tests added: ≥6 new test cases (one per resolver scenario above + at least 1 catalog-loader test + 1 migration test).
- [ ] No new `any` / `// biome-ignore` violations introduced.
- [ ] Worker boot resolver extracted into testable function; not inline in `main()`.

**Architectural acceptance:**
- [ ] `agent/channels-catalog.json` exists, validates against new loader, contains Slack entry with documented secrets.
- [ ] `agent/assets/icons/slack.svg` exists.
- [ ] DB migration adds `kind` column; existing rows defaulted to `kind='mcp'` automatically; new constraint enforced.
- [ ] `Connector` type carries `kind` field; `ConnectorRepo` exposes `listByKind`.
- [ ] Worker boot resolves Slack credentials via the documented priority (DB → env → error) with the 3 logging callouts.
- [ ] API endpoints `GET /api/channels/catalog` + `GET /api/channels` work; install via existing connectors endpoints accepts `kind=channel`.
- [ ] `config.ts` Zod schema makes `SLACK_*_TOKEN` optional. Worker boots successfully when `.env` lacks them AND a Slack channel is installed in DB.

**Backward compat (the "don't break Operator's Zeno" criterion):**
- [ ] `profiles/fn` is NOT touched — no edits to `profiles/fn/.env`, no new files in `profiles/fn/`, no skills materialized for it.
- [ ] An existing profile with `SLACK_*_TOKEN` set in `.env` and NO Slack DB row boots via the env fallback path. Verified by integration test — NOT by booting `profiles/fn` (which would conflict with the live container).
- [ ] No Docker commands run by this PR's tests. No port conflicts with `zeno-fn-agent-1`.

**Documentation:**
- [ ] `context/learnings/<atomic-note>.md` capturing the channels-vs-connectors distinction (created at end of implementation per project convention).
- [ ] `agent/channels-catalog.json` has a clear `_doc` field explaining its purpose.

**3-round review:**
- [ ] R1+R2+R3 reviews on the branch CLEAN consecutive (per cleanup contract Rule 2).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Migration ordering — adding `kind` to `connectors` while running profiles still on the old schema | Migration is additive only (no DROP / no constraint tightening on existing values). Default `kind='mcp'` makes all existing rows valid post-migration. Tested with a snapshot of `profiles/fn` schema as fixture. |
| `transport` constraint forces a meaningless value for channel rows | Use `transport='remote'` semantically as "runtime-managed, no MCP spawn" for channel rows. Documented in spec + repo. Cleanup possible later if it bothers; not a 0057 concern. |
| Tests pass in mocked env but live Slack boot breaks something subtle | This is exactly why 0058 exists. 0057 explicitly does NOT claim production-readiness for the `profiles/fn` cutover; that risk is deferred and managed in 0058 with rollback plan + backup of `.env`. |
| `.env` fallback code stays forever as dead crud | Optional 0058's last commit removes the fallback after cutover stabilizes. Tracked in 0058's plan, not 0057's. |
| Channels catalog loader semantics drift from connectors loader | Share helpers where reasonable (validation, file reads). Both loaders tested side-by-side. If drift becomes a problem, refactor to a generic catalog loader with `kind`-specific validators. |
| Dashboard UI doesn't show Channels section yet — operator can't install via UI | Spec 0058 (cutover) handles UI install. For 0057 alone, the install can happen via direct API call (`curl -X POST /api/connectors -d '{...kind: channel...}'`). UI section is a follow-up, NOT a 0057 blocker. |
| Worker boot resolver's "DB row exists + secrets missing" edge case is rarely hit, hard to test | Explicit unit test fixture (insert row with no secrets, assert hard error). Documented as expected operator-error behavior. |
| Adding `kind` column to a populated DB on `profiles/fn` breaks the running container when the migration runs at next boot | NOT A 0057 RISK. 0057 doesn't run the migration on `profiles/fn`. 0058 will, with backup + rollback. |

## Open Questions

None blocking. Three were closed before writing this spec:

- **Q1 (migration strategy):** DB-first with `.env` fallback. Closed.
- **Q2 (routing):** Unchanged — mention triggers agent core directly. Closed.
- **Q3 (catalog model):** Parallel `channels-catalog.json` with shared storage layer. Closed (counterpoint subagent influenced the call).

If new questions surface during implementation:
- Should `agent/channels-catalog.json` ship Slack as the only entry, or include a placeholder for Telegram so the structure is established? **Recommendation: Slack only, per YAGNI.** Telegram entry comes when its spec ships.
- Should the channels-catalog JSON shape mirror connectors-catalog 1:1 (for parser reuse) or diverge where channels have no analogous field (no `transport`, no `tools`)? **Recommendation: diverge cleanly.** Different concept = different shape; loader normalizes for the dashboard.

## Out-of-scope follow-ups

- **Spec 0058 — production cutover.** Install Slack via dashboard (or curl), validate live, remove `SLACK_*` from `profiles/fn/.env`, optionally remove `.env` fallback code from worker.
- **Channel UI section in dashboard.** Spec 0058 may include a small UI tweak; full Channels page redesign is a future polish spec.
- **Multi-channel boot loop.** Worker iterates `listByKind('channel')` and instantiates each via a registry. Not needed until spec 0066 (Telegram) lands.
- **`transport` schema cleanup for channel rows.** Currently using `'remote'` as a placeholder. Future migration could either relax the constraint or rename the column. Cosmetic, not a correctness issue.
- **Skill-to-channel routing rules** (e.g., "skill X only responds in channel Y"). Future spec, when concrete need arises.
- **Replacing `.env` for ALL profiles** (not just `profiles/fn`). The fallback handles any profile; cutover is per-profile. New profiles just install via dashboard from day one.
