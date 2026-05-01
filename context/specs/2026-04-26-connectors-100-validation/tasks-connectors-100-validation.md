---
feature: connectors-100-validation
plan: "[[plan-connectors-100-validation]]"
spec: "[[spec-connectors-100-validation]]"
created: 2026-04-26
---
# Connectors 100% Coverage Validation — Tasks

**For this plan:** `[[plan-connectors-100-validation]]`

> Scenario IDs follow the spec's §Test matrix (G1.1 … G12.2). Tasks are grouped by spec phase.

---

## Phase 0 — Spec finalization (3-review loop)

### Task 0.1: Author docs

- [x] Step 1: Write `spec.md`.
- [x] Step 2: Write `plan.md`.
- [x] Step 3: Write `tasks.md` (this file).

### Task 0.2: Review round R1 (independent)

- [ ] Step 1: Spawn `spec-document-reviewer` agent on `spec.md` cold.
- [ ] Step 2: Capture findings in `tmp/0036-validation/reviews/r1.md`.
- [ ] Step 3: If findings ≠ 0 → apply fixes to spec/plan/tasks → restart at Task 0.2.
- [ ] Step 4: Mark R1 clean.

### Task 0.3: Review round R2 (cross-check vs feature)

- [ ] Step 1: Re-read all referenced source files: `connectors.$id.tsx`, `connectors.index.tsx`, `apps/api/src/routes/connectors.ts`, `apps/api/src/lib/secret-rate-limit.ts`, `apps/worker/src/guardrails/policies/connector-permission.ts`, `apps/worker/src/guardrails/policies/classifier-gate.ts`, `apps/worker/src/guardrails/guarded-backend.ts`, `apps/worker/src/guardrails/policies/audit.ts`, `apps/worker/src/commands/handlers/connector-{create,refresh-tools,uninstall,update}.ts`, `packages/storage/src/repos/connectors.ts`, `packages/storage/src/repos/approvals-log.ts`, `packages/storage/src/migrations.ts`, `agent/connectors-catalog.json`.
- [ ] Step 2: For each scenario in §Test matrix verify: (a) the API endpoint and HTTP method are correct, (b) the response shape claimed matches the handler (sync vs async — does it return data, 204, or just enqueue?), (c) DB column names are accurate, (d) cascade rules and constraints reflected, (e) UI strings quoted match the actual component, (f) every async-write scenario has a deterministic poll specified.
- [ ] Step 3: Verify the stale comment at `apps/api/src/routes/connectors.ts:504-505` claiming the reveal log "is captured by the API process's stdout sink which bridges to the dbSink LogRepo" — the spec asserts (G7.1 + Open Questions) that this comment is factually wrong. Confirm the spec's claim by tracing the call path. (Correcting the comment itself is a follow-up cleanup outside this validation; record the finding so it doesn't get re-litigated.)
- [ ] Step 4: Capture findings in `tmp/0036-validation/reviews/r2.md`.
- [ ] Step 5: If findings ≠ 0 → fix → restart at Task 0.2 (full reset to R1).
- [ ] Step 6: Mark R2 clean.

### Task 0.4: Review round R3 (independent fresh)

- [ ] Step 1: Spawn a fresh `spec-document-reviewer` agent on the post-R2 docs.
- [ ] Step 2: Capture findings in `tmp/0036-validation/reviews/r3.md`.
- [ ] Step 3: If findings ≠ 0 → fix → reset to Task 0.2.
- [ ] Step 4: Mark R3 clean.

### Task 0.5: Approve spec

- [ ] Step 1: Update `spec.md` front-matter: `status: approved`.
- [ ] Step 2: Notify the user that the spec is implementation-ready.

---

## Phase 1 — Driver scaffolding

### Task 1.1: Build helpers library

- [ ] Step 1: Create `tmp/0036-validation/lib.sh` with `api`, `db_query`, `expect_eq`, `expect_in`, `expect_not_in`, `slack_send`, `slack_wait`, `sentry_id` (cached), `log`, `redact_token`.
- [ ] Step 2: Smoke each helper in isolation against the live container.
- [ ] Step 3: Commit.

### Task 1.2: Build round-reset block

- [ ] Step 1: Implement §Round reset procedure verbatim as `tmp/0036-validation/reset.sh`. The script's first executable line MUST be `source "$(dirname "$0")/lib.sh"` so the sentinel-ping helpers (`slack_send`, `slack_wait`) used at step 4.5 of §Round reset are available. (Must follow Task 1.1.)
- [ ] Step 2: Run reset and `cat tmp/0036-validation/run-1/00-baseline.json` to verify.
- [ ] Step 3: Commit.

### Task 1.3: Build runner

- [ ] Step 1: Create `tmp/0036-validation/run.sh` accepting `<n>|all|single <id>`.
- [ ] Step 2: Wire fail-fast, artifact capture, summary tsv, runs.json append.
- [ ] Step 3: Smoke with a no-op scenario.
- [ ] Step 4: Commit.

### Task 1.4: Build report builder

- [ ] Step 1: Create `tmp/0036-validation/build-report.sh` reading `runs.json` + per-round summaries.
- [ ] Step 2: Smoke with synthetic green data.
- [ ] Step 3: Commit.

---

## Phase 2 — Scenario authoring

> One sub-task per scenario. Each authoring task is "write the scenario file, run it twice deterministically, commit". Listing them in matrix execution order (= round order) so a partial implementation still produces a runnable subset.

### Task 2.1 — G1 Catalog browse + install modal

- [ ] G1.1 list page sanity (curl GET /api/connectors)
- [ ] G1.2 install modal opens for already-installed catalog entry `[manual-screenshot]`
- [ ] G1.3 required-field gate `[manual-screenshot]`
- [ ] G1.4 catalog test with bad token (curl POST)
- [ ] G1.5 catalog test with real token (curl POST)
- [ ] G1.6 modal `credentials changed` hint after edit `[manual-screenshot]`
- [ ] G1.7 modal Cancel discards `[manual-screenshot]`
- [ ] G1.8 install via Add (R3-only; depends on G6 having uninstalled first; runner prompts for token; expect HTTP 204 + poll `GET /api/connectors` until row appears, max 30s — see spec G1.8)

### Task 2.2 — G2 Detail page display

- [ ] G2.1 header fields
- [ ] G2.2 connection command/args
- [ ] G2.3 secrets last4
- [ ] G2.4 tool permissions categories + counts
- [ ] G2.5 activity feed empty state `[manual-screenshot]`
- [ ] G2.6 activity feed populated row `[manual-screenshot]`

### Task 2.3 — G7 Reveal secret

- [ ] G7.1 first reveal + audit log line
- [ ] G7.2 immediate retry → 429
- [ ] G7.3 after retry-after → success again
- [ ] G7.4 10s auto-hide `[manual-screenshot]`
- [ ] G7.5 rapid double-click toast `[manual-screenshot]`

### Task 2.4 — G8 Per-tool permission

- [ ] G8.1 PATCH list_issues→never; verify GET reflects
- [ ] G8.2 Slack DM blocked; assert via `SELECT policy_that_gated FROM approvals_log` (durable) + zero new `connector_invocations` since round start (preferred) — see spec G8.2 for exact SQL
- [ ] G8.3 PATCH back to always_allow; subsequent DM works
- [ ] G8.4 PATCH unknown tool → 404

### Task 2.5 — G9 Bulk per-category permission

- [ ] G9.1 bulk read→never (rowsAffected=6)
- [ ] G9.2 UI bulk pill = `never` `[manual-screenshot]`
- [ ] G9.3 single tool to always_allow → bulk pill = `mixed` `[manual-screenshot]`
- [ ] G9.4 bulk read→always_allow restore

### Task 2.6 — G3 Toggle

- [ ] G3.1 toggle enabled→disabled (API+DB)
- [ ] G3.2 toggle disabled→enabled
- [ ] G3.3 persistence across api restart
- [ ] G3.4 pending guard via white-box DB UPDATE
- [ ] G3.5 Slack DM with disabled → fallback, no MCP, no curl
- [ ] G3.6 Slack DM with enabled → MCP fires, invocation logged

### Task 2.7 — G4 Test connection (installed)

- [ ] G4.1 test happy path → updates lastVerifiedAt
- [ ] G4.2 force bad secret via PATCH `:id` → test fails → lastError set
- [ ] G4.3 restore secret → test → lastError clears

### Task 2.8 — G5 Refresh tools

- [ ] G5.1 modify perm + refresh → reset to defaults; **deterministic wait:** poll `lastVerifiedAt` for change (≤30s) before asserting permissions
- [ ] G5.2 confirm() dismiss path `[manual-screenshot]`
- [ ] G5.3 refresh with bad secret → error, tools intact

### Task 2.9 — G12 Error banner

- [ ] G12.1 banner appears after G4.2-induced lastError `[manual-screenshot]`
- [ ] G12.2 banner clears after restoring + retest `[manual-screenshot]`

### Task 2.10 — G10 Permission enforcement (runtime)

- [ ] G10.1 default state firing (covered effectively by G3.6 — assert linkage)
- [ ] G10.2 read=never blocks (covered by G8.2 generalized)
- [ ] G10.3 destructive write tool — **R3-only**, **operator-approval-gated**, default skip
- [ ] G10.4 owner ask → auto_allow assertion via `approvals_log` SQL (`policy_that_gated='auto_allow' AND decision='allow'`) + secondary: new `connector_invocations` row with `result='ok'`. Setup PATCH list_issues→ask, then DM, then PATCH back to always_allow. See spec §G10.4 for the full SQL.

### Task 2.11 — G11 Disable security guarantees

- [ ] G11.1 env grep empty when disabled
- [ ] G11.2 grep skills for curl-to-sentry → only the negative example
- [ ] G11.3 Slack DM coercion attempt → refusal, no curl, no invocation

### Task 2.12 — G6 Uninstall + reinstall (R3 only)

- [ ] G6.1 confirm() dismiss `[manual-screenshot]`
- [ ] G6.2 confirm() accept → DELETE → row gone, redirect
- [ ] G6.3 cascade verify (3 child tables empty for that id)
- [ ] G6.4 reinstall via runner-prompted token

---

## Phase 3 — Round 1 execution

### Task 3.1: Pre-flight

- [ ] Step 1: Run `bash tmp/0036-validation/reset.sh`.
- [ ] Step 2: Verify `tmp/0036-validation/run-1/00-baseline.json` matches expected baseline (status=enabled, no lastError, defaults).
- [ ] Step 3: Send a Slack ping DM and confirm the agent replies within 60s (proves Slack pipe is live).

### Task 3.2: Run matrix

- [ ] Step 1: `bash tmp/0036-validation/run.sh 1`.
- [ ] Step 2: Inspect `tmp/0036-validation/run-1/summary.tsv`.
- [ ] Step 3: If any ✗ → fix root cause (code or scenario) → restart Phase 3.

### Task 3.3: Round 1 acceptance

- [ ] Step 1: Confirm 100% green.
- [ ] Step 2: Append `clean: yes, run: 1` to `runs.json`.

---

## Phase 4 — Round 2 execution

### Task 4.1: Reset + ping (same as 3.1)

- [ ] Step 1: Run reset.sh.
- [ ] Step 2: Baseline check.
- [ ] Step 3: Slack ping.

### Task 4.2: Run matrix

- [ ] Step 1: `bash tmp/0036-validation/run.sh 2`.
- [ ] Step 2: Inspect summary.
- [ ] Step 3: Failure → restart Phase 3 (counter resets, both round 2 and 3 will replay).

### Task 4.3: Round 2 acceptance

- [ ] Step 1: 100% green.
- [ ] Step 2: Update runs.json.

---

## Phase 5 — Round 3 execution (includes destructive G6 + G1.8)

### Task 5.1: Reset + ping

- [ ] Step 1: Run reset.sh.
- [ ] Step 2: Baseline check.
- [ ] Step 3: Slack ping.

### Task 5.2: Operator pre-approval for G10.3 (optional)

- [ ] Step 1: Ask the operator if G10.3 (`resolve_issue` against a real Sentry issue) should run in this round.
- [ ] Step 2: If yes — record the chosen short-id and confirm a manual unresolve is acceptable. If no — mark G10.3 `skipped (operator declined)` in summary.

### Task 5.3: Run matrix

- [ ] Step 1: `bash tmp/0036-validation/run.sh 3`.
- [ ] Step 2: When the runner reaches G6, it pauses for token entry; supply `SENTRY_ACCESS_TOKEN` from secure source.
- [ ] Step 3: Inspect summary.
- [ ] Step 4: Failure → restart Phase 3.

### Task 5.4: Round 3 acceptance

- [ ] Step 1: 100% green.
- [ ] Step 2: Update runs.json.

---

## Phase 6 — Reporting + close

### Task 6.1: Build final report

- [ ] Step 1: Run `bash tmp/0036-validation/build-report.sh`.
- [ ] Step 2: Open `tmp/0036-validation/final-report.md` and skim the 3×N matrix.
- [ ] Step 3: Confirm every cell is `✓` (or `skipped` for G10.3 where operator declined).

### Task 6.2: Spec close

- [ ] Step 1: Update `spec.md` front-matter: `status: shipped`, `shipped: <YYYY-MM-DD>`.
- [ ] Step 2: Capture any non-obvious gotcha as a `context/learnings/<slug>.md` note (template at `context/templates/learning.md`).

### Task 6.3: PR

- [ ] Step 1: Branch `feat/connectors-validation`.
- [ ] Step 2: Open PR using `/open-pr`. Attach link to `final-report.md`.
- [ ] Step 3: Notify the user.

---

## Definition of Done (overall)

- [ ] Phase 0: 3 consecutive clean reviews → spec status `approved`.
- [ ] Phase 1+2: scaffolding + scenarios committed.
- [ ] Phase 3+4+5: 3 consecutive clean rounds against the live `fn` profile.
- [ ] Phase 6: report at `tmp/0036-validation/final-report.md` and spec status `shipped`.
