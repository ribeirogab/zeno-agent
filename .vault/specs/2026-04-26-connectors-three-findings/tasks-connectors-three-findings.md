---
feature: connectors-three-findings
plan: "[[plan-connectors-three-findings]]"
spec: "[[spec-connectors-three-findings]]"
created: 2026-04-26
---
# Connectors Three Findings — Tasks

**For this plan:** `[[plan-connectors-three-findings]]`

> Depends on spec 0037 Phase A infrastructure being in place. Implementation order: F#2 → F#1 → F#3.

## Phase 0 — Spec finalization (3-review loop)

### Task 0.1: Author docs

- [x] Step 1: Write `spec.md`.
- [x] Step 2: Write `plan.md`.
- [x] Step 3: Write `tasks.md`.

### Task 0.2: Review round R1

- [ ] Step 1: `spec-document-reviewer` agent against the docs cold.
- [ ] Step 2: If findings → fix → restart.

### Task 0.3: Review round R2 (cross-check)

- [ ] Step 1: Re-read `apps/api/src/lib/catalog-loader.ts`, `apps/api/src/routes/connectors.ts` (test endpoints + reveal handler), `packages/mcp-discover/src/discover.ts` and `build-config.ts`, `apps/worker/src/agent/backends/claude-code.ts` (specifically the `onInvocation` callback and how it receives tool results), `apps/worker/src/guardrails/guarded-backend.ts` (the PreToolUse hook).
- [ ] Step 2: Verify every claim about API surfaces and SDK shapes.
- [ ] Step 3: Special: verify whether `permissionDecisionReason` is reachable inside `onInvocation`; if not, update spec/plan with the fallback path.
- [ ] Step 4: If findings → reset to R1.

### Task 0.4: Review round R3

- [ ] Step 1: Fresh independent reviewer.
- [ ] Step 2: If findings → reset to R1.

### Task 0.5: Approve

- [ ] Step 1: Front-matter `status: approved`.

## Phase 1 — Finding #2 (auth check)

### Task 1.1: Schema

- [ ] Step 1: In `apps/api/src/lib/catalog-loader.ts`, add `authCheckTool: z.string().optional()` to `catalogEntrySchema`. Document inline.

### Task 1.2: discoverTools options

- [ ] Step 1: In `packages/mcp-discover/src/discover.ts`, add `DiscoverOptions { authCheckTool?: string }` interface.
- [ ] Step 2: Add 3rd arg to `discoverTools`.
- [ ] Step 3: After `listTools()` succeeds, if `options?.authCheckTool` is set AND the tool exists in the returned list, call `client.callTool({ name: options.authCheckTool, arguments: {} })` with the existing 10s timeout.
- [ ] Step 4: If the call throws or returns an MCP error indicating auth (regex covers 401/403/unauthorized/forbidden), `return classifyError(err)` (will return `errorKind: 'auth'`).
- [ ] Step 5: If success, proceed to existing return.
- [ ] Step 6: If `authCheckTool` is set but NOT in the tool list, log a warning and skip the auth check (don't fail discovery for this).

### Task 1.3: Wire through routes

- [ ] Step 1: In `POST /api/connectors/catalog/:id/test`, pass `{ authCheckTool: entry.authCheckTool }` to `discoverTools`.
- [ ] Step 2: In `POST /api/connectors/:id/test`, look up the catalog entry by `connector.catalogId` (only if `connector.source === 'catalog'`); pass `authCheckTool` from the catalog entry. Custom connectors: pass nothing (default behavior).

### Task 1.4: Sentry catalog entry

- [ ] Step 1: Add `"authCheckTool": "whoami"` to the Sentry entry in `agent/connectors-catalog.json`.

### Task 1.5: Regression test (in spec 0037 Phase A)

- [ ] Step 1: Add P1.3 in `apps/worker/tests/connectors-e2e/p1-catalog.test.ts`: boot fixture with `FIXTURE_FAIL=auth`, call `discoverTools` with `{ authCheckTool: 'read_echo' }` (the fixture's read tool). The fixture's `auth` mode returns OK on `tools/list` but errors on tool calls. Assert `errorKind: 'auth'`.
- [ ] Step 2: Add a positive companion: same call without `FIXTURE_FAIL` → returns tools normally.

### Task 1.6: Quality gate

- [ ] Step 1: `pnpm run quality-gate`. Green.
- [ ] Step 2: Confirm existing 16 tests in `apps/api/tests/routes/connectors.test.ts` still pass.

### Task 1.7: Commit

- [ ] Step 1: One commit titled `feat(connectors): authCheckTool — Test connection now validates credentials (Finding #2)`.
- [ ] Step 2: Body references spec 0038 §F2.

## Phase 2 — Finding #1 (catalog regeneration)

### Task 2.1: Extend the regenerator script

The base script already exists from spec 0037 Task 7.1 (mirror-only mode). This task **extends** it with `--fetch-from-mcp`:

- [ ] Step 1: Open `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`.
- [ ] Step 2: Parse `process.argv` for the `--fetch-from-mcp` flag.
- [ ] Step 3: When flag is set, before the mirror pass: for each catalog entry, pull its required-secret value from env (env var name = the `key` field of the first `secrets[]` entry; for Sentry that's `SENTRY_ACCESS_TOKEN`), construct a transient `Connector` and `ConnectorSecret[]`, call `discoverTools(...)` with `{ authCheckTool: entry.authCheckTool }`.
- [ ] Step 4: On success, project each tool into `{ name, description: <first sentence>, category, defaultPermission: <category default per category> }`.
- [ ] Step 5: Sort deterministically by category then name.
- [ ] Step 6: Write back the entry's `tools[]` in `agent/connectors-catalog.json` using stable JSON formatting (2-space indent, trailing newline).
- [ ] Step 7: Then run the existing mirror pass to update `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap`.
- [ ] Step 8: Without the flag, the script behaves identically to spec 0037's version (mirror only). Without the flag, the env vars are not required.
- [ ] Step 9: With the flag, abort with a clear message if any required env var is missing.
- [ ] Step 10: Add a script-header comment documenting the env-var derivation rule: "by convention, the env var name equals the `key` field of the first required `secrets[]` entry of the catalog entry. For Sentry that is `SENTRY_ACCESS_TOKEN`. If a future catalog entry has multiple required secrets or unusual ordering, this convention may need to be revisited; today the rule is simple and unambiguous because all entries are single-secret."

### Task 2.2: Run + verify

- [ ] Step 1: `SENTRY_ACCESS_TOKEN=<...> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`.
- [ ] Step 2: Inspect `git diff agent/connectors-catalog.json` — should show 8 tools removed, 22 added (or update-in-place).
- [ ] Step 3: `pnpm run quality-gate` — green; P1.5 snapshot now matches.

### Task 2.3: Commit

- [ ] Step 1: One commit titled `feat(catalog): regenerate Sentry tool list to match @sentry/mcp-server (Finding #1)`.
- [ ] Step 2: Body explains the regenerator script + how to run it on next catalog change.

## Phase 3 — Finding #3 (deny error_message)

### Task 3.1: Modify `guarded-backend.ts`

- [ ] Step 1: Open `apps/worker/src/guardrails/guarded-backend.ts`. Locate the policy-result return block (around lines 105-112) where `hookSpecificOutput` is constructed. The current code sets `permissionDecisionReason: decision.reason` on a single line, applied to both allow and deny.
- [ ] Step 2: Change that line to a conditional: `permissionDecisionReason: decision.allow ? decision.reason : 'policy_denied: ' + decision.reason`. Allow path unchanged; deny path gets the prefix.
- [ ] Step 3: Add a one-line code comment near the earlier fail-safe deny path (lines 65-74, `'guardrails: missing call context'`): `// not prefixed: internal failure, not a policy denial`.
- [ ] Step 4: Confirm via inspection that `claude-code.ts:277 extractErrorMessage` will return the already-prefixed string verbatim — no changes needed there.

### Task 3.2: Unskip P4.2 + assert

- [ ] Step 1: Locate `apps/worker/tests/connectors-e2e/p4-invocation-logging.test.ts` (created by spec 0037 with P4.2 as `it.skip`).
- [ ] Step 2: Change `it.skip` → `it`.
- [ ] Step 3: Assert: trigger a tool call that the `connector_never` policy denies; one new row exists in `connector_invocations` with `error_message LIKE 'policy_denied:%'` AND `error_message` contains `permission=never`.

### Task 3.3: Quality gate

- [ ] Step 1: `pnpm run quality-gate`. Green.

### Task 3.4: Commit

- [ ] Step 1: One commit titled `fix(connectors): annotate policy-deny rows in connector_invocations (Finding #3)`.

## Phase 4 — Stale comment cleanup

### Task 4.1: Fix comment

- [ ] Step 1: Edit `apps/api/src/routes/connectors.ts` lines 504-505 (or wherever the reveal stdout-write block lives).
- [ ] Step 2: Replace with: `// Audit: log line is written directly to the API process's stdout via process.stdout.write.\n// It does NOT flow through Pino and therefore does NOT appear in the logs table.\n// See spec 0036 §Coverage gaps and learnings/connectors-validation-findings.md.`
- [ ] Step 3: Commit (folded into Phase 1 or its own commit; either is fine).

## Phase 5 — Manual smoke (live profile)

### Task 5.1: Deploy to live profile

- [ ] Step 1: `docker compose -f infra/docker-compose.<profile>.yml build` (incremental).
- [ ] Step 2: `docker compose -f infra/docker-compose.<profile>.yml restart agent`.
- [ ] Step 3: Confirm API up via `curl -o /dev/null -w '%{http_code}' http://localhost:3001/api/auth/me` returning 401.

### Task 5.2: Run affected scenarios from `tmp/0036-validation/`

- [ ] Step 1: Re-auth via `tmp/0036-validation/reset.sh` (round number 4 or higher).
- [ ] Step 2: Run G1.4 (catalog test bad token) — expected: now `ok: false, errorKind: 'auth'`.
- [ ] Step 3: Run G1.5 (catalog test real token) — expected: `ok: true`, 22 tools.
- [ ] Step 4: Run G4.2 (broken command path) — expected: unchanged, still `ok: false, errorKind: 'spawn'`.
- [ ] Step 5: Run G4.3 (restore real secret) — expected: unchanged, `ok: true, lastError: null`.
- [ ] Step 6: Run G8.2 (Slack DM with `list_issues=never`) — expected: agent blocked; `connector_invocations.error_message` LIKE `policy_denied:%`.

### Task 5.3: Capture results

- [ ] Step 1: Append a `manual-smoke-report.md` under `tmp/0038-validation/`.
- [ ] Step 2: List PASS/FAIL per scenario with a one-line excerpt of the agent reply or DB row.

## Phase 6 — Spec close

### Task 6.1: Spec status flips

- [ ] Step 1: `spec.md` front-matter `status: shipped`, `shipped: <YYYY-MM-DD>`.
- [ ] Step 2: Same for `2026-04-26-connectors-test-strategy/spec.md` if Phase 8 already landed.

### Task 6.2: Update learning note

- [ ] Step 1: Append to `context/learnings/connectors-validation-findings.md`: "**Resolved in spec 0038.** All three findings have regression tests (P1.3, P1.5, P4.2) in spec 0037 Phase A. Manual smoke confirms expected new behavior on 2026-04-26 (or current date)."

### Task 6.3: Definition of Done

- [ ] All three fixes committed with their regression tests.
- [ ] Spec 0037 Phase A suite green.
- [ ] Manual smoke green for G1.4, G1.5, G4.2, G4.3, G8.2.
- [ ] No new findings.
- [ ] Branch ready to merge to main.
