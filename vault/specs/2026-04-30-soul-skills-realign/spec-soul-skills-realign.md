---
status: draft
feature: soul-skills-realign
created: 2026-04-30
shipped: null
---
# Spec 0060 — SOUL realignment + skill awareness restoration

**Status:** Draft
**Scope:** Make skills functional at runtime by (a) configuring the Claude Agent SDK to inject the skill listing into the system prompt, and (b) updating SOUL.md to acknowledge skills as a first-class concept again. Result: when a Slack message matches `code-review`'s description, the agent reads the skill body and follows its templates instead of freelancing.

## Context

Spec 0049 retired skills and rewrote SOUL.md with a **`## Skills (deferred)`** section telling the agent skills aren't part of how it works. Spec 0052 reintroduced skills as DB-managed playbooks materialized to `~/.claude/skills/<name>/SKILL.md` and announced the Claude Agent SDK auto-discovers them via `settingSources: ['user']`. **The SOUL.md was never updated.**

The bug surfaced live on 2026-04-30: a `@zeno-agent` mention with a `github.com/.../pull/12` URL triggered a code review where the agent submitted a freelance multi-sentence GitHub body and a freelance Slack reply — completely ignoring the four templates (`A: lgtm`, `B/C/D: structured shapes`) defined in `profiles/<example>/skills/code-review/SKILL.md`. Worker logs show the agent's tool calls were `ToolSearch → get_pull_request → create_and_submit_pull_request_review` with **zero `Skill` invocations**.

Two independent failure modes contribute, both rooted in spec 0052 not closing the loop with the SDK and SOUL.md:

1. **Bare-string system prompt skips skill listing injection** (root cause). The Claude Agent SDK type definition at `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` documents two `systemPrompt` shapes: `string | string[]` (custom — replaces the default preset entirely) and `{ type: 'preset', preset: 'claude_code', append?, excludeDynamicSections? }` (default-with-additions). Only the preset shape injects the skill listing block (`<skill-name>: <truncated-description>` per-skill, budget governed by `skillListingMaxDescChars` default 1536 and `skillListingBudgetFraction` default 0.01 = 1% of context). Today `apps/worker/src/agent/backends/claude-code.ts:106` passes `systemPrompt: input.systemPrompt` where `input.systemPrompt` is a plain string from `apps/worker/src/agent/system-prompt.ts:54`. Result: SDK sees a custom prompt and silently drops the skill listing. The agent's prompt has zero awareness of `code-review`, `sentry-fix`, or `zeno-development` even though they're materialized on disk and `settingSources: ['user']` triggers FS discovery.

2. **SOUL.md still says "Skills (deferred)"** (compounding cause). Lines 39–44 of `agent/SOUL.md`:

   > ## Skills (deferred)
   >
   > Skills as a runtime concept — domain-knowledge files telling you "for org X use repo Y" — are **not part of how you work right now**. They may return later, possibly bundled with connectors. Until that lands, treat the connectors and the user's request as the only inputs to your reasoning.

   This is a strong negative instruction. Even after fix #1 makes the skill listing visible in the prompt, the SOUL would actively contradict it ("ignore those skills you see — they're deferred"). The agent's behavior on a contradictory prompt is undefined, but in practice the explicit narrative wins over the structured listing.

## Problem Statement

Skills are silently dead at runtime. The operator authored thoughtful SKILL.md templates with strict shape contracts (Templates A/B/C/D for code-review GitHub body; structured Slack reply shape; pre-submit emoji/header lint), and at runtime the agent ignores all of them. Two consequences:

- **Code-review output drifts** — multi-sentence praise, missing review URL, wrong @-mention target, no template adherence. Defeats the entire purpose of `code-review`.
- **Operator trust erodes** — every PR review needs manual format-correction, undermining the "delegate to @zeno-agent" workflow the skills were designed to enable.

## Non-Goals

- **Out of scope: redesigning the skill system.** Spec 0052's storage + materialization + auto-discovery shape stays. Only the SDK option shape and SOUL.md text change.
- **Out of scope: `excludeDynamicSections` decision.** Initial implementation keeps the `claude_code` preset's dynamic sections (cwd, git status, harness intro) ON. If the Claude Code persona leaks into Zeno's voice (e.g., agent introduces itself as "Claude Code"), a follow-up flips this flag. Decision deferred to E2E observation, not pre-decided.
- **Out of scope: linking specific skills to specific connectors via `connector_skills`.** Spec 0052's connector-driven skill body injection (pre-tool-use hook) already exists. Whether `code-review ↔ github-app-acmebooks` should be linked in DB is a separate decision the operator can make in `/connectors/<id>` UI without a spec. The fix here makes auto-discovery work — connector linking is defense-in-depth, not the primary fix.
- **Out of scope: changing the four templates in `code-review/SKILL.md`.** Templates are correct; the runtime just isn't reading them. Fix is upstream of the templates.
- **Out of scope: any UI changes.** Pure runtime + identity-text fix. Dashboard untouched.
- **Out of scope: `skillListingMaxDescChars` / `skillListingBudgetFraction` tuning.** Defaults (1536 chars per skill, 1% of context) are fine for v1. Tune only if a real skill description gets truncated to uselessness.

## Constraints

- **No SDK version bump.** Stay on `@anthropic-ai/claude-agent-sdk@0.2.110` — the preset shape exists at this version (verified in `node_modules/.pnpm/@anthropic-ai+claude-agent-sdk@0.2.110_zod@4.3.6/.../sdk.d.ts`).
- **Backwards-compatible at the function signature level.** `buildSystemPrompt(...)` is consumed by `apps/worker/src/index.ts:174,180` (and possibly tests). Either change the return type and update all callers in the same commit, or keep the existing string return and adapt at the call site in `claude-code.ts`. Pick the cleaner path during implementation.
- **No new tests in apps/dashboard.** Dashboard untouched, no test churn there.
- **E2E test on the live `zeno-agent` container is the contract acceptance.** Open a real test PR in `AcmeBooks/ecommerce-frontend` (PR title prefixed `[zeno-test]` to mark it disposable), `@zeno-agent` mention in `#C0EXAMPLE000` Slack channel, validate the response shape against Templates A/B/C/D + the Slack reply shape from `code-review/SKILL.md`. Container is already running on port 3001 (built from main).
- **No skill content changes.** SKILL.md files in `profiles/<example>/skills/` are out of scope. Only `agent/SOUL.md`, `apps/worker/src/agent/system-prompt.ts`, and `apps/worker/src/agent/backends/claude-code.ts` change in this spec.
- **Constitution principles:** YAGNI (no skill-listing tuning, no preset variations until proven needed), Reversibility (each commit independently buildable), Single source of truth (SDK preset is authoritative for skill awareness; SOUL.md describes intent, not mechanism).

## User Stories / Scenarios

1. **Operator mentions @zeno-agent on a PR review request.** Slack message: `@reviewer @zeno-agent <github.com/Org/repo/pull/N>` + PR description. Agent's system prompt now contains a skill listing block including `code-review: Review pull requests on GitHub following Acme's git workflow...`. The description matches the trigger, the agent reads `~/.claude/skills/code-review/SKILL.md`, follows Template A/B/C/D, submits review with `gh api` + `gh pr review`, and the auto-posted Slack reply matches `<@USER_ID> <verdict> · <counts> · <review-url>`.

2. **Operator mentions @zeno-agent on a Sentry issue.** Same path: `sentry-fix` is in the listing, description matches, agent reads + follows the skill.

3. **Operator asks for something with no matching skill.** Listing has skills but none match — agent falls through to connectors (existing behavior). No regression.

4. **Operator deletes a skill via `/skills` dashboard.** Materializer regenerates `~/.claude/skills/`, ProfileWatcher reloads AgentCore, next turn's prompt has the updated listing without the deleted skill. (This already works post spec 0052; we're not breaking it.)

## Success Criteria

**Phase A — system prompt SDK shape:**
- [ ] `apps/worker/src/agent/backends/claude-code.ts:106` passes `systemPrompt: { type: 'preset', preset: 'claude_code', append: input.systemPrompt }` instead of bare `input.systemPrompt`.
- [ ] `apps/worker/src/agent/system-prompt.ts:buildSystemPrompt` either returns a string (and the wrap happens at the call site) or returns the option-shape directly. Implementer picks; both are correct.
- [ ] `apps/worker/tests/` has at least one test that asserts the SDK call site uses the preset shape (e.g., spy on the `query()` options and check `systemPrompt.type === 'preset'`).
- [ ] Typecheck green; existing worker tests stay green.

**Phase B — SOUL.md realignment:**
- [ ] `agent/SOUL.md` no longer contains the literal substring `Skills (deferred)` nor the "are not part of how you work right now" sentence.
- [ ] `agent/SOUL.md` has a **positive** `## Skills` section (3–6 lines) describing skills as: markdown playbooks the SDK auto-announces each turn; when a description matches the request, the agent **reads the SKILL.md and follows its instructions literally**, including any output-format templates; skills override prose instincts when they exist.
- [ ] No other section of SOUL.md mentions "deferred" or "spec 0050" framing.

**Phase C — regression guard test:**
- [ ] New test in `apps/worker/tests/agent/system-prompt.test.ts` (or expanded existing test) that asserts the buildSystemPrompt+SDK-option pipeline produces a `systemPrompt` of shape `{ type: 'preset', preset: 'claude_code', append: <string-containing-soul-content> }`. Lock the contract so a future refactor that reverts to bare string fails CI.
- [ ] New CI lint test (e.g., `apps/worker/tests/agent/soul-content.test.ts`) that reads `agent/SOUL.md` from disk and asserts: (a) does NOT contain `'deferred'` within 100 chars of `'Skills'` (case-insensitive); (b) DOES contain a `## Skills` markdown header without `(deferred)` qualifier.

**Phase D — E2E live test against zeno-agent container (the contract acceptance):**
- [ ] Open at least 2 disposable test PRs in `https://github.com/AcmeBooks/ecommerce-frontend` with title prefix `[zeno-test]`. PRs are minimal (a one-line README change + maybe a typo fix in a comment) — designed to exercise different review verdicts (one clean = should hit Template A; one with a real but tiny issue = should hit Template B or C).
- [ ] For each test PR: post a Slack message in `#C0EXAMPLE000` of shape `<repo> - <one-liner>\n<github.com/AcmeBooks/ecommerce-frontend/pull/N>\n@zeno-agent`.
- [ ] After the agent's reply is posted, validate against `code-review/SKILL.md` contracts:
  - **GitHub review body** matches one of Templates A/B/C/D **literally** (regex check OK):
    - Template A: `^(lgtm|ok|sem ressalvas)$` — single word, no period, no extras.
    - Template B: `^lgtm\. \d+ (nits?|sugestões?|sugestão|nits? \+ \d+ sugestões?) inline\.$` (≤200 chars).
    - Template C: `^pedi correções\. \d+ (blockers?|sugestões?) (.{0,180})\.$` (≤200 chars).
    - Template D: starts with `^pedi correções\. .+\. Detalhe abaixo\.\n\n---\n\n\*\*blocker — ` and has 2-3 prose sentences.
  - **Slack reply** matches `^<@U[A-Z0-9]+> (aprovado|aprovado com nits|pedi correções|deixei dúvidas) · .+ · https://github\.com/AcmeBooks/ecommerce-frontend/pull/\d+#pullrequestreview-\d+$` (≤140 chars, ZERO emojis, single line).
  - **Worker logs** for the turn show at least one tool call where `tool` matches `^Skill` or `^Read.*SKILL\.md$` — proves the agent actually consulted the skill.
- [ ] After E2E passes: close the test PRs, push the closure (don't merge to main of `ecommerce-frontend`).

**Quality gate:**
- [ ] `pnpm run quality-gate` green: 30/30 turbo tasks. Test count delta: +2 minimum (the system-prompt assertion + the SOUL.md lint).

## Architecture

### Component map

```
agent/
└── SOUL.md                                         # rewrite "Skills (deferred)" section

apps/worker/src/agent/
├── system-prompt.ts                                # signature decision (return string vs option shape)
└── backends/claude-code.ts                         # pass systemPrompt: { type: 'preset', preset: 'claude_code', append: ... }

apps/worker/tests/agent/
├── system-prompt.test.ts                           # +1 contract test (preset shape)
└── soul-content.test.ts                            # NEW: lint SOUL.md against deferred drift

context/specs/2026-04-30-soul-skills-realign/
├── spec.md                                         # this file
├── plan.md                                         # next file
└── tasks.md                                        # next file
```

### Data flow at turn start (after fix)

```
Slack message → AgentCore.handleTurn(userMessage, threadState)
  ↓
buildSystemPrompt(SOUL.md, USER.md) → "You are Zeno..." string
  ↓
ClaudeCodeBackend.query() with options:
  systemPrompt: { type: 'preset', preset: 'claude_code', append: <SOUL+USER string> }
  settingSources: ['user']           # SDK reads ~/.claude/skills/
  hooks: { PreToolUse: [...] }       # connector-gated guardrail
  allowedTools: [Skill, ToolSearch, Bash, ...]
  ↓
SDK constructs prompt:
  - claude_code preset (harness + dynamic sections + SKILL LISTING BLOCK)
  - + appended SOUL+USER content
  ↓
Agent receives prompt with skill listing visible. Reads matching skill body via Read or Skill tool.
  ↓
Agent follows SKILL.md templates instead of freelancing.
```

### What changes vs today (the regression mode)

```
TODAY:
  systemPrompt: <SOUL+USER string>          # bare string → SDK uses custom path
  → SDK skips skill listing injection
  → Agent has no awareness of code-review existing
  → Agent freelances output

AFTER:
  systemPrompt: { type: 'preset', preset: 'claude_code', append: <SOUL+USER> }
  → SDK injects skill listing in claude_code preset
  → Agent sees `code-review: Review pull requests on GitHub...` in system prompt
  → On matching message, agent reads SKILL.md body and follows templates
```

## Test plan / Success criteria summary

This spec ships when ALL the following pass:

**Unit (Phase A + C):**
- [ ] `pnpm --filter @zeno/worker test -- system-prompt.test.ts` passes; the new contract test asserts the SDK option shape.
- [ ] `pnpm --filter @zeno/worker test -- soul-content.test.ts` passes; SOUL.md lint blocks "deferred" near "Skills".

**Quality gate:**
- [ ] `pnpm run quality-gate`: 30/30 turbo tasks green.

**E2E (Phase D — the contract acceptance):**
- [ ] Branch built into image: `cd /Users/<you>/www/your-github-username/zeno-agent && PROFILE=<example> pnpm run docker:build && PROFILE=<example> pnpm run docker:up`.
- [ ] Test PR #1 (clean, minimal change): @zeno-agent reply on Slack matches Template A regex; GitHub body literally `lgtm` (or `ok`/`sem ressalvas`).
- [ ] Test PR #2 (one introduced minor issue, e.g., a typo in a comment newly added): @zeno-agent reply matches Template B (`lgtm. <X> nits inline.`) OR Template C (`pedi correções. <X> ...`) depending on severity classification. Inline comment count matches the Slack reply count.
- [ ] Worker logs for both turns: `grep -E "Skill|SKILL\.md" docker logs` shows ≥1 hit per turn — proves auto-discovery + skill body read happened.
- [ ] No emojis, no `## Review` headers, no praise adjectives in either GitHub or Slack output (run the SKILL.md pre-submit lint manually against the actual outputs).
- [ ] Test PRs closed (no merge to `ecommerce-frontend` main).

**Branch review (Rule 2 — 3 consecutive clean):**
- [ ] After all of the above, run 3 independent code-review subagent passes against the branch. Reset the streak on any BLOCKING finding.

## Risks / Open Decisions

- **Dynamic sections may leak the "Claude Code" persona into Zeno's voice.** When `systemPrompt: { type: 'preset', preset: 'claude_code', append: ... }` is used **without** `excludeDynamicSections: true`, the SDK injects sections about the Claude Code harness ("you are Claude Code, an interactive CLI tool..."). Zeno is not Claude Code; the SOUL is the identity. **Mitigation**: append section ordering matters — SOUL+USER come after the preset and can override tone. If E2E shows the agent saying "I'm Claude Code" or breaking character, follow-up commit adds `excludeDynamicSections: true` and we accept losing cwd/git-status (we don't need them for Slack-mediated work). Decision is observation-driven, not pre-baked.
- **Skill listing budget might truncate `code-review`'s description.** Subagent investigation (sdk.d.ts) cited `skillListingMaxDescChars` (default 1536) and `skillListingBudgetFraction` (default 0.01). A re-grep at spec-review time could not confirm those exact field names in the public Options type — they may live in `Settings` or be private SDK internals. Pragmatic stance: `code-review`'s description is ~600 chars, well under any reasonable per-skill cap. If E2E shows the listing got truncated, file a follow-up to investigate budget knobs.

- **`Skill` is NOT a tool the agent invokes; it's an announce-in-system-prompt mechanism.** The Claude Agent SDK auto-announces each `~/.claude/skills/<name>/SKILL.md` as a `<name>: <description>` line in the preset's system prompt. The agent then reads the matching SKILL.md body via the **`Read` tool** (already in `ClaudeCodeBackend`'s default `allowedTools = ['Bash', 'Read', 'Glob', 'Grep']`). This is why no `Skill` allowedTools change is needed in this spec. The `agent_capabilities_loaded` log entry includes `Skill` because it's an entry in the operator-managed capability table (spec 0052), but that's the pre-tool-use hook's gate, not the SDK's allowedTools filter. The E2E log assertion in Phase D should match `^Read.*SKILL\.md$` OR `^Skill\b` — either tool name proves auto-discovery worked. If E2E shows the agent freelancing despite the listing being injected (no `Read` of SKILL.md visible), file a follow-up to make `allowedTools` permissive (mirror `agent_capabilities` enabled set).
- **Pre-tool-use hook still exists for connector_skills DB-linked injection.** Spec 0052's path (link a skill to a connector → body injects when that connector's MCP tool fires) still works and is independent of this fix. Defense-in-depth if E2E reveals edge cases.
- **`code-review` SKILL uses `gh api` (Bash) for review submission, not MCP github tools.** Means the connector-skill injection path doesn't fire for it (would only fire on `mcp__github-app-acmebooks__*` calls). The fix here (skill listing in system prompt) is the ONLY reliable path for `code-review` — by surfacing the skill in the agent's awareness and letting auto-discovery + Read take over. This is why the SOUL realignment + preset shape combo is critical, not optional.
- **Owner-call (Rule 3 synthesis):** subagent 1 said SOUL.md is contributing not root cause; subagent 2 found the real root cause (bare-string systemPrompt). Owner agrees with subagent 2. Both fixes ship in this spec because they're cheap and complementary — preset shape makes skills visible, SOUL realignment removes the contradiction.

## References

- Claude Agent SDK types: `node_modules/.pnpm/@anthropic-ai+claude-agent-sdk@0.2.110_zod@4.3.6/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` — `systemPrompt` shape, `skillListingMaxDescChars`, `skillListingBudgetFraction`, `skillOverrides`.
- Spec 0049 (skills retired + SOUL rewrite): `context/specs/0049-strip-skills-and-classifier/spec.md`
- Spec 0050 (classifier removal): `context/specs/0050-haiku-classifier-removal/spec.md`
- Spec 0052 (skills reintroduced as DB playbooks): `context/specs/2026-04-28-skills/spec.md`
- The bug-trigger SKILL.md: `profiles/<example>/skills/code-review/SKILL.md`
- The bug observation: worker logs from `zeno-agent-1` on 2026-04-30 reviewing `https://github.com/AcmeBooks/infrastructure/pull/12` — see analysis in this conversation's thread.
