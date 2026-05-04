---
status: superseded
superseded_by: 0050
feature: guardrails-approval
created: 2026-04-21
shipped: null
related:
  - "[[../../learnings/connectors-only-pivot]]"
---

> **Superseded** by spec [[../2026-04-27-strip-skills-and-classifier/spec|2026-04-27-strip-skills-and-classifier]] (connectors-only positioning, see [[../../learnings/connectors-only-pivot]]). The Haiku classifier, Slack approver, policy chain, and `approvals_log` table described here were removed in spec 0050. The single guardrail that survives is the connector-permission gate (per-tool dashboard toggle).

# Guardrails + Approval Flow — Spec

**Status:** Draft
**Scope:** Intercept every tool invocation from the agent backend, classify sensitivity via LLM, and require owner approval (via Slack reaction) before executing sensitive actions. Works in owner mode (approver is the requester) and worker mode (requester is someone else, approval routes to the owner's DM).

## Context

Zeno currently runs the Claude Agent SDK with `permissionMode: 'bypassPermissions'`. Every tool call executes without human review. That is acceptable while Zeno only serves the owner in a personal Slack, but it is the single blocker for using Zeno in a shared/company workspace where other people can send messages that trigger destructive actions (merging PRs, running deploy scripts, writing to external systems).

The backlog flagged this as Tier 1 item #1 — the gating feature that unlocks worker-mode usage. Related items (file reading, multichannel, allowlist pairing) are explicitly deferred to separate specs.

Design decisions settled during brainstorming:

- **Classification is LLM-driven**, not pattern-matched. Regex-based `sensitive_patterns` do not scale as new MCPs and tools are added.
- **Owner mode vs worker mode is auto-inferred** from `message.userId === approvals.owner_slack_user_id`, not chosen via config flag. One profile serves both cases.
- **Architecture uses a policy pipeline** (ordered middleware) for scalability — new policies (allowlist, rate limiting, cost tracking) plug in later without refactoring the core.
- **Approval UX is reaction-only** (👍/👎) with a configurable timeout. No textual approval parsing in MVP.

## Problem Statement

Zeno cannot safely execute tools on behalf of anyone other than the owner because there is no mechanism to (a) detect that a tool invocation is sensitive, (b) ask the owner before executing it, and (c) record what was approved for auditability.

The feature must:

1. Intercept every tool call from the Claude Agent SDK.
2. Decide whether the call needs approval, through a pipeline of composable checks.
3. Request approval from the owner via Slack (in the current thread if the owner is the requester; via DM otherwise).
4. Deny the action on timeout or channel failure (fail-safe).
5. Record every decision (allow or deny, with reason) in a persistent audit log.

## Non-Goals

- **User allowlist / DM pairing.** Anyone can talk to Zeno today; only the owner can approve sensitive actions. A pairing system (who can *converse* with Zeno) is a separate future spec.
- **Approval persistence across container restarts.** In-memory only. If the container restarts while an approval is pending, the session dies and the user repeats the request.
- **"Approve for this session" / batching approvals.** Each sensitive tool call asks independently in MVP. Session-level approval is deferred (it is the exact pattern that has historically eroded security in similar tools).
- **Textual approval parsing.** Only emoji reactions. If the user types "aprova" the bot keeps waiting.
- **Approval revision.** Once a reaction is received, the decision is firm. Users cannot remove the reaction and replace it.
- **Classifier caching.** Each sensitive call hits the classifier fresh. Haiku is cheap enough for MVP.
- **Automated classifier quality evals.** Unit tests with fixed inputs cover correctness; false-positive / false-negative rate evaluation is a future spec if it becomes a real problem.
- **Non-Slack channels.** The `Channel` interface is extended with `waitForReaction`, but only the Slack adapter implements it in this spec. Telegram / WhatsApp will implement it when those channels ship.

## Constraints

- **SDK integration point is fixed.** The `@anthropic-ai/claude-agent-sdk` exposes `canUseTool` as the only hook for approval decisions. All policy logic must run inside that callback.
- **Stateless per turn.** The current agent core does not maintain state between turns for a thread beyond the session ID. Guardrails must not introduce cross-turn state coupling beyond the audit log.
- **Docker-only runtime.** All code runs inside the worker container. The classifier makes outbound HTTPS to the Anthropic API; no extra infrastructure required.
- **Fail-safe on infrastructure failure.** If the classifier or the approver channel fails, the action is denied — never auto-allowed.
- **Config lives in `profiles/<name>/config.yaml`.** Validated with `zod` at boot. Missing `approvals` section disables guardrails entirely (legacy / dev fallback, with a loud warning log).

- **Audit table columns** (intent, exact types in plan/migration):
  `id`, `profile`, `correlation_id`, `thread_id` (nullable), `requester_user_id`, `decider_user_id` (nullable — null when auto-allow or fail-safe deny), `tool_name`, `tool_input` (JSON string), `policy_that_gated` (`always_sensitive` | `read_only` | `classifier` | `auto_allow` | `timeout` | `classifier_unavailable` | `approver_channel_error`), `classifier_reason` (nullable), `decision` (`allow` | `deny`), `decision_reason`, `created_at`.
- **Existing code style constraints apply.** No `any`, no `biome-ignore`, single quotes, semicolons, kebab-case files.
- **Architecture must honor ports & adapters.** All guardrail *policy* lives in a dedicated module (`GuardedBackend`) that implements the same `AgentBackend` interface. `ClaudeCodeBackend` stays focused on SDK mechanics but MUST grow a single new constructor option: `canUseTool?: CanUseTool` (the SDK's hook type). `GuardedBackend` owns an inner `ClaudeCodeBackend` instance and injects the policy pipeline as that `canUseTool` callback. `AgentInput` stays unchanged. This is the only wiring mechanism allowed — do not pass the callback via `AgentInput`, do not bypass `ClaudeCodeBackend` entirely.

- **Canonical pipeline order** (stated once, here):
  ```
  1. alwaysSensitiveGate   — absolute override; runs first so read-only bypass can never override "always"
  2. readOnlySkillBypass   — skips classifier for tools owned by read_only skills
  3. classifierGate        — Haiku classifies remaining tool calls
  4. approverGate          — invoked by alwaysSensitive or classifier when approval is required
  5. auditLog              — terminal; always runs, records the effective decision
  ```
  All scenarios in this spec follow this order.

- **Backend assembly decision point.** `AgentCore.bind()` is responsible for deciding whether to wrap: at construction, it inspects the loaded profile config. If `approvals` section is present, it constructs a `GuardedBackend(new ClaudeCodeBackend({ ... }))` with the policy pipeline wired. If absent, it constructs a bare `ClaudeCodeBackend` with `permissionMode: 'bypassPermissions'` as today and logs a warning. The wrapping decision lives in one place.

## User Stories / Scenarios

### Scenario 1 — Owner mode, auto-allow (safe tool)

1. Owner sends `@Zeno read the last commit message` in a thread.
2. SDK decides to call `Bash(command="git log -1 --pretty=%B")`.
3. `canUseTool` fires → pipeline runs (order per Constraints):
   - `alwaysSensitiveGate` → no match
   - `readOnlySkillBypass` → no match
   - `classifierGate` → Haiku returns `{ sensitive: false, reason: "read-only git command" }` → pass-through
   - `audit` (terminal) → logs `decision=allow, policy_that_gated=auto_allow`
4. Tool executes. No user-facing delay beyond classifier latency.

### Scenario 2 — Owner mode, approval in thread

1. Owner sends `@Zeno merge PR #42`.
2. SDK decides to call `mcp__github__merge_pull_request(pr=42)`.
3. `alwaysSensitiveGate` matches (`mcp__github__merge_pull_request` is in `config.approvals.always_sensitive`).
4. Zeno posts in the same thread: *"Can I run `mcp__github__merge_pull_request(pr=42)`? 👍 aprova / 👎 nega"*.
5. Owner reacts 👍 within timeout.
6. `audit` logs `decision=allow, decider_user_id=<owner>, policy_that_gated=always_sensitive`.
7. Tool executes.

### Scenario 3 — Worker mode, approval via DM

1. `@colleague` (user ID ≠ owner) sends `@Zeno deploy to staging` in `#engineering`.
2. SDK decides `Bash(command="./deploy.sh staging")`.
3. `classifierGate` returns `{ sensitive: true, reason: "deploy script" }`.
4. Zeno:
   - Posts in the `#engineering` thread: *"aguardando aprovação do owner..."* (UX feedback).
   - Opens DM with owner (via `conversations.open`) if not already open.
   - Posts in owner DM: *"@colleague asked in #engineering (link). Tool: Bash. Input: ./deploy.sh staging. Classifier: deploy script. 👍 / 👎"*.
5. Owner reacts 👍 in DM within timeout.
6. Tool executes. Zeno responds to `@colleague` in the original thread.
7. `audit` logs requester + decider separately.

### Scenario 4 — Timeout

1. Sensitive action requested. Approval posted.
2. No reaction arrives within `approval_timeout_sec` (default 300s).
3. `waitForReaction` returns `null`.
4. Pipeline emits `{ allow: false, reason: "approval_timeout" }`.
5. `audit` logs `decision=deny, policy_that_gated=timeout`.
6. Zeno posts in the original thread: *"ação cancelada (sem resposta em 5min)"*.
7. SDK turn ends with the agent being told the tool call was denied.

### Scenario 5 — Read-only skill bypass

1. User asks a question that triggers a tool in the `acme` skill (declared `read_only: true` in its `SKILL.md` frontmatter).
2. `readOnlySkillBypass` matches → `{ allow: true, reason: "read_only skill" }`.
3. Classifier is NOT called (saves tokens + latency).
4. `audit` logs `policy_that_gated=read_only`.
5. Tool executes.

### Scenario 6 — Classifier failure

1. Sensitive-candidate tool call reaches `classifierGate`.
2. HTTP call to Anthropic fails (network, 500, timeout after 10s).
3. Policy returns `{ allow: false, reason: "classifier_unavailable" }` (fail-safe).
4. `audit` logs the denial.
5. Zeno posts: *"não consegui avaliar a segurança dessa ação, cancelando"*.

### Scenario 7 — Config absent

1. Worker boots with a profile whose `config.yaml` has no `approvals:` section.
2. Boot succeeds.
3. Log emits `warn` level: *"approvals section missing in config — running unguarded"*.
4. Backend initializes without `GuardedBackend` wrapper; uses `permissionMode: 'bypassPermissions'` as today.

## Success Criteria

- All seven scenarios above pass as integration tests (with the Slack adapter mocked).
- `canUseTool` is wired into `ClaudeCodeBackend` and called for every tool invocation.
- `pnpm run quality-gate` passes (lint + typecheck + tests).
- New migration runs cleanly on a fresh DB and is idempotent (re-run = no-op).
- Manual smoke test on `profiles/default`:
  1. Owner mode auto-allow: `read the README` → no approval prompt, executes.
  2. Owner mode approval: `merge PR` → prompt appears in thread, 👍 proceeds.
  3. Timeout: sensitive request left without reaction → cancellation after 5min.
  4. Worker mode: changing `owner_slack_user_id` in config to a different user and sending from current user triggers DM routing.
- `approvals_log` table contains one row per intercepted tool call, with both allows and denies distinguishable.
- Guardrails can be disabled per profile by omitting the `approvals` section (existing dev workflow is not broken).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Classifier false negative (misses a sensitive action) | `always_sensitive` list acts as deterministic safety net for catastrophic tools (merge PR, delete, `rm -rf` patterns via Bash classification). Users add entries as they find gaps. Post-incident, the list is the fix. |
| Classifier false positive (too many prompts) | Haiku is cheap; friction of extra approvals is the correct default for MVP. If it becomes painful, future spec adds per-skill `allow_tools` whitelist or session-level approvals. |
| Prompt injection in `toolInput` tricking the classifier | Classifier prompt is isolated, receives only `{toolName, toolInput}` (no USER.md, no thread history). Instructions in the classifier system prompt are short and explicit. `always_sensitive` provides the deterministic backstop. |
| `Channel.waitForReaction` leaks listeners on crash | Listeners registered per approval, cleaned up in `finally`. Timeout clears the listener unconditionally. |
| DM to owner fails in worker mode (user never DM'd the bot) | Zeno calls `conversations.open` to force the DM channel. If that fails, fail-safe deny + log error. Manual fix: owner opens DM with bot once. |
| Owner receives many approval requests in DM (notification fatigue) | Out of scope for MVP. If it becomes a problem, future spec adds batching or summary cron. |
| Restart during pending approval loses state | Documented as a non-goal. Usage pattern expected to be short-lived approvals (< 1min most of the time); restart during approval is rare. Persistence is deferred until observed as a real problem. |
| Skill `read_only: true` incorrectly bypasses for a tool that's actually dangerous | `always_sensitive` runs first in the pipeline (see Constraints), so it overrides any `read_only` declaration. A misdeclared skill cannot bypass a tool that the owner has pinned as always-sensitive. |

## Open Questions

- [NEEDS CLARIFICATION: skill-to-tool mapping] The plan assumes tools from MCP server `foo` (invoked as `mcp__foo__bar`) belong to skill named `foo`. This heuristic only works when skill folder names match MCP server names. Currently `profiles/*/skills/*/mcp.json` is where MCP servers are declared per skill. Is the mapping always `skillName === serverName`, or do we need explicit declaration? Resolve in plan phase by reading current skill loader code.
- [NEEDS CLARIFICATION: classifier model ID] Spec uses `claude-haiku-4-5` as default. Confirm exact model string at plan time against current SDK / API docs.
- [NEEDS CLARIFICATION: Slack DM open permission] The bot's Slack app manifest must allow `im:write` and `chat:write` in DMs. Verify current manifest and document any scope additions needed in the plan.
