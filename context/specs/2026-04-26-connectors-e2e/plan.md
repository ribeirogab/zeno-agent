---
feature: connectors-e2e
spec: "[[spec]]"
created: 2026-04-26
---
# Connectors E2E Validation + Testing — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. The harness lands first; scenarios layer on top.

**Goal:** Stand up a repeatable end-to-end suite that exercises the Connectors feature across real worker, real API, real dashboard, and real MCP fixtures. Drive it via `pnpm run test:e2e` and `pnpm run test:e2e:4x`. Pass the 4× consecutive clean rule.

**Architecture:** A new top-level `tests/e2e/` directory with three concerns: (1) **fixtures** — boot helpers that bring up worker + API **in the same Node process as the test runner** (via `bootWorker()` / `bootApi()` exports added by a small refactor), plus stdio and HTTP MCP fixture servers (these ARE separate processes — the SDK spawns them); (2) **scenarios** — one file per row of the matrix, each a vitest-mode-integration test that asserts at boundaries (DB, API, log, DOM); (3) **runner** — a vitest config + a thin shell wrapper that loops 4× and writes structured JSON to `tests/e2e/results/`. The mock agent backend is extended with `scriptTurn` so scenarios can drive deterministic turns without a real LLM. Same-process boot is a deliberate choice — it gives scenarios direct access to `mockBackend`, the `slack-stub`, and the `connectorRepo` without RPC plumbing.

**Tech Stack:** Adds Playwright (`@playwright/test`) as the only new dependency. Vitest (already present) drives non-browser scenarios. No new runtime dependencies.

## Approach

Five phases:

1. **Harness foundation.** The boot helper, child-process registry, fixture starters, scripted mock backend extension. No scenarios yet.
2. **Group A + B (catalog + custom flows).** First wave of scenarios — install paths.
3. **Group C + D (lifecycle + guardrails).** Mid-wave — connector lifecycle and pipeline behavior.
4. **Group E + F + G (errors + cutover + cross-cutting).** Final wave — failure modes and edge cases.
5. **Runner + 4× rule + first acceptance.** The 4× wrapper, structured output, and the first attempt at four consecutive clean runs. Iterate on flake until the bar is met.

Phases 2-4 are independent in isolation but each relies on Phase 1's harness. Phase 5 closes the loop.

The plan is **not** TDD-shaped in the unit-test sense — these are integration tests by definition. But each scenario is written with deterministic event hooks (wait for the `command_processed` log event, then assert) instead of `setTimeout(..., 1500)` polling. That discipline is what carries the 4× rule.

## Architecture

```
tests/e2e/
├── vitest.config.ts            specialized config: --mode=integration, no parallelism, 60s timeout
├── package.json                local fixtures lib + Playwright dev-dep declarations
├── fixtures/
│   ├── boot-zeno.ts            spawn worker + api against a temp DB; return apiUrl, db, stop()
│   ├── child-registry.ts       global registry of PIDs; afterAll kills all
│   ├── start-stdio-mcp.ts      spawn echo-mcp; return { command, args, close }
│   ├── start-remote-mcp.ts     spawn HTTP fixture; return { url, close }
│   ├── seed-connector.ts       insert helpers
│   ├── play.ts                 Playwright page factory with cookie auth
│   ├── mock-backend-script.ts  helper to register `scriptTurn` calls on the running mock backend
│   └── slack-stub.ts           stub Channel that records replies + reactions; bypasses real Slack
├── scenarios/
│   ├── A1-catalog-install.test.ts
│   ├── A2-catalog-install-401-then-fix.test.ts
│   ├── A3-catalog-already-installed.test.ts
│   ├── A4-catalog-malformed.test.ts
│   ├── B1-custom-stdio.test.ts
│   ├── B2-custom-remote.test.ts
│   ├── B3-custom-pending-then-test.test.ts
│   ├── C1-toggle-off-on.test.ts
│   ├── C2-edit-credentials.test.ts
│   ├── C3-refresh-tools.test.ts
│   ├── C4-uninstall.test.ts
│   ├── C5-tool-permission-edit.test.ts
│   ├── D1-pipeline-always-allow.test.ts
│   ├── D2-pipeline-never.test.ts
│   ├── D3-pipeline-ask-falls-through.test.ts
│   ├── E1-auth-expires-mid-session.test.ts
│   ├── E2-network-down.test.ts
│   ├── E3-test-connection-fails.test.ts
│   ├── F1-mcp-json-cutover.test.ts
│   ├── F2-multi-profile-isolation.test.ts
│   ├── G1-secret-reveal-rate-limit.test.ts
│   └── G2-activity-feed-deep-link.test.ts
├── results/                    .gitignored — per-run JSON output
└── helpers/
    ├── assertions.ts           DB-state, API-response, log-event, DOM helpers
    └── runner-summary.ts       vitest reporter that writes the run-<n>.json
```

## File Structure

### NEW (top-level)

| Path | Responsibility |
|---|---|
| `tests/e2e/vitest.config.ts` | Specialized vitest config |
| `tests/e2e/package.json` | Adds `@playwright/test` as dev dep; declares the local-fixtures path |
| `tests/e2e/fixtures/**` | All harness components |
| `tests/e2e/scenarios/**` | All 22 scenario test files |
| `tests/e2e/helpers/**` | Shared assertion helpers + the reporter |
| `scripts/test-e2e-4x.sh` | Bash wrapper: loops `pnpm run test:e2e` four times, halts on first failure, prints the counter |

### NEW package fields

| File | Change |
|---|---|
| `package.json` (repo root) | New scripts: `"test:e2e": "vitest --config tests/e2e/vitest.config.ts run"`, `"test:e2e:4x": "bash scripts/test-e2e-4x.sh"` |

### MODIFIED

| File | Change |
|---|---|
| `apps/worker/src/agent/backends/mock.ts` | Add `scriptTurn(prompt, response)` method that pushes a record into a per-instance queue; `query()` consumes the matching record. Existing `loadFixtures` semantics unchanged. |
| `pnpm-workspace.yaml` | Add `tests/e2e` so it gets workspace install of devDeps |
| `.gitignore` | Add `tests/e2e/results/run-*.json` and `tests/e2e/results/runs.json` |

## Phase Ordering

### Phase 1 — Harness foundation

**Process model decision (load-bearing):** the harness boots worker + API in the **same Node process** as the test runner. Two `await import(...)` calls invoke `bootWorker()` and `bootApi()` (small refactors that export the existing `main()` bodies). Rationale: this gives scenarios direct in-memory access to `mockBackend` (for `scriptTurn`), the `slack-stub` (for assertion on captured replies), and the `connectorRepo` (for direct DB inspection). Multi-process boot would require RPC over a Unix socket or stdin/stdout JSON, adding fragility for no benefit at single-user e2e scale. The `child-registry` is still authored — it tracks **MCP fixture children** (stdio echo + HTTP remote) that ARE separate processes by necessity (the SDK spawns them); not the worker/API themselves.

- Author `boot-zeno.ts`. In-process boot via `await import(...)` of refactored `bootWorker()` + `bootApi()` exports. Set env vars (`WORKSPACE_DIR=<tmp>`, `ZENO_BACKEND=mock`, `ZENO_CHANNEL=stub`, `DASHBOARD_PASSWORD=test`, `LOG_LEVEL=info`) before import. Return `{ apiUrl, db, log, mockBackend, channel, stop }`. The `log` is a tail-aware reader (subscribes to the Pino destination stream) that lets the test wait for specific `event` lines.
- Author `child-registry.ts` — global Set of `ChildProcess` for fixture MCPs; `process.on('exit')` SIGKILLs anything left behind. (Used by `start-stdio-mcp.ts` and `start-remote-mcp.ts`, NOT for worker/API which boot in-process.)
- Author the fixture starters for stdio and remote MCPs (thin wrappers around the work done in spec 0032 / 0033). These DO spawn separate Node processes and register with `child-registry`.
- Refactor `apps/worker/src/index.ts` to export a `bootWorker()` function whose body is the current `main()`. Same for `apps/api/src/index.ts` → `bootApi()`. The CLI entry points (`if (require.main === module) bootWorker()`) remain so the prod boot is unchanged.
- Extend `MockBackend` with `scriptTurn`.
- Author `slack-stub.ts` — a `Channel` implementation that captures `reply()` calls and approver requests. The harness installs it in place of the real Slack channel via the same env var pattern (`ZENO_CHANNEL=stub` — add to the worker's channel selection if not already present).
- Author `play.ts` — boot a Playwright browser with the dashboard URL, set the auth cookie via `context.addCookies`, return a `page` ready for use.
- Smoke test the harness: a single throwaway test that boots, hits `/api/health`, and tears down. Confirms the rig works end-to-end.
- Quality gate: `pnpm run test:e2e` runs the smoke and exits 0.

### Phase 2 — Group A + B (catalog + custom)

- Author A1-A4 and B1-B3.
- Each follows a template: setup (boot, seed catalog override if needed, start MCP fixture if needed), action (HTTP or Playwright), assert (DB + API + log + DOM as relevant), teardown.
- Some scenarios use Playwright (modals, clicks); others stay at the API level. Mark the difference clearly in the file's first lines.
- Quality gate: all 7 scenarios pass. Tear down without leaks.

### Phase 3 — Group C + D (lifecycle + pipeline)

- C1-C5: lifecycle (toggle, edit, refresh, uninstall, permission edit).
- D1-D3: pipeline behavior with the scripted mock backend driving tool calls and the stub approver auto-deciding.
- Quality gate: all 8 scenarios pass.

### Phase 4 — Group E + F + G (errors + cutover + cross-cutting)

- E1-E3: failure modes via fixture env (`FAIL=401`, `FAIL=timeout`).
- F1: cutover — the harness writes a temp `profile/mcp.json` before boot; the boot log is asserted to carry `mcp_json_ignored`.
- F2: multi-profile — boot with two profile dirs, two DBs; assert isolation via two API calls.
- G1: secret reveal — Playwright clicks the eye, a second click within 60s gets a toast, fake-clock advance to confirm the 60s limit.
- G2: activity deep-link — assert the rendered link's `href` matches `/sessions/<expected>` and that clicking it navigates without 404.
- Quality gate: all 7 scenarios pass.

### Phase 5 — Runner + 4× rule + first acceptance

- Author `scripts/test-e2e-4x.sh`:
  ```bash
  #!/usr/bin/env bash
  set -e
  count=0
  for i in 1 2 3 4; do
    echo "RUN $i/4 starting…"
    if pnpm run test:e2e; then
      count=$((count+1))
      echo "RUN $i/4 — clean ✓ (counter: $count/4)"
    else
      echo "RUN $i/4 — failed ✗ (counter resets to 0)"
      exit 1
    fi
  done
  echo "ACCEPTANCE: 4 consecutive clean runs"
  ```
- Author `helpers/runner-summary.ts` — vitest custom reporter that writes `run-<n>.json` based on the existing `runs.json` aggregate.
- Run the suite once. Triage flakes ruthlessly. Fix root causes (race-prone reads, late teardown, hard-coded waits).
- Run `pnpm run test:e2e:4x`. Iterate until 4 consecutive clean runs are achieved.
- Update `context/specs/2026-04-26-connectors-e2e/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.

## Risks / Open Decisions

- **Whether the dashboard tests use a built SPA or the dev server.** The built SPA served by the API is closer to production. Use it. The harness builds the dashboard once at suite start (`pnpm --filter @zeno/dashboard build`) and the API serves the static output. Build time is ~5s — acceptable.
- **Playwright browser download size on first run.** The CI / fresh-machine first run downloads ~150MB of Chromium. The wrapper script prints a clear message about this so the operator isn't surprised. CI configurations cache the browser; out of scope for this plan.
- **How to capture worker log events for assertions.** The worker already logs to stdout in JSON (Pino). The harness's `log` object exposes `waitFor(event: string, timeoutMs = 5000)` that scans the buffered output. Implementation reuses the same JSON-line tail approach used by other scripts in the project.
- **Whether `slack-stub.ts` needs to be a full `Channel` impl or can implement just the methods the agent calls.** Full impl. The Channel interface is small (≤ 5 methods) and the stub records every call; this gives scenarios a richer assertion surface (e.g., "no DM was sent").
- **Whether scenarios should write fixtures inline or share a `helpers/connectors.ts` builder.** Share. A `connectors.ts` builder exposes `installCatalog(name, secrets)` and `installCustomStdio({ command, args })` so scenarios stay short. The builder uses the API endpoints, not direct DB writes — that's what we're testing.
- **Should F2 require booting two complete worker+API stacks?** Yes. Multi-profile isolation is a real boundary; faking it via two DBs in one process would not catch process-level boundary bugs. Boot two stacks on different ports and assert isolation.
- **How long does `scriptTurn` queue persist.** Per `MockBackend` instance. New backend = empty queue. The harness creates a fresh worker per scenario so this is naturally clean.
- **What to do when a scenario takes > 60s.** Hard fail. The 60s timeout is generous; if a scenario hits it, something is wrong (typically a fixture not torn down or a deadlock). Add a deterministic event wait, not a longer timeout.
- **Whether the test:e2e:4x output is human-readable or machine-readable.** Both. The shell wrapper prints human-readable progress; the reporter writes machine-readable JSON. Acceptable to grep both.
- **CI integration.** Out of scope for this plan. The 4× rule runs locally during the implementer's last loop before mark-shipped. CI hooks are a follow-up after the suite has proven stable.
