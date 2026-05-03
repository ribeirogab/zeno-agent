---
status: superseded
superseded_by: 0050
feature: skill-final-reaction
created: 2026-04-24
shipped: null
related:
  - "[[../../learnings/connectors-only-pivot]]"
---

> **Superseded** by spec [[../2026-04-27-strip-skills-and-classifier/spec|2026-04-27-strip-skills-and-classifier]] (connectors-only positioning, see [[../../learnings/connectors-only-pivot]]). This spec built on the runtime skill mechanism (skill-typed final reactions); skills as a runtime concept were removed in spec 0050. If skills return bundled with connectors, a future spec will revisit how connector-bundled domain knowledge can influence the channel response.

# Skill-controlled Final Reaction — Spec

**Status:** Draft
**Scope:** Give skills a typed, reliable way to override the core's default ✅ terminal reaction on Slack, so outcome-specific reactions (e.g. 💬 for "changes requested") land as expected.

## Context

Zeno's `AgentCore` currently ends every successful execution by clearing the 👀 reaction and adding ✅ unconditionally (see `apps/worker/src/agent/core.ts:81-82`). That works for generic "command done" feedback but breaks any skill that wants a different signal for a different outcome.

The `code-review` skill in the `fn` profile needs exactly this: it should react ✅ on approve, 💬 on "changes requested", and another sensible default on "commented only". Today it attempts to do so via inline `curl` calls from inside the Claude Agent SDK subprocess, but fails because:

1. `$SLACK_BOT_TOKEN` is not reaching the SDK subprocess. `ClaudeCodeBackend` already accepts an `env` option (`apps/worker/src/agent/backends/claude-code.ts:33` — wired to the SDK at line 78), but the chat-backend instantiation sites in `apps/worker/src/index.ts` (lines 280, 285, 301) pass no `env`, so the token never propagates.
2. The triggering message's Slack timestamp (the "message ref" the Slack reactions API needs) is not reachable from inside a skill. `core.ts:wrapWithSlackContext` emits only `conversation_id`, `thread_id`, `user_id`, `current_time`. The proposed design makes this moot (see §2 below) — the skill never needs the timestamp directly.
3. Even if the two above were fixed, a race remains: the core re-adds ✅ after the agent finishes, overwriting whatever the skill tried to set.

A lightweight, typed mechanism for a skill to communicate "the final reaction is X" back to the core solves all three at once.

## Problem Statement

Skills cannot influence the terminal reaction the `AgentCore` places on the triggering Slack message. Any per-outcome reaction a skill emits is either lost to missing env/context, or silently overwritten by the core's unconditional ✅.

## Non-Goals

- Redesigning Zeno's reaction system (adding arbitrary reaction pipelines, emoji policies, per-channel overrides).
- Generalizing this to other channels — only Slack is in scope; the mechanism must be harmless when running on future non-Slack channels.
- Migrating `code-review` away from `curl` for *all* Slack interactions (e.g. posting to other channels). This spec covers only the final-reaction flow.
- Touching the approval/guardrails classifier or the 👀 lifecycle.
- **Exposing `message_ref` in the `[slack_context]` wrapper.** The map-based design in §2 delivers the full `MessageTarget` (including `messageRef`) to the MCP tool handlers directly; skills never need to read or interpolate the timestamp from their context. Any planner touching `wrapWithSlackContext` for this reason is out of scope.
- **Giving the cron-runner backend access to reaction tools.** Crons are not triggered by a user message and have no `MessageTarget` to react to. The new MCP tools are wired only to the chat-facing backend (see §3).

## Constraints

- No breaking changes to the `AgentBackend` interface — the new field on `AgentOutput` must be optional.
- The mock backend (`ZENO_BACKEND=mock`) must continue to boot and respond without ever populating the new field.
- Skill authors must be able to invoke the mechanism without shell tricks — a clean, discoverable tool that reads as a first-class Zeno capability.
- Must not require a container restart as part of the rollout decision (user gates restarts separately — see memory `feedback_no_bot_restart`).
- Must preserve the current default (✅ on success, unchanged error-path reactions).

## Proposed Design

Three coordinated changes:

### 1. New optional field `finalReaction` on `AgentOutput`

```ts
export interface AgentOutput {
  text: string;
  sessionId?: string;
  finalReaction?: string | null;  // NEW
}
```

Semantics:

| Value | Core behavior after agent completes |
|---|---|
| `undefined` | Remove 👀, add ✅ (current behavior — default) |
| `null` | Remove 👀, add nothing |
| `string` (e.g. `'speech_balloon'`) | Remove 👀, add that reaction |

The string must be a valid Slack emoji name (without colons). Invalid names cause a warn-log; core falls back to ✅.

### 2. In-process `zeno` MCP server gains three tools

The existing `zeno` MCP server (currently exposes cron tools) adds three reaction tools:

- `mcp__zeno__set_final_reaction(name: string | null)` — records the skill's choice for the current correlation. The backend reads this value right before returning `AgentOutput`.
- `mcp__zeno__slack_react(emoji: string)` — adds a reaction to the triggering message, using the bot token transparently.
- `mcp__zeno__slack_unreact(emoji: string)` — removes a reaction from the triggering message.

#### Map lifecycle

A process-local `Map<correlationId, RequestContext>` (where `RequestContext = { target: MessageTarget; finalReaction?: string | null }`) holds state for the duration of a single chat request. The lifecycle is:

1. **Build phase (boot once):** the map is created at worker startup and captured by a closure. `buildCronMcpServer` — renamed to `buildZenoMcpServer` — takes an additional dependency, the shared map + a reference to the Slack channel adapter (so `slack_react`/`slack_unreact` can call `channel.react`/`unreact` with the right `MessageTarget`).
2. **Insert (per request):** `AgentCore.bind()` inserts `(correlationId, { target })` into the map right after computing `target`, before calling `backend.query()`.
3. **Read (during skill execution):** when a skill invokes any of the three tools, the MCP handler reads `correlationId` from the tool's invocation context (the SDK exposes it via the hook context — verify at implementation time), looks up the `RequestContext`, and either mutates `finalReaction` (for `set_final_reaction`) or calls `channel.react`/`unreact` (for `slack_react`/`unreact`).
4. **Consume + clear (after `backend.query()` returns):** `AgentCore.bind()` reads `finalReaction` from the map entry, applies it in place of the unconditional `react(target, 'white_check_mark')` line, then deletes the entry in a `finally` block. Deletion must happen even on error paths so the map cannot leak.

Behavior of `set_final_reaction`:
- Called once → stored value wins.
- Called multiple times → last call wins.
- Never called → field stays `undefined` → core uses ✅ default.

This keeps the core's contract simple and gives skills a clean, typed API instead of shell `curl`.

### 3. `SLACK_BOT_TOKEN` available to the chat subprocess

`ClaudeCodeBackend` already accepts an `env` option (`apps/worker/src/agent/backends/claude-code.ts:33`, wired to the SDK at line 78) — no backend change needed. The gap is at the instantiation sites: `apps/worker/src/index.ts` builds the chat backend at lines **280, 285, 301** without passing `env`.

Pass `env: { SLACK_BOT_TOKEN: config.slack.botToken }` at **all three chat-backend instantiation sites**. Do **not** pass it to the cron-runner backend (line 217) — that backend has no `MessageTarget` and the new tools don't apply there.

Rationale: passing the token unblocks two things in one step — (a) the in-process MCP tools use it internally when calling the Slack API via the channel adapter, and (b) any skill that still needs direct `curl` access for non-reaction Slack calls (e.g. future use cases) has it available. When running with a mock/no-Slack backend (`ZENO_BACKEND=mock`), the `env` is simply not set; the MCP tools degrade gracefully (see Risks).

### 4. `code-review` skill rewrite

Replace the `curl` block in `profiles/fn/skills/code-review/SKILL.md` with calls to the new MCP tools:

```
# Skill pseudo-pattern
if outcome == changes_requested:
    mcp__zeno__set_final_reaction('speech_balloon')
elif outcome == commented:
    mcp__zeno__set_final_reaction('speech_balloon')
# approve → do nothing; default ✅ is correct
```

No more shell, no more token/timestamp interpolation in the skill.

## User Stories / Scenarios

1. **Changes requested** — A user tags Zeno in `#dev-codereview` with a PR link. Zeno reviews, finds a blocker, submits a `request-changes` review. The final Slack reaction on the parent message is **only 💬**; ✅ is absent.

2. **Approved** — Same flow, no blockers. Zeno submits `--approve`. Final reaction is **only ✅** (unchanged default).

3. **Comment-only review** — Suggestions but no blockers, skill chooses `--comment`. Skill sets `speech_balloon`. Final reaction is **only 💬**.

4. **Unrelated skill** — `acme` answers an AWS operational question. Skill never calls `set_final_reaction`. Final reaction is **✅** (default preserved).

5. **Non-Slack channel (future-proofing)** — Agent runs without `SLACK_BOT_TOKEN` (e.g. test harness, future Discord channel). `slack_react` tool returns `not_configured`; the core's default `finalReaction=undefined` path is taken. No crash.

6. **Skill error** — Skill calls `set_final_reaction('not_a_real_emoji')`. Backend records the value; core tries to `react` with it; Slack returns `invalid_name`; core logs a warning and adds ✅ anyway (graceful degradation).

## Success Criteria

- [ ] Opening a PR review that ends in `request-changes` leaves **only 💬** on the Slack parent message (no ✅).
- [ ] Opening a PR review that ends in `--approve` leaves **only ✅** (baseline preserved).
- [ ] `AgentOutput.finalReaction` is exported from `@/agent/types` and typed as `string | null | undefined`.
- [ ] `mcp__zeno__set_final_reaction`, `mcp__zeno__slack_react`, `mcp__zeno__slack_unreact` appear in the SDK's tool list (`settingSources: ['user']` already loads the skills; the MCP is always loaded).
- [ ] With mock backend (`ZENO_BACKEND=mock`), boot + reply cycle completes; no reference to Slack tokens.
- [ ] `apps/worker` unit tests cover: (a) default path adds ✅, (b) `null` adds nothing, (c) string uses the given emoji, (d) invalid string falls back to ✅.
- [ ] `code-review` skill no longer contains any `curl` invocation for reactions.
- [ ] No regression in `acme` and other skills — default reaction behavior preserved.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| In-process map leaks memory if correlation entries are never cleared. | Clear the entry in a `finally` block in `AgentCore.bind()` after the reaction step. |
| Race between concurrent requests (same process, two mentions in parallel) writing to the same key. | Keyed by `correlationId`, which is unique per request — no shared-key collisions. |
| Skill calls `slack_react` mid-flight before `set_final_reaction`, creating confusing intermediate states. | Accept as a skill-authored choice — document in `SKILL.md` pattern that the *final* reaction is owned by `set_final_reaction` only. |
| `SLACK_BOT_TOKEN` exposure to all skills broadens credential surface. | Acceptable — skills already run arbitrary Bash inside the container. The MCP wrappers are the recommended path; `curl` with the token is still possible but discouraged. |
| Invalid emoji name from a buggy skill causes the entire reaction step to throw. | Wrap the `react` call in `safe()` (already done in core) and fall back to ✅ with a warn log. |
| Mock backend breaks because it doesn't know about the new field. | Field is optional; mock continues returning `{text, sessionId?}` without change. Type is `string \| null \| undefined` where undefined = default. |

## Open Questions

One question the planner must resolve at implementation time:

- **How does the MCP tool handler access `correlationId`?** The SDK's in-process MCP tool handlers receive an invocation context — the planner must verify whether `correlationId` is surfaced there, or whether we need to thread it through another channel (e.g. a Slack-scoped closure, or setting the `correlationId` into `AgentInput.userMessage` in a way the tool can read). If the SDK doesn't expose correlationId to tool handlers, the fallback is a "current request" singleton maintained by `AgentCore.bind()` (safe because chat requests are serialized per agent core instance today). Resolve in the `plan.md`.

All design decisions confirmed in conversation on 2026-04-24:

- Mechanism: in-process MCP tool (option i).
- `finalReaction` semantics: `undefined`=default✅, `null`=nothing, `string`=that emoji.
- `SLACK_BOT_TOKEN` exposed to chat backend (3 sites); cron-runner backend stays as-is.
- Reaction MCP tools (`slack_react`, `slack_unreact`) included in scope; `code-review` skill migrates off `curl`.
