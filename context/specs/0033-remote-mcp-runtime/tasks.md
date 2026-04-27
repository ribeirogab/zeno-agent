---
feature: remote-mcp-runtime
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-26
---
# Remote MCP Runtime — Tasks

**For this plan:** `[[plan]]`

Three phases. Each phase ends with a green `pnpm run quality-gate`. TDD-shaped for `discoverToolsRemote`; matrix-driven for `toRemoteConfig`.

---

## Phase 1: Loader implementation

### Task 1.1: Implement `toRemoteConfig`

- [ ] Step 1: In `apps/worker/src/agent/mcp-build.ts`, define module-level constants:
  ```typescript
  const RESERVED_MCP_TYPE_KEY = '__MCP_TYPE__';
  const RESERVED_AUTHORIZATION_KEY = '__MCP_AUTHORIZATION__';
  ```
- [ ] Step 2: Add `pickTransportType(url, override)` per spec §Loader change. Heuristic: `/sse/?` regex (case-insensitive). Override `'http'` or `'sse'` short-circuits.
- [ ] Step 3: Replace the body of `toRemoteConfig`:
  - Throw if `connector.url` is null.
  - Iterate `secrets`. Branch on the two reserved keys; everything else into `headers[key]`.
  - Compute `type` via `pickTransportType`.
  - Return `{ type, url, headers: Object.keys(headers).length > 0 ? headers : undefined }`.
- [ ] Step 4: Delete `class RemoteTransportNotImplementedError` and its export.
- [ ] Step 5: Search the codebase for `RemoteTransportNotImplementedError` (`pnpm dlx tsc --noEmit` will surface unresolved imports). Update or remove any catch block that referenced it. The fallback in `buildMcpServersMap` that recorded `last_error='remote transport not yet supported (spec 0033)'` is removed; remote loading errors now flow through the same generic catch as any other loader error.
- [ ] Step 6: `pnpm --filter @zeno/worker typecheck` green.
- [ ] Step 7: Commit: `feat(worker): toRemoteConfig builds SDK HTTP/SSE config from connector + secrets`.

### Task 1.2: Loader matrix tests

- [ ] Step 1: Create `apps/worker/tests/agent/mcp-build-remote.test.ts`. Use a small `makeConnector(...)` helper that returns a `Connector` with `transport='remote'`, the given URL, and the rest defaulted.
- [ ] Step 2: Write a `describe.each` table covering every line of spec §Success Criteria item 1:
  - URL `/sse` → `type='sse'`.
  - URL `/sse/` → `type='sse'`.
  - URL `/mcp` → `type='http'`.
  - URL `/v1/api` → `type='http'`.
  - With `__MCP_TYPE__='http'` override on `/sse` URL → `type='http'`.
  - With `__MCP_TYPE__='sse'` override on `/api` URL → `type='sse'`.
  - With `__MCP_AUTHORIZATION__='Bearer xyz'` → `headers.Authorization='Bearer xyz'`.
  - With `X-Custom-Header='abc'` → `headers['X-Custom-Header']='abc'`.
  - With both reserved + custom → reserved consumed, custom present.
  - Empty secrets → `headers: undefined`.
  - Missing URL → throws with the slug in the message.
- [ ] Step 3: Update `apps/worker/tests/agent/mcp-build.test.ts`: the test that previously asserted `RemoteTransportNotImplementedError` is replaced by a test that the remote case loads successfully. Other tests untouched.
- [ ] Step 4: `pnpm --filter @zeno/worker test` green.
- [ ] Step 5: Commit: `test(worker): toRemoteConfig matrix coverage`.

---

## Phase 2: Discovery implementation

### Task 2.1: Fixture HTTP MCP server

- [ ] Step 1: Create `apps/worker/tests/fixtures/remote-mcp/server.ts`. Use `node:http`'s `createServer`. Bind to ephemeral port via `listen(0)`.
- [ ] Step 2: Implement the minimum MCP HTTP surface:
  - `POST /` (or whatever path the SDK expects — check during implementation): responds to:
    - `initialize` → returns server info.
    - `tools/list` → returns `[{ name: 'read_echo', description: 'Echo via read', inputSchema: {} }, { name: 'write_echo', ... }, { name: 'interactive_echo', ... }]`.
    - `tools/call` for `<name>` → returns `{ content: [{ type: 'text', text: JSON.stringify(args) }] }`.
- [ ] Step 3: Failure modes via env (taxonomy harmonized with the `echo-mcp` stdio fixture from spec 0032 task 6.1):
  - `FAIL=401` → respond 401 to all requests with body `{"error":"401 Unauthorized"}`.
  - `FAIL=timeout` → never respond (test asserts the 10s timeout fires).
  - `FAIL=unknown` → respond 500 with body `'oops'`.
  - Unset / empty → normal mode.
- [ ] Step 3.b: **Runtime flip support** (used by spec 0035 E1 + E3). The fixture watches a control file at `<workspace>/remote-mcp-fail.txt` and re-reads its `FAIL=...` value on each request. Writing `FAIL=401` to the file flips behavior without restarting. Empty/absent file → fall back to the env var. Mirrors the `echo-mcp` fixture's mechanism (control file at `<workspace>/echo-mcp-fail.txt`) so e2e scenarios use one consistent flip API across transports.
- [ ] Step 4: Export a helper `startFixtureServer(opts): Promise<{ url: string; close: () => Promise<void> }>` that the unit tests can call.
- [ ] Step 5: Sanity test: `pnpm --filter @zeno/worker test apps/worker/tests/fixtures/remote-mcp/server.test.ts` (a tiny test asserting the server starts and `tools/list` returns 3 entries via fetch).
- [ ] Step 6: Commit: `test(worker): remote-mcp HTTP fixture server`.

### Task 2.2: Implement `discoverToolsRemote`

- [ ] Step 1: In `apps/worker/src/agent/mcp-discover.ts`, refactor `discoverTools` to dispatch on `connector.transport`. Keep the existing stdio path as `discoverToolsStdio` (was the only path before).
- [ ] Step 2: Implement `discoverToolsRemote(connector, secrets)`:
  - Build the SDK config via `toRemoteConfig`.
  - Initialize the SDK's MCP HTTP client. (See plan §Risks / Open Decisions for the exact import; pick (b) — direct MCP client primitive — if exposed.)
  - Call `tools/list` with a 10s timeout (`Promise.race` against `setTimeout`).
  - On success: return `{ tools: classified[] }` where each tool has `name`, `description`, `category` from the heuristic.
  - On 401/403: return `{ error: '...', errorKind: 'auth' }`.
  - On network refused / DNS / EAI: return `{ error: '...', errorKind: 'network' }`.
  - On timeout: return `{ error: 'timeout (10s)', errorKind: 'timeout' }`.
  - On other 4xx/5xx / parse errors: return `{ error: '...', errorKind: 'unknown' }` with a body excerpt (truncated to 200 chars).
- [ ] Step 3: Always tear down the connection (whether success or failure) — `try/finally`.
- [ ] Step 4: Commit: `feat(worker): discoverToolsRemote against HTTP/SSE MCP endpoints`.

### Task 2.3: Discovery tests

- [ ] Step 1: Create `apps/worker/tests/agent/mcp-discover-remote.test.ts`.
- [ ] Step 2: Test matrix:
  - Fixture default → `tools` array with 3 entries; categories: `read_echo='read'`, `write_echo='write'`, `interactive_echo='interactive'`.
  - `FAIL=401` → `errorKind='auth'`.
  - `FAIL=timeout` with shortened test timeout (use `vi.useFakeTimers()` + `vi.advanceTimersByTime(10_001)`) → `errorKind='timeout'`.
  - `FAIL=unknown` (500 with body `oops`) → `errorKind='unknown'`, error contains `oops`.
  - Missing URL on connector → throws (uncaught — caller's responsibility; matches `toRemoteConfig`).
- [ ] Step 3: `pnpm --filter @zeno/worker test` green.
- [ ] Step 4: Commit: `test(worker): discoverToolsRemote matrix`.

---

## Phase 3: Boot smoke + parity

### Task 3.1: Integration test against the fixture

- [ ] Step 1: Create `apps/worker/tests/integration/connectors-remote.test.ts`.
- [ ] Step 2: Reuse the boot harness from spec 0032's Phase 6 (extract to `tests/helpers/boot.ts` if not already shared).
- [ ] Step 3: Start the fixture: `const fixture = await startFixtureServer()`.
- [ ] Step 4: Insert a connector via `connectorRepo.create({...})`:
  - `slug='remote-echo'`, `source='custom'`, `transport='remote'`, `url=fixture.url`.
  - Secrets: `[{ key: '__MCP_AUTHORIZATION__', value: 'Bearer test-token' }]`.
  - Tools: 3 with permissions `read_echo='always_allow'`, `write_echo='ask'`, `interactive_echo='never'`.
- [ ] Step 5: Drive an agent turn: stub LLM to call `mcp__remote-echo__read_echo` with `{ msg: 'hi' }`. Assert: pipeline allowed, invocation row written, `last_verified_at` bumped.
- [ ] Step 6: Drive `mcp__remote-echo__interactive_echo`. Assert: pipeline denied, no invocation row.
- [ ] Step 7: Stop the fixture, restart with `FAIL=401`. Drive `mcp__remote-echo__read_echo`. Assert: invocation row with `result='error', error_message` containing `401`. Connector row updated with `last_error`, `last_error_at`. Status remains `enabled`.
- [ ] Step 8: `await fixture.close()` in `afterEach`.
- [ ] Step 9: `pnpm --filter @zeno/worker test` green.
- [ ] Step 10: Commit: `test(worker): connectors-remote integration smoke`.

### Task 3.2: Final quality gate

- [ ] Step 1: `pnpm run quality-gate` green at the repo root.
- [ ] Step 2: `pnpm run docker:build` succeeds.
- [ ] Step 3: Manual smoke (optional — covered by 0035): start docker-compose, insert a remote connector pointing to a public hosted MCP (Linear), observe the agent calls succeed via SSE.
- [ ] Step 4: Update `context/specs/0033-remote-mcp-runtime/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.
- [ ] Step 5: Commit: `chore(spec-0033): mark shipped`.

---

## Verification checklist (against spec § Success Criteria)

- [ ] 1. `toRemoteConfig` matrix (Phase 1.2 tests).
- [ ] 2. `discoverToolsRemote` matrix (Phase 2.3 tests).
- [ ] 3. `RemoteTransportNotImplementedError` removed (Phase 1.1 step 4-5).
- [ ] 4. Existing stdio loader tests still pass (Phase 1.2 step 3).
- [ ] 5. Pipeline-order assertion still passes (no change to wiring; verified at quality gate).
- [ ] 6. Boot smoke (Phase 3.1).
- [ ] 7. Catalog parity (Phase 3.1; the test seeds via the same DB shape regardless of catalog/custom — the metadata difference is `source`, not behavior).
- [ ] 8. `pnpm run quality-gate` green (Phase 3.2).
