---
feature: fn-sentry-fix-adjust
spec: "[[spec]]"
created: 2026-04-29
---
# fn-sentry-fix v2 Adjustments — Plan

**For this spec:** `[[spec]]`

## Approach

Single-file content edit: `profiles/fn/skills/fn-sentry-fix/SKILL.md`. Three changes apply in one commit:

1. **Replace** the existing "NO progress/status messages" paragraph (currently lines 16-18, immediately after the channel + @-mention rule) with a new "Turn output contract" section that lists the 6 allowed shapes (4 final + 2 progress) and a DON'T list with concrete examples + the code-block carve-out.
2. **Add** the 2 progress message templates inline at the end of Phase 1 (`🔍 investigando *<SENTRY-ID>*...`) and at the end of Phase 4 (`✅ gate passou — partindo pro fix em \`<owner>/<repo>\``), each with a one-liner saying when they fire and that they have NO `<@user_id>` mention.
3. **Trim** verbose sections to land at ≤480 lines: compress `git log -S` false-positive guard, condense the Sentry MCP tool table, drop redundant auto-resolve note example, prune the Phase 7 Step 2 dead-code (`docker_or_inside_container` block was added during the spec 0055 Phase C iteration but is never used).

After the commit lands locally, hot-reload the skill via dashboard PATCH (no docker rebuild — body change only) and run the 3 E2E scenarios live in channel `C0EXAMPLE001`.

The hard math: 493 baseline + ~30 v2 additions = 523. Target 480. Need to cut ≥43 lines net. Trim candidates listed in spec total ~25 line savings; the Phase 7 dead-code + Phase 5/6 template duplication can recover the remaining ~18. If the implementer hits 480 with margin, stop trimming — don't over-cut signal.

## Architecture

### File structure

```
profiles/fn/skills/fn-sentry-fix/
├── SKILL.md             # ONLY file changed (replace lines 16-18 + add 2 progress templates + trim)
└── LICENSE-APACHE-2.0   # untouched
```

### Edit map

```
SKILL.md (current)                          → SKILL.md (v2)
─────────────────────────────────────────────────────────────
Lines 1-15: frontmatter + attribution + intro    UNCHANGED
Lines 16-18: "NO progress/status messages"        REPLACED → "Turn output contract" section (~25 lines)
Lines 19-39: security rules + cost caps           UNCHANGED
Lines 41-103: Phase 1 (parsing + fetch + slug)    +5 lines (progress msg #1 at end of Phase 1)
Lines 104-180: Phase 2-3                          TRIM: compress git log -S guard, drop redundant auto-resolve example
Lines 181-200: Phase 4 (gate)                     +5 lines (progress msg #2 at end of Phase 4 description, only fires on gate-pass)
Lines 201-294: Phase 5 + 6                        TRIM: deduplicate stuck templates, condense
Lines 295-460: Phase 7                            TRIM: drop docker_or_inside_container dead-code, condense `gh pr create` block
Lines 461-end: reminders + final notes            UNCHANGED
```

Net delta target: net trim -13 lines (from 493 → 480).

### Workflow phases

```
A. Pre-trim baseline + plan
   ↓
B. Edit SKILL.md (replace + add + trim) — one commit
   ↓
C. Hot-reload via dashboard PATCH (no docker rebuild needed for body)
   ↓
D. E2E in channel C0EXAMPLE001 (S1 happy / S2 stuck-gate / S5 bug regression)
   ↓
E. Final 3-round branch review
   ↓
F. Push + open PR (target: feat/sentry-fix-skill, stacked)
```

## File Structure

### New
None.

### Modified
- `profiles/fn/skills/fn-sentry-fix/SKILL.md` — single-file edit per the edit map above
- `tmp/spec-0056-e2e-results.md` — created during Phase D, NOT committed (under tmp/)

### Deleted
None.

## Phase Ordering

Hard ordering — each phase blocks the next:

```
A. Baseline + trim plan (read current SKILL.md, count, identify cuts)
   ↓
B. Single edit commit (replace + add + trim)
   ↓
C. Hot-reload (PATCH /api/skills/<id>)
   ↓
D. E2E (3 scenarios in C0EXAMPLE001)
   ↓
E. 3-round review
   ↓
F. Push + PR
```

A → B → C is strictly serial. D requires C. E requires D PASS. F requires E approve.

## Risks / Open Decisions

- **480-line target might be too tight if v2 content slightly exceeds the ~30 line estimate.** Mitigation: actual edit measures live; if Turn output contract grows to 35-40 lines, lift the trim target proportionally (cap is "≤500 with comfortable headroom" per Anthropic, so 490 is still acceptable). Don't fail the whole spec on a 5-line shortfall.
- **WORKER-V signal flux for E2E S2.** R3 advisory: WORKER-V might have accumulated events since spec 0055 testing. Verify pre-test by querying the issue; if event count is now ≥3 the gate may pass and S2 turns into S1. Pick a fresh 1-event issue if needed (run `mcp__sentry__list_issues` query for `is:unresolved` ordered by event count ASC, take the bottom).
- **Hot-reload via dashboard PATCH may not apply if the agent's session has cached the old skill body.** Mitigation: spec 0055 already validated PATCH works for body-only changes — test by sending a 1-msg ping after the PATCH and verifying Zeno's response uses the new templates. If the cache holds, force docker `restart` of the worker container (~10s, no rebuild needed).
- **Slack message ordering: progress msg #1 fires BEFORE Phase 1 fully completes** (e.g., `get_issue_details` 404 path). The spec already addresses this in Risks: stuck-message follows the progress msg as next emission, no need to retract. Implementer must put progress msg #1 placement at end of Phase 1 (after fetch SUCCESS), not at start.
- **Sentry comment fallback assumption.** REST API uses connector_secrets token. If the token rotated or got revoked, the curl call fails and the agent must hit the Slack fallback. R3 advisory: verify token still valid in the docker container before E2E (`docker exec ... node -e "..."` to read connector_secrets).

## Divergence from this plan (post-implementation amendment)

This plan was authored before E2E. The actual delivery diverged on 2 axes — see `spec.md` "Divergence from original design" section for the full narrative. Summary for plan readers:

- **Phase B was split into 4 commits, not 1.** Original plan: single commit applying replace + add + trim. Actual: (1) v2 commit per plan; (2) drop progress msgs after E2E S1 round 1 revealed `apps/worker/src/agent/backends/claude-code.ts:137-148` only routes SDK `result` events; (3) tighten Turn Output Contract after E2E S1+S2 round 2 leaked status preamble; (4) in-place self-check at Phase 7 Step 4 after rounds 2-3 still leaked.
- **Edit map's progress-msg insertions never landed in final SKILL.md.** Phase 1 / Phase 4 progress signal sub-sections were added in commit 1, removed in commit 2.
- **Net trim target met (493 → 467, -26 lines)** — comfortable margin under ≤480 cap.
- **Phase D E2E** ran in 4 rounds (vs 3 scenarios planned). S1 happy was retested 4 times to validate the contract tightening. S2 ended up exercising the clarification path (zero-issue) instead of stuck-gate (WORKER-V drifted from 1-event to multi-event between spec 0055 and now). S5 zero-filler regression confirmed across all rounds.

## Self-Review

After authoring the v2 SKILL.md, verify:

- [x] Frontmatter unchanged (name, description)
- [x] Apache 2.0 attribution unchanged
- [x] Old "NO progress/status messages" paragraph completely REMOVED
- [x] New "Turn output contract" section present (now: 4 allowed shapes + deferred-work note for progress msgs, NOT the original 6 — see Divergence)
- [x] ~~Progress msg #1 at end of Phase 1~~ — DROPPED, deferred to future spec
- [x] ~~Progress msg #2 at end of Phase 4~~ — DROPPED, deferred to future spec
- [x] All 5 final templates byte-for-byte unchanged from spec 0055 baseline
- [x] LICENSE-APACHE-2.0 file untouched
- [x] Line count ≤ 480 (delivered at 467)
- [x] No new files in `profiles/fn/skills/fn-sentry-fix/`
- [ ] `git diff --stat feat/sentry-fix-skill..HEAD` shows ONLY the SKILL.md change in this branch
