---
status: shipped
feature: connectors-test-strategy
created: 2026-04-26
shipped: 2026-04-26
supersedes: "[[../0035-connectors-e2e/spec]]"
---
# Connectors Test Strategy — Spec

**Status:** Draft
**Scope:** Replace `0035-connectors-e2e`'s monolithic "4× consecutive clean × ~40-scenario × Playwright × 10-min-per-pass" harness with a **phased** strategy that puts cheap-and-fast regression tests on every PR and pushes the heavy E2E to a release/nightly cadence (or keeps it manual via `0036`).

## Brainstorm Q&A

These are the questions I asked myself before drafting this spec, with my own answers. Captured here for future readers (especially anyone reopening 0035).

### What problem does 0035 actually try to solve?

Two problems, conflated:

1. **Regression coverage** — make sure bugs don't come back. Should be: cheap, deterministic, runs on every change.
2. **End-to-end validation** — prove the whole stack works before a release. Allowed to be: heavier, slower, runs less frequently.

0035 treats both as the same gate (4× clean of the full matrix on every "release"). That's why it ballooned to ~40 min wall clock and never got built.

### What do we already have for connectors today?

| Layer | Coverage | Where | Speed |
|---|---|---|---|
| Unit tests (storage, worker, api, dashboard) | good | `apps/*/tests`, `packages/*/tests` | ~2s total, 135 tests |
| API integration (in-process, mocked deps) | partial | `apps/api/tests/routes/connectors.test.ts` | 184ms, 16 tests |
| Manual E2E against live profile | one-off (0036) | `tmp/0036-validation/*.sh` | ~25-40 min/run, 3 rounds |
| Automated E2E with fixtures | **missing** | `tests/e2e/` (planned in 0035) | ~10 min/pass × 4 = 40 min |
| Real Slack DM E2E | one-off (0036) | manual driver | 22-90s/DM × 16 |

The big gap is "automated E2E with fixtures". 0035 tries to fill it with one massive suite. 0037 phases it.

### Why is 0035's "all on every PR" not viable?

- Target was ~10 min per pass × 4 passes = 40 min / PR. Industry sane is ≤10 min for **all tests combined** on a PR.
- Multiplies by feature: connectors gets 40 min, crons gets 40 min, channels gets 40 min → CI gate exceeds 2h within the year.
- Playwright in CI on every PR is heavy (browser binaries ~300 MB, cold start, flake-prone).
- Mock LLM with scripted turns mocks too much — nightly is fine, every PR is overkill.

### What's the right cadence per test type?

| Test class | Where it lives | Cadence | Budget |
|---|---|---|---|
| Unit | `apps/*/tests`, `packages/*/tests` | Every PR (`quality-gate`) | <2s total |
| Light integration (in-process API + mocked deps) | `apps/api/tests/routes` | Every PR | <500ms total |
| **Fast regression suite (Phase A)** ← this spec | new `apps/worker/tests/connectors-e2e/` | Every PR | <90s total |
| Full integration with mock LLM (Phase B) | `tests/e2e/` (deferred — 0035-derived) | Pre-merge to main / nightly | <5 min |
| UI E2E with Playwright (Phase C) | `tests/e2e-ui/` (deferred — 0035-derived) | Nightly only | <10 min |
| Manual real-system smoke | `tmp/0036-validation/` | Before release | best-effort |

### Why split into A/B/C instead of one big spec?

Decoupling lets each phase ship independently:

- **A** is the smallest deliverable that gives us regression coverage for the bugs we actually care about (the 3 findings + the runtime guardrails). Probably 1-2 days of work. High value.
- **B** is the next tier: scripted-turn scenarios that exercise the agent loop without real LLM. Worth doing eventually, but not blocking.
- **C** is dashboard UI E2E — visual confidence. Lowest priority because `0036` already proved the UI manually and the rendered state is a function of API state we can verify cheaply.

### Why fixtures instead of real MCPs?

Real `@sentry/mcp-server` in CI would mean:

- Network dependency (Sentry's MCP package, npm registry, Sentry's API).
- A live Sentry token in CI secrets (real token in CI is a recurring security issue).
- Variable latency (cold-boot 10-30s).
- Brittle: a Sentry-side outage breaks our CI.

Fixtures are stdio echo servers we control:

- Boot in <50ms.
- Deterministic tool list and behavior.
- Failure modes triggered by env vars (no real auth needed).
- Reusable across all transport tests (stdio + remote).

### What about the spec 0035 file itself?

Not deleted, marked as **superseded by 0037** with a header note. Its design is the source of Phase B and Phase C of this spec, so it stays as a reference. When B or C lands, those parts get extracted from 0035 to their own specs.

## Context

After shipping connectors (specs 0029, 0032, 0033, 0034), spec 0036 manually validated the full feature against the live `fn` profile (104/0/1 across 3 rounds). That validation surfaced three project bugs (catalog mismatch, test connection doesn't validate token, deny writes invocation row) — see `context/learnings/connectors-validation-findings.md`.

Spec 0035 was designed earlier as the automated equivalent of 0036 but was deferred because the scope was unscalable: 4× consecutive clean × ~40 scenarios × Playwright on every PR = ~40 min wall clock, multiplied per feature. This spec replaces 0035 with a phased approach.

The companion spec [`0038-connectors-three-findings`](../0038-connectors-three-findings/spec.md) implements the bug fixes; that spec depends on this spec's Phase A infrastructure (the regression tests that prove each fix works).

## Problem Statement

We need automated regression coverage for connectors that:

1. Catches the 3 findings if they ever come back.
2. Catches the runtime guardrail invariants validated manually in 0036 (permission policies, security guarantees, lifecycle).
3. Runs in <90s on every PR.
4. Doesn't depend on real Slack, real Sentry, real Anthropic API, or any external service.
5. Is incrementally extensible — new connector adds new tests cheaply.

Spec 0035 over-engineered the solution. This spec scopes it back to what's actually needed.

## Non-Goals

1. **Replacing 0036.** Manual E2E against the live profile remains the release-time smoke; this spec's automated suite catches regressions, not novel real-system bugs.
2. **Building Phase B (mock LLM driving) or Phase C (Playwright UI) right now.** Both stay deferred. This spec ships only Phase A.
3. **Testing real third-party MCPs.** Fixtures only. Real-MCP smoke is a manual operation tracked separately.
4. **Performance benchmarks.** Latency observed (and asserted as `<90s`), but no per-scenario perf targets.
5. **Multi-profile tests.** Tests use a single in-memory DB; profile concept is irrelevant inside the suite.
6. **Multi-connector concurrency.** Single connector at a time is sufficient for what we're catching.
7. **Replacing the existing `apps/api/tests/routes/connectors.test.ts`** (16 tests). That file stays as-is; new suite is additive.

## Constraints

- **Phase A only.** Phases B and C are documented but explicitly out of scope for this spec.
- **No browser, no Slack MCP, no real LLM.** Phase A drives the worker's command dispatcher and `discoverTools` directly; verifies DB state and HTTP responses; no agent loop.
- **In-process** where possible. The fast-path uses real worker handlers + real `discoverTools` against an in-process fixture MCP child process, with a real SQLite DB on tmpfs (already what `apps/storage/tests` does).
- **Single fixture stdio MCP** (echo server) shared across all Phase A scenarios. Three tools: `read_echo`, `update_echo` (chosen because `write_` is not in `WRITE_PREFIXES` in `mcp-discover/classifyToolCategory`; `update_` is), `interactive_echo`. Failure modes via env vars (`FIXTURE_FAIL=auth`, `FIXTURE_FAIL=spawn`, `FIXTURE_FAIL=timeout`).
- **No remote fixture in Phase A.** Spec 0033 already has its own remote-transport unit tests; Phase A focuses on the surfaces that 0036 manually validated.
- **No 4× rule.** Tests are deterministic; the 4× rule was a workaround for flake. This spec mandates "no flake tolerance" via deterministic event hooks (poll for completion log line, not fixed sleep).
- **Quality gate integration.** Suite runs as part of `pnpm run quality-gate` (already turbo-orchestrated). **No new npm script** — the existing `apps/worker/vitest.config.ts` `include: ['tests/**/*.test.ts']` auto-discovers the new `tests/connectors-e2e/*.test.ts` files. The gate fails the same way unit tests do.
- **Total runtime budget: <90 seconds for the full Phase A suite** on the developer's machine. CI can be slightly slower; if it exceeds 3 min in CI, the suite is too heavy and needs trimming.
- **Canonical paths** (used consistently across this spec, its plan, and its tasks):
  - Test files: `apps/worker/tests/connectors-e2e/p[1-4]-*.test.ts`
  - Helpers: `apps/worker/tests/connectors-e2e/helpers/{echo-fixture,test-db,connector-fixture}.ts`
  - Fixture echo MCP: `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs`
  - Snapshot file: `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap`
  - Regenerator script: `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`

## User Stories / Scenarios

### Phase A scenario set (~12 scenarios)

Each scenario is a single vitest test with arrange / act / assert. Selected to give us regression coverage for the 3 findings + the high-impact runtime guardrails from 0036.

#### Group P1 — Catalog + discoverTools

| ID | Description |
|---|---|
| P1.1 | `discoverTools` against fixture echo MCP returns 3 tools with correct categories (read/write/interactive) |
| P1.2 | `discoverTools` with `FIXTURE_FAIL=spawn` returns `{errorKind: 'spawn'}` |
| P1.3 | `discoverTools` with `FIXTURE_FAIL=auth` and `{ authCheckTool: 'read_echo' }` returns `{errorKind: 'auth'}`. **Transitional contract:** spec 0037 ships first, before 0038's auth-check fix. The third options argument doesn't exist on `discoverTools` at 0037 ship time. To avoid landing a type-error or a knowingly-failing test, P1.3 is committed as `it.skip(...)` in 0037 with a comment pointing at 0038. Spec 0038 unskips P1.3 in the same commit that adds `DiscoverOptions` to `mcp-discover` and asserts `errorKind: 'auth'`. |
| P1.4 | `discoverTools` with `FIXTURE_FAIL=timeout` returns `{errorKind: 'timeout'}` |
| P1.5 | Catalog file shape: every catalog entry's `tools[]` matches a snapshot file generated by `discoverTools` of that entry's MCP. **Catches Finding #1 regressions.** |

#### Group P2 — Connector lifecycle

| ID | Description |
|---|---|
| P2.1 | `connector_create` handler with valid payload → connector row + secrets + tools rows in DB |
| P2.2 | `connector_update` handler replacing a secret → `last4` changes; lastVerifiedAt bumps on success |
| P2.3 | `connector_refresh_tools` → tools replaced; perms reset to category default |
| P2.4 | `connector_uninstall` → cascade deletes connector_secrets, connector_tool_permissions, connector_invocations |

#### Group P3 — Permission policy enforcement

| ID | Description |
|---|---|
| P3.1 | `connector_permission` policy: tool with permission=`always_allow` → returns `{allow:true, policyThatGated:'connector_allow'}` |
| P3.2 | `connector_permission` policy: tool with permission=`never` → returns `{allow:false, policyThatGated:'connector_never'}` |
| P3.3 | `connector_permission` policy: tool with permission=`ask` → returns `undefined` (falls through) |
| P3.4 | `connector_permission` policy: tool not in DB → returns `undefined` (falls through; built-in MCPs ride this slot) |

#### Group P4 — Invocation logging (covers Finding #3)

| ID | Description |
|---|---|
| P4.1 | Successful tool call → `connector_invocations` row with `result='ok'`, `error_message=null` |
| P4.2 | Tool call denied by `connector_never` policy → `connector_invocations` row with `result='error'` AND `error_message` containing the policy reason. **Catches Finding #3 regressions.** |
| P4.3 | Tool call that hits MCP and the MCP returns an error → `result='error'`, `error_message` ≠ policy text |

That's 14 scenarios. Anything beyond catches stuff that's already covered by unit tests or the 0036 manual smoke.

### Out of scope for Phase A (deferred to B/C)

- Slack channel integration (mocked LLM driving end-to-end through Slack) — Phase B (extracted from 0035 §Group D-G later).
- Dashboard UI assertions (install modal, banner, mixed permissions UI) — Phase C (extracted from 0035 §Group D later).
- Multi-connector interactions — separate spec when needed.
- Real remote-transport fixture — separate spec; spec 0033's existing tests cover the runtime.
- The `ask` → classifier → approver flow for non-owner — needs the Phase B mock LLM; deferred.

## Success Criteria

- Suite passes deterministically on the dev machine and in CI 10× in a row without retries.
- Total Phase A wall clock: **<90 seconds** on the dev machine.
- Catches all 3 of the findings reproduced via:
  - Synthetic catalog-with-wrong-tools → P1.5 fails.
  - `discoverTools` returning ok with bad token (regression) → P1.3 fails.
  - Deny-without-error_message in `connector_invocations` → P4.2 fails.
- Suite is part of `pnpm run quality-gate` and gates merge to main.
- Spec passes 3 review rounds without findings (see §Review procedure).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fixture MCP drifts from real MCP behavior over time | Fixture is a known echo, not a real-MCP simulacrum. The "drift" risk is bounded because fixture is documented to test wiring, not behavior. Real-system smoke (0036) catches behavior drift. |
| Spawn-time flake on CI runners (npx warm cache, etc.) | Fixture is plain `node apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` — no `npx`, no install, no transpile. Deterministic boot. |
| Tests grow to >90s | Per-scenario budget enforced via `testTimeout: 5000` set in `apps/worker/vitest.config.ts` (added in Phase 8 Task 8.1, currently the worker config has no explicit testTimeout — vitest default is 5000ms, but pinning it makes the budget explicit). Suite-level budget enforced ad-hoc by the contributor: `time pnpm --filter @zeno/worker test connectors-e2e` should be <90s. CI doesn't auto-fail on the 90s threshold; it's a guideline, not a gate. |
| Snapshot test (P1.5) churns on every catalog change | Snapshot lives in `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (plain JSON, not vitest's auto-snap format). Update by re-running `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` and committing the diff — done as part of any catalog edit. |
| `connector_permission` policy depends on `connectorRepo.getBySlug` — tests need a real DB | Use `packages/storage`'s `openDatabase(':memory:')` + `runMigrations` (already exported from `packages/storage/src/index.ts`). The new `helpers/test-db.ts` wraps that pattern; no pre-existing test-helpers file is reused. |
| Test parallelism + shared fixture port | Fixture is stdio (no port). Each test boots its own child process. Vitest default parallel is fine. |

## Open Questions

All resolved during drafting.

- **(Resolved) Where does the fixture MCP live?** `apps/worker/tests/connectors-e2e/fixtures/echo-mcp/server.mjs` — nested under `connectors-e2e/` for cohesion with the suite that uses it; plain `.mjs` because no workspace has `tsx`/`ts-node`. Alternative `tests/fixtures/` at repo root was considered and rejected (would require a new package/workspace just for fixtures).
- **(Resolved) Do we need a remote-transport fixture in Phase A?** No. `discoverTools` is transport-agnostic and the spec 0033 unit tests already cover remote-transport edge cases. Phase A focuses on the regressions surfaced in 0036, which are stdio-rooted.
- **(Resolved) How do we handle the existing 16 tests in `apps/api/tests/routes/connectors.test.ts`?** Untouched. They're API-layer mocked-DB tests; Phase A is worker-layer with real DB. Different scopes.
- **(Resolved) Do we need to mock `mcp-discover` for the API route tests?** Already mocked there. No change.
- **(Resolved) What about the Phase B/C fate?** They stay deferred. When ready, they get their own specs (likely 0040+ or extracted from 0035).

## Coverage gaps (acknowledged)

Phase A intentionally does not cover:

1. **Slack channel adapter end-to-end** — `apps/worker/src/channel/slack.ts` has its own unit tests; integration-with-agent path stays in manual smoke until Phase B lands.
2. **Real LLM behavior** — never. Mock LLM (Phase B) is the closest we get; production smoke is the only way to validate real model behavior.
3. **Browser rendering** — Phase C territory.
4. **Performance** — observed only; no thresholds.

## Review procedure

This spec must pass **3 consecutive review rounds without findings** before implementation begins. Same protocol as spec 0036:

1. **R1 — Independent reviewer (`spec-document-reviewer` agent)**: cold read; checks ambiguity, gaps, YAGNI, contradictions.
2. **R2 — Cross-check vs codebase reality**: re-reads referenced files (`mcp-discover`, `connector-permission` policy, claude-code backend, storage repos) to verify every claim.
3. **R3 — Independent reviewer fresh**.

Any round with findings → fix → reset to R1.

## Relationship to other specs

- **Supersedes** [`0035-connectors-e2e`](../0035-connectors-e2e/spec.md) for the test infrastructure question. 0035 keeps a header pointer to this spec; its design becomes the basis for future Phase B/C extractions.
- **Required by** [`0038-connectors-three-findings`](../0038-connectors-three-findings/spec.md). Each finding fix in 0038 lands together with its regression test in this Phase A suite. Spec 0038 cannot ship until this spec's Phase A infrastructure exists.
- **Complements** [`0036-connectors-100-validation`](../0036-connectors-100-validation/spec.md) (manual real-system smoke). 0036 stays as the release-time validation; 0037 Phase A is the per-PR regression gate.
