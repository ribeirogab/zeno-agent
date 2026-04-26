---
feature: connectors-e2e
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-26
---
# Connectors E2E Validation + Testing — Tasks

**For this plan:** `[[plan]]`

Five phases. Phase 5 ends only when **4 consecutive clean runs** of `pnpm run test:e2e:4x` are observed.

---

## Phase 1: Harness foundation

### Task 1.1: Workspace setup

- [ ] Step 1: `mkdir -p tests/e2e/{fixtures,scenarios,helpers,results}`.
- [ ] Step 2: Author `tests/e2e/package.json`: `name: '@zeno/e2e', private: true`; devDependencies: `'@playwright/test': '^1'`, `vitest`. Workspace deps: `'@zeno/storage': 'workspace:*'`.
- [ ] Step 3: Update `pnpm-workspace.yaml` to include `tests/e2e`. Update root `.gitignore` with `tests/e2e/results/run-*.json` + `tests/e2e/results/runs.json`.
- [ ] Step 4: `pnpm install`. `npx playwright install chromium`.
- [ ] Step 5: Add root scripts in `package.json`:
  ```json
  "test:e2e": "vitest --config tests/e2e/vitest.config.ts run",
  "test:e2e:4x": "bash scripts/test-e2e-4x.sh"
  ```
- [ ] Step 6: Commit: `chore(workspace): scaffold tests/e2e + Playwright`.

### Task 1.2: Vitest config

- [ ] Step 1: Author `tests/e2e/vitest.config.ts`: `pool: 'forks', singleThread: true, testTimeout: 60_000, hookTimeout: 30_000`. Custom reporter that writes `run-<n>.json`.
- [ ] Step 2: Author a placeholder smoke test `tests/e2e/scenarios/_smoke.test.ts` that asserts `1 + 1 === 2`.
- [ ] Step 3: `pnpm run test:e2e` — runs and exits 0.
- [ ] Step 4: Commit: `feat(e2e): vitest config + smoke`.

### Task 1.3: Child registry

- [ ] Step 1: Create `tests/e2e/fixtures/child-registry.ts`. Module-level `Set<ChildProcess>`. Export `register(child)`, `killAll()`. Hook into `process.on('exit')` to SIGKILL anything left behind.
- [ ] Step 2: Trivial unit test for the registry: register a stub object, call killAll, assert behavior.
- [ ] Step 3: Commit: `feat(e2e): child process registry`.

### Task 1.4: Mock backend `scriptTurn`

- [ ] Step 1: In `apps/worker/src/agent/backends/mock.ts`, add `private scriptedTurns: Array<{ promptMatcher: string | RegExp; response: AgentOutput }> = [];` and `scriptTurn(prompt, response)` that appends to the queue.
- [ ] Step 2: In `query()`, before falling back to fixtures, iterate `scriptedTurns` and pop the first match. If found, return its `response`.
- [ ] Step 3: Unit test: register two scripted turns, call `query` twice, assert each response.
- [ ] Step 4: Commit: `feat(worker): MockBackend.scriptTurn for deterministic e2e`.

### Task 1.5: Channel stub

- [ ] Step 1: Create `tests/e2e/fixtures/slack-stub.ts`. Implement the `Channel` interface (look up the actual interface in `apps/worker/src/channels/`). Methods record calls into in-memory arrays exposed for assertions: `replies: []`, `reactions: []`, `approvalRequests: []`. The stub auto-decides approval requests via a callback set during construction (default: always approve).
- [ ] Step 2: Add a stub-channel selector to the worker boot — env `ZENO_CHANNEL=stub` selects `SlackStub` instead of the real `SlackChannel`. Implementation: extend the `apps/worker/src/index.ts` channel-construction switch.
- [ ] Step 3: Smoke unit test: instantiate the stub, call its methods, assert the records.
- [ ] Step 4: Commit: `feat(e2e): slack channel stub + ZENO_CHANNEL=stub selector`.

### Task 1.6: Boot helper

- [ ] Step 1: Refactor `apps/worker/src/index.ts` and `apps/api/src/index.ts` so each exports a `bootWorker()` / `bootApi()` async function whose body is the current `main()`. CLI entry points stay (`if (process.argv[1] === fileURLToPath(import.meta.url)) bootWorker()`) so prod boot is unchanged.
- [ ] Step 2: Create `tests/e2e/fixtures/boot-zeno.ts`. Set env (`WORKSPACE_DIR=<tmp>`, `ZENO_BACKEND=mock`, `ZENO_CHANNEL=stub`, `DASHBOARD_PASSWORD=test`, `DASHBOARD_SESSION_SECRET=test-secret-32-chars-long-pad-pad`, `LOG_LEVEL=info`) before importing. Two `await import(...)` calls invoke `bootWorker()` and `bootApi()` from the refactored modules. Worker + API share the test runner's Node runtime, so `mockBackend`, the slack stub, and the `connectorRepo` are reachable via direct module imports rather than RPC.
- [ ] Step 3: Wait for `event=zeno_online` and `event=api_listening` via the in-process Pino destination tap (subscribe to the same stream the dbSink uses, or attach a custom Pino destination during boot). Timeout 30s.
- [ ] Step 4: Build the harness's return shape: `{ apiUrl, db: <opened DB handle for direct assertions>, log: { waitFor, recent }, mockBackend, channel: <stub instance>, stop }`. The `stop` callback runs the worker's existing shutdown path, calls `apiServer.close()`, kills MCP fixture children via the child-registry, closes the DB, and removes the temp `WORKSPACE_DIR`.
- [ ] Step 5: A throwaway test: boot, GET `/api/health`, assert 200, stop.
- [ ] Step 6: Commit: `feat(e2e): boot-zeno same-process harness`.

### Task 1.7: MCP fixture starters

- [ ] Step 1: Create `tests/e2e/fixtures/start-stdio-mcp.ts`. Returns `{ command: 'node', args: [<absolute path to echo-mcp/server.ts>], env, close }`. Uses the existing fixture from spec 0032.
- [ ] Step 2: Create `tests/e2e/fixtures/start-remote-mcp.ts`. Spawns the HTTP fixture from spec 0033 on an ephemeral port. Returns `{ url, close }`.
- [ ] Step 3: Smoke tests for each (start, sanity-call, close).
- [ ] Step 4: Commit: `feat(e2e): MCP fixture starters`.

### Task 1.8: Playwright page builder

- [ ] Step 1: Create `tests/e2e/fixtures/play.ts`. Exports `async function newPage(apiUrl: string): Promise<Page>` that boots a Chromium browser, sets the auth cookie via the same HMAC-cookie scheme the dashboard uses, navigates to `${apiUrl}/`, and returns a logged-in page.
- [ ] Step 2: Smoke test: bring up, open page, assert the dashboard shell renders, close.
- [ ] Step 3: Commit: `feat(e2e): playwright page factory`.

### Task 1.9: Phase 1 quality gate

- [ ] Step 1: All harness smokes pass (the throwaway tests that exercise each fixture).
- [ ] Step 2: `pnpm run test:e2e` runs the smokes only and exits 0.

---

## Phase 2: Group A + B scenarios

### Task 2.1: Group A — catalog (4 scenarios)

- [ ] A1: catalog install happy path. Steps: boot, start the **remote HTTP fixture** (`start-remote-mcp.ts`), write a temp catalog with a single Linear-shaped entry where `transport='remote'` and `url=<fixture URL>`, open page → `/connectors`, click Linear, paste token (`Bearer test`), click Test (assert ✓ + 3 tools), click Add, assert connector exists in DB and renders in the list.
- [ ] A2: catalog install with 401. Same as A1 but start the remote fixture with `FAIL=401`. Assert the error result strip with `errorKind='auth'`, Add disabled. Restart fixture in normal mode (or expose a runtime flip), retry Test → ✓, Add succeeds.
- [ ] A3: catalog already installed. Pre-seed DB with a Linear connector (remote, pointing at the fixture URL). Open page. Assert the Linear card shows installed; click does not open the modal.
- [ ] A4: malformed catalog. Override the catalog file with garbage JSON. Open page. Assert API returns 500 on `/api/connectors/catalog`; dashboard renders an error banner; Installed list still loads.
- [ ] Quality gate: all 4 scenarios pass.

### Task 2.2: Group B — custom (3 scenarios)

- [ ] B1: custom stdio. Add custom (local) modal, fill name "echo" + command/args of the fixture, no secrets. Test → ✓ + 3 tools. Add → connector enabled. Assert DB.
- [ ] B2: custom remote. Add custom (remote) with the HTTP fixture URL + Authorization "Bearer test". Test → ✓. Add → enabled.
- [ ] B3: custom save without test → pending. Skip Test. Click Add. Connector lands as `pending`. Open the detail page, assert empty Activity + "no tools yet" tool permissions area. Click Test on the detail page → discovers tools, status flips to `enabled`.
- [ ] Quality gate: all 3 scenarios pass.

---

## Phase 3: Group C + D scenarios

### Task 3.1: Group C — lifecycle (5 scenarios)

- [ ] C1: toggle off → on. Pre-seed Linear. Click toggle. DB status flips. Drive a scripted turn that calls `mcp__linear__list_issues` → assert the agent reports tools missing (because the connector is disabled and `getMcpServers` filters it). Toggle on. Drive again. Tool succeeds.
- [ ] C2: edit credentials. Pre-seed. Open detail. Click eye on the secret, then click edit, paste a new value. Save. Assert `connector_update` row in `commands`. Then **wait deterministically** for the `command_processed` log event with `type='connector_update'` (use `log.waitFor(...)` from the harness, NOT a sleep). Assert `last_verified_at` bumped and a follow-up scripted turn that calls a tool succeeds.
- [ ] C3: refresh tools. Pre-seed with manual per-tool overrides (`create_issue=always_allow` instead of the default `ask`). Open kebab → Refresh tools. Assert modal copy is exactly `This will reset tool permissions to defaults.`. Confirm. Assert `connector_refresh_tools` command processed; per-tool permissions reset to category defaults.
- [ ] C4: uninstall. Pre-seed. Open kebab → Uninstall → confirm. Assert command processed; DB shows no connector + no secrets + no tools + no invocations.
- [ ] C5: tool permission edit. Pre-seed with `create_issue=ask`. Click the segmented control to `always_allow`. Assert optimistic UI updates immediately; PATCH lands; DB updated. Drive a scripted turn that calls `create_issue` → pipeline returns `connector_allow`, no classifier hit (assert via log).
- [ ] Quality gate: all 5 scenarios pass.

### Task 3.2: Group D — pipeline (3 scenarios)

- [ ] D1: always-allow path. Pre-seed `read_echo=always_allow`. Drive a scripted turn calling `mcp__echo__read_echo`. Assert: tool runs, audit log row with `policyThatGated='connector_allow'`, no classifier invocation in the log.
- [ ] D2: never path. Pre-seed `interactive_echo=never`. Drive a turn calling it. Assert: deny, audit log with `policyThatGated='connector_never'`, agent's reply contains "ação negada".
- [ ] D3: ask falls through. Pre-seed `write_echo=ask`. Stub classifier returns "sensitive". Stub approver auto-approves. Drive a turn. Assert: classifier invoked, approver invoked, tool runs, invocation row written.
- [ ] Quality gate: all 3 scenarios pass.

---

## Phase 4: Group E + F + G scenarios

### Task 4.1: Group E — errors (3 scenarios)

- [ ] E1: auth expires mid-session. Start the stdio fixture in normal mode. Drive a successful turn. Flip the fixture to `FAIL=401` by writing `FAIL=401` to `<workspace>/echo-mcp-fail.txt` (per spec 0032 task 6.1 step 1.c — runtime control file mechanism). Drive another turn. Assert: invocation row with `result='error'`, `error_message` contains `'401 Unauthorized'`, connector `last_error` populated with the same string, `status` still `enabled`.
- [ ] E2: network down. Pre-seed remote connector pointing to a port nobody listens on. Drive a turn. Assert: invocation `result='error'`, `errorKind='network'` reflected in the log, `last_error` populated.
- [ ] E3: test connection fails. Pre-seed connector pointing at the stdio fixture in `FAIL=401`. Open detail, click Test. Assert: result strip shows the error; `last_error` populated.
- [ ] Quality gate: all 3 scenarios pass.

### Task 4.2: Group F — cutover + multi-profile (2 scenarios)

- [ ] F1: cutover warning. Before booting, write a temp `profile/mcp.json` with two server entries. Boot. Assert: exactly one log line `event=mcp_json_ignored, servers=['x','y']`. List page shows empty state. File on disk unchanged.
- [ ] F2: multi-profile isolation. Boot two parallel zeno stacks (two ports, two DBs). Insert connector into stack A. Assert API of stack B returns empty connector list.
- [ ] Quality gate: both scenarios pass.

### Task 4.3: Group G — cross-cutting (2 scenarios)

- [ ] G1: secret reveal rate-limit. Pre-seed connector with one secret. Open detail. Click eye → value reveals. Wait > 10s, assert re-mask. Click eye again immediately, assert toast `aguarde alguns segundos pra revelar de novo` (within 60s window). Use vitest fake clocks to advance 60s + 1, click again, assert success.
- [ ] G2: activity feed deep-link. Pre-seed an invocation row with `thread_id='1234'`. Open the detail page → Activity. Assert the View turn link's `href` is `/dashboard/sessions/1234` (or whatever the project's sessions detail route is). Click it, assert no 404 (the sessions page renders).
- [ ] Quality gate: both scenarios pass.

---

## Phase 5: Runner + 4× rule + acceptance

### Task 5.1: Structured output

- [ ] Step 1: Author `tests/e2e/helpers/runner-summary.ts` — vitest reporter that writes `tests/e2e/results/run-<auto-incremented-N>.json` capturing per-scenario results. Maintain a single `runs.json` aggregating the last N runs and the current consecutive-clean counter.
- [ ] Step 2: Wire the reporter in `tests/e2e/vitest.config.ts`.
- [ ] Step 3: Run once; verify `run-1.json` and `runs.json` are written.
- [ ] Step 4: Commit: `feat(e2e): structured run output`.

### Task 5.2: 4× wrapper script

- [ ] Step 1: Author `scripts/test-e2e-4x.sh` per plan §Phase 5. `chmod +x`.
- [ ] Step 2: Sanity: run it. If the suite is currently green, observe 4 consecutive clean runs. If not, observe failure on first non-clean iteration.
- [ ] Step 3: Commit: `feat(e2e): test-e2e-4x.sh wrapper`.

### Task 5.3: Iterate until 4 consecutive clean

- [ ] Step 1: `pnpm run test:e2e:4x`. If counter reaches 4, the suite is accepted.
- [ ] Step 2: If a run fails, read the per-scenario failure, fix the root cause (production code or test assertion), restart the wrapper. Counter resets to 0.
- [ ] Step 3: Repeat until 4/4.
- [ ] Step 4: Common flake sources to look for during iteration:
  - Hardcoded timeouts where a `log.waitFor('command_processed')` would suffice.
  - Network-port collisions when tests run back-to-back without proper teardown.
  - Process zombies that hold the DB open across scenarios.
  - DOM races where an assertion runs before the optimistic update has rendered.
- [ ] Step 5: When 4/4 is reached, commit: `chore(e2e): 4 consecutive clean runs achieved`. The implementer may also add a note to `runs.json` or a separate `ACCEPTED.md` for posterity.

### Task 5.4: Manual release-time smoke

- [ ] Step 1: Run `pnpm run docker:up`. Open the dashboard.
- [ ] Step 2: Catalog-install Linear with a real Linear API key. Test → ✓.
- [ ] Step 3: In Slack: `@zeno list my linear issues`. Confirm a real response.
- [ ] Step 4: Toggle off → on. Refresh tools. Uninstall. Confirm each works against the real upstream.
- [ ] Step 5: Note the result in the spec's `shipped:` commit message. This step does NOT gate; it's documentation that the suite catches what the matrix asks it to.

### Task 5.5: Mark shipped

- [ ] Step 1: Update `context/specs/0035-connectors-e2e/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.
- [ ] Step 2: Commit: `chore(spec-0035): mark shipped after 4 consecutive clean runs`.

---

## Verification checklist (against spec § Success Criteria)

- [ ] 1. Harness components land (Phase 1).
- [ ] 2. 22 scenario files in `tests/e2e/scenarios/` (Phases 2-4).
- [ ] 3. `pnpm run test:e2e` runs the matrix once + emits `run-N.json` (Phases 1, 5.1).
- [ ] 4. `pnpm run test:e2e:4x` exits 0 only after 4 consecutive cleans (Phase 5.2).
- [ ] 5. Per-scenario wall ≤ 60s; matrix ≤ 10min (observed in Phase 5.3 iteration).
- [ ] 6. **4 consecutive clean runs achieved** (Phase 5.3).
- [ ] 7. `scriptTurn` documented + used (Phase 1.4 + every D-group scenario).
- [ ] 8. `runs.json` aggregate makes the counter visible (Phase 5.1).
- [ ] 9. Manual release smoke documented (Phase 5.4).
- [ ] 10. `test:e2e:4x` exits non-zero unless counter reaches 4 (Phase 5.2 wrapper).
