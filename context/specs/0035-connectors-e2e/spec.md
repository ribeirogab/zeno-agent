---
status: draft
feature: connectors-e2e
created: 2026-04-26
shipped: null
---
# Connectors End-to-End Validation + Testing — Spec

**Status:** Draft
**Scope:** A dedicated test plan that validates the full Connectors feature (specs 0029 + 0032 + 0033 + 0034) end-to-end through real integrations — real DB, real worker, real API, real dashboard, real MCP processes (stdio fixture + remote HTTP fixture). Defines the scenario matrix, the harness, the **4× consecutive clean run** acceptance rule, and the operating procedure when a run fails.

## Context

The Connectors feature spans three implementation specs:
- **0032** — DB + stdio loader + per-tool permissions + cutover.
- **0033** — Remote (HTTP/SSE) transport.
- **0034** — Catalog + API + dashboard frontend port + four worker command handlers.

Each spec has its own unit and integration tests. They are necessary but not sufficient. The user-visible product is the composition: a person at `/connectors` clicks a button → API enqueues a command → worker spawns an MCP → SDK calls a tool → guardrails decide → invocation row → activity feed updates. There are at least three process boundaries and a UI in that loop, and bugs at the seams have historically been the ones that ship. Spec 0013's `commands` pattern works mostly because it has been exercised end-to-end manually; this spec formalizes that exercise for the larger Connectors surface.

The user explicitly requested this spec because the feature has many cross-cutting scenarios and warrants its own validation pass before shipping. The **4× consecutive clean rule** is the acceptance bar: each run executes the full scenario matrix; one failure triggers a fix + a counter reset.

## Problem Statement

Without dedicated end-to-end coverage:

1. Race conditions between the API write, the worker tick, and the dashboard refetch surface late (in production smoke or, worse, in the operator's daily use).
2. Per-spec unit tests miss interactions: e.g., the catalog install modal collects a Bearer token, the worker handler interprets it, the SDK passes it to a remote MCP, the MCP authenticates — every step right in isolation, but a single off-by-one bug across the chain (`Authorization: Bearer  Bearer xxx` because of double prepending) is not visible until you exercise the full path.
3. Visual regressions in the dashboard against the validated `apps/design` baseline are not caught by jsdom render tests (they verify shape, not pixels).
4. Failure modes (auth error mid-session, timeout on test, refresh wiping overrides) need explicit coverage to confirm the spec's contract holds — those are the moments the operator notices.

This spec answers: what scenarios must we run, in what environment, with what assertions, until what bar is met.

## Non-Goals

1. **Performance benchmarking.** Latency targets are not part of acceptance. The 1.5s post-mutation refetch from spec 0013 is observed but not strictly enforced.
2. **Load testing.** Single-user; no concurrency simulation.
3. **Security audit.** No fuzzing, no auth bypass attempts. The basics (rate limit on reveal, audit log lines) are asserted as part of normal flow.
4. **Cross-browser matrix.** Chromium-only. The dashboard targets the operator's browser; that is enough.
5. **Mobile / responsive testing.** Desktop 1440×900 per spec 0008.
6. **Visual regression diffing.** Manual comparison against `apps/design` is sufficient. No screenshot-pixel-diff infra.
7. **Replacing per-spec unit/integration tests.** This spec layers on top; it does not subsume.
8. **Static analysis or lint enforcement.** `pnpm run quality-gate` already covers that.
9. **Tests against real third-party hosted MCPs** (Linear, Notion). The matrix uses local fixtures only — reproducible, no rate-limit / token concerns. A separate manual smoke against a real hosted MCP runs once per release as a non-blocking sanity check.
10. **Infrastructure or deployment testing.** Docker compose comes up; that is the bar.

## Constraints

- **All tests run against real processes.** Worker boots in its real Node process. API boots in its real Node process. They share a SQLite DB on a tmpfs volume. The dashboard runs as the production-built static SPA served by the API. MCP servers are real Node processes (the stdio echo fixture from spec 0032; the HTTP fixture from spec 0033). **No process-level mocks.** Within the worker, the LLM classifier is stubbed (deterministic) and the LLM agent is mocked to return a scripted sequence of tool calls; this is the only mock allowed. Rationale: testing the LLM is not the goal; testing the wiring around it is.
- **The harness uses Playwright** for the dashboard side (browser interactions, network capture, assertions on the rendered DOM) and **vitest with `--mode=integration`** for direct API hits where a browser is not needed. The harness is wired to a single `pnpm run test:e2e` command at the repo root.
- **Each scenario gets a fresh DB and a fresh workspace.** A migration-applied empty SQLite is created per scenario via a setup hook in a freshly-allocated `WORKSPACE_DIR` tmp directory. The teardown hook deletes the tmp dir entirely. This guarantees per-scenario isolation for the DB **and** for any auxiliary files in the workspace — including the fixture control files (`<workspace>/echo-mcp-fail.txt`, `<workspace>/remote-mcp-fail.txt`) used by E1/E3 to flip fixture failure modes mid-scenario. No scenario inherits files from another. No ordering dependency between scenarios.
- **Each scenario asserts at the boundaries:** DB state (after the operation), API response (status code + body shape), worker log output (specific events present), dashboard DOM (the right sections / pills / counters render).
- **The 4× consecutive clean rule.** A run is "clean" when every scenario passes with zero failures, zero retries, zero flakes. The runner runs the full matrix back-to-back four times. If run N fails (any scenario), the operator (or implementer) fixes the bug, then re-runs from scratch — the counter resets to zero. Acceptance: 4 consecutive clean runs. After that, the feature is "validated" and the spec moves to `shipped`. The runner emits a summary table per run with pass/fail per scenario, and a top-level `RUN n/4` line.
- **No flake tolerance.** A flaky test (passes on retry) counts as a failure. The fix is to make the test deterministic — either by tightening the assertion (fewer race-prone reads) or by adding explicit waits (e.g., wait for the `command_processed` log line before reading the DB). Retries-as-a-feature are banned; retries-as-a-debug-tool during fixing are fine.
- **All scenarios are codified, not narrated.** Every scenario is an automated test file. No "manual smoke" inside the matrix. The release-time manual smoke against a real hosted MCP is a separate, optional pass listed at the end of this spec.
- **Test artifacts live under `tests/e2e/` at the repo root.** Not in any `apps/` workspace — the suite spans all of them.
- **Docker-only is NOT a constraint here.** The e2e suite is allowed to boot the worker and API as Node processes directly (faster than docker:build). A docker-mode is offered for the final release-time run but is not part of the 4× rule.
- **Test data uses fixtures.** No live external systems. The stdio echo MCP and the HTTP echo MCP from specs 0032 + 0033 are reused. They expose three tools each (`read_echo`, `write_echo`, `interactive_echo`) and support failure modes via env vars.
- **Run duration.** Target: each pass of the matrix completes in ≤ 10 minutes on the developer machine. 4 passes = ≤ 40 min wall clock. If a scenario routinely exceeds 1 minute, consider whether the wait can be replaced with a deterministic event hook.
- **Output is structured.** The runner emits a `tests/e2e/results/run-<n>.json` per run summarizing pass/fail per scenario, plus an aggregate `runs.json` showing the consecutive-clean counter. Easy for the implementer to grep when debugging.

## Design

### Test harness

Three layers:

1. **Fixture orchestration.** `tests/e2e/fixtures/` houses startable fixtures:
   - `boot-zeno.ts` — starts a worker process + API process against a temp DB and a temp `${workspace}` dir. Returns `{ apiUrl, workerLog, db, stop }`. The boot mocks the LLM by injecting a `ZENO_BACKEND=mock` env var that swaps in a deterministic backend with scripted turn outputs (extending `apps/worker/src/agent/backends/mock.ts`).
   - `start-stdio-mcp.ts` — spawns `apps/worker/tests/fixtures/echo-mcp/server.ts` as a child process. Returns the command + args to embed in a connector row.
   - `start-remote-mcp.ts` — spawns `apps/worker/tests/fixtures/remote-mcp/server.ts` on an ephemeral port. Returns `{ url, close }`.
   - `seed-connector.ts` — INSERT helpers for a fresh DB.
   - `play.ts` — Playwright page builder with cookie auth pre-set so the test starts already logged in.

2. **Scenario files.** `tests/e2e/scenarios/<NN>-<slug>.test.ts`. Each is a vitest test in `--mode=integration` that:
   - Uses the harness to bring up the system.
   - Performs operations (HTTP calls or Playwright clicks).
   - Asserts at boundaries.
   - Tears down.
   Numbered for ordering only — they are independent.

3. **Runner.** `pnpm run test:e2e` invokes vitest in a special config (`tests/e2e/vitest.config.ts`) that disables parallelism (process-level state would collide), sets a longer timeout (60s per test), and writes the structured JSON output. After all scenarios finish, the runner appends to `tests/e2e/results/runs.json` and prints `RUN n/4 — clean ✓` or `RUN n/4 — failed ✗` with a per-scenario summary. A wrapper `pnpm run test:e2e:4x` invokes `test:e2e` four times in a loop, stops on first failure, and reports the consecutive-clean count.

### Mock backend extension for scripted turns

The existing `MockBackend` (`apps/worker/src/agent/backends/mock.ts`) takes fixtures and replays them. Extend its API so a test can register a turn-by-turn script:

```typescript
export class MockBackend implements AgentBackend {
  readonly name = 'mock';
  // existing
  loadFixtures(...): void;
  // new
  scriptTurn(prompt: string, response: { toolCalls?: Array<{ name: string; input: Record<string, unknown> }>; finalText: string }): void;
}
```

A scenario then does `mockBackend.scriptTurn('list my issues', { toolCalls: [{ name: 'mcp__linear__list_issues', input: { team: 'eng' } }], finalText: '5 issues found' })` before invoking a "Slack message" against the worker.

The "Slack message" path is exercised via a thin wrapper in the harness that bypasses the Slack adapter: directly calls `core.bind(stubChannel)`'s message handler with a synthetic message payload. The stub channel records what would be replied and what reactions would be set, so the scenario can assert "the agent replied with X" without speaking real Slack.

### Scenario matrix

Each scenario covers exactly one user-facing behavior. The list:

#### Group A — Catalog flow (4 scenarios)

> **Fixture rule:** the catalog entries in `agent/connectors-catalog.json` declare a `transport` per entry (per spec 0029 §Initial catalog and spec 0034). Linear is `transport='remote'`. To exercise the catalog install flow against a controllable fixture, the harness overrides the catalog file with a test catalog that points each entry's URL at the corresponding fixture: remote-transport entries → `start-remote-mcp.ts` URL; stdio-transport entries → `start-stdio-mcp.ts` command/args. Each Group A scenario states which fixture(s) it starts and confirms the chosen catalog entry's transport matches.
>
> For Group A scenarios below, "Linear catalog entry" means the test-catalog Linear entry pointing at the **remote HTTP fixture** (`tests/fixtures/remote-mcp/server.ts`). The stdio echo fixture is used in Group B (custom stdio) and Group C/D where transport isn't catalog-driven.

- **A1**: Operator opens `/connectors`, sees the empty state + catalog. Clicks Linear (entry: `transport='remote'`, URL=remote-fixture URL). Modal opens with the `__MCP_AUTHORIZATION__` field. Pastes a token. Test → ✓ (the remote HTTP fixture answers `tools/list` with 3 entries). Add → modal closes, list refetches, Linear appears as `enabled`.
- **A2**: Same as A1 but the remote fixture is started in `FAIL=401` mode. Test → ✗ with `errorKind='auth'`. Result strip shows the hint. Add stays disabled. Restart the fixture in normal mode (or flip its env via the fixture's runtime control), retry Test → ✓, Add succeeds.
- **A3**: Linear (remote) is already installed; the catalog card renders as "installed" and is non-actionable. Add Custom button still works.
- **A4**: Catalog file is malformed (test fixture overrides `agent/connectors-catalog.json` with garbage). API returns 500. Dashboard renders an error banner on the catalog area; Installed list still loads.

#### Group B — Custom flow (3 scenarios)

- **B1** stdio: Add custom (local) modal. Name "echo", Command "node", Args ["./tests/fixtures/echo-mcp/server.ts"], no secrets. Test → ✓ + 3 tools detected with right categories. Add → connector lands as `enabled`.
- **B2** remote: Add custom (remote) modal. Name "fn-scrum", URL = remote fixture URL, Authorization = "Bearer test". Test → ✓ + 3 tools. Add → enabled.
- **B3** save without test: Add custom (remote) without running Test. Add allowed. Connector lands as `pending`. The detail page shows the empty Activity + the "no tools yet" tool permissions. Run Test → tools discovered, status flips to `enabled`.

#### Group C — Lifecycle (5 scenarios)

- **C1** Toggle off, then on: Linear toggle flips → DB state, sidebar count, tool not callable by agent next turn, then re-enabled, callable again.
- **C2** Edit credentials: change the token via the inline edit affordance. Save fires `connector_update`. Worker test runs internally; `last_verified_at` bumps; tool calls succeed.
- **C3** Refresh tools: the connector's tool list is replaced; per-tool overrides reset. Modal copy must equal `This will reset tool permissions to defaults.`.
- **C4** Uninstall: connector + secrets + tools + invocations rows all gone (cascade). List doesn't show it.
- **C5** Tool permission edit: change `create_issue` from `ask` to `always_allow` via the per-tool segmented control (optimistic UI). DB row updated. Next turn that calls `mcp__linear__create_issue` allows without classifier or approver.

#### Group D — Runtime guardrails parity (3 scenarios)

- **D1** Always-allow: a tool with permission `always_allow` is called. Pipeline returns `connector_allow`. Audit log row written. No classifier hit.
- **D2** Never: a tool with permission `never` is called. Pipeline returns `connector_never`. Audit log row written. The agent's reply contains "ação negada" per the GuardedBackend convention.
- **D3** Ask falls through to classifier: a tool with permission `ask` is called. The (stubbed) classifier returns "sensitive". The (stubbed) approver auto-approves. Tool runs. Audit log shows `classifier` then approval.

#### Group E — Error states (3 scenarios)

- **E1** Auth expires mid-session: a successful call followed by a 401 (fixture switches mode mid-test). Invocation row recorded with `result='error'`. Connector `last_error` populated. Status NOT flipped.
- **E2** Network down: connector's URL points to nothing. Tool call fails with `errorKind='network'`. Same DB consequences as E1. Dashboard surfaces the with-error visual state.
- **E3** Test connection fails: in the detail page, click Test. Result strip shows the error. Connector row updated.

#### Group F — Cutover + Multi-profile (2 scenarios)

- **F1** Cutover: the harness boots with a `profile/mcp.json` non-empty file. The boot log contains exactly one `event=mcp_json_ignored` line listing the server names. The list page shows the empty state (no connectors imported). The file is unchanged on disk after boot.
- **F2** Multi-profile isolation: two profiles each with their own DB. A connector inserted into profile A is not visible in profile B's API. (Inherited from spec 0022; this scenario confirms connectors don't violate the boundary.)

#### Group G — Cross-cutting (2 scenarios)

- **G1** Secret reveal flow: dashboard reveals a secret, value displays for 10s, re-mask happens, second reveal within 60s gets 429 and a toast, after 60s it works.
- **G2** Activity feed deep-link: an invocation row links to `/sessions/<threadId>` with the right thread id. Clicking the link navigates to the session page (which renders).

### Fail-mode procedure

When a scenario fails inside a run:

1. The runner stops the 4× loop. It writes a `run-<n>.json` with the failure detail.
2. The implementer reads the failure, fixes the bug (in code, not in the test — unless the test itself is wrong, which is rarer than it sounds).
3. The implementer re-runs `pnpm run test:e2e:4x` from scratch. Counter starts at 0.

This is the spec's **only** acceptance procedure. There is no "fix and skip the failing scenario," no "re-run only the failing test," no "mark as known flake."

### Manual release-time smoke (separate, non-blocking)

After 4× clean, before mark-shipped, run a manual smoke against a real hosted MCP:

1. Start docker-compose. Open the dashboard.
2. Catalog-install Linear with a real Linear API key.
3. In Slack: `@zeno list my linear issues`. Confirm a real response.
4. Toggle, refresh tools, uninstall — all against the real backend.

This is a sanity check, not part of the 4× rule. It catches network-level surprises that the local fixture cannot model (TLS, hosted rate limits, real OAuth expiry).

## User Stories / Scenarios

Skipped — the scenario matrix above IS the user-stories list. Each item is a self-contained acceptance scenario.

## Success Criteria

1. The harness (boot-zeno, fixture starters, scripted mock backend, Playwright page builder) lands and is reusable.
2. Every scenario in the matrix has a corresponding test file under `tests/e2e/scenarios/`. Naming: `<group><number>-<slug>.test.ts`, e.g., `A1-catalog-install.test.ts`. Total: 22 scenarios across 7 groups.
3. `pnpm run test:e2e` runs the full matrix exactly once and emits `tests/e2e/results/run-<n>.json` with a pass/fail per scenario plus the aggregate.
4. `pnpm run test:e2e:4x` runs the matrix four times in sequence, halting on first failure, and reports the consecutive-clean counter.
5. Each scenario's per-test wall clock ≤ 60s; the full matrix ≤ 10min on a developer machine.
6. **Acceptance bar:** four consecutive clean runs, end-to-end, no flakes, no retries.
7. The mock backend's `scriptTurn` method is documented and used by every scenario that needs to drive an agent turn.
8. The structured output (`runs.json`) makes it possible to look at the last 10 runs and see whether the project is currently at 4/4, 0/4, etc.
9. The release-time manual smoke is documented in this spec and references concrete commands. It is run once per spec-shipped event but does not gate.
10. The 4× rule is enforced by `test:e2e:4x` returning a non-zero exit code unless the counter reached 4. CI configuration is out of scope; the rule is a local discipline at MVP.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The harness is brittle (port collisions, lingering child processes between runs) | Ephemeral ports for fixtures; explicit `afterEach` teardown calling `process.kill` on every fixture child; dedicated tmp dir per run. The first scenario of every run asserts no leftover files in the workspace tmp dir. |
| The 4× rule punishes the operator too harshly when a real upstream change breaks tests | The matrix uses fixtures only — no real upstreams. A failure means a real bug in the project's code or test, not external flake. |
| Playwright slows the suite dramatically | Most scenarios stay at the API level (no browser). Only Group A modal flows + Group G UI flows use Playwright. Headless mode by default. |
| Mock backend drift from the real Claude SDK | Scenarios assert on the SDK's tool-name shape (`mcp__<slug>__<tool>`), not on internal SDK behavior. Mock failures surface as test breakage; the implementer updates the mock to match SDK changes. |
| The 4× counter encourages "test until lucky" behavior | The rule is a counter to that exact instinct: passing once means nothing; the bar is a clean four. Implementers will gravitate toward determinism because flakes block progress. |
| Scenarios accidentally share state via the SQLite filesystem | Each scenario gets a fresh DB. The harness deletes the DB file in `afterEach`. A smoke assertion verifies the DB starts at migration 5 with empty connector tables. |
| Test files become an unreadable wall of setup | Each scenario is one file; setup is shared via the harness; assertions are concentrated at the boundary points listed in §Constraints. Aim for ≤ 100 lines per scenario file. |
| Cleaning up child processes leaves zombies on test failures | `afterAll` callback unconditionally kills every spawned child by tracking PIDs in a registry. The runner sends SIGTERM then SIGKILL after 5s. |
| Boundary assertions on log lines are noisy and break on log format changes | Assert on `event` field only (structured), not on the human message string. Already the project convention. |
| The matrix is incomplete (a real bug slips through) | Add a new scenario for any production bug that gets reported post-ship. The 4× rule then blocks until that scenario passes too. The matrix grows over time as a regression suite. |

## Open Questions

None blocking.

1. **Whether to add CI hooks.** Out of scope for MVP. The 4× rule is local discipline. CI integration (run on PR, run nightly) is a follow-up — first prove the suite is stable locally for several weeks.
2. **Whether to add a "scenario-only" runner mode.** `pnpm run test:e2e -- A1` filters to a single scenario for debugging. Implementation detail — vitest's `--testPathPattern` already covers it.
3. **Whether to seed the DB with a known catalog before each scenario.** The catalog is read from `agent/connectors-catalog.json` which is in the repo. No seeding needed; the file is the source. If a scenario needs a different catalog, it overrides via a tmp file + an env var pointing the API at it.
4. **Whether the mock backend script supports multi-turn conversations.** Yes — `scriptTurn` can be called multiple times, the backend dequeues per `query()`. Documented in the harness README.
