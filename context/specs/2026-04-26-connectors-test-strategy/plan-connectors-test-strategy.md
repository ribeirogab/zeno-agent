---
feature: connectors-test-strategy
spec: "[[spec-connectors-test-strategy]]"
created: 2026-04-26
---
# Connectors Test Strategy — Plan

**For this spec:** `[[spec-connectors-test-strategy]]`

## Approach

Phase A is built as a single new vitest suite under `apps/worker/tests/connectors-e2e/`, sharing the worker's existing vitest config (no new test runner). The suite consists of three pieces:

1. **Echo fixture MCP** — a tiny `node` server (stdio transport) implementing the MCP protocol with three tools and configurable failure modes. Reused by every scenario.
2. **Test harness helpers** — utilities for booting the fixture as a child, building a `Connector` row in an in-memory DB, and asserting common shapes. No external dependencies beyond what `packages/storage` and `packages/mcp-discover` already pull in.
3. **Scenario files** — 14 vitest tests grouped by concern (P1 catalog/discover, P2 lifecycle, P3 permission policy, P4 invocation logging).

Phase B and C are documented in spec but not built here.

## Architecture

```
apps/worker/tests/connectors-e2e/
├── README.md                          one-paragraph orientation
├── helpers/
│   ├── echo-fixture.ts                spawn/kill helpers for the echo MCP
│   ├── test-db.ts                     thin wrapper over @zeno/storage's in-memory DB
│   └── connector-fixture.ts           build a Connector + secrets row deterministically
├── fixtures/
│   └── echo-mcp/
│       └── server.mjs                 stdio MCP, 3 tools, env-controlled failures (plain JS)
├── __snapshots__/
│   └── catalog-tools.snap             P1.5 reference; per-catalog-entry tool list
├── p1-catalog.test.ts                 P1.1–P1.5
├── p2-lifecycle.test.ts               P2.1–P2.4
├── p3-permission-policy.test.ts       P3.1–P3.4
└── p4-invocation-logging.test.ts      P4.1–P4.3

apps/worker/scripts/
└── regenerate-catalog-tool-snapshots.mjs   plain JS; reads catalog, writes the .snap file
```

## Components

### 1. Echo fixture MCP (`apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`)

Implements the MCP protocol over stdio with `@modelcontextprotocol/sdk/server/index.js`.

**Dependency note:** `@modelcontextprotocol/sdk` is currently only in `packages/mcp-discover/package.json`. Under pnpm's default isolated linker, it is **not** resolvable from `apps/worker/`. **This spec adds `@modelcontextprotocol/sdk` (matching `mcp-discover`'s version) to `apps/worker/package.json` `devDependencies`** so the fixture child process can `import` it normally.

Three tools:

- `read_echo` — returns input back unchanged. Categorized as `read` by `classifyToolCategory`.
- `update_echo` — same. Categorized as `write`.
- `interactive_echo` — same. Falls through to `interactive` because `interactive_` is not in `READ_PREFIXES` or `WRITE_PREFIXES` in `mcp-discover`.

Failure modes via env vars set by the test harness:

- `FIXTURE_FAIL=spawn` — process exits with code 1 on launch.
- `FIXTURE_FAIL=auth` — `tools/list` succeeds (so 0036 Finding #2 reproduces); any `tools/call` returns an error whose message matches `/unauthorized/i`. Used by P1.3 once 0038's `authCheckTool` plumbing exists.
- `FIXTURE_FAIL=mcp_error` — `tools/list` succeeds; any `tools/call` returns a generic, non-auth-shaped MCP error (message: `"fixture: simulated tool error (not auth)"`). Used by P4.3 to exercise the MCP-level error path in `connector_invocations` without overlapping P1.3's auth-check scenario.
- `FIXTURE_FAIL=timeout` — process sleeps 30s before responding to anything; combined with `discoverTools`'s 10s timeout produces a `timeout` errorKind.
- (No env) — happy path.

The fixture file is **plain JavaScript (`.mjs`, ES modules)** — not TypeScript — because the project does not have `tsx` or another TS-on-the-fly runner in any workspace's devDependencies (verified during R1 review). Avoiding TS keeps the fixture self-contained: `node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` is the entire boot command. ~80 lines total, no types needed for this kind of test fixture.

### 2. Helpers

- `bootFixture(failMode?)`: spawns the fixture child process (`node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`), returns `{ command, args, env, stop, dumpOutput }`. Tests clean up via `stop()` in `afterEach` (see Component 3 for the canonical pattern).
- `makeFixtureConnector(opts)`: returns a `Connector` row pointing at the fixture command (canonical path above) with the optional fail-mode env passed through. Uses `packages/storage`'s in-memory DB.
- `expectInvocation(db, predicate)`: SQL helper for P4 assertions.

### 3. Scenario files

Each `*.test.ts` is a normal vitest file. Cleanup uses `afterEach` (always fires, even on test failure) to avoid leaked child processes:

```typescript
describe('P1 — catalog + discoverTools', () => {
  let fixture: Fixture | null = null;

  afterEach(() => {
    fixture?.stop();
    fixture = null;
  });

  it('P1.1: returns 3 tools with correct categories', async () => {
    fixture = bootFixture();
    const connector = makeFixtureConnector(db, fixture);
    const result = await discoverTools(connector, []);
    expect(result).toMatchObject({
      tools: expect.arrayContaining([
        { name: 'read_echo', category: 'read', description: expect.any(String) },
        { name: 'write_echo', category: 'write', description: expect.any(String) },
        { name: 'interactive_echo', category: 'interactive', description: expect.any(String) },
      ]),
    });
  });
  // ...
});
```

**Cleanup contract**: every scenario assigns its fixture to a describe-scoped variable and the `afterEach` calls `stop()`. No inline cleanup at the end of test bodies — that pattern is fragile under failure.

### 4. Snapshot reference (P1.5)

`__snapshots__/catalog-tools.snap` is generated by a small script (`apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`) that:

1. Reads `agent/connectors-catalog.json`.
2. For each entry, extracts `(name, category, defaultPermission)` for every tool.
3. Sorts deterministically by category then name.
4. Emits to the snapshot file as plain JSON (not vitest's `.snap` format — easier to review in PRs).

The test (P1.5) reads `agent/connectors-catalog.json` at runtime, projects via the same logic, and asserts equality against the committed snapshot using `expect(...).toEqual(...)`.

**Honest framing of what this catches**: P1.5 is a **self-consistency** check. It enforces that catalog edits and the snapshot stay in lockstep. It does NOT validate the catalog against a real MCP — that would require external network in CI. So:

- ✅ Catches: someone hand-edits `agent/connectors-catalog.json` and forgets to re-run the regenerator. The committed snapshot diverges from the projected catalog → P1.5 fails on next CI run.
- ❌ Does NOT catch: the catalog drifts from the **real** MCP (e.g., `@sentry/mcp-server` releases new tools). Detection of that drift is the responsibility of the manual smoke (spec 0036) plus the regenerator script being part of the connector-add / connector-upgrade dev workflow.

**Sequencing with spec 0038** (the catalog-regeneration spec):

The script lives in this spec (0037) because it's test infrastructure. Spec 0038 *uses* the script to perform the catalog regeneration as part of its Finding #1 fix. The contract is:

- This spec (0037) ships first. The committed snapshot reflects the **catalog state at the time of this spec's commit** — which is the current 8-tool Sentry catalog (the stale one). P1.5 passes because catalog and snapshot are in sync, even though both are stale.
- Spec 0038 then runs the regenerator (this spec's script) with a real Sentry token, which updates **both** `agent/connectors-catalog.json` (now 22 tools) **and** the snapshot file (now 22 entries) atomically. P1.5 still passes because they're regenerated together.
- After spec 0038 ships, the snapshot reflects the live 22-tool reality, and any future hand-edit of the catalog without re-running the script → P1.5 fails.

This sequencing is documented at the top of the script header and in the §Phase ordering of this spec (Phase 7 explicitly says "commit the snapshot of the current catalog — the catalog regeneration itself is spec 0038's responsibility").

## File Structure

Files **created**:

- `apps/worker/tests/connectors-e2e/README.md`
- `apps/worker/tests/connectors-e2e/helpers/echo-fixture.ts`
- `apps/worker/tests/connectors-e2e/helpers/test-db.ts`
- `apps/worker/tests/connectors-e2e/helpers/connector-fixture.ts`
- `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (committed)
- `apps/worker/tests/connectors-e2e/p1-catalog.test.ts`
- `apps/worker/tests/connectors-e2e/p2-lifecycle.test.ts`
- `apps/worker/tests/connectors-e2e/p3-permission-policy.test.ts`
- `apps/worker/tests/connectors-e2e/p4-invocation-logging.test.ts`
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`

Files **modified**:

- `apps/worker/package.json` — add `@modelcontextprotocol/sdk` to `devDependencies` (matching `packages/mcp-discover`'s version) so the fixture child can resolve the SDK. **No new npm scripts** — the worker's existing `test` script auto-discovers the new directory via the existing `include: ['tests/**/*.test.ts']` pattern.
- `apps/worker/vitest.config.ts` — pin `testTimeout: 5000` (currently relies on the implicit default; pinning makes the per-scenario budget explicit and visible). Auto-discovery itself is unchanged.
- `context/specs/2026-04-26-connectors-e2e/spec.md` — add header note pointing to spec 0037 as superseder.

Files **NOT** modified:

- `apps/api/tests/routes/connectors.test.ts` — untouched; complements Phase A (different scope, mocked deps).
- `package.json` (root) — no new top-level scripts.

## Phase ordering

### Phase 0 — Spec finalization (3-review loop)

Same as spec 0036. Three reviews of `spec.md` + `plan.md` + `tasks.md`; restart on findings.

### Phase 1 — Echo fixture MCP

Build `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`. Smoke it manually with `node` + the MCP SDK client. Confirm the three tools list correctly and the failure modes work.

### Phase 2 — Helpers

Build `helpers/{echo-fixture,test-db,connector-fixture}.ts`. Add unit tests for the helpers themselves (overhead is acceptable; saves debugging later).

### Phase 3 — P1 scenarios (5 tests)

Author and stabilize. Run 10× to confirm zero flake before moving on.

### Phase 4 — P2 scenarios (4 tests)

Same drill.

### Phase 5 — P3 scenarios (4 tests)

Same drill.

### Phase 6 — P4 scenarios (3 tests)

Same drill. **Transitional contract for P4.2:** committed in 0037 as `it.skip(...)` with a comment pointing at spec 0038 (mirroring P1.3). Spec 0038's Finding #3 fix unskips it and asserts `error_message LIKE 'policy_denied:%'` in the same commit. This avoids landing a knowingly-failing test in CI on the 0037 PR.

### Phase 7 — Snapshot regenerator script

Build `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`. Run it; commit the initial snapshot reflecting the current (pre-0038) catalog.

### Phase 8 — Quality gate integration

**No new npm script.** Confirm the existing `pnpm --filter @zeno/worker test` (auto-discovers `tests/**/*.test.ts` per the existing `vitest.config.ts`) picks up the new `tests/connectors-e2e/*.test.ts` files. Verify `pnpm run quality-gate` runs the new tests and total time stays under target.

### Phase 9 — Documentation update

Update `2026-04-26-connectors-e2e/spec.md` header. Add a learning note if anything non-obvious surfaced during Phase 1-7.

### Phase 10 — Smoke (manual, fast)

Run `bash tmp/0036-validation/reset.sh` followed by a quick `pnpm --filter @zeno/worker test connectors-e2e` round to verify the suite passes against a clean DB.

## Risks / Open Decisions

- **Decision: vitest pattern vs separate suite directory.** Going with a sub-directory under the worker's existing `tests/` tree, **no separate npm script**. The worker's `vitest.config.ts` `include: ['tests/**/*.test.ts']` already auto-discovers the new directory. Both `pnpm --filter @zeno/worker test` (full suite) and `pnpm --filter @zeno/worker test connectors-e2e` (fast inner loop) work; `pnpm run quality-gate` runs everything via turbo.
- **Decision: plain `.mjs` (no TypeScript) for fixture and regenerator script.** Verified during R1 that no workspace has `tsx`, `ts-node`, or another TS-on-the-fly runner. Adding one is unnecessary scope. The fixture and the script are both small (~80 lines and ~50 lines), don't share code with the worker source, and don't benefit from types in their own right. Boot via `node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` and `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`.
- **Decision: snapshot format for P1.5.** Plain JSON in the `__snapshots__` directory — not vitest's `.snap` files (which are quoted JS, harder to read in PRs). The test loads the JSON and compares with `expect(...).toEqual(...)`. Snapshot updates require running the regenerator script (deliberate friction so catalog-vs-snapshot drift is caught at code review).
- **Decision: in-memory DB vs file DB for tests.** In-memory (`:memory:` SQLite) — fast, isolated, no cleanup. Spec 0036 used file DB because it ran against the live system; this suite is pure unit/integration so memory is correct.
- **Risk: vitest default parallelism + child process resource usage.** 14 tests, each with one short-lived `node` child. **Cleanup is uniformly per-test via `afterEach`** (no `beforeAll`/`afterAll` reuse) — the cost of an extra spawn (~50ms) is far less than the debugging cost of a leaked child after a test failure. Earlier drafts considered fixture reuse within a describe block; rejected after R3 review for consistency.
- **Risk: stdio fixture chatter on test-runner stdout.** Wrap the child stdio in a buffer so its noise doesn't pollute vitest output unless the test fails (then dump). Existing helper pattern in `apps/worker/tests/agent/...` already handles this.
- **Open: how to integrate with future Phase B (mock LLM driving)?** Out of scope for this spec, but the helpers are designed to be reusable: `bootFixture` and `makeFixtureConnector` are both deliberately decoupled from any "agent loop" assumption. Phase B can layer on top.
