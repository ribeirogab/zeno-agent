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
- The worker boots dynamic MCP servers from `connectors` rows via `apps/worker/src/agent/mcp-build.ts` (`buildMcpServersMap()` iterates `ConnectorRepo.getEnabledWithRelations()`).

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

Schema change (new migration, id=18 — currently last is id=17 per `packages/storage/src/migrations.ts`):

```sql
ALTER TABLE connectors ADD COLUMN kind TEXT NOT NULL DEFAULT 'mcp'
  CHECK (kind IN ('mcp', 'channel'));
```

Both the `NOT NULL` constraint AND the `CHECK (kind IN ('mcp', 'channel'))` constraint are mandatory. Without the CHECK, the DB silently accepts arbitrary strings for `kind`, defeating the type discriminator. Existing rows get `kind = 'mcp'` automatically (default). The current `transport CHECK (transport IN ('stdio','remote'))` constraint is **kept** — channels don't use `transport` (no MCP server spawn), so for channel rows we'll insert `transport = 'remote'` as a placeholder to satisfy the existing constraint without altering it. (SQLite ALTER COLUMN is awkward; sticking with the existing constraint and using `'remote'` semantically meaning "not an MCP server, runtime-managed adapter" is the lowest-risk path. Schema cleanup of `transport` for channels can come later if it bothers anyone — it's invisible to the user via dashboard.)

**Three locations in `packages/storage/src/` must be updated together** — missing any one silently drops the field on read:

1. **`packages/storage/src/types.ts`** — `Connector` interface gains `kind: ConnectorKind` and a new exported type:
   ```ts
   export type ConnectorKind = 'mcp' | 'channel';

   export interface Connector {
     // ... existing fields ...
     kind: ConnectorKind;
   }

   export interface CreateConnectorInput {
     // ... existing fields ...
     kind?: ConnectorKind;  // optional, defaults to 'mcp' for backward compat
   }
   ```

   **`CreateConnectorInput.transport` STAYS REQUIRED** (`transport: ConnectorTransport`, NOT `transport?: ConnectorTransport`). For channel rows, the API route synthesizes `transport='remote'` and passes it through. Do NOT make `transport` optional in `CreateConnectorInput` — that would weaken the type contract for the existing MCP create paths. The spec text "channels don't use `transport`" is about the **catalog file shape** (`channels-catalog.json` deliberately omits a `transport` field, since channels don't spawn MCP servers); at the storage layer `transport` is always present (with `'remote'` as a placeholder for channel rows).

2. **`packages/storage/src/repos/connectors.ts`** — three coordinated changes:
   - `ConnectorRow` interface gains `kind: string`.
   - `rowToConnector()` MUST map `row.kind` to the new `Connector.kind`. Without this mapping, the migration writes the column to the DB but reads return `undefined`, breaking `listByKind` silently.
   - `ConnectorRepo.create()` INSERT statement (currently `INSERT INTO connectors (id, slug, display_name, description, source, catalog_id, transport, command, args, url, status, app_id) VALUES (...)`) MUST include the `kind` column. The implementation reads `input.kind ?? 'mcp'` from the new optional `CreateConnectorInput.kind` field. Without this, channel installs land in the DB with the column DEFAULT `'mcp'` — silent bug masking the ROUND-TRIP write side. The existing `update()` method (dynamic patch builder) does NOT need to touch `kind` — kind is set at creation only, never patched. No other write paths in the repo file touch full row state, so only `INSERT` + the `Connector`/`ConnectorRow`/`rowToConnector` triad need updating.

3. **`packages/storage/src/repos/connectors.ts`** — `ListConnectorsFilter` gains an optional `kind?: ConnectorKind` filter field. **This filter type change must ship in the same PR as the route handler change in Track 4** (passing `{ kind: 'mcp' }` to `list()` from `GET /api/connectors`). Implementing one without the other either fails to compile (TS) or fails to filter (silent leak of channel rows into MCP list). `list()`'s default behavior is **unchanged** — passing no filter still returns all rows (avoids silent breakage of any caller that expects all rows). New method `listByKind(kind: ConnectorKind): Connector[]` is a thin wrapper around `list({ kind })` for ergonomics. Add an indexed lookup OR rely on `idx_connectors_status_slug` + post-filter (acceptable at current row counts; revisit if catalog grows).

4. **`apps/worker/src/agent/mcp-build.ts`** (or equivalent MCP-snapshot/loader) — add a guard: `if (connector.kind !== 'mcp') continue;`. The guard goes INSIDE the `for (const { connector, secrets } of userLayer)` loop at `mcp-build.ts:58`, NOT at the `userLayer = connectorRepo.getEnabledWithRelations()` assignment. `getEnabledWithRelations()` returns ALL enabled rows (any kind); the guard at the iteration site is what skips channel rows. Without this, the MCP loader will see channel rows (which use `transport='remote'` as a placeholder per Track 1) and likely register a no-op or bogus remote MCP server (the `try/catch` already in the loop body would catch any throw, but `toRemoteConfig()` may not throw for the placeholder values — silent registration of a broken server is the realistic failure mode). This guard is REQUIRED — covered by an explicit test (see Test strategy).

Both the test for `listByKind` AND a separate test asserting `rowToConnector(rowWithKind)` correctly hydrates the field are mandatory — they catch the "DB has it, type ignores it" silent bug class.

### Track 2 — Catalog: `agent/channels-catalog.json`

New file `agent/channels-catalog.json`, parallel to `agent/connectors-catalog.json`. Shape:

```json
{
  "_doc": "Curated channel adapters offered to the operator in the dashboard. Each channel is a transport that delivers messages to the agent core. Adding an entry here makes it appear under GET /api/channels/catalog. The runtime stores channel configuration in the connectors table (kind=channel) after install — this file is the directory.",
  "version": 1,
  "channels": [
    {
      "id": "slack",
      "slug": "slack",
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

Icon file lives at `agent/assets/connectors/slack.svg` — verified to match `apps/api/src/lib/catalog-loader.ts:149` `resolveIconPath` resolver (the existing helper looks under `assets/connectors/`, not `assets/icons/`). The channels-catalog loader reuses this resolver so icons resolve correctly via the same `resolveIconPath`-style helper.

A loader in `apps/api/src/lib/channels-catalog-loader.ts` (parallel to `catalog-loader.ts` for connectors) reads + parses + validates the file. Both loaders share helpers where reasonable.

### Track 3 — Worker boot wiring (DB-first with `.env` fallback)

Refactor `apps/worker/src/index.ts:362` to use a new function `resolveSlackCredentials({ db, env, logger })` returning `{ appToken, botToken, source: 'connector_secrets' | 'env_fallback' }` or throwing. Resolution table (use this exact decision tree — no other interpretation):

| Step | DB row state (`slug='slack'`) | `.env` SLACK_*_TOKEN | Outcome |
|---|---|---|---|
| 1 | enabled + both secrets present | (irrelevant) | DB creds; `source: 'connector_secrets'` |
| 2 | enabled + at least one secret missing | (irrelevant) | **HARD ERROR**: `Slack channel installed but credentials missing — fix via dashboard or uninstall the channel`. NEVER silent fallback. Empty secrets on an enabled row = operator misconfig. |
| 3 | disabled OR pending (any secret state) | both present | `.env` creds; `source: 'env_fallback'`. Non-enabled rows treated as "not installed" (per `ConnectorStatus`: only `'enabled'` triggers DB-creds path). |
| 4 | disabled OR pending (any secret state) | missing | **HARD ERROR**: `Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env`. |
| 5 | no row at all | both present | `.env` creds; `source: 'env_fallback'`. |
| 6 | no row at all | missing | **HARD ERROR**: `Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env`. |

Key rule: the **only** path that triggers a hard error from a present DB row is `enabled + missing secret(s)`. Disabled rows are equivalent to "not installed" — the `.env` path takes over (or fails with the no-row error message). This avoids the trap where an operator disables a channel via dashboard and the worker crashes despite working `.env` credentials.

Each successful return logs `slack_creds_source: '<source>'`. Each error logs `slack_creds_error: '<reason>'` before throwing.

The resolver is a pure function (takes deps explicitly, no module-level state) — purely for testability. **It lives in a dedicated module** at `apps/worker/src/channels/slack/resolve-credentials.ts`, NOT inline in `index.ts`. Test file at `apps/worker/src/channels/slack/resolve-credentials.test.ts`. Function signature:

```ts
export interface SlackCredentialsResolverDeps {
  connectors: ConnectorRepo;
  env: { appToken: string | undefined; botToken: string | undefined };
  logger: Logger;
}
export interface ResolvedSlackCredentials {
  appToken: string;
  botToken: string;
  source: 'connector_secrets' | 'env_fallback';
}
export function resolveSlackCredentials(deps: SlackCredentialsResolverDeps): ResolvedSlackCredentials;
```

**Why `ConnectorRepo` and not raw `DB`:** every other worker module accepts a `ConnectorRepo` (see `mcp-build.ts:55`, `index.ts` boot wiring). Re-implementing repo query logic inside the resolver would be inconsistent + error-prone.

**Type for tests:** `ConnectorRepo` is a class. The resolver accepts the **concrete class type** as its dependency (no interface extraction in this spec). Unit tests construct a real `ConnectorRepo` against an in-memory SQLite (matches existing repo test patterns; e.g., `packages/storage/src/repos/connectors.test.ts`). No `vi.fn()` stubs on the class prototype — fixtures use real DB inserts to exercise resolution paths. This keeps tests honest (real SQL, real schema constraints) and matches existing test conventions in the repo.

Internally, the resolver does:

```ts
const allChannels = deps.connectors.listByKind('channel');
const slack = allChannels.find(c => c.slug === 'slack' && c.status === 'enabled');

if (slack) {
  const secrets = deps.connectors.getSecrets(slack.id);
  const appToken = secrets.find(s => s.key === 'SLACK_APP_TOKEN')?.value;
  const botToken = secrets.find(s => s.key === 'SLACK_BOT_TOKEN')?.value;

  if (!appToken || !botToken) {
    // Step 2 of resolution table — enabled + missing key(s)
    throw new Error('Slack channel installed but credentials missing — fix via dashboard or uninstall the channel');
  }
  return { appToken, botToken, source: 'connector_secrets' };
}

// No enabled row (either no row at all, or only disabled). Both cases fall through to env.
if (deps.env.appToken && deps.env.botToken) {
  return { appToken: deps.env.appToken, botToken: deps.env.botToken, source: 'env_fallback' };
}
throw new Error('Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env');
```

**Key check semantics for Step 2 of the resolution table:** "at least one secret missing" means **`SLACK_APP_TOKEN` OR `SLACK_BOT_TOKEN` not found in `getSecrets(...)` result**. This is a key-by-key check, not a length check. Storing one but not the other counts as "missing" and triggers the hard error. The check is `!appToken || !botToken` after `secrets.find(s => s.key === '<KEY>')?.value`.

The function is **synchronous** (no `Promise` wrapper) — `better-sqlite3` is synchronous; resolver has no async operations. `apps/worker/src/index.ts:362` imports and calls it WITHOUT `await`: `const { appToken, botToken } = resolveSlackCredentials({ connectors, env: config.slack, logger });`, then constructs `new SlackChannel({ appToken, botToken, workspaceDir: config.workspaceDir })`. **No `await` anywhere on this resolver call** — anywhere else in the spec showing `await resolveSlackCredentials(...)` is a typo.

The `config.ts` Zod schema for `SLACK_APP_TOKEN` / `SLACK_BOT_TOKEN` becomes **optional**, AND `Config.slack` (the typed result of `loadConfig()`) updates accordingly:

```ts
// envSchema:
SLACK_APP_TOKEN: z.string().startsWith('xapp-').optional(),
SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),

// Config type:
export interface Config {
  // ...
  slack: {
    appToken: string | undefined;
    botToken: string | undefined;
  };
  // ...
}
```

The `loadConfig()` return passes `env.SLACK_APP_TOKEN` / `env.SLACK_BOT_TOKEN` through (now possibly `undefined`); the resolver in `index.ts` is the single owner of "what to do when these are undefined". This keeps the existing `config.slack` shape (just with optional fields) — no need to invent a new shape or move env reads to the resolver. Smaller diff, clearer responsibility split.

**TypeScript blast radius:** changing `Config.slack` field types from `string` to `string | undefined` propagates to call sites that consume `config.slack.*`. At time of writing there is exactly one such site: `apps/worker/src/index.ts:362` (`new SlackChannel({...config.slack, workspaceDir: config.workspaceDir})`). After the change, that line passes `appToken: string | undefined` and `botToken: string | undefined` into `SlackChannel`, whose constructor expects `string`. The fix at this site: replace the spread with the resolver call (sync, no `await`) — `const { appToken, botToken } = resolveSlackCredentials({ connectors, env: config.slack, logger });` then `new SlackChannel({ appToken, botToken, workspaceDir: config.workspaceDir })`. The resolver returns non-optional `string`s (or throws). No other call sites consume `config.slack` — verified by grep before implementation.

**Why keep `Config.slack` at all** (vs. dropping it once the resolver is the only consumer): keeping the typed `Config.slack` shape preserves a single source of truth for env parsing (the Zod schema). The resolver receives `config.slack` as a typed dependency rather than reading `process.env` directly. This is a deliberate architectural choice — env reads stay centralized in `loadConfig()`, and the resolver is testable without process-env manipulation. Future channels (Telegram) would do the same: keep `config.<channel>` for env-parsed values; resolver mediates DB/env priority. The "dead-shaped type" concern is addressed by the comment in `Config` documenting why the fields are optional.

**Logging discipline:** every boot logs the credential source explicitly. This prevents the spec 0058 cutover from being a "did the install work?" guess — the worker logs say which path won.

### Track 4 — Dashboard endpoints (read-only catalog + extended install)

Channels need to appear in the dashboard for the operator to install. Endpoint pattern matches the existing connectors flow:

- **NEW** `GET /api/channels/catalog` → list of catalog entries (read-only, reads `agent/channels-catalog.json` via `channels-catalog-loader.ts`).
- **NEW** `GET /api/channels` → list of installed channels (i.e., `connectors` rows filtered by `kind='channel'`). Implementation: `ConnectorRepo.listByKind('channel')` returns full `Connector` objects; the **route handler in `channels.ts` does the projection** (NOT the repo). Repo stays generic; route owns the response shape. Response shape (one entry per row): `{ id: string, slug: string, displayName: string, description: string | null, status: ConnectorStatus, lastError: string | null, lastErrorAt: string | null, lastVerifiedAt: string | null, createdAt: string, updatedAt: string, catalogId: string | null }`. Omits MCP-specific fields (`transport`, `command`, `args`, `url`, `appId`) — the projection is intentionally narrower than `Connector` to make the channel-list response self-documenting (no leaky placeholders like `transport: 'remote'`).
- **NEW route registration:** `apps/api/src/routes/channels.ts` exports `buildChannelsRoute(deps: { connectors: ConnectorRepo, channelsCatalog: ChannelsCatalog })` returning a Hono router.

  **`AppDeps` extension** (`apps/api/src/server.ts:36-55`): add a new optional field following the existing pattern:
  ```ts
  /** Spec 0057: channels catalog loader. Optional — when present, /api/channels/* routes mount; absent in tests that don't exercise channel routes. */
  channelsCatalog?: ChannelsCatalog;
  ```
  The `connectors: ConnectorRepo` dep needed by the route is reused from the existing `connectorRepo` field on `AppDeps`.

  **Mounting in `server.ts`**: gate the route block on `if (deps.connectorRepo && deps.channelsCatalog) { ... }` (analogous to existing optional-subsystem gates like `cronSkillRepo`). The block adds:
  1. `app.use('/api/channels', requireAuth({ secret: deps.config.sessionSecret, secure }));`
  2. `app.use('/api/channels/*', requireAuth({ secret: deps.config.sessionSecret, secure }));`
  3. `app.route('/api/channels', buildChannelsRoute({ connectors: deps.connectorRepo, channelsCatalog: deps.channelsCatalog }));`

  Place this block immediately after the `/api/connectors` mount (~line 105 in `server.ts`) and before `/api/skills`. Per the convention noted at `apps/api/src/routes/connectors.ts:1-9`, static segments must precede dynamic `:id` segments — within `channels.ts`, register `GET /catalog` and `GET /` BEFORE any `:id` parameterized route (none in this spec, but defensive).

  **Wiring `channelsCatalog` into the API entry point**: where the API process starts (look for `buildServer(...)` call site), construct the channels catalog loader once at boot (`const channelsCatalog = loadChannelsCatalog();`) and pass it as `channelsCatalog` in the `AppDeps`. Mirror the pattern of how the existing MCP catalog is wired.
- **MODIFIED** `GET /api/connectors` — existing endpoint at `apps/api/src/routes/connectors.ts:727`. Today it calls `deps.connectors.list()` with no filter and returns ALL rows. After this spec, channel rows would leak into the MCP connectors list since both kinds share the table. **The fix is in the route handler, NOT in `list()`'s default behavior:**
  1. `ListConnectorsFilter` (in `repos/connectors.ts`) gains an optional `kind?: ConnectorKind` filter field. `list()`'s default behavior **stays unchanged** — passing no filter still returns all rows. This avoids silently breaking any caller that expects "all rows" today.
  2. The route handler at `connectors.ts:727` is updated to pass `{ kind: 'mcp' }` explicitly: `deps.connectors.list({ kind: 'mcp' })`. After this change, `GET /api/connectors` returns only MCP rows, the existing `buildListItem` (which hardcodes `kind: 'connector'` in the response shape) is unchanged for MCP rows, and external response contract is preserved.
  3. Other internal callers of `list()` are NOT changed in this spec. Specifically, `getEnabledWithRelations()` (called by `buildMcpServersMap()` in `apps/worker/src/agent/mcp-build.ts`) keeps its current behavior — it doesn't filter by kind via SQL. Instead, the **MCP guard** (Track 1 step 4) — `if (row.kind !== 'mcp') continue;` — is added at the iteration site in `mcp-build.ts`, which catches channel rows there. Defense in depth: route filters at the API edge, MCP loader filters at the consumer. No silent default changes.
  4. The `GET /api/connectors` handler is more complex than a single `list()` call — it partitions results into `standalone` vs `connectorsByAppId` (for GitHub App grouping). Channel rows don't have `appId` set so they would only show up in the `standalone` branch. The `{ kind: 'mcp' }` filter at the SQL layer (point 2 above) excludes them upstream of the partitioning logic — both branches see only MCP rows. No further changes needed in the partitioning code.
- **EXTENDED** `POST /api/connectors` — install endpoint. The existing schema at `apps/api/src/routes/connectors.ts:222` is `z.discriminatedUnion('source', [createCatalogSchema, createCustomSchema])`. We DO NOT change the discriminator. Instead, we add the same optional `kind` field to **each branch's `z.object(...)` shape** (Zod's `discriminatedUnion` doesn't natively support shared top-level fields — adding to each branch is the explicit pattern):
  ```ts
  const createCatalogSchema = z.object({
    source: z.literal('catalog'),
    catalogId: z.string(),
    kind: z.enum(['mcp', 'channel']).optional().default('mcp'),  // NEW
    secrets: z.record(z.string()).optional(),
    // ... existing fields
  });
  const createCustomSchema = z.object({
    source: z.literal('custom'),
    kind: z.enum(['mcp', 'channel']).optional().default('mcp'),  // NEW
    // ... existing fields
  });
  ```
  After Zod validation, the handler enters the existing `if (body.source === 'catalog')` branch (at `apps/api/src/routes/connectors.ts:800`). **Inside that branch**, the handler then checks `body.kind` BEFORE the existing `findCatalogEntry()` call (the `kind` branch is INSIDE the `source === 'catalog'` if-block, NOT before it — channels only support catalog source per the spec, custom source channels are not allowed):

  **Pre-validation:** if `body.source === 'custom' && body.kind === 'channel'`, the handler returns 400 (`{error: 'channel_must_be_catalog_source', message: 'Channels only support source: catalog. Custom channels are not supported in this version.'}`). Without this check, a `source: 'custom' + kind: 'channel'` request would silently land `kind='mcp'` in the DB or skip the channels-catalog lookup. Test required.

  Inside `source === 'catalog'`:
  - If `kind === 'channel'`: call a NEW `findChannelCatalogEntry(catalogId)` that searches `channels-catalog.json`. Validate secrets payload against the channel entry's `secrets` schema. Resolve the slug via the existing `resolveSlugCollision(deps.connectors, channelEntry.id)` (mirrors the MCP path).

    **The API route owns ALL channel-specific synthesis** (single source of truth). When `kind='channel'`, the route builds the enqueued `connector_create` command payload with these synthesized fields:
    ```ts
    {
      kind: 'channel',
      slug: resolvedSlug,
      catalogId: channelEntry.id,
      displayName: channelEntry.name,
      description: channelEntry.description ?? null,
      transport: 'remote',         // placeholder per Track 1
      command: null,
      args: null,
      url: null,
      tools: [],                    // channels have no MCP tools
      secrets: validatedSecretsPayload,
    }
    ```
    The worker-side `connector-create` handler (`apps/worker/src/commands/handlers/connector-create.ts`) receives this fully-synthesized payload and validates it against its existing `catalogSchema` — the schema accepts `tools: []` because it's `z.array(toolSchema)` (zero elements are valid) and `transport: 'remote'` because `'remote'` is in the enum. **The handler does not synthesize anything for channel rows** — all defaults come from the API route. The handler's only `kind`-specific logic is forwarding `kind` to `ConnectorRepo.create({ ...input, kind: input.kind ?? 'mcp' })`. Symmetric with the MCP path, which forwards everything from the catalog entry without channel-specific branching.
  - If `kind === 'mcp'` (default): existing behavior — call `findCatalogEntry()` against `connectors-catalog.json`, etc. NO behavior change for existing MCP installs.
  This preserves the existing `source` discriminator (catalog/custom remains) while introducing `kind` as an orthogonal axis. Channel installs only support `source: 'catalog'` (no custom channels in this spec — channels are always from the curated catalog).
- **MODIFIED** worker-side command handler `connector_create` at `apps/worker/src/commands/handlers/connector-create.ts`. Two minimal changes:
  1. The handler's local Zod payload schemas (`catalogSchema` and `customSchema`) gain the same `kind: z.enum(['mcp', 'channel']).optional().default('mcp')` field — symmetric with the API route schema. The handler does NOT synthesize anything specific to channels; all channel-specific defaults are pre-filled by the API route (see EXTENDED `POST /api/connectors` above).
  2. The handler forwards `kind` (and the synthesized `transport`, `tools`, etc.) from the parsed payload to `ConnectorRepo.create({ ...input, kind: input.kind ?? 'mcp' })`.
  Without these, the API accepts `kind: 'channel'` but the row lands in the DB with the column DEFAULT `'mcp'` — silent bug that fails acceptance criterion "channel row inserted with `kind='channel'`".
  Integration test required: end-to-end POST → enqueue → handler → DB row → assert `kind='channel'` AND `transport='remote'`. Unit tests that mock `ConnectorRepo.create()` would PASS while the integration is broken — that's the trap.
- **MODIFIED** icon serving endpoint `GET /api/connectors/catalog/icons/:filename` at `apps/api/src/routes/connectors.ts:306`. Today the handler validates `:filename` against a `knownIcons` set built from the **MCP catalog only** (`loadCatalog()`). Channels' `slack.svg` would 404. **DECIDED: option (a)** — extend the existing endpoint's validation set. Combine icons from BOTH `loadCatalog()` (MCP) and `loadChannelsCatalog()` (channels) into the `knownIcons` allow-list. Endpoint stays at `/api/connectors/catalog/icons/:filename`. Rationale: channels are in the same `connectors` table; serving their icons via the same endpoint is consistent and minimizes duplicated path-traversal logic. The dashboard URL just looks up the icon by filename — doesn't care which catalog provided it.
- **REUSED** `DELETE /api/connectors/:id`, `PATCH /api/connectors/:id`, `GET /api/connectors/:id/secrets` — these work generically on the connectors table; channel rows are uninstalled / patched / read identically to MCP rows. No changes needed for these endpoints.

  **Note on `iconUrlForConnector`** (`apps/api/src/routes/connectors.ts:119-128`): this helper resolves icon URLs from the MCP catalog via `findCatalogEntry(connector.catalogId)`. For a channel row whose `catalogId='slack'` (only present in `channels-catalog.json`), this function returns `null` and the icon URL is null. Since the `GET /api/connectors` list is filtered to `kind='mcp'` only (per Track 4), channel rows never hit this path through the list endpoint. However, `GET /api/connectors/:id` (detail) is "reused unchanged" and could theoretically return a channel row's icon as null. This is acceptable for spec 0057 because (a) the dashboard UI for channels is out of scope (spec 0058 / future polish), so no UI consumer will hit this path, (b) returning a null icon URL is graceful (no crash). If a future spec needs channel icons via `GET /api/connectors/:id`, extend `iconUrlForConnector` to also search the channels catalog. **Not in scope here.**

**Why extend instead of new `POST /api/channels`:** auth, audit logging, FK cascade behavior, error handling, and rate limits already work on `/api/connectors`. Duplicating that logic for channels would be premature DRY violation. The `kind` field on the request body is the discriminator at the row level; the catalog source (MCP vs Channels) is selected by routing on `kind` before `findCatalogEntry`.

Dashboard UI changes are NOT in scope for spec 0057. The endpoints are added so spec 0058 can install Slack via direct API call (`curl`) or via a minimal dashboard tweak; full Channels page redesign is a future polish spec.

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
└── assets/connectors/             # icon directory (existing — verified resolveIconPath)
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
│   └── slack/
│       ├── adapter.ts             # +_appOverride opt for testability
│       ├── files.ts               # unchanged
│       ├── format.ts              # unchanged
│       ├── normalize.ts           # unchanged
│       ├── resolve-credentials.ts # NEW: DB → env → error resolver
│       └── resolve-credentials.test.ts # NEW: 6 cases (resolution table)
├── agent/
│   └── mcp-build.ts               # +guard: if (connector.kind !== 'mcp') continue
├── commands/handlers/
│   └── connector-create.ts        # +kind in payload schemas, forward to repo
└── index.ts                       # call resolveSlackCredentials before SlackChannel
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
- Worker boot resolver — `resolveSlackCredentials({ db, env, logger })` exhaustively tests all 6 rows of the resolution table in Track 3:
  1. enabled + both secrets → DB creds, `source: 'connector_secrets'`.
  2. enabled + one missing secret → throws hard error `slack_creds_empty_after_install`.
  3. disabled + both env tokens → env creds, `source: 'env_fallback'`.
  4. disabled + missing env → throws `slack_creds_missing`.
  5. no DB row + both env tokens → env creds, `source: 'env_fallback'`.
  6. no DB row + missing env → throws `slack_creds_missing`.
  Each test asserts the log signal as well as the return value or thrown error.
- **MCP-vs-channel guard test** — assert that `apps/worker/src/agent/mcp-build.ts` (or the equivalent MCP-snapshot loader) ignores rows where `kind='channel'`. Current behavior: the MCP loader iterates all `connectors` rows and tries to spawn each one as an MCP server. After this spec, channel rows in the same table would cause spurious spawn attempts (`transport='remote'` placeholder makes them look like remote MCPs). The guard is `if (row.kind !== 'mcp') continue;` — this is REQUIRED, not advisory. Test: insert a channel row, run the MCP loader, assert no spawn attempt was made for it.

**Integration tests:**

- API `GET /api/channels/catalog` → returns catalog entries.
- API `GET /api/channels` (empty / with one installed) → returns expected shape.
- API `POST /api/connectors` with `kind=channel` payload → row inserted with `kind='channel'`.
- API `GET /api/connectors` → channel rows are NOT returned (filtered out by route handler).
- Worker boot in-process (against in-memory DB) — uses `SlackChannel` with a mocked Bolt `App`. Verifies the channel `start()` is called; verifies `MessageHandler` wired correctly.

**SlackChannel constructor needs an opt-in injection point.** Today (`apps/worker/src/channels/slack/adapter.ts:38-44`), `SlackChannel` constructs `new App(...)` internally — there's no way to substitute a test double. This spec adds a minimal escape hatch:
```ts
interface SlackChannelOptions {
  appToken: string;
  botToken: string;
  // ... existing fields ...
  /** Test-only: inject a pre-built App instance instead of constructing one. */
  _appOverride?: App;
}
```
Constructor uses `this.app = opts._appOverride ?? new App({ token: opts.botToken, ... });`. Production code never passes `_appOverride`. Tests pass a mocked `App` instance to assert dispatch behavior without real Slack network calls. The underscore prefix signals "internal/test-only" — not part of the public contract.

**No real Slack interaction in this spec.** The Bolt `App` is mocked via `_appOverride` at the integration boundary. Real Slack workspace test is intentionally deferred to spec 0058.

### Error handling

| Failure mode | Behavior | Log signal |
|---|---|---|
| DB unreachable at boot | Crash with clear error (existing behavior) | `db_open_failed` |
| Migration fails | Crash with clear error (existing behavior) | `migration_failed` |
| `channels-catalog.json` malformed | API logs warning, returns empty list to dashboard. Worker boot is unaffected (worker reads installed channels from DB, not from the catalog file — catalog is dashboard-only). | `channels_catalog_invalid` |
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
- [ ] `agent/assets/connectors/slack.svg` exists.
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
| `transport` constraint forces a meaningless value for channel rows | Use `transport='remote'` semantically as "runtime-managed, no MCP spawn" for channel rows. Documented in spec + repo. Cleanup possible later if it bothers; not a 0057 concern. **Guard required** in `apps/worker/src/agent/mcp-build.ts`: `if (row.kind !== 'mcp') continue;` so the MCP loader never tries to spawn a channel row. Tested explicitly. |
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

## Errata (post-merge)

**2026-04-29 (spec 0058 cutover):** the 6-row resolution table described in Track 3 has been simplified to 4 rows. Cases 3, 4, 5, 6 (env_fallback paths) were removed when `profiles/fn` cut over to DB-only credentials and the `.env` fallback code became unreachable. See spec 0058 Phase H for the simplification. The `Config.slack` field, the `SLACK_*_TOKEN` Zod schema entries, and the `env_fallback` source field on `ResolvedSlackCredentials` are also gone.

**2026-04-29 follow-up identified during cutover (Phase C.5):** `GET /api/connectors/:id` returns the legacy hardcoded UI discriminator `kind: 'connector'` (from `buildListItem`), not the new DB column `kind: 'mcp' | 'channel'`. The DB row is correctly stored as `kind='channel'` (verified during cutover); only the detail-endpoint response masks this. Future spec should expose the DB `kind` field on the detail endpoint (separate from the `kind: 'connector' | 'app'` UI discriminator). Not blocking — the resolver queries DB directly via `listByKind('channel')`, which works correctly.
