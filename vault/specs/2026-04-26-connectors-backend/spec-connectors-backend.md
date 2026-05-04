---
status: shipped
feature: connectors-backend
created: 2026-04-26
shipped: 2026-04-26
---
# Connectors Backend Foundation — Spec

**Status:** Draft
**Scope:** First implementation slice of the Connectors UI feature (design in spec 0029). Adds DB-backed storage for MCP connectors, replaces the file-based MCP loader with a DB-first one (stdio transport only), wires per-tool 3-state permissions into the existing guardrails pipeline, persists tool invocations for the future Activity feed, and implements the hard cutover from `profile/mcp.json`. Remote MCPs (HTTP/SSE) are spec 0033. Dashboard API + UI is spec 0034. End-to-end validation is spec 0035.

## Context

Spec 0029 (`connectors-ui`, design-only) defined a dashboard surface for managing MCP connectors with no file editing. The design assumes:

- Connectors live in the **DB**, not in `profile/mcp.json`. The profile file becomes a dead reference after cutover.
- Each connector has a list of **tools** with 3-state permissions (`always_allow` / `ask` / `never`) per tool.
- The **Activity** section reads a feed of recent tool invocations.
- The runtime supports both `stdio` and `remote` transports, distinguished in the UI.

This spec implements the **stdio half** of that contract on the worker side. It also defines the schema and shared concepts that spec 0033 (remote) and spec 0034 (dashboard) plug into. After this spec ships, the worker can already load connectors from the DB and the agent can already invoke them with permission gating — but no API or UI has been built yet, so administration is still done by writing to the DB directly (which is fine for the bootstrapping window between specs 0032 and 0034).

The current architecture (relevant parts):

- `apps/worker/src/agent/mcp.ts` — `loadMcpConfig()` reads `agent/mcp.json` + `profile/mcp.json` files, interpolates `${VAR}` from `process.env`, and returns a map keyed by server name. The result is passed to `ClaudeCodeBackend` constructor as `mcpServers`. The SDK then exposes each tool as `mcp__<server-name>__<tool-name>`.
- `apps/worker/src/guardrails/` — policy pipeline runs on every tool call. Policies in order: `always_sensitive` → `always_allowed` → `read_only_skill` → `classifier_gate`. Decisions are written to the `approvals_log` table. Config comes from `profile/config.yaml`'s `approvals` section.
- `packages/storage/src/migrations.ts` — migrations 1 (init) through 4 (`approvals_log`) already shipped. New migrations append at the end.
- `packages/storage/src/repos/` — one repo per concern (`crons`, `cron_runs`, `sessions`, `commands`, `logs`, `approvals_log`).
- `apps/worker/src/profile/watcher.ts` — file-system watcher for `profile/`. Currently calls `onMcpChanged` to log a warning when `mcp.json` changes. After this spec, that callback is dropped (no longer relevant).

The `agent/mcp.json` layer (built-in MCPs like the in-process cron tools) is **out of scope** — it stays file-based. Only the `profile/mcp.json` user layer is migrated to the DB. This boundary is real: built-in MCPs are part of the Zeno binary; user MCPs are runtime configuration.

## Problem Statement

The worker today reads MCP servers from `profile/mcp.json` at boot and never reloads them. Adding/editing/removing a connector requires editing JSON, editing `.env` for secrets, restarting the container. The dashboard cannot manage them through any UI because the source of truth is a text file outside the DB.

This spec moves user MCP configuration to the DB so that:

1. The dashboard (spec 0034) has a single backend to read from and write to (the API speaks DB; the worker speaks DB; no shared file).
2. Per-tool permissions can be declared per-connector and enforced by the existing guardrails pipeline.
3. Tool invocations can be logged with a connector reference, enabling the Activity feed.
4. The MCP loader can be rebuilt to read from DB and reload without restart (worker re-reads on the next agent turn — see Constraints).
5. A clean cutover is performed for `profile/mcp.json`: the file is no longer read, but is left on disk and produces a single boot-time warning so the operator knows their old config is inert.

## Non-Goals

1. **HTTP/SSE remote MCP support** — spec 0033. This spec lays down the schema (which has a `transport` column) but the loader path for `transport='remote'` is implemented in 0033. Until 0033 ships, attempting to load a remote connector throws a typed error and the connector is recorded in `error` status with `last_error='remote transport not yet supported (spec 0033)'`.
2. **API endpoints / dashboard UI** — spec 0034. This spec assumes connectors are added/edited via direct DB writes (e.g., a maintenance script) during the bootstrap window. That is acceptable because spec 0032 ships standalone but is not yet *useful* without 0034.
3. **End-to-end tests** — spec 0035. This spec ships unit + integration tests for the worker components only.
4. **`agent/mcp.json` cutover** — built-in MCPs stay file-based. Only the user (`profile/`) layer migrates to DB.
5. **Encryption-at-rest of secrets in DB** — single-user local context. Plain text in DB columns. Filesystem permissions on the SQLite file are the only protection. Re-evaluate if Zeno ever runs multi-host or multi-tenant.
6. **Catalog file format / catalog reading** — spec 0034 owns `agent/connectors-catalog.json` (it is read by the API to render the directory). This spec only stores what the dashboard ends up writing per-connector after a catalog install resolves.
7. **Multi-profile semantics for connectors beyond what already exists.** Each profile has its own DB (per spec 0022 — multi-profile isolation), so connectors are naturally scoped per profile with no extra logic.
8. **Tool category override** (manually moving a tool from `read` to `write`). The `category` column is set at install time (from catalog) or at first discovery (heuristic for custom). Not editable in MVP.
9. **Connector-level rate limiting / cost tracking.** Out of scope; future policy slot.
10. **Auto-import of existing `profile/mcp.json` entries.** Hard cutover per spec 0029 §Migration. The file is ignored, not migrated.

## Constraints

- **Migration 5 is the cutoff.** All connector tables are added in a single migration to keep the schema atomic. Migrations are append-only — no edits or reorders to migrations 1–4.
- **DB is the only source of truth for user connectors.** After this spec ships, the worker boot path stops reading `profile/mcp.json` entirely. The file may exist on disk, but its contents have zero runtime effect.
- **Hot-reload via getter, not setter.** `ClaudeCodeBackend` already accepts `mcpServers` as a constructor option. To pick up DB changes without restart, this spec extends it to accept `getMcpServers: () => Record<string, McpServerConfig>` as an *additional* optional constructor option (the existing `mcpServers` static option is preserved for backward compatibility with the in-process MCPs and for tests). When the getter is provided, `ClaudeCodeBackend.query()` calls it once per turn and uses the returned map for that query. Cron-side backend uses the same pattern. This mirrors the established **getter-factory** approach already used in the project: `AgentCore` accepts `getSystemPrompt: () => string` and re-reads it per turn for SOUL.md / USER.md hot-reload. The pattern lives at a different layer (orchestrator vs backend) but the shape is the same.
- **Permission policy slot is new and ordered.** A new policy `connector_permission` is inserted into the guardrails pipeline after `read_only_skill` and before `classifier_gate`. It only fires for tools whose name matches `mcp__<connector-slug>__<tool-name>`. For matching tools, it reads the per-tool permission from the DB and applies: `always_allow` → allow with `policyThatGated='connector_allow'`; `never` → deny with `policyThatGated='connector_never'`; `ask` → falls through to subsequent policies (typically `classifier_gate` → approver). Tools without a permission row in the DB also fall through (unknown = ask).
- **Approvals log carries a new `policy_that_gated` value.** Two new values: `connector_allow` and `connector_never`. The audit log policy already accepts strings; the type union in `@zeno/storage` is extended.
- **Tool invocation logging goes in a new table, not in `approvals_log`.** Approvals log is about decisions; invocations are about execution outcomes. Separate concerns. The new table `connector_invocations` records every tool call against a connector, regardless of whether it was approved (timing, status, threadId for the deep link, error message on failure).
- **Connector slug is stable and globally unique within a profile.** The `slug` column has `UNIQUE` constraint. On collision (custom connector with derived slug clash), the dashboard appends `-2`, `-3`, etc.; the worker is not responsible for collision avoidance — it only enforces the constraint.
- **Status set is fixed:** `enabled` (healthy or with last error — distinguish via `last_error` column), `disabled`, `pending`. `error` is **not** a separate status — it is `enabled` + non-null `last_error`. The dashboard derives the visual `error` state from `(status='enabled' && last_error IS NOT NULL)`. This keeps the toggle semantic clean (the operator decides whether a connector is on or off; the runtime decides whether it errored).
- **`mcp.json` cutover is irreversible per release.** The worker's MCP loader no longer reads the file. The boot-time warning lists the server names from the still-existing file (so the operator can re-create them via the dashboard once 0034 ships) but takes no action. The watcher's `onMcpChanged` callback is removed entirely (the file is irrelevant — no point watching it).
- **Profile DB path is unchanged.** `${workspace}/zeno.db`. Per spec 0022 each profile has its own workspace dir.
- **Tool list discovery is a worker-side capability.** When the dashboard (spec 0034) asks to refresh tools or test a connection, the API enqueues a command and the worker spawns the MCP, requests its tool list, and persists it. Spec 0032 ships the worker-side helper `discoverTools(connector, secrets)` that spec 0033 (remote transport) and spec 0034 (commands + sync test endpoints) will call. Signature is fixed at two arguments — the connector row and its secrets — across all callers.
- **No `any`, no `// biome-ignore`** in code added by this spec.

## Design

### Database — migration 5

Four new tables. All carry `id` as TEXT primary key (ULID/UUID generated by the writer) for consistency with the existing `crons` table.

```sql
CREATE TABLE connectors (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  description     TEXT,
  source          TEXT NOT NULL CHECK (source IN ('catalog','custom')),
  catalog_id      TEXT,                                   -- catalog entry id when source='catalog'; nullable for custom
  transport       TEXT NOT NULL CHECK (transport IN ('stdio','remote')),
  command         TEXT,                                   -- stdio only
  args            TEXT,                                   -- JSON array; stdio only
  url             TEXT,                                   -- remote only (spec 0033 implements; column exists from 0032)
  status          TEXT NOT NULL CHECK (status IN ('enabled','disabled','pending')) DEFAULT 'enabled',
  last_error      TEXT,                                   -- the last_error string (e.g., '401 Unauthorized'); null when healthy
  last_error_at   TEXT,                                   -- ISO timestamp of last_error
  last_verified_at TEXT,                                  -- ISO timestamp of last successful test_connection / runtime success
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_connectors_status_slug ON connectors(status, slug);

CREATE TABLE connector_secrets (
  connector_id    TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,                          -- plain text in MVP; encryption-at-rest deferred
  PRIMARY KEY (connector_id, key)
);

CREATE TABLE connector_tool_permissions (
  connector_id    TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,                          -- tool name as advertised by the MCP, NOT the SDK-prefixed form
  description     TEXT,                                   -- 1-line description, from catalog or empty for custom
  category        TEXT NOT NULL CHECK (category IN ('read','write','interactive')),
  permission      TEXT NOT NULL CHECK (permission IN ('always_allow','ask','never')),
  PRIMARY KEY (connector_id, tool_name)
);
CREATE INDEX idx_connector_tool_permissions_connector ON connector_tool_permissions(connector_id);

CREATE TABLE connector_invocations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_id    TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,                          -- bare tool name; correlate with permissions.tool_name
  thread_id       TEXT,                                   -- Slack thread for the deep link; nullable for non-thread runs (e.g., crons)
  correlation_id  TEXT,                                   -- echoes the agent turn's correlation id for log cross-reference
  result          TEXT NOT NULL CHECK (result IN ('ok','error')),
  duration_ms     INTEGER NOT NULL,
  error_message   TEXT,                                   -- null when result='ok'
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_connector_invocations_connector_created ON connector_invocations(connector_id, created_at DESC);
CREATE INDEX idx_connector_invocations_thread ON connector_invocations(thread_id);
```

Field notes:

- `slug` is the SDK-facing server name. The MCP server appears to the SDK as `mcp__<slug>__*`. So for `slug='linear'`, the SDK exposes tools as `mcp__linear__list_issues`, etc.
- `args` is JSON-encoded because SQLite has no array type. Parsed on read with a Zod schema.
- `last_error` is freeform text — the underlying transport / SDK message, truncated to 500 chars. The UI surfaces it; the worker writes it.
- `connector_invocations.tool_name` is the **bare** tool name (e.g., `list_issues`), not the SDK-prefixed `mcp__linear__list_issues`. This matches the `connector_tool_permissions.tool_name` form so joins are direct. The conversion is done at the call site in the worker (parse `mcp__<slug>__<tool>` → split → `<tool>`).

### Type extensions in `@zeno/storage`

```typescript
// packages/storage/src/types.ts (additions)

export type ConnectorTransport = 'stdio' | 'remote';
export type ConnectorSource = 'catalog' | 'custom';
export type ConnectorStatus = 'enabled' | 'disabled' | 'pending';
export type ToolCategory = 'read' | 'write' | 'interactive';
export type ToolPermission = 'always_allow' | 'ask' | 'never';
export type InvocationResult = 'ok' | 'error';

export interface Connector {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  source: ConnectorSource;
  catalogId: string | null;
  transport: ConnectorTransport;
  command: string | null;
  args: string[] | null;
  url: string | null;
  status: ConnectorStatus;
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorSecret {
  connectorId: string;
  key: string;
  value: string;
}

export interface ConnectorToolPermission {
  connectorId: string;
  toolName: string;
  description: string | null;
  category: ToolCategory;
  permission: ToolPermission;
}

export interface ConnectorInvocation {
  id: number;
  connectorId: string;
  toolName: string;
  threadId: string | null;
  correlationId: string | null;
  result: InvocationResult;
  durationMs: number;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateConnectorInput {
  slug: string;
  displayName: string;
  description?: string | null;
  source: ConnectorSource;
  catalogId?: string | null;
  transport: ConnectorTransport;
  command?: string | null;
  args?: string[] | null;
  url?: string | null;
  status?: ConnectorStatus;       // defaults to 'enabled'
  secrets: Array<{ key: string; value: string }>;
  tools: Array<Omit<ConnectorToolPermission, 'connectorId'>>;
}

// Existing union extended in approvals_log types:
export type PolicyThatGated =
  | 'always_sensitive'
  | 'read_only'
  | 'classifier'
  | 'auto_allow'
  | 'timeout'
  | 'classifier_unavailable'
  | 'approver_channel_error'
  | 'connector_allow'    // new
  | 'connector_never';   // new
```

### `ConnectorRepo`

`packages/storage/src/repos/connectors.ts` — synchronous (better-sqlite3 idiom). Methods:

```typescript
class ConnectorRepo {
  // Reads
  list(filter?: { status?: ConnectorStatus; source?: ConnectorSource }): Connector[];
  get(id: string): Connector | null;
  getBySlug(slug: string): Connector | null;
  getSecrets(connectorId: string): ConnectorSecret[];        // values returned as stored (plain)
  getTools(connectorId: string): ConnectorToolPermission[];
  getEnabledWithSecrets(): Array<{ connector: Connector; secrets: ConnectorSecret[]; tools: ConnectorToolPermission[] }>;
  // Reads — invocations
  recentInvocations(connectorId: string, limit: number): ConnectorInvocation[];
  // Writes
  create(input: CreateConnectorInput): Connector;            // single transaction; inserts connector + secrets + tools
  update(id: string, patch: Partial<Pick<Connector, 'displayName' | 'description' | 'command' | 'args' | 'url' | 'status' | 'lastError' | 'lastErrorAt' | 'lastVerifiedAt'>>): Connector;
  replaceSecrets(connectorId: string, secrets: Array<{ key: string; value: string }>): void;
  replaceTools(connectorId: string, tools: Array<Omit<ConnectorToolPermission, 'connectorId'>>): void;
  setToolPermission(connectorId: string, toolName: string, permission: ToolPermission): void;
  setBulkPermission(connectorId: string, category: ToolCategory, permission: ToolPermission): number;  // returns rows affected
  delete(id: string): boolean;                                // cascades secrets, tools, invocations
  recordInvocation(input: Omit<ConnectorInvocation, 'id' | 'createdAt'>): void;
}
```

Helper functions outside the repo (to keep the repo thin):

- `slugify(name: string): string` — lower-case, dashes-and-alphanumeric, used by spec 0034. Repo only enforces the UNIQUE constraint; collision suffixing is the writer's job.

### MCP loader rewrite

Replace `apps/worker/src/agent/mcp.ts` `loadMcpConfig()` with two functions:

```typescript
// apps/worker/src/agent/mcp.ts (rewritten)

import type { Connector, ConnectorRepo, ConnectorSecret } from '@zeno/storage';
import { loadAgentMcpConfig } from './mcp-agent.js';   // unchanged: reads agent/mcp.json (built-in)

export interface BuildMcpServersOptions {
  connectorRepo: ConnectorRepo;
  logger: Logger;
}

/**
 * Build the merged map handed to the SDK. Three layers:
 *   1. agent/mcp.json (built-in, file-based) — unchanged behavior
 *   2. profile/mcp.json — IGNORED. If the file is non-empty, emits a single
 *      `mcp_json_ignored` warning per worker boot listing the server names
 *      so the operator knows their old config is inert.
 *   3. DB (this profile) — connectors with status='enabled', stdio transport.
 *      Remote transport throws via the loader path that spec 0033 implements.
 *
 * On name collision between agent built-in and DB connector, the DB wins
 * (matches the prior file-based "profile overrides agent" rule).
 */
export function buildMcpServersMap(opts: BuildMcpServersOptions): Record<string, McpServerConfig>;

/**
 * Emit the cutover warning. Called once at worker boot. Reads
 * `profile/mcp.json` if present, lists the server names, and logs
 * `mcp_json_ignored`. Does NOT mutate the file.
 */
export function warnIfMcpJsonExists(logger: Logger): void;
```

Construction of `McpServerConfig` for a stdio connector:

```typescript
function toStdioConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  const env: Record<string, string> = {};
  for (const s of secrets) env[s.key] = s.value;
  return {
    type: 'stdio',                         // explicit; SDK accepts undefined too but explicit is clearer
    command: connector.command!,           // non-null asserted by repo invariant for stdio
    args: connector.args ?? [],
    env: Object.keys(env).length > 0 ? env : undefined,
  };
}
```

For `transport='remote'`:

```typescript
function toRemoteConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  // Spec 0033 implements this. Until then, throw a typed error and let the
  // caller mark the connector with last_error.
  throw new RemoteTransportNotImplementedError(connector.slug);
}
```

The `getMcpServers` factory passed to `ClaudeCodeBackend` becomes:

```typescript
const getMcpServers = () => buildMcpServersMap({ connectorRepo, logger });
```

Built backends construct lazily per-turn from the DB, so connector edits land on the next agent invocation without restart.

### Hot-reload contract on `ClaudeCodeBackend`

Extend the constructor options with an optional `getMcpServers` factory:

```typescript
interface ClaudeCodeBackendOptions {
  // existing
  mcpServers?: Record<string, McpServerConfig>;
  inProcessMcpServers?: Record<string, InProcessMcpServer>;
  // new
  getMcpServers?: () => Record<string, McpServerConfig>;
  // ... rest unchanged
}
```

In `query()`, the assembled map for that call is:

```typescript
const dynamic = this.opts.getMcpServers?.() ?? {};
const merged = { ...this.opts.mcpServers, ...dynamic };  // dynamic wins
```

The cron backend uses the same pattern. Both backends are still constructed once at boot (no per-turn re-construction of the backend object), but their MCP server map is fresh per turn.

### Guardrails — new `connector_permission` policy

`apps/worker/src/guardrails/policies/connector-permission.ts`:

```typescript
import type { ConnectorRepo } from '@zeno/storage';
import type { PolicyMiddleware } from '../types.js';

const TOOL_NAME_PATTERN = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/;

interface ConnectorPermissionDeps {
  connectorRepo: ConnectorRepo;
}

/**
 * Apply per-tool 3-state permissions for tools that come from a DB-managed
 * connector (`mcp__<slug>__<tool>`). Resolution rules:
 *   - tool name does not match the connector pattern → undefined (pass through)
 *   - connector slug not found in DB → undefined (built-in MCPs use this slot)
 *   - tool name not in connector's permissions → undefined (unknown tool, treat as ask)
 *   - permission='always_allow' → Decision allow with policyThatGated='connector_allow'
 *   - permission='never' → Decision deny with policyThatGated='connector_never'
 *   - permission='ask' → undefined (let classifier or other policies handle it)
 */
export function makeConnectorPermissionPolicy(deps: ConnectorPermissionDeps): PolicyMiddleware;
```

**Canonical pipeline order after this spec ships** (the 6-policy sequence; documented here as the single source of truth — any future reorder must update this paragraph and the smoke test that asserts the sequence):

1. `always_sensitive` — global override (config.yaml list)
2. `always_allowed` — built-in safe tools + bash patterns (config.yaml lists)
3. `read_only_skill` — skills that opt into auto-allow for their own tools
4. `connector_permission` — **NEW in this spec.** Per-tool 3-state from DB.
5. `classifier_gate` — Haiku classifier for everything else
6. (`audit_log` runs as a terminal logger, not gate; spec 0023 §Constraints already documented this)

Wired in `apps/worker/src/index.ts`:

```typescript
const policies: PolicyMiddleware[] = [
  makeAlwaysSensitivePolicy(approvalsConfig.always_sensitive),
  makeAlwaysAllowedPolicy({ ... }),
  makeReadOnlySkillPolicy(),
  makeConnectorPermissionPolicy({ connectorRepo: connectors }),  // new slot
  makeClassifierGatePolicy(classifier),
];
```

Why between `read_only_skill` and `classifier_gate`:
- `always_sensitive` is the global override and must run first.
- `always_allowed` covers built-in safe tools (Read/Glob/Grep + bash patterns) and runs early to short-circuit common cases.
- `read_only_skill` is for skills that opt into auto-allow for their own tools.
- `connector_permission` runs next: connector tools that the operator marked `always_allow` skip the classifier; connector tools marked `never` deny without classifier cost; `ask` falls through to classifier.
- `classifier_gate` is the last filter for everything else.

The audit log records the `policyThatGated` so the dashboard can later show "this tool was allowed because the operator set permission=always_allow on the connector".

### Tool invocation logging

Wire into the existing tool-call path. Best capture point: after the SDK returns the tool result, the worker has the tool name, duration, and result. The current code in `ClaudeCodeBackend` already pushes `ToolCallSummary` objects to `toolCalls` per turn. Extend that loop with a side-effect that also calls `connectorRepo.recordInvocation` when the tool name matches the `mcp__<slug>__*` pattern and the slug exists in the DB. Implementation note for `plan.md`: the recording must not throw — wrap in try/catch and log on failure to keep the agent loop robust.

### Profile watcher

Remove `onMcpChanged` from `ProfileWatcher`. The file is no longer relevant. Replace the worker boot wiring that previously logged `mcp_change_requires_restart` with nothing — the watcher's contract for `mcp.json` ends here.

## User Stories / Scenarios

These are the worker-side scenarios. End-user UI flows live in spec 0029 (design) and spec 0034 (frontend); spec 0035 covers cross-cutting e2e.

1. **Worker boots with a `profile/mcp.json` from the pre-cutover era.**
   - File exists with 3 servers (`linear`, `notion`, `granola`).
   - Worker emits a single log: `event=mcp_json_ignored, servers=['linear','notion','granola'], message='MCP servers in mcp.json are no longer loaded. Re-add them via /connectors in the dashboard.'`
   - The DB `connectors` table is empty.
   - The agent boots. `agent/mcp.json` built-ins still load. No user MCPs are available.
   - The operator (during the bootstrap window before spec 0034 ships) creates connector rows directly in the DB.
   - On the next agent turn (no restart), the user MCPs appear in `mcpServers`.

2. **Operator manually inserts a Linear connector via maintenance script.**
   - INSERT INTO `connectors` (slug='linear', source='catalog', catalog_id='linear', transport='stdio', command='npx', args='["-y","mcp-linear"]', status='enabled').
   - INSERT INTO `connector_secrets` (key='LINEAR_API_KEY', value='lin_api_…').
   - INSERT INTO `connector_tool_permissions` (12 rows; all read tools `always_allow`, write tools `ask`).
   - Operator sends `@zeno list my open Linear issues` in Slack.
   - Worker's chat backend reads the DB at `query()` start. Map includes `linear` with `command='npx', args=['-y','mcp-linear'], env={LINEAR_API_KEY:'…'}`.
   - SDK exposes `mcp__linear__list_issues`. Agent calls it.
   - Pipeline: `connector_permission` finds `linear` in DB, `list_issues` → `always_allow` → allow.
   - Tool returns. Worker records an invocation row: tool=`list_issues`, result=`ok`, duration_ms=287, thread_id=Slack thread.
   - Agent replies with the issue list.

3. **Connector with `permission='never'` is invoked.**
   - Operator marked `delete_issue` as `never` in the DB.
   - Agent attempts `mcp__linear__delete_issue` (perhaps a model misjudgment).
   - Pipeline: `connector_permission` denies with `policyThatGated='connector_never'`.
   - Audit row written; agent receives the GUARDRAIL DENIAL and reports `ação negada — denied by connector permission (never)` per the existing GuardedBackend convention.
   - No invocation row is recorded (the tool call did not execute — invocations log execution outcomes, not denials).

4. **Connector tool with `permission='ask'` is invoked.**
   - `create_issue` permission is `ask` for the Linear connector.
   - Agent calls `mcp__linear__create_issue` with payload.
   - Pipeline: `connector_permission` returns undefined for `ask` (no allow, no deny, fall through). `classifier_gate` runs and likely classifies it as sensitive (write to external system) → routes to approver. Owner reacts 👍 or 👎.
   - On 👍: tool runs; invocation row written with result=`ok`.
   - On 👎: tool denied; no invocation row.

5. **Connector with stale credentials.**
   - `LINEAR_API_KEY` was rotated upstream; the value in DB is now invalid.
   - Agent calls `mcp__linear__list_issues`. Pipeline allows (permission=always_allow). Tool execution fails with `401 Unauthorized` from the MCP server.
   - Worker writes an invocation row with `result='error', error_message='401 Unauthorized'`.
   - Worker also updates the connector row: `last_error='401 Unauthorized', last_error_at=<now>`. The connector remains `status='enabled'` — runtime errors do not flip the toggle. Spec 0029 §Lifecycle and States explicitly mandates this.
   - The dashboard (spec 0034) will surface the `last_error` as the "with error" visual state. For spec 0032, the only observable is the DB columns.

6. **Operator disables a connector via DB.**
   - UPDATE `connectors` SET status='disabled' WHERE slug='linear'.
   - On the next agent turn, the chat backend's `getMcpServers` call filters out `linear` (only enabled rows are included).
   - Agent no longer sees Linear tools.
   - No restart.

7. **Operator re-enables and the worker recovers.**
   - UPDATE `connectors` SET status='enabled', last_error=NULL, last_error_at=NULL WHERE slug='linear'.
   - Next agent turn picks the connector up and it's available again.

## Success Criteria

1. Migration 5 applies cleanly on a fresh DB and on a DB upgraded from migration 4. Tested via `runMigrations` unit test (existing pattern from prior migrations).
2. `ConnectorRepo` unit tests pass. Coverage: each method, the cascade behavior of secrets/tools/invocations on connector delete, the UNIQUE constraint on slug, the CHECK constraints on transport/source/status/category/permission/result.
3. The MCP loader unit tests pass:
   - Empty DB → empty user-layer map; agent built-ins still present.
   - One enabled stdio connector with secrets → correct map shape, env interpolated.
   - One disabled connector → not present.
   - One pending connector → not present (only `enabled` is loaded).
   - One remote connector → throws `RemoteTransportNotImplementedError` from `toRemoteConfig`; the loader catches, marks `last_error='remote transport not yet supported (spec 0033)'`, and continues with the rest.
   - Name collision (connector slug matches a built-in name) → DB wins; one log line `connector_overrides_builtin`.
4. `connector_permission` policy unit tests pass:
   - Tool name not matching `mcp__<slug>__*` → undefined.
   - Slug not in DB → undefined.
   - Tool name not in permissions → undefined.
   - Permission `always_allow` → allow + `connector_allow`.
   - Permission `never` → deny + `connector_never`.
   - Permission `ask` → undefined.
5. Boot-time `mcp_json_ignored` warning is emitted exactly once per worker start when `profile/mcp.json` exists with at least one server. Asserted via the worker's boot integration test.
6. The `ClaudeCodeBackend` `getMcpServers` getter is invoked exactly once per `query()` (not per tool call). Asserted via mock backend test.
7. `connector_invocations` rows are written for every tool call against a DB-managed connector — both `ok` and `error` results. **Successful invocations (`result='ok'`) also bump `connectors.last_verified_at`** to the invocation timestamp; this gives the dashboard a fresh "last verified" without requiring an explicit test-connection. Asserted via integration test that uses a fixture stdio MCP echoing canned responses.
8. `last_error` / `last_error_at` are updated when a runtime tool call fails with a transport-level error. Asserted via the same integration test.
9. The pipeline order in `index.ts` is: `always_sensitive` → `always_allowed` → `read_only_skill` → `connector_permission` → `classifier_gate`. The smoke test asserts the `policies` array's `name` field sequence using the **exact** strings used by each policy's `name` constant — `['always_sensitive', 'always_allowed', 'read_only_skill', 'connector_permission', 'classifier_gate']`. Verified against `apps/worker/src/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,read-only-skill}.ts` `name` exports.
10. `pnpm run quality-gate` is green: lint + typecheck + unit + integration tests across all workspaces. No new `any`. No new `// biome-ignore`.
11. Backward compatibility: `agent/mcp.json` continues to load built-ins (cron tools, etc.) with no behavior change. Asserted by the existing built-in MCP smoke test (which must pass unchanged).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `getMcpServers` is invoked at the wrong time and returns stale data (e.g., during a turn that started before the DB write committed) | Better-sqlite3 is synchronous and single-writer; commits are visible immediately. The getter is called at `query()` entry, after any concurrent commit has landed. The window is at most one in-flight turn — acceptable. |
| Per-turn DB read on every agent invocation adds latency | Reading `connectors` + secrets + tool permissions is O(N) where N is the connector count (single-digit). Single SQLite query with a JOIN is sub-millisecond. Negligible vs. agent turn duration (seconds). |
| `connector_invocations` table grows unbounded | Add a retention sweep similar to `LogsRetention` (existing pattern). MVP defers this — single-user volume is low. Tracked as follow-up; not blocking. |
| Pipeline order regression: someone reorders policies and breaks the contract | Pipeline order is asserted in a smoke test (success criterion 9). Reorder triggers test failure. |
| The `mcp__<slug>__<tool>` regex misparses slugs containing underscores (e.g., `acme-scrum`, `google-drive`) | Slugs are kebab-case (no underscores allowed by spec 0029 §Slug collision). The regex assumes that. Slug shape is enforced at **two layers**: (1) the migration adds a CHECK that combines SQLite-valid GLOB clauses to require kebab-case (`slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND length(slug) >= 1`); (2) the writer (`ConnectorRepo.create` and the API layer) validates via a Zod schema (`/^[a-z0-9][a-z0-9-]*$/`) before insert so error messages are clear. SQLite GLOB does not support `+`/`?` quantifiers, so the CHECK uses two complementary GLOB tests rather than a single regex-style pattern. |
| Hard cutover surprises an operator who upgrades and loses access to existing MCPs | The boot warning lists the affected server names. Release notes for the version that ships this spec call out the cutover. The operator must re-add via dashboard once spec 0034 ships, or via direct DB write during the bootstrap window. |
| Plain-text secrets in DB are at rest on the operator's laptop | Single-user, local-only context. SQLite file lives under `${workspace}` with the operator's filesystem permissions. Encryption-at-rest deferred to a future spec if Zeno ever runs on shared infra. |
| Tool list goes stale after the upstream MCP changes | `discoverTools(connector)` helper (used by spec 0034's refresh-tools command) replaces the connector's tools and resets per-tool permissions to category defaults. Spec 0029 §Refresh tools mandates the warning before applying. |
| `last_error` overwrites useful prior errors | Each error overwrites the previous. The audit/invocations log preserves history. The dashboard shows only the most recent error in the connector card; deeper history is in the activity feed. |
| Connector cascade on delete drops in-flight invocation rows | The cascade is intentional (uninstall removes everything). If an invocation row is being written concurrently with a delete, better-sqlite3's single-writer + foreign-key enforcement means the cascade always wins or the insert errors — never partial state. |

## Open Questions

None blocking. Resolved during implementation:

1. **Exact ULID library or generation idiom for connector ids.** The existing `crons` table uses `crypto.randomUUID()` per existing code. Reuse it for connector ids. No new dependency.
2. **Whether to log the `mcp_json_ignored` warning at `info` or `warn`.** `warn` per spec 0029 §Migration ("emits a single structured warning event"). Confirm in the boot integration test.
3. **Whether `discoverTools` belongs in `apps/worker/src/agent/mcp.ts` or in a sibling file.** Implementation choice; either is fine. Prefer a sibling `mcp-discover.ts` to keep the loader file focused on building the SDK map.
