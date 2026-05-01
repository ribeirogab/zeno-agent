---
feature: connectors-backend
plan: "[[plan-connectors-backend]]"
spec: "[[spec-connectors-backend]]"
created: 2026-04-26
---
# Connectors Backend Foundation — Tasks

**For this plan:** `[[plan-connectors-backend]]`

Six phases. Each phase ends with a green `pnpm run quality-gate`. Tasks are TDD-shaped wherever a unit has clear input/output.

---

## Phase 1: Storage layer

### Task 1.1: Add migration 5

- [ ] Step 1: In `packages/storage/src/migrations.ts`, append the migration entry with `id: 5, name: 'connectors'` and the SQL from spec §Database. The slug CHECK uses SQLite GLOB (no quantifiers) split into three clauses: `CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9-]*' AND length(slug) >= 1)`. Verify behavior in Step 4.
- [ ] Step 2: Open `packages/storage/tests/migrations.test.ts` (or the equivalent existing test file). Add a case: applying migrations against an empty DB results in `current=5` and the four new tables exist with the expected columns. Use `PRAGMA table_info('connectors')` etc.
- [ ] Step 3: Add a case: re-applying after migration 5 is a no-op (idempotency).
- [ ] Step 4: Add a case: inserting a connector with an invalid slug is rejected by the GLOB constraint. Test all three forbidden-character shapes: uppercase (`Linear`), underscore (`linear_one`), trailing/internal disallowed chars (`linear@`, `lin ear`). Empty string is rejected by the `length(slug) >= 1` clause. Valid slugs `linear`, `fn-scrum`, `google-drive`, single-char `a` succeed.
- [ ] Step 5: `pnpm --filter @zeno/storage test` green.
- [ ] Step 6: Commit: `feat(storage): migration 5 — connectors tables`.

### Task 1.2: Add types

- [ ] Step 1: In `packages/storage/src/types.ts`, add the type union from spec §Type extensions: `ConnectorTransport`, `ConnectorSource`, `ConnectorStatus`, `ToolCategory`, `ToolPermission`, `InvocationResult`, `Connector`, `ConnectorSecret`, `ConnectorToolPermission`, `ConnectorInvocation`, `CreateConnectorInput`.
- [ ] Step 2: Extend `PolicyThatGated` with `'connector_allow' | 'connector_never'`.
- [ ] Step 3: Re-export from `packages/storage/src/index.ts`.
- [ ] Step 4: `pnpm --filter @zeno/storage typecheck` green.
- [ ] Step 5: Commit: `feat(storage): connector types + extend PolicyThatGated`.

### Task 1.3: Implement ConnectorRepo (TDD)

- [ ] Step 1: Create `packages/storage/tests/connectors.test.ts`. Skeleton with one failing test: `repo.list()` on an empty DB returns `[]`.
- [ ] Step 2: Create `packages/storage/src/repos/connectors.ts` with the class and method signatures from spec §`ConnectorRepo`. Implement only `list()` to make the first test pass.
- [ ] Step 3: TDD `create` (single transaction inserts connector + secrets + tools). Tests: returns the inserted row; rolls back if any inner insert fails (e.g., a tool with invalid category — the CHECK fires, the entire transaction aborts, no rows persisted).
- [ ] Step 4: TDD `get`, `getBySlug`. Tests: hit, miss.
- [ ] Step 5: TDD `getSecrets`, `getTools`, `getEnabledWithSecrets`. The composite getter loads only `status='enabled'` rows with their secrets and tools attached.
- [ ] Step 6: TDD `update`. Tests: partial updates; `updated_at` is bumped on every update; setting `lastError` and `lastErrorAt` to non-null then null works.
- [ ] Step 7: TDD `replaceSecrets`. Tests: removes existing rows for the connector and inserts the new set in one transaction.
- [ ] Step 8: TDD `replaceTools` and `setToolPermission`. Tests: replace clears + inserts; `setToolPermission` updates a single row; raises if the tool name is not present (the dashboard should always check first).
- [ ] Step 9: TDD `setBulkPermission`. Test: returns the count of rows affected; only updates rows in the specified category.
- [ ] Step 10: TDD `delete`. Tests: returns true on hit, false on miss; cascades secrets + tools + invocations.
- [ ] Step 11: TDD `recordInvocation` and `recentInvocations`. Tests: insertion, ordering (newest first), the LIMIT honored, `error_message` populated only when result='error'.
- [ ] Step 12: Add Zod schemas for `args` JSON parsing inside the repo so callers receive a typed `string[]` not `unknown`. Test that malformed JSON throws a clear error (this is a programmer error, not a runtime user concern).
- [ ] Step 13: `pnpm --filter @zeno/storage test` green; coverage on `connectors.ts` ≥ 95%.
- [ ] Step 14: Commit: `feat(storage): ConnectorRepo + tests`.

---

## Phase 2: Loader rewrite

### Task 2.1: Extend `ClaudeCodeBackend` with `getMcpServers`

- [ ] Step 1: In `apps/worker/src/agent/backends/claude-code.ts`, add `getMcpServers?: () => Record<string, McpServerConfig>` to `ClaudeCodeBackendOptions`.
- [ ] Step 2: In `query()`, compute `const dynamic = this.getMcpServers?.() ?? {};` and merge with the existing static `mcpServers` (dynamic wins on key conflict). Do **not** call `getMcpServers` per tool call — once per query.
- [ ] Step 3: Update the existing `mock-fixtures.ts` and `mock.ts` if they reference `mcpServers` directly — no change expected, but verify.
- [ ] Step 4: Update `apps/worker/tests/agent/backends/claude-code.test.ts` (or create) with a mock backend test: assert `getMcpServers` is invoked once per `query()` and the returned map merges correctly.
- [ ] Step 5: `pnpm --filter @zeno/worker test` green.
- [ ] Step 6: Commit: `feat(worker): ClaudeCodeBackend accepts getMcpServers factory`.

### Task 2.2: Build `mcp-build.ts`

- [ ] Step 1: Create `apps/worker/src/agent/mcp-build.ts`. Export `buildMcpServersMap`, `toStdioConfig`, `toRemoteConfig`, `RemoteTransportNotImplementedError`. Signatures per spec §MCP loader rewrite.
- [ ] Step 2: Implement `toStdioConfig` from a `Connector` + its `secrets`. Tests cover: env map populated when secrets present; `env: undefined` when secrets empty; `args: []` when null.
- [ ] Step 3: Implement `toRemoteConfig` to throw `RemoteTransportNotImplementedError` (spec 0033 will replace this).
- [ ] Step 4: Implement `buildMcpServersMap`:
  - Reads `loadAgentMcpConfig()` (built-ins, unchanged from current `loadMcpConfig`'s agent-layer half).
  - Reads `connectorRepo.getEnabledWithSecrets()` for the user layer.
  - For each user connector: try-catch around `toStdioConfig` / `toRemoteConfig`. On `RemoteTransportNotImplementedError`: `connectorRepo.update(c.id, { lastError: 'remote transport not yet supported (spec 0033)', lastErrorAt: now })` and skip. Other errors: log and skip.
  - Merge: built-ins first, user connectors second (user wins on collision; emit log `connector_overrides_builtin`).
  - Return the merged map.
- [ ] Step 5: Tests for `buildMcpServersMap`: each matrix case from spec success criterion 3.
- [ ] Step 6: `pnpm --filter @zeno/worker test` green.
- [ ] Step 7: Commit: `feat(worker): buildMcpServersMap reads connectors from DB`.

### Task 2.3: Refactor `apps/worker/src/agent/mcp.ts`

- [ ] Step 1: Delete `loadMcpConfig` (the merged loader). Keep `loadAgentMcpConfig` (renamed from the agent-layer half of the old function). Keep the `McpServerConfig` interface export.
- [ ] Step 2: Re-export `buildMcpServersMap` from this file so existing imports of `@/agent/mcp` keep working as much as possible (callers will still update to use the new name; this is a compatibility re-export).
- [ ] Step 3: Update existing tests in `apps/worker/tests/agent/mcp.test.ts` to test only the `loadAgentMcpConfig` half (built-ins). The user-layer paths are no longer exercised here.
- [ ] Step 4: `pnpm --filter @zeno/worker test` green.
- [ ] Step 5: Commit: `refactor(worker): split mcp.ts into agent-layer loader and DB-driven builder`.

### Task 2.4: Wire boot in `apps/worker/src/index.ts`

- [ ] Step 1: After `runMigrations`, instantiate `connectors = new ConnectorRepo(db)`.
- [ ] Step 2: Replace `const mcpServers = loadMcpConfig()` with: `const getMcpServers = () => buildMcpServersMap({ connectorRepo: connectors, logger });`. Then call it once at boot to get the initial map for the log line: `const initialServers = getMcpServers(); logger.info({ event: 'mcp_loaded', count: Object.keys(initialServers).length, servers: Object.keys(initialServers) }, 'mcp servers loaded');`.
- [ ] Step 3: Pass `getMcpServers` to **both** backend constructions (the `tempInner`, `guardedInner`, `backendForRunner`, and the unguarded fallback path). The static `mcpServers` constructor option is no longer set; only the dynamic getter is used.
- [ ] Step 4: Boot smoke: `pnpm run docker:build && pnpm run docker:up`. Tail logs; expect `mcp_loaded count=N servers=[...]`. Smoke is verified manually here; the integration test in Phase 6 covers it formally.
- [ ] Step 5: Commit: `feat(worker): boot reads connectors from DB via getMcpServers factory`.

---

## Phase 3: Cutover warning

### Task 3.1: Implement `warnIfMcpJsonExists`

- [ ] Step 1: Create `apps/worker/src/agent/mcp-cutover.ts`. Export `warnIfMcpJsonExists(logger: Logger): void`.
- [ ] Step 2: Implementation: probe `PROFILE_CANDIDATES` (the same array used elsewhere); if `profile/mcp.json` exists, parse it loosely (best-effort), gather the `Object.keys(parsed.mcpServers ?? {})`, and emit one structured `warn` log: `{ event: 'mcp_json_ignored', servers, message: 'MCP servers in mcp.json are no longer loaded. Re-add them via /connectors in the dashboard.' }`. If parse fails, still emit the warning with `servers: ['<unparseable>']`.
- [ ] Step 3: Tests in `apps/worker/tests/agent/mcp-cutover.test.ts`: file absent → no log; file present with 3 servers → one log with the right `servers` array; file malformed → one log with placeholder.
- [ ] Step 4: Wire in `apps/worker/src/index.ts` immediately after `runMigrations` (before any MCP loading). Drop nothing else here.
- [ ] Step 5: `pnpm --filter @zeno/worker test` green.
- [ ] Step 6: Commit: `feat(worker): mcp.json cutover warning at boot`.

### Task 3.2: Drop `onMcpChanged` from `ProfileWatcher`

- [ ] Step 1: In `apps/worker/src/profile/watcher.ts`, remove the `onMcpChanged` callback option from the constructor and the corresponding watch wiring.
- [ ] Step 2: In `apps/worker/src/index.ts`, remove the `onMcpChanged` handler from the watcher construction.
- [ ] Step 3: Update `apps/worker/tests/profile/watcher.test.ts` to drop the test for `mcp.json` change detection.
- [ ] Step 4: `pnpm --filter @zeno/worker test` green.
- [ ] Step 5: Commit: `refactor(worker): drop onMcpChanged from ProfileWatcher`.

---

## Phase 4: Permission policy

### Task 4.1: Build `connector_permission` middleware (TDD)

- [ ] Step 1: Create `apps/worker/tests/guardrails/connector-permission.test.ts`. Skeleton with the matrix cases from spec §Success Criteria item 4. Use a stub `ConnectorRepo` that returns canned `getBySlug` and `getTools` results.
- [ ] Step 2: Create `apps/worker/src/guardrails/policies/connector-permission.ts`. Implement per the regex + lookup logic in spec §Guardrails — new `connector_permission` policy.
- [ ] Step 3: Run tests: all matrix cases green.
- [ ] Step 4: `pnpm --filter @zeno/worker test` green.
- [ ] Step 5: Commit: `feat(worker): connector_permission policy middleware`.

### Task 4.2: Insert into the pipeline

- [ ] Step 1: In `apps/worker/src/index.ts`, in the `policies: PolicyMiddleware[]` array, insert `makeConnectorPermissionPolicy({ connectorRepo: connectors })` between `makeReadOnlySkillPolicy()` and `makeClassifierGatePolicy(classifier)`.
- [ ] Step 2: Add a smoke test `apps/worker/tests/guardrails/pipeline-order.test.ts` that imports the boot's policy assembly (refactor to a small `buildPolicies()` helper if needed) and asserts the `name` sequence is **exactly** `['always_sensitive', 'always_allowed', 'read_only_skill', 'connector_permission', 'classifier_gate']`. The names must match the `name` constants exported by each policy's source file (verified at `apps/worker/src/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,read-only-skill}.ts`). This catches accidental reordering AND name drift.
- [ ] Step 3: `pnpm --filter @zeno/worker test` green.
- [ ] Step 4: Commit: `feat(worker): wire connector_permission into the guardrails pipeline`.

### Task 4.3: Verify audit log carries new `policyThatGated` values

- [ ] Step 1: In `apps/worker/tests/guardrails/audit.test.ts` (or wherever the audit policy is tested), add a case: a `Decision` with `policyThatGated='connector_allow'` is persisted with that exact string in `approvals_log.policy_that_gated`. Same for `connector_never`.
- [ ] Step 2: `pnpm --filter @zeno/worker test` green.
- [ ] Step 3: Commit: `test(worker): audit log persists connector_* policyThatGated values`.

---

## Phase 5: Invocation logging

### Task 5.1: Capture tool invocations in `ClaudeCodeBackend`

- [ ] Step 1: Identify the SDK event(s) in `ClaudeCodeBackend.query()` where a tool's name + input + result + timing are known. The existing `toolCalls.push({...})` site is the natural extension point.
- [ ] Step 2: Add an optional `onInvocation?: (entry: { connectorSlug: string; toolName: string; durationMs: number; result: 'ok' | 'error'; errorMessage: string | null; threadId: string | null; correlationId: string }) => void` callback in `ClaudeCodeBackendOptions`. Don't overload `onTurnEvent`; this is a separate concern.
- [ ] Step 3: Inside `query()`, after a `tool_result` event, parse the prefixed tool name `mcp__<slug>__<bare>`. If the prefix matches, call `onInvocation` with the parsed slug, bare tool name, duration, result, and ambient correlation/thread ids (from `AsyncLocalStorage` if available — otherwise `null`; the runner-side path may not have a thread).
- [ ] Step 4: Wire in `apps/worker/src/index.ts`: pass `onInvocation: (entry) => { try { /* lookup connector by slug, call recordInvocation, update last_error if error */ } catch (err) { logger.error({ event: 'invocation_record_failed', err: String(err) }) } }` to both backend constructions.
- [ ] Step 5: Tests in `apps/worker/tests/agent/backends/claude-code.test.ts`: a fake SDK iterator emits a tool_use + tool_result; assert `onInvocation` is called once with the right shape; tool names not matching the prefix do not trigger the callback.
- [ ] Step 6: `pnpm --filter @zeno/worker test` green.
- [ ] Step 7: Commit: `feat(worker): record connector tool invocations`.

### Task 5.2: Update `last_error` on transport failures

- [ ] Step 1: In the same `onInvocation` wiring in `index.ts`, when `entry.result === 'error'`: call `connectors.update(c.id, { lastError: entry.errorMessage?.slice(0, 500) ?? 'unknown error', lastErrorAt: new Date().toISOString() })`. When `entry.result === 'ok'`: also bump `lastVerifiedAt` (per plan §Risks/Open Decisions). Do not flip `status`.
- [ ] Step 2: Add an integration test that runs the fixture echo MCP, instructs it to fail one call, and asserts `connectors.lastError` is populated and `status` remains `enabled`.
- [ ] Step 3: `pnpm --filter @zeno/worker test` green.
- [ ] Step 4: Commit: `feat(worker): update connector last_error on tool transport failure`.

---

## Phase 6: Boot integration smoke

### Task 6.1: Build the fixture echo MCP

- [ ] Step 1: Create `apps/worker/tests/fixtures/echo-mcp/server.ts`. Implement a minimal stdio MCP server using the SDK or `@modelcontextprotocol/sdk` (whichever the project already vendors). Tools:
  - `read_echo` (category: read) — returns `{ echo: input }`.
  - `write_echo` (category: write) — returns `{ wrote: input }`.
  - `interactive_echo` (category: interactive) — returns `{ ok: true }`.
- [ ] Step 1.b: Failure-mode env vars (mirror the `remote-mcp` fixture's vocabulary from spec 0033 — both fixtures share the same FAIL taxonomy so e2e scenarios in spec 0035 can swap transports without changing assertion strings):
  - `FAIL=401` → every tool call returns a JSON-RPC error with `code=-32001, message='401 Unauthorized'`. (Stdio MCPs don't have real HTTP status codes; the fixture mimics auth failure with this error shape so the worker's invocation logging captures `error_message` containing `'401 Unauthorized'`.)
  - `FAIL=timeout` → every tool call hangs forever (the worker's per-tool timeout fires).
  - `FAIL=unknown` → every tool call returns a JSON-RPC error with `code=-32603, message='internal error'`.
  - Unset / empty → normal mode.
- [ ] Step 1.c: **Runtime flip support** (used by spec 0035 E1 "auth expires mid-session"). The fixture watches a control file at `<workspace>/echo-mcp-fail.txt` and re-reads its `FAIL=...` value before every tool call. Writing `FAIL=401` to the file flips behavior without restarting the process. Empty file or absent file → fall back to the env var. This same control-file mechanism is mirrored in the `remote-mcp` fixture (spec 0033 task 2.1 step 3) so e2e scenarios use one consistent flip API across transports.
- [ ] Step 2: Document running it: `node tests/fixtures/echo-mcp/server.ts`.
- [ ] Step 3: Sanity test: spawn the fixture from a vitest test, send a `tools/list` request, assert the three tools come back.
- [ ] Step 4: Commit: `test(worker): echo-mcp fixture for connector integration tests`.

### Task 6.2: Boot integration test

- [ ] Step 1: Create `apps/worker/tests/integration/connectors-stdio.test.ts`. Use a temp DB, run migrations, build a `ConnectorRepo`.
- [ ] Step 2: Insert one `echo` connector via `connectorRepo.create({...})` with `command='node', args=['tests/fixtures/echo-mcp/server.ts']`, no secrets, the three tools with categories matching the fixture and permissions: `read_echo='always_allow'`, `write_echo='ask'`, `interactive_echo='never'`.
- [ ] Step 3: Build a worker boot harness (existing pattern from spec 0013's tests if any; otherwise a minimal one): instantiate the chat backend with the new `getMcpServers` factory, `connector_permission` policy, and a stub approver that always returns `allow`. Inject a stub LLM classifier that always returns `not_sensitive`.
- [ ] Step 4: Drive a fake user message that triggers the agent to call `mcp__echo__read_echo`. Assert it allows (policy=`connector_allow`), records an invocation, bumps `lastVerifiedAt`.
- [ ] Step 5: Drive `mcp__echo__interactive_echo`. Assert it denies (policy=`connector_never`), no invocation row.
- [ ] Step 6: Drive `mcp__echo__write_echo`. Assert it falls through (policy returns undefined → classifier → allow because stub), records an invocation.
- [ ] Step 7: Set the connector's secrets to include `FAIL=401`, drive `mcp__echo__read_echo` again. Assert invocation row has `result='error'`, `error_message` contains `'401 Unauthorized'`, `last_error` is populated with the same string, `status` remains `enabled`.
- [ ] Step 8: UPDATE the connector to `status='disabled'`. Drive a new turn — assert `mcp__echo__*` tools are not in the SDK's available set (the agent doesn't see them). Verified by inspecting the `mcpServers` map passed to the SDK.
- [ ] Step 9: `pnpm --filter @zeno/worker test` green.
- [ ] Step 10: Commit: `test(worker): connectors-stdio integration smoke`.

### Task 6.3: Cutover warning integration assertion

- [ ] Step 1: Add a case to the boot integration test (or a new file) that creates a temp `profile/mcp.json` with two server names, boots, and asserts a single `event=mcp_json_ignored` log appears with `servers=['a','b']`.
- [ ] Step 2: Commit: `test(worker): boot emits mcp_json_ignored when profile/mcp.json exists`.

### Task 6.4: Final quality gate

- [ ] Step 1: `pnpm run quality-gate` green at the repo root.
- [ ] Step 2: `pnpm run docker:build` succeeds.
- [ ] Step 3: Manual smoke: `pnpm run docker:up`, tail logs, see `mcp_loaded count=N` (with built-ins only when DB has no connectors). Insert a row into `connectors` via `pnpm run docker:sh && sqlite3 /workspace/zeno.db "INSERT INTO connectors..."`, observe the next agent turn picks it up without restart.
- [ ] Step 4: Update `context/specs/2026-04-26-connectors-backend/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.
- [ ] Step 5: Commit: `chore(spec-0032): mark shipped`.

---

## Verification checklist (against spec § Success Criteria)

- [ ] 1. Migration 5 applies cleanly + idempotent (Phase 1 tests).
- [ ] 2. `ConnectorRepo` unit tests pass (Phase 1 tests).
- [ ] 3. MCP loader matrix (Phase 2 tests).
- [ ] 4. Connector permission policy matrix (Phase 4 tests).
- [ ] 5. `mcp_json_ignored` boot warning (Phase 3 + 6 tests).
- [ ] 6. `getMcpServers` invoked once per `query()` (Phase 2 test).
- [ ] 7. Invocation rows for ok + error (Phase 5 + 6 tests).
- [ ] 8. `last_error` updated on transport failure (Phase 5 + 6 tests).
- [ ] 9. Pipeline order assertion (Phase 4 test).
- [ ] 10. `pnpm run quality-gate` green (Phase 6).
- [ ] 11. `agent/mcp.json` built-ins still load (Phase 2 test on `loadAgentMcpConfig`).
