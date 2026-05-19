---
feature: connectors-three-findings
spec: "[[spec-connectors-three-findings]]"
created: 2026-04-26
---
# Connectors Three Findings — Plan

**For this spec:** `[[spec-connectors-three-findings]]`

## Approach

Three independent code fixes, each landing with its regression test. The fixes touch three different files and one shared file (the catalog JSON). Implementation order is chosen so each phase compiles and tests independently:

1. Finding #2 (auth check) is foundation: the catalog regeneration script in #1 uses the same `authCheckTool` plumbing.
2. Finding #1 (catalog regenerate) follows — runs the new script, regenerates `agent/connectors-catalog.json` and the test snapshot.
3. Finding #3 (deny error_message) is independent — touches `guarded-backend.ts` only.

Each fix is its own commit. Combined PR is small (estimated ~150 lines of code + ~80 lines of tests across the three).

## Architecture

```
                ┌──────────────────────────────────────────────────────────────────┐
                │ catalog (agent/connectors-catalog.json)                          │
                │   sentry: tools=[22 live tools], authCheckTool='whoami'          │
                └────────────────────────┬─────────────────────────────────────────┘
                                         │ read at install + test endpoints
                                         ▼
                ┌─────────────────────────────────────┐
                │ catalog-loader.ts                    │
                │   schema: + authCheckTool (optional) │
                └────────────────────────┬─────────────┘
                                         │
                                         ▼
                ┌──────────────────────────────────────────────────────────────────┐
                │ connectors.ts route                                              │
                │   POST /catalog/:id/test → discoverTools(transient, secrets,     │
                │                                          { authCheckTool })      │
                │   POST /:id/test → discoverTools(connector, secrets,             │
                │                                  { authCheckTool: lookupCatalog }) │
                └────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
                ┌──────────────────────────────────────────────────────────────────┐
                │ packages/mcp-discover/src/discover.ts                            │
                │   discoverTools(connector, secrets, options?)                    │
                │     ├─ connect + listTools (existing)                            │
                │     └─ NEW: if options?.authCheckTool                            │
                │           → callTool(authCheckTool)                              │
                │           → on auth-shaped error → return errorKind:'auth'       │
                │           → on success → return tools                            │
                └──────────────────────────────────────────────────────────────────┘

                ┌──────────────────────────────────────────────────────────────────┐
                │ apps/worker/src/guardrails/guarded-backend.ts                    │
                │   PreToolUse hook                                                │
                │     when permissionDecision === 'deny':                          │
                │       permissionDecisionReason = 'policy_denied: ' + decision.reason  │
                │   (claude-code.ts onInvocation already writes permissionDecisionReason  │
                │    verbatim to error_message via extractErrorMessage; no change there) │
                └──────────────────────────────────────────────────────────────────┘
```

## File Structure

Files **created**:

(none)

Files **modified** (extends artifact created by spec 0037):

- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` — created in 0037 Task 7.1 to mirror catalog → snapshot. **0038 extends it** with a `--fetch-from-mcp` flag: when present, the script also calls `discoverTools` (using a token from env per catalog entry, e.g. `SENTRY_ACCESS_TOKEN`) and overwrites the catalog's `tools[]` with the live result before mirroring to the snapshot. Without the flag the script keeps its 0037 behavior (mirror only).

Files **modified**:

- `apps/api/src/lib/catalog-loader.ts` — add `authCheckTool: z.string().optional()` to `catalogEntrySchema`.
- `apps/api/src/routes/connectors.ts`:
  - `POST /catalog/:id/test`: pass `entry.authCheckTool` to `discoverTools`.
  - `POST /:id/test`: look up the catalog entry by `connector.catalogId` (if `source === 'catalog'`); pass `authCheckTool` if found. Custom connectors get `undefined` (no change in behavior).
  - Fix the stale comment at lines 504–505 (replace with accurate description: "the log line is captured by Docker's stdout collector; it does not reach the `logs` table because Pino is bypassed here. See spec 0036 §Coverage gaps").
- `packages/mcp-discover/src/discover.ts`:
  - Add `DiscoverOptions` interface: `{ authCheckTool?: string }`.
  - Add 3rd argument to `discoverTools(connector, secrets, options?)`.
  - After successful `listTools()`, if `options?.authCheckTool` is set and present in the tool list, call `client.callTool({ name: options.authCheckTool, arguments: {} })` with the existing 10s timeout; classify auth-shaped errors as `errorKind: 'auth'`.
- `apps/worker/src/guardrails/guarded-backend.ts` — when `permissionDecision === 'deny'`, prepend `policy_denied: ` to `permissionDecisionReason`. The Claude Agent SDK propagates this string into the tool_result block; `claude-code.ts`'s existing `extractErrorMessage` path writes it verbatim to `connector_invocations.error_message`. No changes needed in `claude-code.ts` itself.
- `agent/connectors-catalog.json` — regenerated (22 tools, `authCheckTool: 'whoami'`).
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — regenerated to match the new catalog.

Files **NOT modified**:

- Schema migrations. No DB changes.
- Existing 16 tests in `apps/api/tests/routes/connectors.test.ts` — their mocks already accept any `discoverTools` call.

## Phase ordering

### Phase 0 — Spec finalization (3-review loop)

Standard 3-review cycle. Restart on findings.

### Phase 1 — Finding #2 (auth check)

Sub-tasks:

- 1.1: Add `authCheckTool` to catalog schema in `catalog-loader.ts`.
- 1.2: Add `DiscoverOptions` and 3rd arg to `discoverTools`.
- 1.3: Implement auth-check call after `listTools()`.
- 1.4: Wire `authCheckTool` through both `POST /catalog/:id/test` and `POST /:id/test`.
- 1.5: Add `authCheckTool: 'whoami'` to Sentry catalog entry.
- 1.6: Add P1.3 test in `apps/worker/tests/connectors-e2e/p1-catalog.test.ts` (depends on 0037 Phase A scaffolding).
- 1.7: `pnpm run quality-gate` green.
- 1.8: Commit.

### Phase 2 — Finding #1 (catalog regeneration)

Sub-tasks:

- 2.1: **Extend** `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` (created by spec 0037 Task 7.1). Add a `--fetch-from-mcp` flag handler: when present, for each catalog entry, take its `authCheckTool`-secret pair from env (e.g. `SENTRY_ACCESS_TOKEN` for the `sentry` entry — env var name documented per entry in the script header), construct a transient `Connector` and `ConnectorSecret[]`, call `discoverTools(...)`, project each result into `{ name, description: <first sentence>, category, defaultPermission: <category default> }`, and overwrite the catalog entry's `tools[]` before mirroring to the snapshot. Without the flag, the script's 0037 behavior (mirror catalog → snapshot only) is unchanged.
- 2.2: Update the script to also write the test snapshot file.
- 2.3: Run the script with a real Sentry token. Inspect the diff in `agent/connectors-catalog.json`. Confirm 22 tools, correct categories, descriptions.
- 2.4: `pnpm run quality-gate` green (P1.5 snapshot test now matches).
- 2.5: Commit.

### Phase 3 — Finding #3 (deny error_message)

Sub-tasks:

- 3.1: Modify `apps/worker/src/guardrails/guarded-backend.ts`. The current code (verified at R1) sets `permissionDecisionReason: decision.reason` unconditionally on a single line (~line 108) — there is no separate deny branch. **Change that line to a ternary**: `permissionDecisionReason: decision.allow ? decision.reason : 'policy_denied: ' + decision.reason`. The earlier fail-safe deny path (around lines 65-74, `'guardrails: missing call context'`) stays unprefixed by design — it represents an internal failure, not a policy denial; add a brief code comment to mark this exclusion intentional. The prefix flows through the SDK's tool_result encoding into `extractErrorMessage` in `claude-code.ts:277` without further changes.
- 3.2: Unskip P4.2 in `apps/worker/tests/connectors-e2e/p4-invocation-logging.test.ts` (it was committed as `it.skip` by spec 0037). Assert `connector_invocations.error_message LIKE 'policy_denied:%'` AND contains the policy reason text.
- 3.3: `pnpm run quality-gate` green.
- 3.4: Commit.

### Phase 4 — Stale comment cleanup

- 4.1: Edit `apps/api/src/routes/connectors.ts:504-505` to accurately describe the audit path.
- 4.2: Commit (folded into one of the prior commits if convenient).

### Phase 5 — Manual smoke (live profile)

- 5.1: `docker compose -f infra/docker-compose.acme.yml restart agent` to pick up the new code.
- 5.2: Re-run subset of `tmp/0036-validation/` runbook: G1.4, G1.5, G4.2, G4.3, G8.2 (the affected scenarios).
- 5.3: Verify expected new behavior:
  - G1.4 with `sk-ant-INVALID` now returns `errorKind: 'auth'` (was `ok: true`).
  - G1.5 with real token returns 22 tools (was already passing; just verify count).
  - G4.2 still works (broken command path; unaffected).
  - G4.3 still works (restore path).
  - G8.2: agent still blocked; `connector_invocations.error_message` now starts with `policy_denied:` (was `null`).

### Phase 6 — Spec status flip + final report

- 6.1: Update spec front-matter to `status: shipped`, set `shipped` date.
- 6.2: Append a one-paragraph summary to `context/learnings/connectors-validation-findings.md` noting all three findings are resolved with regression test IDs.

## Risks / Open Decisions

- **(Resolved during R1) Deny reason propagation through SDK.** Verified that `guarded-backend.ts` returns `permissionDecisionReason: decision.reason`, the SDK encodes that into the tool_result block content, and `claude-code.ts:277 extractErrorMessage` returns it. Therefore the prefix-at-source approach (modify `guarded-backend.ts`) works end-to-end with no changes to `claude-code.ts`. No fallback needed.
- **Decision: regenerator script home.** Lives under `apps/worker/scripts/` because the worker package owns connectors. **The script is plain `.mjs`** (not `.ts`) because no workspace has `tsx` or another TS-on-the-fly runner. Invoked via `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`. Not added to `package.json` scripts (avoid noise; document in script header).
- **Decision: error_message format.** `policy_denied: <reason>` chosen over `denied:` or other variants. The colon-prefix is grep-friendly and self-explanatory.
- **Open: future connector adds.** Each new connector should have an `authCheckTool` chosen during the catalog entry write. The connector-add PR template should be updated (out of scope here; tracked as a small follow-up).
- **Risk: regenerator script runs against a real Sentry account.** Token must come from env, never persisted. The script aborts if `SENTRY_ACCESS_TOKEN` is unset.
