---
tags:
  - learning
  - architecture
related:
  - "[[../specs/2026-05-20-agents-md-per-instance/spec-agents-md-per-instance|spec 2026-05-20 agents-md-per-instance]]"
  - "[[claude-sdk-settings-sources-skills]]"
created: 2026-05-20
---
# Deterministic operating rules belong in the cached system prompt, not behind skill auto-load

The Claude Agent SDK announces installed skills as `<name>: <description>` lines in the preset system prompt and lets the model decide whether to read each `SKILL.md` body. That trigger is **probabilistic** — even with imperative wording ("ALWAYS consult...") in the description, the model occasionally skips a skill body. Operating rules that must apply every turn cannot rely on the trigger; they have to live in text the model literally reads every turn.

The fix is to inject the per-instance rules into the cached system prompt directly. `apps/worker/src/agent/system-prompt.ts` already had the right mechanism (it appends file content to the preset prompt via `systemPrompt.append`); the change in spec 2026-05-20 was to feed it `AGENTS.md` (operating manual) instead of `USER.md` (user bio). The skill itself still exists and still does the policy work; the difference is that the *instruction to invoke it* is now in the cached prompt, not in the skill's own description.

## Context

Caught in production when a non-developer audience received a technical-jargon reply (component name + file path + function name) despite the `fn-conduct` skill being installed and its description clearly stating "ALWAYS consult this skill at the start of every Slack thread". The SDK loaded the description line into the preset prompt but the model did not always fetch the body, so the policy never ran for some turns.

Validated end-to-end after spec 2026-05-20 shipped: same channel, same audience, same shape of message — this time `backend_tool_call` for `Skill` → `fn-conduct` fires on the first turn, deterministically, because the AGENTS.md operating rule "Toda mensagem no Slack: invocar `fn-conduct` ANTES" is in the cached prompt the model reads on every turn.

## How to Apply

- For any rule that must apply on every turn (vocabulary, mandatory skill consultation, language default, escalation policy), put the instruction in `AGENTS.md`. The worker injects it via `buildSystemPrompt(soul, agents)` and the SDK preset caches it.
- Skill descriptions are still the right place for what the skill *does*; they are NOT the right place for the only copy of an instruction that has to run every turn. The skill body can be deep; the system prompt has to surface the trigger.
- Skills installed but never invoked are wasted installs. If a skill's body has an inviolable rule, mirror that rule in `AGENTS.md` so the SDK-triggered skill body isn't the only path to it.
- Verify the wiring after any change to `system-prompt.ts` by checking the worker boot logs for `agents_md_loaded` with the expected `bytes` field; missing or zero-byte content means the cached prompt has no operating manual and the SDK auto-trigger is the only path again.
