---
feature: connectors-test-strategy
plan: "[[plan-connectors-test-strategy]]"
spec: "[[spec-connectors-test-strategy]]"
created: 2026-04-26
---
# Connectors Test Strategy — Tasks

**For this plan:** `[[plan-connectors-test-strategy]]`

> Phase A only. Phase B and Phase C remain deferred and tracked in `2026-04-26-connectors-e2e/spec.md` (header pointer added in Phase 9).

## Phase 0 — Spec finalization (3-review loop)

### Task 0.1: Author docs

- [x] Step 1: Write `spec.md`.
- [x] Step 2: Write `plan.md`.
- [x] Step 3: Write `tasks.md` (this file).

### Task 0.2: Review round R1

- [ ] Step 1: Spawn `spec-document-reviewer` agent against the docs cold.
- [ ] Step 2: If findings ≠ 0 → fix → restart.
- [ ] Step 3: Mark R1 clean.

### Task 0.3: Review round R2 (cross-check)

- [ ] Step 1: Re-read `packages/mcp-discover/src/discover.ts`, `apps/worker/src/guardrails/policies/connector-permission.ts`, `apps/worker/src/agent/backends/claude-code.ts`, `apps/worker/src/commands/handlers/connector-*.ts`, `packages/storage/src/repos/connectors.ts`.
- [ ] Step 2: Verify every code path and shape mentioned in spec/plan matches reality.
- [ ] Step 3: If findings → reset to R1.

### Task 0.4: Review round R3

- [ ] Step 1: Fresh independent reviewer.
- [ ] Step 2: If findings → reset to R1.

### Task 0.5: Approve

- [ ] Step 1: Front-matter `status: approved`.

## Phase 1 — Echo fixture MCP

### Task 1.0: Add SDK dep

- [ ] Step 1: Add `"@modelcontextprotocol/sdk": "^1.29.0"` (or whatever version `packages/mcp-discover/package.json` declares) to `apps/worker/package.json` `devDependencies`. Reason: under pnpm's default isolated linker, the SDK is not transitively reachable from `apps/worker/` even though `mcp-discover` depends on it.
- [ ] Step 2: `pnpm install` at repo root. Verify `node -e "console.log(require.resolve('@modelcontextprotocol/sdk/server/index.js'))"` from inside `apps/worker/` resolves successfully.

### Task 1.1: Build the fixture

- [ ] Step 1: Create `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` (plain JS — `tsx` is not available in any workspace) using `@modelcontextprotocol/sdk`'s server stdio transport.
- [ ] Step 2: Implement three tools: `read_echo`, `update_echo`, `interactive_echo`. Each accepts `{ message: string }` and returns the echoed message. Names chosen to land in `read`/`write`/`interactive` categories per `mcp-discover/classifyToolCategory`'s `READ_PREFIXES` / `WRITE_PREFIXES` (note: `write_` is NOT a prefix; `update_` is).
- [ ] Step 3: Implement `FIXTURE_FAIL` env handling — four modes: `spawn` (exit 1 immediately), `auth` (tools/list ok, but `tools/call` returns `Unauthorized` errors — used by P1.3 auth-check tests), `mcp_error` (tools/list ok, but `tools/call` returns a non-auth `"fixture: simulated tool error (not auth)"` error — used by P4.3), `timeout` (sleep 30s before any response).
- [ ] Step 4: Smoke manually with `node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` + the SDK client; confirm tools/list returns 3 tools.
- [ ] Step 5: Commit.

## Phase 2 — Helpers

### Task 2.1: `helpers/echo-fixture.ts`

- [ ] Step 1: Export `bootFixture(opts?: { failMode?: string }): Fixture` where `Fixture = { command: string; args: string[]; env: Record<string,string>; stop: () => void; dumpOutput: () => string }`.
- [ ] Step 2: Use `node` to spawn `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` (no transpiler needed).
- [ ] Step 3: Capture child stdio in a buffer; expose `dumpOutput()` for debugging.
- [ ] Step 4: All test files using the helper assign the result to a describe-scoped `let fixture: Fixture | null = null` and clean up via `afterEach(() => { fixture?.stop(); fixture = null; })`. Document this contract in the helper's JSDoc.

### Task 2.2: `helpers/test-db.ts`

- [ ] Step 1: Wrap `packages/storage`'s in-memory DB factory.
- [ ] Step 2: Export `makeTestDb(): { db, repos: { connectorRepo, ... }, close: () => void }`.

### Task 2.3: `helpers/connector-fixture.ts`

- [ ] Step 1: `makeFixtureConnector(db, fixture, overrides?): Connector` — inserts a connector row pointing at the fixture command.
- [ ] Step 2: Sensible defaults (slug='echo', status='enabled', no secrets).

### Task 2.4: Helper smoke test

- [ ] Step 1: Add a one-off `helpers.smoke.test.ts` that boots fixture, makes connector, calls `discoverTools` once. Confirms wiring works.
- [ ] Step 2: Commit.

## Phase 3 — P1 scenarios (catalog + discoverTools)

### Task 3.1: P1.1–P1.4

- [ ] P1.1: 3 tools categorized correctly.
- [ ] P1.2: `FIXTURE_FAIL=spawn` → `errorKind: 'spawn'`.
- [ ] P1.3: `FIXTURE_FAIL=auth`. **At 0037 ship time:** the third arg `{ authCheckTool }` doesn't exist on `discoverTools` yet (added by 0038). Test is committed as `it.skip` with a comment: `// unskipped + flipped to 'auth' assertion in spec 0038 Finding #2 commit`. Spec 0038 imports `discoverTools` with the new options arg and unskips. This avoids type errors on the 0037 PR and a knowingly-failing test in CI.
- [ ] P1.4: `FIXTURE_FAIL=timeout` → `errorKind: 'timeout'`.

### Task 3.2: P1.5 catalog snapshot test

- [ ] Step 1: Add `expect(toolsFromCatalog).toEqual(snapshot)` against `__snapshots__/catalog-tools.snap`.
- [ ] Step 2: Snapshot regenerator script runs first to produce the file.

### Task 3.3: 10× determinism check

- [ ] Step 1: `for i in 1..10; do pnpm --filter @zeno/worker test connectors-e2e/p1; done`.
- [ ] Step 2: All green; commit.

## Phase 4 — P2 scenarios (lifecycle)

### Task 4.1: P2.1 connector_create

- [ ] Step 1: Use `makeFixtureConnector` to mint a payload.
- [ ] Step 2: Call the worker's connector-create handler factory: `const handler = buildConnectorCreateHandler(connectorRepo); const result = await handler(stubCommand)`. The factory returns a `Handler = (cmd: Command) => Promise<HandlerResult>`. The test constructs a stub `Command` with required fields (`id`, `type: 'connector_create'`, `payload: JSON.stringify(...)`, `status`, `createdAt`, etc. — see `apps/worker/src/commands/dispatcher.ts` for the type).
- [ ] Step 3: Assert connector row + secrets + tools rows in DB via the in-memory db helpers.

### Task 4.2: P2.2 connector_update

- [ ] Step 1: Create connector, capture `last4`.
- [ ] Step 2: Call `connector-update.ts` with new secret value.
- [ ] Step 3: Assert `last4` differs from baseline; `lastVerifiedAt` populated; `lastError` null.

### Task 4.3: P2.3 connector_refresh_tools

- [ ] Step 1: Mutate a tool's permission to `never`.
- [ ] Step 2: Call `connector-refresh-tools.ts`.
- [ ] Step 3: Assert permission reset to category default; tool count matches fixture (3).

### Task 4.4: P2.4 connector_uninstall (cascade)

- [ ] Step 1: Create connector + populate invocation row via direct repo call.
- [ ] Step 2: Call `connector-uninstall.ts`.
- [ ] Step 3: Assert connector + secrets + tools + invocations all 0 rows.

### Task 4.5: 10× determinism check

- [ ] Same drill.

## Phase 5 — P3 scenarios (permission policy)

### Task 5.1: P3.1–P3.4

The policy `check()` returns `{ allow: boolean, reason: string, policyThatGated: string } | undefined`. Assertions:

- [ ] P3.1: tool with permission `always_allow` → `{ allow: true, policyThatGated: 'connector_allow' }`.
- [ ] P3.2: tool with permission `never` → `{ allow: false, policyThatGated: 'connector_never' }`.
- [ ] P3.3: tool with permission `ask` → `undefined` (policy falls through to next).
- [ ] P3.4: tool name not in DB → `undefined` (built-in MCPs ride this slot).

### Task 5.2: 10× determinism check

## Phase 6 — P4 scenarios (invocation logging)

### Task 6.1: P4.1 success path

- [ ] Trigger a successful tool call simulation; assert `connector_invocations` row with `result='ok'`, `error_message=null`.

### Task 6.2: P4.2 deny path (Finding #3 regression)

- [ ] Step 1: Set tool permission to `never`.
- [ ] Step 2: Trigger a call that the policy denies.
- [ ] Step 3: Assert `connector_invocations` row exists AND `error_message LIKE 'policy_denied:%'`. (Spec 0038 §F3 fixed the shape: insert with prefix; do not skip insert.)
- [ ] Step 4: **Transitional contract** — at 0037 ship time, before 0038 lands, the actual behavior is "row exists with `error_message=null`". The test is committed in 0037 in a SKIPPED state (`it.skip`) with a comment pointing at 0038. Spec 0038 unskips and adopts the assertion as part of the Finding #3 fix commit. This avoids landing a knowingly-failing test.

### Task 6.3: P4.3 MCP-error path

- [ ] Step 1: Boot fixture with `FIXTURE_FAIL=mcp_error` (the dedicated non-auth MCP-error mode introduced in Task 1.1 Step 3).
- [ ] Step 2: Trigger a tool call through the `claude-code` backend's onInvocation path.
- [ ] Step 3: Assert `connector_invocations` row with `result='error'`, `error_message` containing `"simulated tool error (not auth)"`, and `error_message` does NOT start with `policy_denied:` (distinguishes from the F#3 deny path).

### Task 6.4: 10× determinism check

## Phase 7 — Snapshot regenerator script

### Task 7.1: `scripts/regenerate-catalog-tool-snapshots.mjs`

- [ ] Step 1: Read `agent/connectors-catalog.json`.
- [ ] Step 2: Project each entry's `tools[]` into `{ name, category, defaultPermission }` sorted by category then name.
- [ ] Step 3: Write to `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (JSON, 2-space indent, trailing newline).
- [ ] Step 4: Header comment in the script explains: "Run via `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`. This script ONLY mirrors the current catalog into the snapshot — it does NOT pull from any live MCP. Spec 0038 owns the catalog→live-MCP regeneration; this snapshot just keeps the test in sync with the catalog."

### Task 7.2: Initial snapshot

- [ ] Step 1: Run `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` against the **current** catalog (the 8-tool stale Sentry entry, pre-0038).
- [ ] Step 2: Commit the snapshot. P1.5 will pass because catalog and snapshot match (both stale by the same amount). Spec 0038's regenerator will update both atomically when its catalog regeneration runs.

## Phase 8 — Quality gate integration

### Task 8.1: Confirm auto-discovery + pin testTimeout

- [ ] Step 1: Confirm `apps/worker/vitest.config.ts` `include: ['tests/**/*.test.ts']` already covers the new `tests/connectors-e2e/*.test.ts` files (verified at R1 review time).
- [ ] Step 2: Add `testTimeout: 5000` to the worker `vitest.config.ts` (currently absent; relying on the 5000ms default). Pinning makes the per-scenario budget explicit and visible to anyone who edits the config later.
- [ ] Step 3: NO new script in `package.json`. Running the existing `pnpm --filter @zeno/worker test` runs everything; `quality-gate` runs everything.
- [ ] Step 4: Run `pnpm run quality-gate` and confirm: green; total time ≤ baseline + 90s.
- [ ] Step 5: Document in `apps/worker/README.md` (see Task 8.2): "fast inner loop: `pnpm --filter @zeno/worker test connectors-e2e`".

### Task 8.2: Update `apps/worker/README.md` (or create one)

- [ ] Step 1: One paragraph: "Phase A regression suite at `tests/connectors-e2e/`; reuses fixture echo MCP at `tests/connectors-e2e/fixtures/echo-mcp/server.mjs`. Run via `pnpm --filter @zeno/worker test connectors-e2e` (fast inner loop) or as part of `pnpm run quality-gate` (full)."

## Phase 9 — Documentation update

### Task 9.1: Mark 0035 superseded

- [ ] Step 1: Edit `context/specs/2026-04-26-connectors-e2e/spec.md` — add a header note: `**Superseded by [[../2026-04-26-connectors-test-strategy/spec]]** for the test-infrastructure question. Phases B and C of this spec are extracted on demand.`.
- [ ] Step 2: Update front-matter status to `superseded`.

### Task 9.2: Spec status flips

- [ ] Step 1: This spec front-matter `status: shipped` once Phase 8 lands.

## Phase 10 — Smoke (manual, fast)

### Task 10.1: Run quality-gate end-to-end

- [ ] Step 1: `pnpm run quality-gate` — green.
- [ ] Step 2: Capture timing in PR description / commit message.

### Task 10.2: Spot-check via existing `tmp/0036-validation/` runbook

- [ ] Step 1: `bash tmp/0036-validation/reset.sh 4` (or any new run number).
- [ ] Step 2: Run a couple of cherry-picked scenarios from the runbook (e.g., G3.6 + G8.2) to confirm live system still works.
- [ ] Step 3: No new findings; commit.

## Definition of Done

- [ ] Phase 0: 3 consecutive clean reviews → spec status `approved`.
- [ ] Phases 1–8: code committed, suite runs in <90s, all tests pass 10× deterministically.
- [ ] Phase 9: 0035 marked superseded; 0037 marked shipped.
- [ ] Phase 10: live system smoke green.
