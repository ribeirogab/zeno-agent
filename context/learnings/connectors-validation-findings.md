---
tags:
  - learning
related:
  - "[[../specs/0036-connectors-100-validation/spec|spec 0036]]"
  - "[[../specs/0034-connectors-dashboard/spec|spec 0034]]"
  - "[[../rules/integration-tokens-in-db-only|integration tokens in DB only]]"
created: 2026-04-26
---
# Connectors validation surfaced three real findings

The 3-round end-to-end validation in spec 0036 confirmed all guardrails (disable, never-permission, security refusal) work as designed across 104 scenarios with zero failures. It also surfaced three real bugs in the project that the validation framework would have hidden if the assertions had been less curious. All three are tracked here for follow-up.

## Context

Discovered while executing spec 0036 against the live `fn` profile. Each finding is rooted in an assumption that didn't hold once the test made contact with reality.

## Finding #1 — Catalog tool list ≠ live MCP tool list

`agent/connectors-catalog.json` declares 8 Sentry tools (`list_organizations`, `list_issues`, `resolve_issue`, …) but `@sentry/mcp-server` actually exposes **22** with different names (`find_organizations`, `list_issues`, `update_issue`, `whoami`, …). Only `list_issues` exists in both.

**Effect:** A fresh catalog install seeds 8 rows. After `refresh-tools` (or any agent tool call that the catalog doesn't list), the surface reconciles to 22. Dashboard tool count shifts. Documentation built around catalog names is wrong (`resolve_issue` doesn't exist; the right tool is `update_issue`).

**Fix path:** either (a) auto-generate the catalog tool list at build time from a fresh `discoverTools` snapshot, or (b) drop the per-tool list from the catalog entirely and rely on post-install discovery — keeping only metadata (icons, secrets, transport).

## Finding #2 — `Test connection` doesn't validate credentials

Both `POST /api/connectors/catalog/:id/test` (install modal) and `POST /api/connectors/:id/test` (detail page) call `discoverTools`, which calls `tools/list` on the spawned MCP. Sentry's MCP returns its tool list **without auth**. So a user can paste any string in `SENTRY_ACCESS_TOKEN` and the dashboard's "Test" button returns ✓ with 22 tools.

**Effect:** The button is misleading — it promises "your credentials work" but only verifies "the MCP process spawns and lists tools". Real auth failure surfaces only when the agent calls a tool that hits Sentry's API.

**Fix path:** after `tools/list`, call a synthetic auth ping (e.g., `whoami` or `find_organizations`) and only return ok=true if it succeeds. Generalizable to any MCP that has a cheap auth-required call.

## Finding #3 — `connector_invocations` row written even on `PreToolUse` deny

When `connector_permission` policy returns `{allow: false, policyThatGated: 'connector_never'}`, the SDK still writes one row to `connector_invocations` with `result='error'`. We assumed (in spec 0036 cycle 2) that the deny short-circuited before the MCP was ever called and no row was written. Reality: deny short-circuits the MCP call, but `onInvocation` fires anyway with the error result.

**Effect:** Cosmetic only. The durable assertion (`approvals_log.policy_that_gated`) still tells the truth. But operators querying invocation counts to gauge tool usage will see denied calls counted.

**Fix path:** decide whether deny-events belong in `connector_invocations` or only in `approvals_log`. If they stay, surface the gating policy in the row's `error_message` so debugging is easy.

## How to Apply

When validating a feature against a live integration:

1. **Verify the catalog matches reality before relying on tool names** — start every validation pass with a `discoverTools` call and diff against the catalog. Don't write assertions that pin specific tool names unless you've confirmed they exist in the live MCP.
2. **Don't assume "Test" buttons validate auth** — for any MCP, manually run a tool-use call with a known-bad token to see what happens. If `tools/list` returns OK without auth, the test endpoint isn't actually testing.
3. **Trust durable observability paths** — `approvals_log` (DB) is more reliable than worker stdout/log greps for assertion paths, and more durable than `connector_invocations` for permission-policy outcomes (which mix runtime errors and policy denies).
4. **The spec is a hypothesis; the live system is the truth.** When they diverge, update the spec to reflect reality, then re-run the validation. Don't try to bend reality to the spec.

## Resolved 2026-04-26

All three findings resolved by [[../specs/0038-connectors-three-findings/spec]] (status: shipped). Each fix landed with a regression test in [[../specs/0037-connectors-test-strategy/spec]] Phase A:

- **#1**: catalog regenerated to match live `@sentry/mcp-server` (22 tools). Test: `apps/worker/tests/connectors-e2e/p1-catalog.test.ts` P1.5 (snapshot self-consistency).
- **#2**: `authCheckTool` field added to catalog schema; `discoverTools` calls it after `tools/list` and surfaces auth errors via the broadened classifyError regex (now matches Sentry's "Authorization Expired" phrasing). Sentry catalog uses `whoami`. Test: P1.3 (fixture `FIXTURE_FAIL=auth` mode + `authCheckTool: 'read_echo'` returns `errorKind: 'auth'`).
- **#3**: `guarded-backend.ts` PreToolUse hook prepends `policy_denied: ` to `permissionDecisionReason` on the deny branch. `connector_invocations.error_message` now distinguishes policy denies from MCP errors at a glance. Test: P4.2 (asserts `error_message LIKE 'policy_denied:%'`).

Live profile manual smoke (2026-04-26, post-rebuild):
- catalog test bad token → `{ ok: false, errorKind: 'auth' }` ✓ (Finding #2 fix)
- catalog test real token → `{ ok: true, toolCount: 22, durationMs: 1285 }` ✓
- Slack DM with `list_issues=never` → agent replied "Ação negada — connector sentry permission=never for list_issues"; DB row in `connector_invocations` has `error_message='policy_denied: connector sentry permission=never for list_issues'` ✓ (Finding #3 fix)
