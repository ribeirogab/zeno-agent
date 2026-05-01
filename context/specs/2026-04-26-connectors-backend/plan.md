---
feature: connectors-backend
spec: "[[spec]]"
created: 2026-04-26
---
# Connectors Backend Foundation — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** TDD-shaped for every non-trivial unit (repo, loader, policy). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land the worker-side foundation that powers the Connectors UI feature — DB schema, repo, DB-first MCP loader (stdio), per-tool permissions wired into the guardrails pipeline, invocation logging, and `mcp.json` cutover. After this plan ships, the worker can be administered via direct DB writes; the dashboard API + UI follows in spec 0034.

**Architecture:** A single migration adds four tables (`connectors`, `connector_secrets`, `connector_tool_permissions`, `connector_invocations`). One repo (`ConnectorRepo`) owns all access. The MCP loader is rewritten to read from the DB and the `getMcpServers` factory pattern (mirroring the existing `getSystemPrompt` factory) gives per-turn freshness without restart. A new policy slot `connector_permission` plugs into the existing pipeline between `read_only_skill` and `classifier_gate`. Tool invocations are recorded as a side effect of the SDK tool-call summary loop already running in `ClaudeCodeBackend`. The `profile/mcp.json` cutover is a one-line boot warning plus removal of the watcher callback.

**Tech Stack:** No new dependencies. Same as the rest of the project — Node 24 · TS strict · pnpm workspaces · Turborepo · better-sqlite3 · Zod · vitest. Fixture stdio MCP for integration tests written in plain TS.

## Approach

Six phases, each ending with a green quality gate. Phase ordering minimises breakage:

1. **Storage layer.** Migration + types + repo. Self-contained — no consumers yet.
2. **Loader rewrite.** Replace `loadMcpConfig()` with the new functions. Update `ClaudeCodeBackend` to accept `getMcpServers`. Update worker boot wiring.
3. **Cutover warning.** `warnIfMcpJsonExists` + boot wiring. Drop `onMcpChanged` from the watcher.
4. **Permission policy.** `connector_permission` middleware + pipeline insertion + audit log type extension.
5. **Invocation logging.** Extend `ClaudeCodeBackend`'s tool-call summary loop with the `recordInvocation` side-effect. Update `last_error` on transport-layer failures.
6. **Smoke + integration.** Boot integration test that exercises stories 1-7 with a fixture stdio MCP; pipeline-order assertion test.

The plan is **TDD-shaped for non-UI units**: each repo method, each new helper, each policy lands with its tests in the same commit. Boot integration tests come last because they need everything wired.

No `any`, no `// biome-ignore` in new code.

## Architecture

```
┌─── Worker process (Node) ───────────────────────────────────────┐
│                                                                 │
│  Boot:                                                          │
│    db = openDatabase(); runMigrations(db);                      │
│    connectorRepo = new ConnectorRepo(db);                       │
│    warnIfMcpJsonExists(logger);   ◄── NEW: cutover warning      │
│                                                                 │
│  Build chat backend (existing two-phase wiring):                │
│    inner = new ClaudeCodeBackend({                              │
│      inProcessMcpServers: { zeno: cronMcp },                    │
│      getMcpServers: () =>                                       │
│        buildMcpServersMap({ connectorRepo, logger }),  ◄── NEW  │
│      preToolUseHook: ...,                                       │
│    });                                                          │
│    chatBackend = new GuardedBackend(inner, {                    │
│      policies: [                                                │
│        always_sensitive,                                        │
│        always_allowed,                                          │
│        read_only_skill,                                         │
│        connector_permission(connectorRepo),  ◄── NEW            │
│        classifier_gate,                                         │
│      ],                                                         │
│      ...                                                        │
│    });                                                          │
│                                                                 │
│  Per agent turn:                                                │
│    backend.query(input):                                        │
│      mcpServers = { ...inProcess, ...getMcpServers() }          │
│      sdk.query({ mcpServers, ... })                             │
│      for each tool_use_event:                                   │
│        if tool matches mcp__<slug>__*:                          │
│          connectorRepo.recordInvocation({ ... })   ◄── NEW      │
│          if result was transport error:                         │
│            connectorRepo.update(id, { lastError, lastErrorAt }) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

DB schema after migration 5:
  connectors
  connector_secrets
  connector_tool_permissions
  connector_invocations
```

## File Structure

### NEW files

| File | Responsibility |
|---|---|
| `packages/storage/src/repos/connectors.ts` | `ConnectorRepo` — all CRUD on the four new tables |
| `packages/storage/tests/connectors.test.ts` | Unit tests for `ConnectorRepo` (every method, all CHECK + UNIQUE constraints, cascade) |
| `apps/worker/src/agent/mcp-discover.ts` | `discoverTools(connector, secrets)` — spawns the MCP, requests tool list, returns the array. Used by spec 0034's refresh-tools command. |
| `apps/worker/src/agent/mcp-build.ts` | `buildMcpServersMap`, `toStdioConfig`, `toRemoteConfig` (the latter throws `RemoteTransportNotImplementedError` until spec 0033) |
| `apps/worker/src/agent/mcp-cutover.ts` | `warnIfMcpJsonExists(logger)` — boot-time cutover warning |
| `apps/worker/src/guardrails/policies/connector-permission.ts` | `makeConnectorPermissionPolicy(deps)` policy middleware |
| `apps/worker/tests/agent/mcp-build.test.ts` | Unit tests for the loader (all matrix entries from success criterion 3) |
| `apps/worker/tests/agent/mcp-cutover.test.ts` | Unit tests for `warnIfMcpJsonExists` |
| `apps/worker/tests/guardrails/connector-permission.test.ts` | Unit tests for the new policy |
| `apps/worker/tests/integration/connectors-stdio.test.ts` | Boot integration test; uses the fixture MCP from `tests/fixtures/echo-mcp/` |
| `apps/worker/tests/fixtures/echo-mcp/server.ts` | Tiny stdio MCP that exposes `read_echo`, `write_echo`, `interactive_echo`. Echoes input as output. Used by integration tests in 0032 and 0035. |
| `apps/worker/tests/fixtures/echo-mcp/package.json` | Self-contained `node tests/fixtures/echo-mcp/server.ts` runnable; references the SDK |

### MODIFIED files

| File | Change |
|---|---|
| `packages/storage/src/migrations.ts` | Append migration 5 with the four-table schema (per spec §Database) |
| `packages/storage/src/types.ts` | Add the connector type union per spec §Type extensions; extend `PolicyThatGated` with `connector_allow` / `connector_never` |
| `packages/storage/src/index.ts` | Re-export `ConnectorRepo` and the new types |
| `apps/worker/src/agent/mcp.ts` | Replace `loadMcpConfig()` with `loadAgentMcpConfig()` (built-ins only) and re-export `buildMcpServersMap` from `mcp-build.ts`. Keep the `McpServerConfig` type definition here. |
| `apps/worker/src/agent/backends/claude-code.ts` | Accept new optional `getMcpServers` constructor option; merge per-call inside `query()` |
| `apps/worker/src/profile/watcher.ts` | Drop `onMcpChanged` callback (no longer relevant) |
| `apps/worker/src/index.ts` | Wire `ConnectorRepo`; pass `getMcpServers` to both backend builders; insert the new policy in the pipeline (between `read_only_skill` and `classifier_gate`); call `warnIfMcpJsonExists` at boot; remove `onMcpChanged` from watcher wiring; pipe invocation recording (extension on `ClaudeCodeBackend`) |
| `apps/worker/src/guardrails/policies/audit.ts` | (No code change expected — string-based; verify the new `policyThatGated` values flow through) |
| `apps/worker/src/cron/runner.ts` | Same `getMcpServers` wiring on the cron-side backend (cron MCPs continue to work without restart after a connector edit) |

### REMOVED files

None. The old `loadMcpConfig` function disappears, but the `mcp.ts` file stays (rehosting the `McpServerConfig` type and re-exporting from `mcp-build.ts`).

## Phase Ordering

### Phase 1 — Storage layer (independent)

- Migration 5 + types + repo. No consumer changes yet.
- Quality gate: `pnpm run quality-gate` green; new tests in `packages/storage/tests/connectors.test.ts` cover repo + migration; existing tests untouched.

### Phase 2 — Loader rewrite (depends on Phase 1)

- `mcp-build.ts`, `mcp-discover.ts`, `mcp-cutover.ts` created.
- `ClaudeCodeBackend` accepts `getMcpServers`. The old static `mcpServers` option is preserved (no breaking change for existing tests/callers; the in-process MCPs path stays the same).
- `apps/worker/src/index.ts` wires the new factory. The cron backend is updated symmetrically.
- The watcher loses `onMcpChanged`.
- Quality gate: green. Worker boot still produces a working agent — at this point, with no connectors in the DB, the agent has the same tools as before minus whatever was in `profile/mcp.json` (which is now ignored).

### Phase 3 — Cutover warning (depends on Phase 2)

- `warnIfMcpJsonExists` + boot wiring + unit test.
- Verifies that the warning fires once per boot and lists the server names.
- Quality gate: green.

### Phase 4 — Permission policy (depends on Phase 2)

- `connector_permission` middleware + tests.
- Audit log type extension lands here (the test for `policyThatGated='connector_allow'` uses the new union value).
- Pipeline wiring in `index.ts` inserts the policy between `read_only_skill` and `classifier_gate`.
- Quality gate: green.

### Phase 5 — Invocation logging (depends on Phase 1, 4)

- Extend `ClaudeCodeBackend` with a per-tool-call hook that records invocations and updates `last_error` on transport errors.
- The recording goes through `connectorRepo.recordInvocation`. Errors swallowed (logged) so the agent loop is robust.
- Spec § Risks #6 (cascade on delete) is naturally handled by FK constraints — no extra logic.
- Quality gate: green.

### Phase 6 — Boot integration smoke (depends on Phases 1-5)

- `tests/fixtures/echo-mcp/server.ts` — fixture stdio MCP exposing 3 tools.
- `tests/integration/connectors-stdio.test.ts` — boots a worker against a temp DB, seeds one `echo` connector, exercises stories 1-7 (excluding 1's "manual insert" detail since the test does the insert directly).
- Pipeline-order smoke test that asserts the policy array's `name` field sequence in `index.ts` build.
- Quality gate: green. All success criteria from spec §Success Criteria checked.

## Risks / Open Decisions

The decisions below are flagged for the task-writer or implementer to resolve **without re-opening the spec**:

- **Where exactly to call `recordInvocation`.** `ClaudeCodeBackend.query()` already iterates SDK events and pushes `ToolCallSummary` objects. The recording is a side effect of that loop — but it must happen *after* the result is known (so `result` and `error_message` are populated). Implementer picks the exact event handler. Pattern: when handling a `tool_result`-style event, look up the corresponding `tool_use` (matched by `tool_use_id`), parse the SDK-prefixed name, derive `slug` and bare `tool_name`, call the repo. If the SDK doesn't surface duration directly, capture `Date.now()` at the `tool_use` event and subtract at the `tool_result` event.
- **`RemoteTransportNotImplementedError` shape.** A simple `class RemoteTransportNotImplementedError extends Error` with the connector slug in the message. Lives in `mcp-build.ts`. Spec 0033 deletes the `throw` and removes the class export.
- **`discoverTools` invocation strategy.** Spawns the MCP via the SDK's MCP client primitives, calls `tools/list`, kills the process. Reuse SDK helpers if available; otherwise wrap `child_process.spawn` + a minimal JSON-RPC client. The implementer picks based on what the SDK exposes at the time of writing — not a spec decision.
- **Whether the `last_verified_at` is updated when an invocation succeeds.** Yes — successful tool execution is implicit verification. Update on each successful invocation. Cheap (one UPDATE per call) and gives the dashboard fresh "last verified" timestamps without an explicit test.
- **Slug enforcement at the migration level.** SQLite GLOB has no quantifiers (no `+`, no `?` for "one or more"), so the kebab-case rule is expressed as three combined clauses: `slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND length(slug) >= 1` — first char alphanumeric; no character outside `[a-z0-9-]` anywhere; non-empty. The writer (`ConnectorRepo.create` + the API layer) ALSO validates via a Zod regex `/^[a-z0-9][a-z0-9-]*$/` so error messages are clear before hitting the DB. Implementer verifies the matrix in the migration test (per spec §Success Criteria item 1 and tasks Task 1.1 Step 4).
