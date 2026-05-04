---
feature: connectors-100-validation
spec: "[[spec-connectors-100-validation]]"
created: 2026-04-26
---
# Connectors 100% Coverage Validation — Plan

**For this spec:** `[[spec-connectors-100-validation]]`

## Approach

The validation is structured as a **driver-led runbook** rather than an automated test suite. Rationale: spec `0035` already maps the automated path; building it now would inflate scope. Instead, we exploit the fact that the agent itself (Claude Code, the entity executing this spec) has all the tools necessary to drive the matrix end-to-end:

- `Bash` to issue `curl` against the dashboard API and to query the SQLite DB inside the container.
- `mcp__07722e00-…__slack_send_message` / `slack_read_channel` to drive Slack-based runtime scenarios.
- File ops to capture per-scenario JSON / log artifacts under `tmp/0036-validation/`.

The execution is a **strict ordering of scenarios per round**, where each scenario is a small bash sequence (often a single `curl` + an assertion) that emits a structured result line and writes its raw outputs to disk. The driver assembles these into a per-round summary and the final report.

The spec's 3× consecutive clean rule is enforced by the runner script: round N proceeds only after round N-1 was 100% green. Any failure prints a diagnostic, halts the runner, and the operator (or driver) fixes the cause before restarting.

## Architecture

```
                                ┌────────────────────────┐
                                │ Driver (Claude Code)   │
                                │ - reads scenarios      │
                                │ - runs them in order   │
                                │ - asserts outcomes     │
                                │ - writes artifacts     │
                                └───────────┬────────────┘
                                            │
                ┌───────────────────────────┼─────────────────────────┐
                │                           │                         │
                ▼                           ▼                         ▼
┌──────────────────────────┐  ┌────────────────────────┐   ┌────────────────────────┐
│  curl                    │  │  docker exec sqlite3   │   │  Slack MCP             │
│  http://localhost:3001   │  │  /var/zeno/zeno.db     │   │  send_message /        │
│                          │  │                        │   │  read_channel          │
└──────────┬───────────────┘  └─────────┬──────────────┘   └──────────┬─────────────┘
           │                            │                              │
           ▼                            ▼                              ▼
┌──────────────────────────┐  ┌────────────────────────┐   ┌────────────────────────┐
│ apps/api (Hono)          │  │ packages/storage       │   │ Slack workspace        │
│ - /api/connectors/*      │  │ - connector tables     │   │ DM channel D0EXAMPLE000 │
└──────────┬───────────────┘  └────────────────────────┘   └──────────┬─────────────┘
           │                                                          │
           ▼                                                          ▼
┌──────────────────────────┐                              ┌────────────────────────┐
│ apps/worker              │                              │ apps/worker (channel)  │
│ - command dispatcher     │                              │ - receives DM          │
│ - mcp-build → MCP procs  │                              │ - invokes agent        │
│ - guardrails policies    │                              │                        │
└──────────────────────────┘                              └────────────────────────┘
```

## Components

### 1. Runner script (`tmp/0036-validation/run.sh`)

A single bash entry-point. Invoked as `bash tmp/0036-validation/run.sh <round-number>` (1, 2, 3) — or `all` to chain all three.

Responsibilities:
- Source `lib.sh` (helpers below).
- Run §Round reset.
- Iterate scenarios in the order defined by §Test matrix → §Round structure.
- Per scenario: call its `runner` function, capture stdout/stderr → `tmp/0036-validation/run-<n>/<id>.{out,err,json}`, append a one-line result to `tmp/0036-validation/run-<n>/summary.tsv` (`<id>\t<result>\t<duration_ms>\t<note>`).
- After all scenarios: aggregate summary, compute `clean: yes/no`, append to `tmp/0036-validation/runs.json`.
- Exit non-zero on first failure (fail-fast).

### 2. Helpers library (`tmp/0036-validation/lib.sh`)

Functions reusable across scenarios:

```bash
api()       # curl wrapper with cookies + JSON
db_query()  # docker exec sqlite3 ... wrapper
expect_eq() # assertion: actual == expected, else fail with diff
expect_in() # assertion: substring in haystack
slack_send() # send DM via MCP, returns ts
slack_wait() # poll DM channel for reply matching predicate, with 60s timeout × 2
sentry_id() # cached lookup
log()       # structured echo to summary
```

### 3. Scenario files (`tmp/0036-validation/scenarios/g<X>.<Y>.sh`)

One file per scenario. Each file `source`s `lib.sh` and defines a `run()` function that returns 0 (pass) or 1 (fail). The runner sources the file, calls `run`, and captures the result.

Example (`g3.5.sh`):

```bash
run() {
  api PATCH "/connectors/$SENTRY_ID/toggle" >/dev/null
  status=$(api GET "/connectors/$SENTRY_ID" | jq -r .status)
  expect_eq "$status" "disabled" || return 1

  TS=$(slack_send 'D0EXAMPLE000' '[G3.5] me liste 3 issues do worker')
  reply=$(slack_wait 'D0EXAMPLE000' "$TS" 90)
  expect_in "$reply" 'desabilitad' || return 1
  expect_in "$reply" 'CloudWatch' || return 1

  # No new connector_invocations since the message ts
  count=$(db_query "SELECT COUNT(*) FROM connector_invocations WHERE connector_id='$SENTRY_ID' AND created_at > '$START_ISO'")
  expect_eq "$count" "0" || return 1

  # No curl in worker log since the message ts
  curl_hits=$(docker logs --since "${START_EPOCH}" zeno-acme-agent-1 2>&1 | grep -ci 'curl.*sentry.io')
  expect_eq "$curl_hits" "0" || return 1
}
```

### 4. Final report builder (`tmp/0036-validation/build-report.sh`)

After three clean rounds, generate `tmp/0036-validation/final-report.md` with:
- Summary header (3/3 clean, totals).
- A 50×3 matrix table (scenario id × round, ✓/✗ each cell).
- Per-round run timings.
- Pointer to per-scenario artifacts.
- Coverage gaps from §Spec restated for posterity.

## File Structure

```
context/specs/2026-04-26-connectors-100-validation/
├── spec.md           (this work)
├── plan.md           (this work)
└── tasks.md          (this work)

tmp/0036-validation/   (created at execution time, .gitignored)
├── run.sh
├── lib.sh
├── build-report.sh
├── scenarios/
│   ├── g1.1.sh ... g12.2.sh    (~50 files)
├── run-1/
│   ├── 00-baseline.json
│   ├── summary.tsv
│   ├── g1.1.{out,err,json}
│   └── ...
├── run-2/   (same shape)
├── run-3/   (same shape, includes G6 + G1.8 outputs)
├── runs.json    (counter + per-round metadata)
└── final-report.md
```

The spec docs (`context/specs/0036-…`) are the durable artifact. The `tmp/` directory is run-only scratch.

## Phase ordering

### Phase 0 — Spec finalization (3-review loop)

- Write `spec.md`, `plan.md`, `tasks.md` (done by the time Phase 1 starts).
- Run review R1 (`spec-document-reviewer` agent, isolated context).
- Apply fixes if any.
- Run review R2 (cross-check vs codebase reality, by the driver).
- Apply fixes if any.
- Run review R3 (`spec-document-reviewer` agent, fresh context).
- If R3 finds issues → fix → reset to R1.
- Phase 0 ends only when R3 clean. **Status flips to `approved`.**

### Phase 1 — Driver scaffolding

- Build `lib.sh` with the helper functions listed above.
- Build `run.sh` runner with fail-fast + artifact capture.
- Build the round-reset block (already in §Round reset of spec).
- Smoke test: invoke a single trivial scenario (e.g., G1.1) and verify the runner emits the right artifacts.

### Phase 2 — Scenario authoring

One scenario at a time, in matrix order. Each scenario:
1. Author `scenarios/g<X>.<Y>.sh`.
2. Run it standalone via `bash run.sh single g<X>.<Y>`.
3. If it passes deterministically twice in a row, mark authored.
4. Commit if part of a logical group (e.g., all G7 reveal scenarios).

This phase produces all ~50 scenario files.

### Phase 3 — Round 1

- Run `bash tmp/0036-validation/run.sh 1`.
- Capture artifacts.
- If green: proceed to Phase 4.
- If red: fix the bug (in code or in the scenario, as appropriate), reset to Phase 3 step 1.

### Phase 4 — Round 2

- Same as Phase 3 with `run.sh 2`.
- Any failure → fix → restart at Phase 3 (counter resets to 0; rounds 2 and 3 will need to re-pass).

### Phase 5 — Round 3

- Same as Phases 3–4, with `run.sh 3` (which includes G6 + G1.8).
- Any failure → restart at Phase 3.
- Green run → build the final report (Phase 6).

### Phase 6 — Reporting + spec close

- `bash tmp/0036-validation/build-report.sh`.
- Inspect `final-report.md`.
- Update `spec.md` front-matter: `status: shipped`, `shipped: <YYYY-MM-DD>`.
- Open the PR with the report linked in the description.
- A learning note may be created under `context/learnings/` if any non-obvious gotcha surfaced.

## Risks / Open Decisions

- **Driver-as-runner vs human-as-runner.** The matrix mostly automates, but G1.6 (modal copy when secret edited) and G7.4 (10s auto-hide in browser) require a real browser. **Decision:** the driver issues the API call equivalents and a parallel screenshot is captured manually by the operator for those two scenarios. Marked `[manual-screenshot]` in tasks.md.
- **Sentry hosted MCP latency.** `npx -y @sentry/mcp-server` first-boot is slow (~10–30s). Each toggle-enable cycle re-spawns the MCP. To keep round runtime bounded, scenarios that only toggle but don't trigger a tool call rely on cached spawn (the worker keeps the MCP alive while enabled). **Mitigation:** the runner uses 90s waits for first-Slack-DM-after-enable and 60s thereafter.
- **DB queries vs API queries.** Where possible, assert via the API (decoupled from schema). For cascade-on-delete (G6.3) we must query DB directly because there's no API surfacing of removed-row counts.
- **Reveal rate-limiter reset.** The test profile compose has a single service named `agent` (worker + API in one container). Restarting it flushes the in-memory `SecretRateLimiter` map. **Decision:** between rounds, run `docker compose -f infra/docker-compose.acme.yml restart agent`. Within a round, scenarios that re-reveal wait the documented 60s.
- **Coverage limitation: `ask` for non-owner.** Out of scope here. Tracked in §Coverage gaps and planned to be subsumed by spec `0035`.
- **Snapshot of `last4`.** The round-reset block (spec §Round reset, step 9) extracts the `SENTRY_ACCESS_TOKEN` last4 from `00-baseline.json` and exports it as `$BASELINE_LAST4`, also persisted to `00-baseline-last4.txt`. Every scenario that mutates or polls the secret last4 (G4.2/G4.3, G5.3 setup+cleanup, G12.1/G12.2) references this single variable. There is no separate `secrets.json` file — `00-baseline.json` is the only baseline artefact.
- **Host tooling assumption.** The runner uses `python3` (for the round-reset script) and `jq` (for inline JSON parsing inside `lib.sh`). Both must be on the PATH where `run.sh` executes. The operator host has them today; the runner's first action is a `command -v python3 jq` check that fails fast with a clear message if either is missing.
- **Operator ergonomics during destructive R3 group.** Uninstall + reinstall in R3 requires the real `SENTRY_ACCESS_TOKEN`. The runner pauses with a clear prompt: `paste SENTRY_ACCESS_TOKEN to stdin then press Enter` — token is consumed and never persisted to disk.
- **Failure recovery without losing in-flight artifacts.** Fail-fast halts on first ✗. Artifacts up to that point are kept. The next attempt creates a fresh `run-<n>` directory (does not overwrite the failed one); the runner inspects `runs.json` to detect resumption vs fresh start. Failed runs are kept for forensic value.
