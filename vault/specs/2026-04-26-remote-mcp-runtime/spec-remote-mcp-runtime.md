---
status: shipped
feature: remote-mcp-runtime
created: 2026-04-26
shipped: 2026-04-26
---
# Remote MCP Runtime — Spec

**Status:** Draft
**Scope:** Implements HTTP/SSE transport for DB-managed MCP connectors. Replaces the `RemoteTransportNotImplementedError` thrown by spec 0032's `toRemoteConfig` with a working implementation that constructs the SDK config for the `remote` transport, injects authorization headers from connector secrets, and exercises the test-connection / refresh-tools paths against a remote endpoint. OAuth dance orchestration (dynamic client registration) remains out of scope.

## Context

Spec 0032 introduced `transport='remote'` as a column value but threw on the loader path so that a remote connector inserted into the DB landed in `enabled` with `last_error='remote transport not yet supported (spec 0033)'`. Spec 0029 §Add Flows describes the dashboard's Add custom (remote) modal, where the user pastes a URL and optional OAuth Client ID + Secret. The non-goals of 0029 §10 explicitly defer OAuth flow orchestration: the operator pastes pre-obtained tokens, the UI does not run a dance.

This spec lights up the runtime path. After this spec ships, a connector with `transport='remote'`, a valid URL, and the right secrets in the DB initializes successfully via the SDK's HTTP/SSE MCP support, exposes its tools, and runs end-to-end through the same pipeline (permissions, invocation logging, last_error tracking) that stdio connectors use.

The Claude Agent SDK MCP `mcpServers` option already accepts both stdio and HTTP/SSE shapes:

```typescript
// stdio
{ command: 'npx', args: ['-y', 'mcp-linear'], env: { LINEAR_API_KEY: '...' } }

// http
{ type: 'http', url: 'https://mcp.linear.app/sse', headers?: { [name]: string } }

// sse (server-sent events)
{ type: 'sse', url: 'https://...', headers?: { [name]: string } }
```

The `type` field is the discriminator. `http` and `sse` differ in transport semantics but the SDK exposes the same surface. This spec treats both as one logical "remote" transport, with a sub-distinction surfaced where it matters.

## Problem Statement

Without remote support, the dashboard's Add custom (remote) flow saves a connector that the worker rejects on load. Operators who want to connect to a hosted MCP (e.g., a remote Linear, a remote internal tool such as a custom scrum tracker) cannot do so. The dashboard surface is visually complete (spec 0029 + spec 0034) but functionally blocked.

This spec is intentionally narrow: implement the remote transport, mirror the operational behaviors of stdio (test-connection, refresh-tools, runtime auth, logging), and stop there.

## Non-Goals

1. **OAuth dynamic client registration / authorization code flow.** The user pastes a token; the runtime sends it. Spec 0029 §Non-Goal 9 stands.
2. **Long-lived OAuth refresh-token rotation.** When a token expires, the operator updates the secret value via the dashboard. There is no refresh token rotation in MVP.
3. **WebSocket MCP transport.** Not in the SDK's accepted shape today; not needed.
4. **Remote MCP discovery via well-known endpoints.** The user provides the URL directly.
5. **Catalog entries with remote URLs that change.** Catalog entries continue to be statically declared in `agent/connectors-catalog.json`. URL drift is a catalog edit, not a runtime concern.
6. **Per-connector TLS pinning / custom CA bundles.** The SDK uses Node's default TLS trust store; that is sufficient for hosted SaaS. Self-signed scenarios are out.
7. **HTTP/2 push or streaming optimizations.** SSE is the streaming primitive the SDK supports; we do not add bespoke transport tuning.
8. **Per-tool overrides on `headers`.** All headers apply to the entire connection, not per tool call.
9. **Schema changes.** The `connectors` table already has the `url` column from spec 0032. No migrations land in this spec.
10. **DB migrations or repo changes.** Pure runtime work in `apps/worker`.

## Constraints

- **`type` mapping.** The DB column `transport` is the boolean discriminator (`stdio` | `remote`). Within `remote`, the SDK type (`http` | `sse`) is determined by URL scheme and path heuristic, with explicit override stored in connector metadata. Decision: **default to `http` for `https://...`** unless the URL ends in `/sse` or `/sse/` (case-insensitive), in which case use `sse`. This matches the convention most hosted MCPs adopt today (`https://mcp.example.com/sse` for SSE; `https://mcp.example.com/mcp` for plain HTTP). If the heuristic mis-fires for a specific connector, the operator can set a one-character override in the secrets table under the reserved key `__MCP_TYPE__` with value `http` or `sse`. This reserved key is consumed by the loader (not forwarded as an env var / header) and lets the operator pin the transport without changing the URL. The dashboard exposes this as a hidden "Advanced > transport" field; spec 0034 details the UI side.
- **Header injection from secrets.** All connector secrets become HTTP headers on the request, *with these reserved-key exceptions*:
  - `__MCP_TYPE__` — controls the SDK `type` field (above); not sent.
  - `__MCP_AUTHORIZATION__` — sent as the `Authorization` header (verbatim — operator includes the scheme: `Bearer ...`, `Basic ...`, etc.). This is the canonical place to put a bearer token.
  - All other keys — sent as headers under their literal name. So a key `X-Custom-Header` becomes `X-Custom-Header: <value>`. The dashboard form lets the operator type the header name; the loader passes it through. Header names follow HTTP rules (no underscores in well-formed names; the loader does not transform).
- **OAuth Client ID / Secret on catalog connectors.** Catalog entries that declare OAuth fields (`secrets: [{ key: '__MCP_AUTHORIZATION__', label: 'OAuth Token', help: '...' }, ...]`) treat them as the `Authorization` header. There is no separate OAuth flow; the catalog's `help` text instructs the operator how to obtain the token from the upstream provider.
- **Test-connection for remote.** Mirrors stdio: invoke the SDK to initialize the MCP, request `tools/list`, return the tool array, kill the connection. `discoverTools(connector)` from spec 0032 dispatches on transport: stdio path is unchanged; remote path runs the SDK's HTTP/SSE init.
- **Timeouts.** Test-connection has a 10s timeout (overall — covers DNS + TLS + handshake + tools/list). On timeout: mark the connector with `last_error='timeout (10s)'` and return a typed result the dashboard surfaces. Runtime tool invocations inherit the existing `ClaudeCodeBackend.timeoutMs` (1h default — operator set on backend init); no per-connector timeout in MVP.
- **Connection reuse.** The SDK manages connection pooling. The loader returns the config map per turn; the SDK decides whether to reuse a TCP connection across turns. No worker-side connection pool.
- **Failure semantics match stdio.** A 401 / 5xx / network error during a runtime tool call lands in `connector_invocations` with `result='error'`, `error_message=<short>`, plus `last_error` / `last_error_at` updated on the connector row. Status remains `enabled`. The operator decides whether to disable.
- **`RemoteTransportNotImplementedError` is removed.** Spec 0032 introduced the error class as a marker. This spec deletes the throw and the export. Any test that expected the throw is updated to assert successful loading instead.
- **No changes to the guardrails pipeline.** Permission resolution is identical between stdio and remote — the policy reads from `connector_tool_permissions` regardless of transport.
- **Custom remote MCP reference path.** The integration test in spec 0035 will exercise a custom remote MCP path against a local mock server or a fixture. This spec ships a minimal fixture remote MCP (HTTP) for unit testing.

## Design

### Loader change in `mcp-build.ts`

Replace `toRemoteConfig`:

```typescript
// apps/worker/src/agent/mcp-build.ts (excerpt)

import type { Connector, ConnectorSecret } from '@zeno/storage';
import type { McpServerConfig } from './mcp.js';

// Reserved keys consumed by the loader (not sent as headers/env).
const RESERVED_MCP_TYPE_KEY = '__MCP_TYPE__';
const RESERVED_AUTHORIZATION_KEY = '__MCP_AUTHORIZATION__';

function pickTransportType(url: string, override?: string): 'http' | 'sse' {
  if (override === 'http' || override === 'sse') return override;
  // Heuristic: URLs ending in /sse or /sse/ are SSE; everything else is plain HTTP.
  return /\/sse\/?$/i.test(url) ? 'sse' : 'http';
}

export function toRemoteConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  if (!connector.url) {
    throw new Error(`connector ${connector.slug} has transport=remote but no url`);
  }
  const headers: Record<string, string> = {};
  let typeOverride: string | undefined;
  for (const s of secrets) {
    if (s.key === RESERVED_MCP_TYPE_KEY) {
      typeOverride = s.value;
      continue;
    }
    if (s.key === RESERVED_AUTHORIZATION_KEY) {
      headers.Authorization = s.value;
      continue;
    }
    headers[s.key] = s.value;
  }
  const type = pickTransportType(connector.url, typeOverride);
  return {
    type,
    url: connector.url,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  };
}
```

`buildMcpServersMap` from spec 0032 is unchanged at the structural level. The behavior change is that `toRemoteConfig` now succeeds. The previous side-effect (writing `last_error='remote transport not yet supported (spec 0033)'` on a remote connector) goes away; if the operator left such a `last_error` in the DB from an earlier release, it persists until the next successful test-connection or runtime invocation clears it.

### Test connection — remote path

`apps/worker/src/agent/mcp-discover.ts` from spec 0032 dispatches on transport:

```typescript
// excerpt — public contract of @zeno/mcp-discover (post-extraction in spec 0034)
export type DiscoverToolsResult =
  | { tools: DiscoveredTool[]; durationMs: number }
  | { error: string; errorKind: 'timeout' | 'auth' | 'network' | 'unknown' | 'spawn' };

export async function discoverTools(
  connector: Connector,
  secrets: ConnectorSecret[],
): Promise<DiscoverToolsResult> {
  if (connector.transport === 'stdio') {
    return discoverToolsStdio(connector, secrets);
  }
  return discoverToolsRemote(connector, secrets);
}

async function discoverToolsRemote(connector, secrets): Promise<DiscoverToolsResult> {
  const config = toRemoteConfig(connector, secrets);
  // Capture start time. Use the SDK's MCP client primitives to initialize the
  // remote endpoint and request tools/list. Timeout: 10s overall.
  // On success: { tools, durationMs: Date.now() - start }.
  // On 401/403: errorKind='auth'. On network refused/timeout: errorKind='timeout'|'network'.
  // On other failures: errorKind='unknown', error message taken from response body.
  // (errorKind='spawn' is reserved for the stdio path — never returned here.)
}
```

### Stdio path — `errorKind` taxonomy

Spec 0032 ships `discoverToolsStdio`. This spec also locks down the **stdio error taxonomy** so the public `DiscoverToolsResult` union is complete and consistent across both transports:

- `errorKind='spawn'` — the child process failed to start (`ENOENT` on the command, permission denied, no executable on PATH, etc.). Stdio-only; `discoverToolsRemote` never produces it.
- `errorKind='timeout'` — `tools/list` did not respond within 10s.
- `errorKind='auth'` — the MCP returned an authentication error response (rare for stdio but possible if the MCP wraps a remote service).
- `errorKind='unknown'` — any other failure (malformed response, unexpected exit, parse error). Error message includes a short excerpt.
- `errorKind='network'` — **not** produced by stdio (no network in stdio); reserved for `discoverToolsRemote`.

The implementer of `discoverToolsStdio` (per spec 0032 task 6.x or via the `@zeno/mcp-discover` extraction in spec 0034) maps `child.spawn` failures and `tools/list` failures to the corresponding `errorKind`. The API's `TestConnectionResponse` type accepts the full union.

### `DiscoveredTool` shape

```typescript
interface DiscoveredTool {
  name: string;
  description: string | null;
  // Inferred category — same heuristic the dashboard uses for custom stdio connectors:
  //   read_*, list_*, get_*, search_*, find_* → 'read'
  //   create_*, update_*, delete_*, send_*, post_*, put_* → 'write'
  //   else → 'interactive'
  category: 'read' | 'write' | 'interactive';
}
```

The classification is performed by `mcp-discover.ts`, not by the SDK or by the dashboard, so the same logic applies regardless of transport.

### Behavior parity matrix

This table is the contract between specs 0032 and 0033:

| Behavior | stdio (0032) | remote (0033) |
|---|---|---|
| Loader builds SDK config | `toStdioConfig` | `toRemoteConfig` |
| Reserved keys consumed by loader | none | `__MCP_TYPE__`, `__MCP_AUTHORIZATION__` |
| Test-connection helper | `discoverToolsStdio` | `discoverToolsRemote` |
| Tool name format on the wire | `mcp__<slug>__<tool>` | `mcp__<slug>__<tool>` (identical) |
| Permission gate | `connector_permission` policy | `connector_permission` policy (identical) |
| Invocation logging | `connector_invocations` row per call | `connector_invocations` row per call (identical) |
| `last_error` updates | on transport failure | on HTTP/timeout/network failure |
| `last_verified_at` updates | on each successful invocation | on each successful invocation |
| Hot-reload semantics | next `query()` reads fresh DB | next `query()` reads fresh DB |
| Status interpretation | enabled / disabled / pending | enabled / disabled / pending |

## User Stories / Scenarios

1. **Operator installs a hosted catalog connector (Linear via remote URL).**
   - Catalog entry: `transport: 'remote', url: 'https://mcp.linear.app/sse', secrets: [{ key: '__MCP_AUTHORIZATION__', label: 'Linear API Key', help: '...' }]`.
   - Operator pastes a `lin_api_xxx` value. The dashboard prepends `Bearer ` for catalog hints (per spec 0034 detail). The DB stores `__MCP_AUTHORIZATION__` = `Bearer lin_api_xxx`.
   - Test-connection succeeds: `discoverToolsRemote` initializes the SDK against the URL with `Authorization: Bearer lin_api_xxx`, gets tools/list, classifies, returns 12 tools.
   - Connector saved as `enabled`. Tool list and per-tool defaults persisted.
   - Agent calls `mcp__linear__list_issues`. Pipeline `connector_permission` finds always_allow. SDK initializes the HTTP/SSE connection, makes the call. Result returned. Invocation row written. `last_verified_at` bumped.

2. **Operator adds a custom remote MCP (e.g., a private scrum tracker).**
   - Add custom (remote) modal. URL: `https://scrum.example.com/mcp`. Advanced > Authorization: `Bearer <pre-obtained-token>`.
   - Test-connection: succeeds. 8 tools discovered. Categories inferred via heuristic.
   - Connector saved. Permissions: read tools `always_allow`, write tools `ask`, interactive tools `ask`.

3. **Token expires mid-session.**
   - Agent calls `mcp__linear__list_issues`. SDK returns 401 from Linear's MCP.
   - Worker invocations table records `result='error', error_message='401 Unauthorized'`.
   - Connector row: `last_error='401 Unauthorized', last_error_at=<now>`. Status remains `enabled`.
   - Operator opens the dashboard, sees the with-error visual state, edits the secret, tests, succeeds, `last_error` clears.

4. **URL is wrong / unreachable.**
   - Test-connection times out at 10s.
   - Result: `errorKind='timeout', error='timeout (10s)'`.
   - Connector saved (custom add allows pending). On every runtime call, the SDK fails with a network error; invocation row has `result='error'`. Connector accumulates `last_error` updates with each attempt.

5. **SSE-typed URL.**
   - URL: `https://mcp.linear.app/sse`. Heuristic picks `type='sse'`. SDK uses SSE transport.
   - Behavior identical from the operator's standpoint; just a different wire protocol the SDK negotiates.

6. **Operator pins transport via override.**
   - Catalog entry doesn't match the heuristic (e.g., `https://mcp.example.com/v2/api`). Connector loads as `type='http'` by default. Tools list call hangs because the upstream needs SSE.
   - Operator inserts a secret `__MCP_TYPE__='sse'`. The next `query()` rebuilds the config with `type='sse'`. Tools work.

## Success Criteria

1. `toRemoteConfig` unit tests cover every input variant of the design table:
   - URL `/sse` → `type='sse'`.
   - URL `/sse/` → `type='sse'`.
   - URL `/mcp`, `/v1/api`, etc. → `type='http'`.
   - `__MCP_TYPE__='http'` override forces `http` regardless of URL.
   - `__MCP_TYPE__='sse'` override forces `sse` regardless of URL.
   - `__MCP_AUTHORIZATION__` value lands in `headers.Authorization` verbatim.
   - Other secrets land as headers under their literal name.
   - Reserved keys are not duplicated as headers.
   - Empty secrets list → `headers: undefined`.
   - Missing URL → throws with the connector slug in the message.
2. `discoverToolsRemote` unit tests use a mock HTTP MCP server and cover: success (returns tool array, classifies categories), 401 (errorKind='auth'), connection refused (errorKind='network'), timeout (errorKind='timeout' after 10s — fast-clock test), malformed response (errorKind='unknown', error contains the response body excerpt).
3. The `RemoteTransportNotImplementedError` class is removed from `mcp-build.ts`. Any tests that imported it are updated. `pnpm --filter @zeno/worker typecheck` is clean.
4. Existing stdio loader tests from spec 0032 still pass — no regression.
5. The pipeline-order assertion test from spec 0032 still passes — adding remote transport does not change pipeline shape.
6. End-to-end smoke (worker + a fixture remote HTTP MCP server in-process):
   - Insert one remote connector with a fixture URL and a Bearer token. Call `discoverToolsRemote` → 3 tools.
   - Boot the chat backend with `getMcpServers`. Drive an agent turn that calls a tool. Assert: invocation row written, `last_verified_at` updated.
7. Catalog parity: a catalog connector entry with `transport: 'remote'` installs and operates identically to a custom remote connector. Asserted by the same boot smoke (configured via the same DB rows — catalog vs custom is a metadata distinction only).
8. `pnpm run quality-gate` green: lint + typecheck + tests across all workspaces. No new `any`. No new `// biome-ignore`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The heuristic mis-classifies a real-world URL (custom path that should be SSE but doesn't end in `/sse`) | The `__MCP_TYPE__` override exists for exactly this case. Documented in the dashboard help text on the Advanced section of the Add custom modal (spec 0034). |
| SDK changes its HTTP/SSE shape between releases | The `McpServerConfig` interface in `apps/worker/src/agent/mcp.ts` already supports both shapes (the SDK accepts the shape we construct). Pinned SDK version + integration test on the fixture catches drift. |
| Authorization header logged accidentally | The loader never logs the headers map. The `mcp_loaded` log emits names only. The classifier and approver never see the header content. |
| 401 / 403 responses not distinguished from generic 4xx in `discoverToolsRemote` | Explicit handling: 401/403 → `errorKind='auth'`. Other 4xx → `errorKind='unknown'` with body excerpt. 5xx → `errorKind='unknown'`. Network/DNS/refused → `errorKind='network'`. Timeout → `errorKind='timeout'`. The dashboard maps `auth` to "check your API key" hint. |
| Remote MCP returns a streaming response that takes longer than 10s for `tools/list` | The 10s timeout is for *test-connection* only. Runtime tool calls inherit the agent backend's timeout (1h default). Tools/list should complete in milliseconds against a hosted endpoint; if 10s isn't enough something is fundamentally wrong. |
| Header collision between operator-named and reserved | Reserved keys (`__MCP_TYPE__`, `__MCP_AUTHORIZATION__`) start with `__` (double underscore). HTTP header names cannot start with `__` per RFC convention; the form-input hint in the dashboard discourages it. The loader treats only the exact reserved keys specially. |
| Testing remote MCPs in unit tests means adding a network fixture | The fixture is an in-process HTTP server (`createServer` from `node:http`) that speaks the MCP protocol minimally. Self-contained; no external dependency. |
| Catalog entries pin a URL that goes stale | Catalog drift behavior from spec 0029 §Detail Screen Behavior applies: installed connectors are frozen at install time. Catalog updates only affect new installs. |
| OAuth tokens stored plain in DB | Same risk as stdio secrets; same mitigation. Encryption-at-rest deferred. |
| SSE transport keeps a connection open for the duration of the agent turn | Acceptable — the SDK handles it. If many connectors with SSE accumulate open sockets at idle, future tuning may matter. Single-user scale: irrelevant. |

## Forward Reference — package extraction in spec 0034

Spec 0034 §Test connection architecture extracts `apps/worker/src/agent/mcp-discover.ts` (and the helpers it depends on, including `discoverToolsRemote` shipped here) into a new workspace package `@zeno/mcp-discover`. The extraction is a pure refactor — same code, new home — but it relocates **the test files this spec adds**:

- `apps/worker/tests/agent/mcp-build-remote.test.ts`
- `apps/worker/tests/agent/mcp-discover-remote.test.ts`
- `apps/worker/tests/integration/connectors-remote.test.ts`
- `apps/worker/tests/fixtures/remote-mcp/server.ts`

Spec 0034 Phase 2 explicitly moves these files (or keeps the integration test in `apps/worker` since it boots the full worker) and adapts imports. Implementers of spec 0033 should be aware that anything they author in `apps/worker/tests/agent/mcp-*` is in scope for relocation when 0034 lands. The fixture under `apps/worker/tests/fixtures/remote-mcp/` is reused by spec 0034's API tests and spec 0035's e2e harness; it stays in `apps/worker/tests/fixtures/` (cross-package access by path, no relocation).

## Open Questions

None blocking. Implementation-time choices:

1. **Exact import path of the SDK's MCP HTTP client primitives.** Implementer reads the SDK version pinned in the project and picks the right import. Pattern: prefer the highest-level helper that takes a config like `toRemoteConfig` returns, runs `tools/list`, and surfaces typed errors.
2. **Where to put the fixture HTTP MCP server.** `apps/worker/tests/fixtures/remote-mcp/server.ts` mirrors the stdio fixture's location. Same self-contained shape: standalone runnable, returns canned `tools/list` results.
3. **Whether to delete the `RemoteTransportNotImplementedError` class export immediately or stage the removal.** Delete in this spec — it's a one-line marker; staged removal is overkill.
4. **Whether `discoverToolsRemote` should retry once on transient 5xx.** No — keep it simple; one attempt; the dashboard's `Test connection` button is the retry mechanism.
