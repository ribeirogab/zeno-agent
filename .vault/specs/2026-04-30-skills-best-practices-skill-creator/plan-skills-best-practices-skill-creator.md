---
feature: skills-best-practices-skill-creator
spec: "[[spec-skills-best-practices-skill-creator]]"
created: 2026-04-30
---
# Spec 0063 — Skills best-practices + skill-creator authoring tools — Plan

**For this spec:** `[[spec-skills-best-practices-skill-creator]]`

## Approach

The skills authoring problem splits cleanly between **infrastructure** (already shipped: spec 0062 multi-file storage + materializer + watcher + dashboard editor) and **content quality** (this spec). The content-quality side has two needs: a **canonical guide** for what good skills look like (Anthropic ships this as the `skill-creator` skill — already physically present in `.claude/skills/skill-creator/` from a prior commit, just not version-pinned), and a **mechanical workflow** for refactoring an existing skill against that guide without breaking its purpose, trigger behavior, or output format.

The mechanical workflow doesn't yet exist. It's the deliverable of this spec: a new project-local Claude Code skill called `skill-improver` (in `.claude/skills/skill-improver/`) that captures the audit-then-refactor playbook. Its three references files contain (a) a best-practices checklist sourced from skill-creator's SKILL.md, (b) the multi-file-split decision rules (when, how — citing spec 0062's caps + conventions), and (c) the invariants-preservation playbook (what to snapshot before, what to verify after).

Phase C then applies skill-improver to Zeno's three production skills (`zeno-development`, `code-review`, `sentry-fix`), one commit per skill, lowest-stakes first (zeno-development = smoke test for skill-improver itself). The spec **does not prescribe** target shape per skill — skill-improver decides. The spec only enforces invariants (Constraints section): trigger compatibility, output format preservation, multi-file caps from spec 0062, reversibility per commit. If skill-improver's audit produces a zero-diff outcome (already best-practices-compliant), that's a valid commit too.

Phase D validates the result at three levels: package-level (`pnpm run quality-gate` 30/30 green — no production code touched), reconciler-level (boot logs cold + warm + classify smoke for profile-source watcher hot-reload — first production exercise of spec 0062's `classify` profile-prefix branch), and behavior-level (Slack E2E in `#C0EXAMPLE000` against real triggers — clone-repo for zeno-development, Sentry URL for sentry-fix, PR URL for code-review — with output baseline comparison).

The whole spec is content-only. Zero production code changes. The risk surface is entirely about not silently breaking a skill's behavior — addressed by the invariants playbook, the per-skill smoke ordering (zeno-development first), the classify smoke gate before the Slack E2E, and Rule 1 (E2E via Slack as the final gate).

## Architecture

### File structure

```
.claude/skills/
├── skill-creator/                                    # already present, just version-pin in Phase A
│   ├── version.txt                                   # NEW: upstream URL + SHA + sync date
│   └── LICENSE.txt                                   # patch placeholder copyright line
│
└── skill-improver/                                   # NEW (Phase B)
    ├── SKILL.md                                      # workflow ≤300L
    └── references/
        ├── best-practices-checklist.md
        ├── multi-file-split-pattern.md
        └── invariants-preservation.md

agent/skills/zeno-development/                        # existing — Phase C refactor commit 1
└── SKILL.md                                          # may stay single-file, may consolidate, may zero-diff

profiles/<example>/skills/code-review/                    # existing — Phase C refactor commit 2
└── SKILL.md                                          # constraint: pre-submit gate working-memory dep

profiles/<example>/skills/sentry-fix/                     # existing — Phase C refactor commit 3
└── SKILL.md                                          # may split into multi-file (skill-improver's call)
   [+ references/]                                    # if multi-file path is taken

tmp/skill-snapshots/<name>-pre/                       # ephemeral, per-skill
├── SKILL.md                                          # pre-refactor copy for diff anchor
└── invariants.yaml                                   # description / trigger_phrases / output_templates / hard_gates / phase_ordering

context/specs/2026-04-30-skills-best-practices-skill-creator/
├── spec.md                                           # 3-clean APPROVED
├── plan.md                                           # this file
└── tasks.md                                          # next file
```

### Phase ordering

| Phase | Owns | Depends on | Output |
|---|---|---|---|
| **A** Pin skill-creator | `version.txt` + LICENSE patch | none | 1 commit |
| **B** Author skill-improver | `.claude/skills/skill-improver/{SKILL.md, references/*.md}` | A done; uses skill-creator workflow | 1 commit |
| **C1** Refactor zeno-development | snapshot + invariants + propose + apply + post-check | B done; uses skill-improver | 1 commit (smoke test for skill-improver) |
| **C2** Refactor code-review | same gates | C1 clean | 1 commit |
| **C3** Refactor sentry-fix | same gates | C2 clean | 1 commit |
| **D** Quality + Docker + smoke + E2E | turbo green + boot logs + classify smoke + Slack E2E | C3 clean | verification only |

Each phase ends with a hard gate. C1 → C2 only if zeno-development's invariants check passes. C2 → C3 only if code-review's invariants check passes. D fires only if C3 lands.

### Data flow at refactor (one skill)

```
read existing SKILL.md (+ references if any)
  ↓
copy to tmp/skill-snapshots/<name>-pre/  [diff anchor]
  ↓
skill-improver audits per references/best-practices-checklist.md
  ↓
skill-improver captures invariants → tmp/skill-snapshots/<name>-pre/invariants.yaml
  ↓
skill-improver proposes refactor (markdown summary)
  ↓
maintainer approves proposal  ←  HUMAN GATE
  ↓
skill-improver applies the proposal
  ↓
skill-improver re-reads + verifies invariants intact
  ↓
git add + git commit (with invariants summary in body)
```

### Data flow at Phase D classify smoke

```
docker exec <container> sh -c 'echo "<!-- e2e marker -->" >> /app/profile/skills/<chosen-file>'
  ↓
ProfileWatcher fires on file change
  ↓ classify('profile', 'skills/<name>/...') → 'skills'  ← FIRST PROD EXERCISE
  ↓
debounced 250ms → onSkillsChanged fires
  ↓
materializeSkillsToFs runs (no-op if symlink already correct)
  ↓
log: skills_reloaded { written, deleted }    [≤5s after edit]
log: skills_materialized { written, deleted }
```

Pass criterion: both log events appear within 5s. Fail = abort + revert + file follow-up to spec 0062.

## Risks / Open Decisions

(Plan-level only — spec-level risks live in spec.md.)

- **Iteration drag in Phase B.** Authoring skill-improver via skill-creator's iterative loop could produce 5+ revisions before the maintainer is happy. The spec encourages this (eat-your-own-dog-food), but plan-level: cap at ~3 iterations. If the third iteration still feels off, ship as-is and iterate post-merge — skill-improver itself is improvable via skill-improver later.
- **zeno-development zero-diff outcome leaves Phase C1 with no proof skill-improver's refactor path actually works.** If C1 lands as a zero-diff commit (pure audit, nothing changed), then C2 is the first commit where skill-improver's apply-refactor codepath runs. Mitigation: in C2, allocate extra time for the post-refactor invariants check; if anything weird surfaces, revert + iterate skill-improver.
- **Slack E2E flakiness.** The Slack channel `#C0EXAMPLE000` is shared with prior tests. Running 3 separate triggers back-to-back may interleave with other agent activity. Mitigation: run each E2E in a fresh thread (don't reply-in-thread), wait for each to complete before sending the next, capture the response by message-ts.
- **Multi-file profile skill exposes a real bug in spec 0062's `classify`.** This is the highest-value bug for the spec to find — it's *why* the classify smoke gate exists. If it surfaces, the right move is: revert C3 (the offending commit), add an `apps/worker/tests/profile/watcher.test.ts` test case for the failing scenario, fix the watcher in a follow-up to spec 0062, then retry C3.
- **PR scope creep.** Plan keeps PR to 6-7 commits (spec + plan + tasks + Phase A + Phase B + 3× Phase C). Phase D produces no commits — only verification. If verification surfaces an issue requiring a code commit, that commit lands as a 7th-or-later commit on the same PR.
