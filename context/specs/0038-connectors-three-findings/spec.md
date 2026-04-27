---
status: approved
feature: connectors-three-findings
created: 2026-04-26
shipped: null
depends_on: "[[../0037-connectors-test-strategy/spec]]"
---
# Connectors Three Findings — Spec

**Status:** Draft
**Scope:** Resolve the three project bugs surfaced by the manual validation pass in spec 0036, with regression tests landed in the same change so each fix is protected by an automated check from day one.

## Brainstorm Q&A

### What are the three findings, exactly?

From `context/learnings/connectors-validation-findings.md`:

1. **Catalog tool list ≠ live MCP tool list.** `agent/connectors-catalog.json` declares 8 Sentry tools (`list_organizations`, `resolve_issue`, …); the live `@sentry/mcp-server` actually exposes 22 with different names (`find_organizations`, `update_issue`, …). Fresh installs seed 8 rows; first refresh-tools reconciles to 22.
2. **`Test connection` does not validate credentials.** `discoverTools` only calls `tools/list`, which Sentry's MCP returns regardless of token validity. Bad token → ✓ in the dashboard.
3. **`connector_invocations` row written even on `PreToolUse` deny.** Spec 0036 expected zero rows when `connector_never` blocks; reality writes one with `result='error'`. Cosmetic; the durable assertion (`approvals_log.policy_that_gated`) is unaffected.

### What's the right fix for each?

#### Finding #1

The catalog declares tool metadata (name, description, category, defaultPermission) used at install time to seed `connector_tool_permissions`. Three options were considered (recorded in §Risks, decision below):

- **(A) Drop `tools[]` from catalog entirely**, force every install to call `discoverTools` first and seed from that. Pure but requires every catalog flow to spawn the MCP. Rejected — increases install latency (~10-30s for Sentry cold start) and adds a failure mode (MCP unavailable at install time → install blocked).
- **(B) Auto-generate `tools[]` at build time** from `discoverTools` against a real MCP. Pure but needs network/real token at build time. Rejected — bad story for CI builds and forks.
- **(C) Keep `tools[]` in catalog but commit it as a reviewed snapshot of the live MCP**. Maintainer regenerates with a script when adding/upgrading a connector. PR review catches drift. **Chosen** — preserves install speed, makes drift visible.

Implementation: a new script `scripts/regenerate-catalog-tool-snapshots.mjs` (also used by spec 0037 for the P1.5 test snapshot). Run it once per connector add or upgrade. Catalog gets the 22 real Sentry tools.

#### Finding #2

`discoverTools` is currently transport-agnostic and only calls `tools/list`. Fix: optionally call a designated auth-check tool after `tools/list` succeeds, treating its failure as auth error.

Mechanism:

- Add `authCheckTool?: string` to `catalogEntrySchema` in `apps/api/src/lib/catalog-loader.ts`.
- Plumb the value through to `discoverTools` as a new optional argument: `discoverTools(connector, secrets, { authCheckTool? })`.
- After `client.listTools()` succeeds, if `authCheckTool` is provided and is in the returned list, call `client.callTool({ name: authCheckTool, arguments: {} })` with the existing 10s timeout.
- If the call returns an MCP error or an HTTP-style 401/403, classify as `errorKind: 'auth'` per the existing `classifyError`.
- If it returns OK, proceed normally.

For Sentry: `authCheckTool: 'whoami'` (returns the authenticated user; clearly fails on a bad token). The catalog test endpoint already calls `discoverTools`; no API surface change needed beyond the catalog-loader schema. The detail-page `POST /:id/test` uses the same path.

#### Finding #3

The PreToolUse hook (`apps/worker/src/guardrails/guarded-backend.ts`) denies a tool call before the MCP is invoked. The Claude Agent SDK propagates the hook's `permissionDecisionReason` into the tool_result block content, which `claude-code.ts`'s `onInvocation` callback receives as the `errorMessage` after `extractErrorMessage(block)`. Today, that reason looks like `connector sentry permission=never for list_issues` — indistinguishable shape-wise from a real MCP error to anyone reading `connector_invocations`.

Two shapes for the fix:

- **(A) Skip the insert on policy deny.** Cleanest for "what's an invocation". But operators auditing tool usage lose the deny signal (have to cross-ref `approvals_log` themselves).
- **(B) Insert with explicit `error_message` containing the policy reason, prefixed.** Preserves the row; makes the cause visible. Slightly noisier but preserves continuity. **Chosen** — operators get one source for "what tool calls happened" with policy denies clearly distinguishable.

**Concrete implementation** (committed up-front to avoid R2 surprises):

The cleanest insertion point is the hook itself, not the invocation callback. In `apps/worker/src/guardrails/guarded-backend.ts`, when the hook's `permissionDecision === 'deny'`, prepend `policy_denied: ` to `permissionDecisionReason` before returning. The SDK then propagates this already-prefixed string into the tool_result block; `onInvocation` writes it verbatim to `connector_invocations.error_message` via the existing `extractErrorMessage` path. No changes needed in `claude-code.ts`.

This means:
- For deny: `error_message` becomes e.g. `policy_denied: connector sentry permission=never for list_issues`.
- For real MCP errors: `error_message` is the raw error text (no `policy_denied:` prefix; it never went through the deny path).
- For success: `error_message = null` (unchanged).

The prefix-at-source approach is simpler than detecting deny shape post-hoc and avoids any heuristics in `claude-code.ts`. Verified against `guarded-backend.ts:107-108` (where `permissionDecisionReason: decision.reason` is set) — the change is a 1-line transformation.

### Why fix all three in one spec / one PR?

They're related by surface (connectors), they all need the same regression-test infrastructure (Phase A from spec 0037), and they're each small enough that a separate spec each would be ceremony. One spec, one PR, three commits (or one bigger commit with clear sectioning).

### Why does this spec depend on 0037?

The acceptance criteria require regression tests that land at the same time as the fix. Those tests live in the Phase A suite from 0037. So 0037 Phase A infrastructure must exist first.

If 0037 isn't ready, this spec waits. We don't fix bugs without protection.

### What about backward compat?

- **Catalog regeneration (#1):** existing installed connectors are unaffected — their DB rows stay. New installs get the new 22 tools. The 8 → 22 transition for any existing Sentry connector happens naturally on the next `refresh-tools`.
- **`authCheckTool` (#2):** field is optional. Catalog entries without it behave exactly as today. Sentry gets `authCheckTool: 'whoami'`.
- **Deny error_message (#3):** changes the meaning of `connector_invocations.error_message` for deny rows from `null` to a specific string. Anyone querying `WHERE error_message IS NOT NULL` to find "real" errors will start seeing denies. Documented in the migration note inside the commit.

### Should the deny rows be filterable?

Considered adding a new column like `policy_denied BOOLEAN` to `connector_invocations`. Rejected as YAGNI for this spec — operators can grep `error_message LIKE 'policy_denied:%'`. If the dashboard ever needs to filter denies separately, it's a one-line schema migration in a follow-up.

## Context

Spec [0036](../0036-connectors-100-validation/spec.md) shipped a 3-round manual validation pass against the live `fn` profile and surfaced these three findings. They were documented in `context/learnings/connectors-validation-findings.md` with fix paths but no implementation. None are security-critical; all are user-facing or cosmetic. Without fixes:

- Operators see misleading tool counts (8 → 22) right after install.
- The "Test connection" button accepts invalid tokens silently.
- Audit/usage queries against `connector_invocations` mix MCP errors with policy denies.

Each fix is small. Together with their regression tests they make the connectors feature ready to merge without a known-defects asterisk.

## Problem Statement

Three known defects in the connectors feature need to be:

1. Fixed in code.
2. Covered by automated regression tests so they cannot silently come back.
3. Validated by re-running the manual smoke (spec 0036) on the affected scenarios.

This spec answers: what changes, where, with what tests, and how the fix is validated.

## Non-Goals

1. **Refactoring the catalog format.** No new schema fields beyond `authCheckTool`.
2. **Adding a new column to `connector_invocations`** for deny rows. Use existing `error_message`.
3. **Migrating the existing live `fn` Sentry connector** to use the new catalog directly. The existing DB row keeps its 22 already-discovered tools (post-G6 reinstall in 0036 R3 reset to 8 catalog seeds; manual `refresh-tools` will re-reconcile). The catalog regeneration in this spec means **future installs** get 22 from the start.
4. **Building Phase B / Phase C of the test strategy.** Out of scope; lives in 0037 (deferred).
5. **Fixing other findings or bugs not surfaced by 0036.** This spec is bounded.
6. **Changing the catalog test endpoint behavior beyond the auth check.** No new endpoints, no shape changes.

## Constraints

- **Each fix lands with its regression test.** The PR contains both. No "fix now, test later".
- **Quality gate green** at every commit boundary. Use `pnpm run quality-gate`.
- **Manual smoke** (spec 0036) re-run for the affected scenarios before merge: G1.4, G1.5, G4.2, G4.3, G8.2 must pass on the live profile after the changes are deployed via `docker:up`.
- **No breaking changes** to public API shapes. The `discoverTools` signature change (adding `options?` arg) is a backward-compatible addition.
- **The stale code comment** at `apps/api/src/routes/connectors.ts:504-505` (cited in spec 0036 §Open Questions as factually wrong about `dbSink LogRepo`) is corrected in this PR as part of touching nearby code. Optional but cheap.

## User Stories / Scenarios

### Finding #1 — catalog regeneration

| ID | Description |
|---|---|
| F1.1 | Run `SENTRY_ACCESS_TOKEN=<real-token> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` (script created in spec 0037 Task 7.1; **0038 extends it** with a `--fetch-from-mcp` flag that, when set, calls `discoverTools` per catalog entry instead of mirroring the existing JSON, and writes both `agent/connectors-catalog.json` and `__snapshots__/catalog-tools.snap` from the live results). The script is invoked via plain `node`; no `package.json` script alias added (per spec 0037's decision). |
| F1.2 | After regeneration, `pnpm test --filter @zeno/api` passes (existing 16 tests in `connectors.test.ts` are not catalog-pinned). |
| F1.3 | After regeneration, `pnpm --filter @zeno/worker test --testPathPattern=connectors-e2e` passes including spec 0037's P1.5 (snapshot matches). |
| F1.4 | Reinstalling Sentry from the dashboard (`POST /api/connectors` with `source:'catalog'`) seeds 22 tools immediately, without needing a manual `refresh-tools` to reconcile. **Validated manually via spec 0036 G6.4 + G1.8.** |

### Finding #2 — auth check

| ID | Description |
|---|---|
| F2.1 | `apps/api/src/lib/catalog-loader.ts` `catalogEntrySchema` is extended to accept optional `authCheckTool: z.string()` (this field is **not yet present** in the live schema; F#2 adds it as part of the same commit). |
| F2.2 | Sentry catalog entry has `authCheckTool: 'whoami'`. |
| F2.3 | `discoverTools(connector, secrets, { authCheckTool: 'whoami' })` after a successful `tools/list`: calls `whoami`. If `whoami` returns an error containing 401/403/auth-related text, returns `{ errorKind: 'auth', error: <message> }`. If `whoami` returns OK, returns normally. |
| F2.4 | Existing call sites (`POST /catalog/:id/test`, `POST /:id/test`) pass `authCheckTool` from the catalog entry. `POST /:id/test` looks up the catalog entry via `connector.catalogId` (the field already exists on the `Connector` DB row from spec 0034 — no schema change). Custom connectors (those with `source='custom'`) get `undefined` and skip the auth check. |
| F2.5 | Existing 16 API tests in `connectors.test.ts` pass without changes (they mock `mcp-discover`; the new optional argument has a default). |
| F2.6 | New test in spec 0037's Phase A (P1.3) — at 0037 ship time committed as `it.skip`. This spec (0038) **unskips P1.3 in the same commit as F#2 fix** and asserts: with the fixture in `FIXTURE_FAIL=auth` mode (per spec 0037 §Constraints, the auth mode makes `tools/list` succeed but any `tools/call` return Unauthorized), `discoverTools` with `authCheckTool: 'read_echo'` returns `{ errorKind: 'auth' }`. Without the F#2 fix, the same call would return success (the regression bait). |
| F2.7 | When `authCheckTool` is set on the catalog entry but the named tool is **not present** in the live `tools/list` response (catalog drift), `discoverTools` logs a warning and skips the auth check rather than failing — preserves discovery for the operator while flagging the misconfiguration in logs. (Implementation detail in `mcp-discover` per Task 1.2 Step 6.) |
| F2.8 | **Manual smoke (spec 0036 G1.4 + G1.5):** dashboard install modal with `sk-ant-INVALID` returns `ok: false, errorKind: 'auth'`; same with the real token returns `ok: true`. |

### Finding #3 — deny error_message

| ID | Description |
|---|---|
| F3.1 | `apps/worker/src/guardrails/guarded-backend.ts` is modified at the policy-result return block (around lines 105-112): `permissionDecisionReason` becomes `decision.allow ? decision.reason : 'policy_denied: ' + decision.reason`. The unconditional `permissionDecisionReason: decision.reason` line is conditionalized on the deny case; allow path is unaffected. The fail-safe early-return at lines 65-74 (`'guardrails: missing call context'`) is **deliberately not prefixed** — it's an internal failure, not a policy denial. The Claude Agent SDK propagates the prefixed string into the tool_result block; `claude-code.ts:277 extractErrorMessage` returns it verbatim; `onInvocation` writes it to `connector_invocations.error_message` unchanged. **No code changes in `claude-code.ts`.** |
| F3.2 | Successful tool calls write `error_message=null` (unchanged). |
| F3.3 | MCP-level errors (network, timeout, protocol error) write the original error message without the `policy_denied:` prefix (unchanged). |
| F3.4 | New test in spec 0037's Phase A (P4.2): trigger a `connector_never` deny via the policy + `claude-code` backend; assert one row exists with `error_message LIKE 'policy_denied:%'`. |
| F3.5 | **Manual smoke (spec 0036 G8.2):** PATCH `list_issues` to `never`, send DM, expect agent reply with deny reason; query DB and confirm `connector_invocations` row has `error_message='policy_denied: connector sentry permission=never for list_issues'`. |

## Success Criteria

- All three fixes implemented, each with at least one new regression test in spec 0037's Phase A suite.
- `pnpm run quality-gate` green.
- Manual smoke for the affected scenarios (G1.4, G1.5, G4.2, G4.3, G8.2) green via the existing `tmp/0036-validation/` runbook.
- Catalog regeneration script committed and runnable.
- `agent/connectors-catalog.json` updated to reflect the 22 live Sentry tools.
- The stale comment at `apps/api/src/routes/connectors.ts:504-505` corrected.
- Spec passes 3 review rounds without findings.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Catalog regenerator script needs a real Sentry token to run | Script accepts `SENTRY_ACCESS_TOKEN` from env; documented in the script's header. CI doesn't run the script — it's a developer/maintainer tool. The committed snapshot is what CI tests against. |
| `whoami` not present in some MCPs (e.g., a future fixture) | `authCheckTool` is optional. Connectors without it skip the auth check (back to current behavior). The fixture echo MCP can have `read_echo` registered as its `authCheckTool` in the test catalog. |
| Auth-check tool itself returns unexpected error shape | `classifyError` already buckets via regex; if `whoami` returns `Unauthorized` or `403` or similar, we get `auth`. If it returns a network error, we get `network`. Worst case: classified as `unknown`. The test `errorKind` enumeration is finite and covered by 0037 P1 scenarios. |
| `claude-code.ts` `onInvocation` doesn't have direct access to `permissionDecisionReason` | Need to verify during implementation. If the SDK doesn't surface it on the tool_result, the alternative is to write a fixed string `policy_denied: deny` and rely on `approvals_log` for the precise reason. Documented as a fallback in the implementation note. |
| Existing live `fn` Sentry connector has 22 tools already (post-0036 G6.4); regenerated catalog has 22 tools too — but the **names** in the live DB row differ from what the catalog seeded after G6.4 reinstall (the reinstall seeded the OLD 8-tool catalog; live MCP reconciled to 22 via `refresh-tools`) | The regenerated catalog now has the same 22 names as the live MCP. After this PR is deployed, a fresh install would seed the 22 directly. The existing connector keeps its 22 (no reseed needed). No migration needed. |
| Quality gate runs the new tests but a real Sentry MCP isn't available in CI | The new tests use the fixture echo MCP (spec 0037 Phase A), not real Sentry. CI is fine. |

## Open Questions

All resolved during drafting.

- **(Resolved) Tool result shape for policy deny.** Need to read `claude-code.ts` during implementation to confirm where `permissionDecisionReason` lands. If unavailable on the result object, fall back to a fixed string per F3 fallback note.
- **(Resolved) Should the existing live Sentry connector get a reseed?** No. Existing rows untouched; the value of this spec for existing installs is the auth-check behavior + the future-install correctness.
- **(Resolved) Two fields with similar purpose: `error_message` vs `decisionReason` in `approvals_log`.** They're different surfaces (`connector_invocations` for tool-call history, `approvals_log` for guardrail audit). Both keep their roles; the F3 fix only touches `connector_invocations`.
- **(Resolved) What if the auth check itself times out?** Classified as `errorKind: 'timeout'`. Consistent with existing `discoverTools` timeout handling.

## Coverage gaps (acknowledged)

- **Real-MCP version drift.** When `@sentry/mcp-server` ships a new tool list, the catalog goes stale until a maintainer runs the regenerator. Detection: the next manual smoke (spec 0036) would reveal new/missing tools. Mitigation: document the regenerator step in the connector-add PR template (out of scope for this spec).
- **Other connectors don't have an `authCheckTool` set.** Currently only Sentry has one. Adding more catalog entries means picking a sane auth check per MCP. Documented in the `authCheckTool` field's help text.

## Review procedure

Same protocol as spec 0036 / 0037: 3 consecutive review rounds without findings. R1 independent reviewer cold, R2 cross-check vs codebase, R3 fresh independent. Restart on findings.

## Implementation order

After Phase 0 (review) approves the spec, the implementation runs in this order:

1. **Phase 1 — Finding #2** (auth check). Smallest change, most user-facing impact, foundation for the F1 catalog regeneration script (which uses the same auth machinery). Lands with P1.3 fixture-mode test from spec 0037.
2. **Phase 2 — Finding #1** (catalog regeneration). Depends on Phase 1 having `authCheckTool` plumbing (so the script verifies the regenerated tool list authenticates). Lands with P1.5 snapshot test from spec 0037.
3. **Phase 3 — Finding #3** (deny error_message). Independent of the other two. Lands with P4.2 test from spec 0037.
4. **Phase 4 — Stale comment cleanup.** One-liner.
5. **Phase 5 — Manual smoke** (spec 0036 affected scenarios) on the live profile.
6. **Phase 6 — Final commit + spec status flips.**
