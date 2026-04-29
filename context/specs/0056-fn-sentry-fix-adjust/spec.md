---
status: draft
feature: fn-sentry-fix-adjust
created: 2026-04-29
shipped: null
---
# fn-sentry-fix v2 Adjustments — Spec

**Status:** Draft
**Scope:** Three skill-body adjustments to `fn-sentry-fix` (the autonomous Sentry fix workflow shipped in spec 0055): (1) authorize 2 short Slack progress messages between phases, (2) fix the "Aguardando o zeno-development..." bug where the agent emits interim filler as final reply and never delivers the structured success/stuck, (3) define a "Turn output contract" in the skill body that locks the allowed assistant-text shapes. **No code changes** — skill body only. Stacked on `feat/sentry-fix-skill` (PR #19).

## Context

Spec 0055 shipped `fn-sentry-fix` and ran 5 E2E scenarios live on the fn profile. Two follow-up issues surfaced from operator feedback during and after the live tests:

1. **Operator wants visibility during the run.** When invoking `@zeno-agent fn-sentry-fix <url>`, the only feedback today is the FINAL message (success / stuck). For runs that take 2-5 minutes, the operator is left guessing whether Zeno is alive. Two short, well-placed progress messages (after Phase 1 fetch + after Phase 4 gate-pass) give visibility without flooding the thread.

2. **Bug observed in production: "Aguardando o zeno-development..." replied as final.** During the WORKER-W test, the agent emitted "Aguardando o zeno-development implementar o fix, rodar os testes e criar o PR draft..." in Slack and never came back with the structured success/stuck. Worker logs confirmed `backend_completed` with 31 tool calls (work HAD been done), but the user-facing reply was the filler text. Likely cause: the agent emitted assistant text BEFORE invoking `Skill(zeno-development, ...)`, the channel adapter posted that to Slack, and the agent considered itself "done replying" — the final structured message was never emitted. The skill body's current rule "NEVER emit interim text" is insufficient — needs to be explicit about the contract + provide a DON'T list with concrete examples.

This spec is the v2 adjustment to address both. Stacked on the spec 0055 PR (`feat/sentry-fix-skill` → PR #19, ready for review). Branch: `feat/sentry-fix-skill-adjust`. PR target: `feat/sentry-fix-skill` (NOT main directly).

## Problem Statement

Two specific problems:

1. **No progress visibility.** Operator invokes the skill, then waits silent for several minutes until the final message lands. There's no signal that Zeno is alive and progressing. Long-running flows feel hung.

2. **Filler text becomes the final reply.** The agent's chain-of-thought leaked into Slack — "Aguardando..." was meant to be a planning step but ended up as the visible response, with the structured success/stuck never delivered. The half-PR avoidance rule (no PR without confidence) is preserved, but the operator-facing contract (always get a structured success or stuck) is broken when the agent emits ad-hoc filler before invoking sub-skills.

## Non-Goals

- **Not changing worker code.** Channel adapter posts every assistant-text to Slack — this stays. The fix is on the skill-body side: forbid the filler shapes that cause the bug.
- **Not adding multi-file skill support.** SKILL.md is currently 493 lines (under Anthropic's 500-line recommendation). Spec 0055's E2E run shipped fine at this size. Anthropic's progressive-disclosure best practice (split into satellite files via `reference/*.md`) needs Zeno-side infra changes (DB schema, materializer, API, dashboard). That's a separate spec when first concrete need arises. For now: skill body grows in v2 by ~30 lines and stays under cap.
- **Not changing PR description / Sentry comment / @-mention behavior.** All shipped in spec 0055 and validated. v2 only adds the Slack progress messages + bug fix.
- **Not adding broad worker-side suppression of interim text.** Bug is specific to this skill (sub-skill compose case). Other skills haven't reported this pattern. If it repeats in ≥2 independent skills, that's a separate worker spec.
- **Not changing the channel target.** Outputs continue to go to Slack via the channel adapter; channel `C0EXAMPLE001` mention stays in the skill body (E2E now tests via that channel, not DM).

## Constraints

- **Skill body remains the only deliverable.** No new files. No changes to `LICENSE-APACHE-2.0`. No code changes.
- **Hard cap: ≤480 SKILL.md lines after the v2 commit.** Currently 493 — adding ~30 lines naively would land at 523. Implementer MUST trim verbose existing sections in the same commit to land at ≤480 (target chosen below the 500 Anthropic optimum to give 20-line headroom for future small adjustments). Trim candidates already identified in Risks table: condense `git log -S` false-positive guard, compress the Sentry MCP tool table to bullet form, remove one redundant example from auto-resolve note. DO NOT split into satellite files (that's the deferred spec). Pre-implementation step: run `wc -l profiles/fn/skills/fn-sentry-fix/SKILL.md` baseline, then plan trim before adding the v2 content.
- **Backwards compatible with spec 0055.** Existing E2E from spec 0055 (S1-S6) must continue to PASS. The 5 final-message templates already shipped (success, Phase 4/5/6 stuck, auto-resolve) stay byte-for-byte the same. Only ADDS: 2 progress templates + Turn output contract section.
- **Operator-side test channel is `C0EXAMPLE001`, not DM `D0EXAMPLE000`.** Spec 0055 tested via DM; this spec's E2E uses the channel.
- **No half-PRs (still).** All spec 0055 invariants (cleanup branch on stuck, no force-push, 5-item gate) remain unchanged.
- **License obligations from spec 0055** (Apache 2.0 attribution at top, LICENSE-APACHE-2.0 next to SKILL.md) stay intact — no edits to attribution block.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| File-split for SKILL.md trim | **Deferred** to a future spec | Multi-file support requires Zeno-side infra changes (DB schema, materializer, API, dashboard, boot seeder). Current size 493 < 500 = no immediate need. v2 adds ~30 lines and stays under cap. YAGNI applies — wait for first concrete pain point. |
| Bug fix approach | **A — skill-body fix only** (rejected B worker-side suppression and C both) | Bug surfaced in this skill (sub-skill compose case); fix where the contract lives. B is mechanism change with global blast-radius — would silently break legitimate progress messages from other skills + risk killing the 2 v2-authorized progress msgs. Rule of Separation (policy → skill, mechanism → worker). |
| Progress message granularity | **2 messages (Opção A)** | Locked from owner feedback during spec 0055 testing. After Phase 1 fetch (`🔍 investigando *<ID>*...`) and after Phase 4 gate-pass (`✅ gate passou — partindo pro fix em \`<owner>/<repo>\``). Sweet spot: enough signal that Zeno is progressing, no flooding. Discarded Option B (5 msgs, too noisy) and Option C (1 msg, too sparse). |
| Progress message @-mention | **No mention** on the 2 progress messages | Operator just sent the invocation, they're already paying attention. Mention is reserved for the FINAL message (success/stuck/auto-resolve/clarification) so the operator gets a notification when there's something to act on. Reduces notification spam. |
| Turn output contract | **Explicit section in SKILL.md** with allowed shapes + DON'T list with concrete examples | The current "NEVER emit interim text" rule is too vague. Needs: (a) explicit list of the 4 final-message shapes, (b) the 2 authorized progress shapes, (c) explicit DON'T list with examples ("Aguardando...", "Investigando...", "Vou começar..."), (d) clarification that tool calls (Skill, Bash, etc.) don't count as text output, (e) explicit note that `Skill(zeno-development)` is synchronous — no sub-process to "wait for". **Implementer note:** the existing `NO progress/status messages` paragraph in SKILL.md (currently lines 16-18 of the file) must be REPLACED (not merely appended to) by the new Turn output contract section. The old paragraph directly contradicts the v2 policy (it forbids ALL interim text; v2 authorizes 2 specific progress messages). |

## User Stories / Scenarios

### S1 — Happy path with progress visibility

1. Operator: in channel `C0EXAMPLE001`, posts `@zeno-agent fn-sentry-fix https://flavia-nasser.sentry.io/issues/WORKER-D`
2. Zeno: Phase 1 fetches the issue. Posts to channel: `🔍 investigando *WORKER-D*...`
3. Zeno: Phase 2 + 3 (deep analysis + repo cross-reference). No Slack output during these phases.
4. Zeno: Phase 4 gate evaluates — all 5 items pass. Posts: `✅ gate passou — partindo pro fix em \`AcmeBooks/acme-monorepo\``
5. Zeno: Phase 5 + 6 (zeno-development handoff: clone, branch, regression test, fix, verify). No Slack output during.
6. Zeno: Phase 7 delivery — pushes branch, opens draft PR with `[zeno-test]` prefix + PT-BR body, posts Sentry comment via REST API.
7. Zeno: posts the FINAL structured success message (with `<@operator_id>` mention) to channel.

Slack thread shows 3 messages from Zeno: `🔍 investigando` → `✅ gate passou` → `<@operator> ✅ *sentry fix shipped* — <pr_url>...`. No "Aguardando..." or other filler. Operator gets a single notification on the final message (the 2 progress msgs are silent — no @mention).

### S2 — Stuck on gate (no progress on Phase 4 fail)

1. Operator: `@zeno-agent fn-sentry-fix https://flavia-nasser.sentry.io/issues/WORKER-V` (1 event, weak signal)
2. Zeno: Phase 1 fetches. Posts: `🔍 investigando *WORKER-V*...`
3. Zeno: Phase 2-3 deep analysis. No Slack output.
4. Zeno: Phase 4 gate FAILS on item 2 (signal floor — only 1 event, no trace, no breadcrumbs, Seer "insufficient data").
5. Zeno: posts the Phase 4 stuck-message (with `<@operator_id>` mention) and STOPS.

Slack shows 2 Zeno messages: `🔍 investigando *WORKER-V*...` → `<@operator> ⚠️ *sentry fix stuck* — preciso de input...`. The "✅ gate passou" message is NOT posted (gate failed). The operator-facing contract: a single stuck message with all 4 fields (hypothesis / confirmed / blocking / question) + @mention.

### S3 — Stuck on edit-test loop (Phase 5 mid-fix)

1. Phases 1-4 PASS. Slack shows: `🔍 investigando` → `✅ gate passou`.
2. Phase 5: regression test written, fails before fix (correct). Edit-test loop runs 3 attempts, all fail.
3. Branch cleanup: `git -C "${BARE}" worktree remove ... --force` + `git -C "${BARE}" branch -D ...`
4. Final stuck-message (Phase 5 mid-fix template) with `<@operator>` mention.

3 messages total; no PR; no half-branch leftover; no "Aguardando..." filler.

### S4 — Multi-issue invocation (zero progress, immediate clarification)

1. Operator: `@zeno-agent fn-sentry-fix WORKER-D e WORKER-7`
2. Zeno: Phase 1 detects 2 issue IDs. Posts: `<@operator> Faço uma issue por vez — qual primeiro? (Detected: WORKER-D, WORKER-7)`

Single Slack message. NO `🔍 investigando` (Phase 1 didn't fetch — it detected the multi-issue and escalated immediately). NO "✅ gate passou" (gate not reached). The clarification IS the final message — gets the mention.

### S5 — Bug regression test (the actual "Aguardando..." case)

The exact scenario that triggered the bug in spec 0055 testing:

1. Operator: `@zeno-agent fn-sentry-fix https://flavia-nasser.sentry.io/issues/WORKER-W` in channel `C0EXAMPLE001`
2. Phase 1-3: agent fetches, analyzes, cross-references repo. Posts `🔍 investigando *WORKER-W*...` after Phase 1 only.
3. Phase 4: gate passes. Posts `✅ gate passou — partindo pro fix em \`AcmeBooks/acme-monorepo\``.
4. Phase 5: agent invokes `Skill(zeno-development, args="...")` to do the fix work.
5. **CRITICAL: agent does NOT emit "Aguardando o zeno-development..." or any other filler text.** Tool calls happen, agent emits NO text until Phase 7.
6. Phase 7: agent posts the FINAL structured success message.

The Turn output contract in the SKILL.md must make this explicit enough that the agent doesn't repeat the v0.1 bug.

## Success Criteria

- [ ] **Skill body contains a "Turn output contract" section** with:
  - Explicit list of allowed shapes (4 final + 2 progress)
  - Explicit DON'T list including: filler phrases ("Aguardando...", "Investigando agora...", "Vou começar...", "Pronto, partindo pro próximo passo..."), AND any code block / diff / formatted data block emitted before the final structured message (e.g. `\`\`\`bash` blocks, JSON dumps, stack trace previews — these are only valid INSIDE the stuck templates' diff field, not as standalone interim output)
  - Note that tool calls (`Skill`, `Bash`, `Read`, `Edit`, etc.) don't count as text output
  - Note that `Skill(zeno-development, ...)` is synchronous — no sub-process to wait on
- [ ] **2 progress messages are documented** in the skill body:
  - Phase 1 post-fetch: `🔍 investigando *<SENTRY-ID>*...` (no @-mention)
  - Phase 4 post-gate-pass: `✅ gate passou — partindo pro fix em \`<owner>/<repo>\`` (no @-mention)
- [ ] **Existing 5 final-message templates** (success, Phase 4/5/6 stuck, auto-resolve, clarification) remain unchanged byte-for-byte. They keep the `<@${user_id}>` mention.
- [ ] **SKILL.md stays under 500 lines.** Verify with `wc -l`. Target: ≤480 lines (room for future small adjustments).
- [ ] **No code changes** outside `profiles/fn/skills/fn-sentry-fix/SKILL.md`. Verify with `git diff --stat feat/sentry-fix-skill..HEAD` (NOT `main..HEAD` — branch is stacked) — only that file modified.
- [ ] **E2E S1 happy path** runs in channel `C0EXAMPLE001`. Slack thread shows: `🔍 investigando *WORKER-D*...` → `✅ gate passou — partindo pro fix em ...` → `<@operator> ✅ *sentry fix shipped* — https://...`. PR draft has `[zeno-test]` prefix, PT-BR body, full report.
- [ ] **E2E S2 stuck on gate** runs. Slack shows `🔍 investigando *WORKER-V*...` → `<@operator> ⚠️ *sentry fix stuck* — preciso de input...`. NO `✅ gate passou` message (gate failed). NO PR opened.
- [ ] **E2E S5 bug regression** runs. Slack thread shows NO assistant text outside the 6 allowed shapes (4 final templates + 2 progress messages). Operationally: count Slack messages from Zeno in the thread; each must match one of the 6 templates exactly. Any non-matching message = FAIL.
- [ ] **S3 (mid-fix stuck) and S4 (multi-issue) NOT in E2E checklist** is intentional, not an oversight: both are paths already validated in spec 0055 and v2 changes are strictly additive to those flows (S3 keeps the same Phase 5 cleanup; S4's clarification IS the final message, no progress messages fire). Re-running them adds no signal beyond what S1/S2/S5 already cover.
- [ ] **E2E Sentry comment via REST API** validates: PR URL appears as a Sentry issue comment after the run (verify in Sentry UI), OR — if the test issue's MCP token lacks comment permission — the Slack final message contains the `ℹ Não linkei o PR no Sentry` caveat per the spec 0055 fallback at SKILL.md Phase 7 Step 3.
- [ ] **All test PRs cleaned up** post-test (closed + branches deleted). No Sentry issues left as `resolved`.
- [ ] **Final 3-round review** (per Rule 2 of cleanup contract) on the branch with zero blocking findings.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The Turn output contract becomes too rigid and the agent escalates to clarification when faced with novel cases not in the allowed list | The contract has 6 shapes (4 final + 2 progress) covering happy + stuck + auto-resolve + clarification + 2 progress states. Plus "DON'T list" pattern is permissive (forbids known-bad shapes, allows new ones if structurally similar to the allowed shapes). If a new case appears in production that doesn't fit, fold it back into the contract in a follow-up commit. |
| The `🔍 investigando` message fires but the rest of the flow fails silently (e.g., `get_issue_details` 404s after the message posts), leaving the operator with a phantom progress | Spec 0055 already specifies the 404-path posts a clarification stuck-message. So the `🔍 investigando` message is followed by the 404 stuck-message — operator sees both and knows the flow ended. Add a note in skill body: "if Phase 1 fails AFTER the `🔍 investigando` message posts, the stuck-message must be the next emission — there's no need to retract the progress message." |
| Adding ~30 lines of contract + progress templates pushes SKILL.md over 500 | Trim verbose existing sections in the same commit. Candidate: the verbose explanations of `git log -S` false-positive guard could lose ~10 lines without losing meaning. The Sentry MCP tool table could compress to bullet form. Worst case: remove one redundant example from the auto-resolve note section. |
| The agent reads the Turn output contract but still emits filler — pattern proves resistant to skill-body fixes | Re-test live. If the bug recurs after the v2 ships AND fix is via clear contract + DON'T list, the next escalation is worker-side filtering (Option B from Q2). That's a separate spec triggered by ≥2 independent skills showing the same pattern. |
| Existing spec 0055 E2E (S1-S6) breaks because of the new progress messages | Manual verification: re-run S1 (happy path) and S3 (stuck path) before declaring done. Both should still PASS — the new progress messages are additive, not subtractive. |
| Channel `C0EXAMPLE001` access changes / bot permissions break | Skill body already references the channel for spec 0055. v2 doesn't change this. If the bot loses channel access, ALL skill output breaks — diagnosed at runtime, not a v2-specific risk. |
| Operator gets too many notifications on iterative re-fixes (e.g., spec 0055 had `cron_run_now` retry collisions) | The 2 progress messages are silent (no @mention). Only the final message mentions. Multiple invocations on the same issue = multiple final messages, but each is intentional (operator triggered) so notifications match operator action. |

## Open Questions

None blocking. Q1 (file-split) explicitly deferred to a future spec when multi-file infra is added. Q2 (bug fix approach) closed at A (skill-body only) with both subagents converging.

## Divergence from original design (post-implementation amendment)

**Discovered during E2E:** Zeno's worker (`apps/worker/src/agent/backends/claude-code.ts:137-148`) only routes `message.type === 'result'` from the SDK loop to Slack — every other assistant message (intermediate text blocks) is dropped. The 2 progress messages (`🔍 investigando *<ID>*...`, `✅ gate passou — partindo pro fix em ...`) would be emitted as intermediate assistant text, which the worker discards. **Net effect: 0 of 3 expected Slack messages fired (only the final).**

**Owner decision (option A):** drop progress messages from spec 0056 scope, defer to a future spec. Document the architectural constraint in the skill body so future readers don't try to re-implement the same way.

**Shipped artifact differs from this spec as follows:**
- **6 allowed shapes → 4 allowed shapes.** The Turn output contract in `SKILL.md` lists only the 4 final shapes (success / stuck / auto-resolve / clarification). Progress messages are documented in a "Progress messages aren't supported (yet)" deferred-work note, not as allowed shapes.
- **Progress msg #1 + #2 sub-sections removed.** The Phase 1 / Phase 4 progress signal sub-sections never made it into the final SKILL.md.
- **Contract tightening added.** E2E rounds 2-3 showed the agent emitting status preamble ("Sentry comment posted (HTTP 201). Now delivering the final result.") before the structured template. Two extra commits hardened the contract: (a) explicit "ZERO bytes before structured template" rule with concrete forbidden patterns; (b) in-place self-check at Phase 7 Step 4 with 2 binary questions ("first 2 chars are `<@`?", "any narration?") that the agent runs immediately before submitting.
- **Final SKILL.md line count: ~462** (still ≤480 target; ample headroom).

**Success criteria carried (validated in E2E):**
- Final shipped/stuck templates emit byte-for-byte clean (verified via 4 live invocations in `C0EXAMPLE001`).
- Zero "Aguardando o `zeno-development`..." filler text in any final reply (S5 bug regression confirmed).
- All 5 final templates byte-for-byte unchanged from spec 0055 baseline.
- Sentry REST API comment + Slack final message + draft PR + @-mention to invoker all functional.

**Success criteria DROPPED:**
- "2 progress messages fire correctly" — moved to a separate future spec, dependent on either a Slack connector exposed as `mcp__slack__*` tools (so progress msgs become tool calls, not turn-text) or a worker-side change that streams `assistant` text blocks.

The original "Test plan / Success criteria" section above describes the as-designed flow. The amendment above describes the as-shipped flow. PR description repeats this divergence summary.

## Out-of-scope follow-ups

- **Multi-file skill support spec** — extend Zeno's skill machinery (DB, materializer, API, dashboard, boot seeder) to support N files per skill. Then apply progressive-disclosure split to fn-sentry-fix (and any other skill that grows).
- **Worker-side interim-text suppression** — if the bug pattern repeats in ≥2 independent skills, evaluate a generic channel-adapter rule that posts only the LAST assistant turn-text. With a per-skill allowlist for legitimate progress messages.
- **Slack message editing instead of new messages** — currently each progress message creates a new Slack thread reply. Anthropic's Slack API supports `chat.update` to edit a previous message. Could reduce thread noise (1 sticky message that updates 3 times). Needs Slack MCP install + skill body wiring. Defer.
- **Cron-driven invocation** — still on the future roadmap (see spec 0055 Out-of-scope). v2 doesn't change this; cron mode would just compose the same skill via spec 0054's cron-skill linking.
- **Spec 0055 advisories carried** — cost cap soft (S1 went 85 vs 55 in spec 0055 testing) — still unchanged in v2. Migrate to hard cap if the pattern proves to be ≥20% of runs.
