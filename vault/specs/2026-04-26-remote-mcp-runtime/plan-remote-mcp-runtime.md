---
feature: remote-mcp-runtime
spec: "[[spec-remote-mcp-runtime]]"
created: 2026-04-26
---
# Remote MCP Runtime — Plan

**For this spec:** `[[spec-remote-mcp-runtime]]`

> **For agentic workers:** TDD-shaped. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Light up the `transport='remote'` path so connectors with HTTP/SSE URLs initialize, list tools, and run end-to-end alongside stdio connectors. No DB migrations, no API changes, no UI changes.

**Architecture:** A focused replacement of `toRemoteConfig` and `discoverTools` (both introduced as stubs in spec 0032) with working implementations. Loader-side: build the SDK's `{ type: 'http'|'sse', url, headers? }` shape from connector + secrets, applying the heuristic + `__MCP_TYPE__` override. Discover-side: invoke the SDK's HTTP/SSE MCP client primitives to fetch `tools/list`, classify by name, return typed errors. Both code paths reuse the rest of spec 0032's machinery (pipeline, invocation logging, last_error tracking) without modification.

**Tech Stack:** No new runtime dependencies. The SDK already supports HTTP/SSE — we just call it correctly. Test-side adds an in-process Node `http.createServer` fixture for unit tests.

## Approach

Three phases, each ending green:

1. **Loader implementation.** Replace `toRemoteConfig` body. Delete `RemoteTransportNotImplementedError`. Update unit tests.
2. **Discovery implementation.** Implement `discoverToolsRemote` against the SDK's HTTP/SSE MCP client. Build the in-process HTTP fixture. Tests cover the success/auth/network/timeout/unknown matrix.
3. **Boot smoke + parity.** Integration test that exercises the full chain: insert remote connector, drive an agent turn, assert pipeline + invocation + last_error parity with stdio.

The plan is **not** TDD-shaped for the loader (already tested in spec 0032's matrix; this spec just expands the matrix to include the remote cases). It **is** TDD-shaped for `discoverToolsRemote` because that path is new in this spec.

## Architecture

```
discoverTools(connector, secrets)
  ├─ transport='stdio' → discoverToolsStdio (unchanged from 0032)
  └─ transport='remote' → discoverToolsRemote (NEW)
                          │
                          ▼
                          toRemoteConfig(connector, secrets)
                          │
                          ▼
                          SDK MCP client
                            ├─ initialize(type, url, headers)
                            ├─ tools/list with 10s timeout
                            └─ disconnect
                          │
                          ▼
                          { tools: DiscoveredTool[] }
                          | { error: string; errorKind: 'auth' | 'network' | 'timeout' | 'unknown' }


buildMcpServersMap (unchanged structurally — just no longer skips remote)
  for each enabled connector:
    config = transport='stdio' ? toStdioConfig : toRemoteConfig  ← THIS works now
    map[slug] = config
  return map
```

## File Structure

### NEW files

| File | Responsibility |
|---|---|
| `apps/worker/tests/fixtures/remote-mcp/server.ts` | In-process HTTP MCP server. Speaks the minimum protocol surface (`initialize`, `tools/list`, `tools/call`). Echoes inputs. Configurable failure modes via env (`FAIL=401`, `FAIL=timeout`). |
| `apps/worker/tests/agent/mcp-build-remote.test.ts` | Loader matrix tests for `toRemoteConfig` (every case from spec §Success Criteria item 1). |
| `apps/worker/tests/agent/mcp-discover-remote.test.ts` | `discoverToolsRemote` matrix tests against the fixture. |
| `apps/worker/tests/integration/connectors-remote.test.ts` | End-to-end smoke: insert remote connector pointing to the fixture, drive a turn, assert invocation rows + `last_verified_at` updates + parity with the stdio path. |

### MODIFIED files

| File | Change |
|---|---|
| `apps/worker/src/agent/mcp-build.ts` | Replace the stub `toRemoteConfig` body with the design from spec §Loader change. Remove `RemoteTransportNotImplementedError` class + export. Remove the spec 0032 fallback path that captured the throw. |
| `apps/worker/src/agent/mcp-discover.ts` | Add `discoverToolsRemote`. Implement the dispatcher (`discoverTools`) to switch on `connector.transport`. |
| `apps/worker/tests/agent/mcp-build.test.ts` | Drop or update the test that asserted the throw. The matrix from spec 0032 stays; the remote case now expects success. |

### REMOVED entities (not files)

- `RemoteTransportNotImplementedError` class export from `mcp-build.ts`.
- The catch block in `buildMcpServersMap` that wrote `last_error='remote transport not yet supported (spec 0033)'`. After this spec, that string never appears as a `last_error` (existing rows from upgraded deployments still carry it; they clear on next successful test or runtime).

## Phase Ordering

### Phase 1 — Loader (no dependencies beyond spec 0032)

- Replace `toRemoteConfig` body.
- Delete the error class.
- Update / extend unit tests.
- Quality gate green.

### Phase 2 — Discovery (depends on Phase 1)

- Build the fixture HTTP MCP.
- Implement `discoverToolsRemote`.
- Tests for the auth/network/timeout/unknown matrix.
- Quality gate green.

### Phase 3 — Boot smoke + parity (depends on Phase 2)

- Integration test seeds a remote connector pointing to the in-process fixture.
- Drives an agent turn through the chat backend (using the same harness from spec 0032's Phase 6).
- Asserts: invocation row, `last_verified_at` updated, pipeline allows per the connector's permission rows.
- Failure variant: configure fixture to return 401, drive a call, assert `last_error` populated.
- Quality gate green.

## Risks / Open Decisions

- **Which SDK helper to use for `discoverToolsRemote`.** The Claude Agent SDK exposes the MCP HTTP client through its main `query()` API plus internal client primitives. Implementation-time choice: either (a) call `query()` with a temp prompt that triggers a `tools/list`, capture the result, and tear down — wasteful, agent in the loop; or (b) use the SDK's lower-level MCP client (if exposed) to do a direct `tools/list`. Prefer (b); fall back to (a) if not exposed at the time of writing. The fixture must work with whichever path is chosen.
- **Timeout enforcement strategy.** A `Promise.race` against `setTimeout(reject, 10_000)` is the simple option. Implementer ensures the SDK call is abort-able (`AbortController`) and aborts on timeout to free the connection.
- **Header logging redaction.** The `Authorization` header value must never appear in any log. The loader does not log headers; if the SDK does (debug mode), that is out of our control. Mitigation: the loader's emitted `mcp_loaded` log includes server names only — already true.
- **Whether to surface SSE-vs-HTTP visually in the dashboard.** Spec 0034 §UI surfaces `transport='remote'` as a single pill ("remote"). The HTTP/SSE distinction is internal. If a future operator confusion case appears (SSE-only servers misclassified), spec 0034 can add the override field as a visible advanced input. For MVP, the override secret key is sufficient.
- **Fixture port allocation.** The fixture HTTP server must bind to a free ephemeral port (`server.listen(0)`) and the test reads the actual port from `server.address()`. Avoid hardcoded ports to prevent CI flakiness.
- **Existing remote connectors with stale `last_error`.** Spec § notes existing rows from a previous deployment may carry `last_error='remote transport not yet supported (spec 0033)'`. They self-clear on the next successful operation. No migration; document in release notes if needed.
