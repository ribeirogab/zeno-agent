---
feature: skills-best-practices-skill-creator
plan: "[[plan-skills-best-practices-skill-creator]]"
spec: "[[spec-skills-best-practices-skill-creator]]"
created: 2026-04-30
---
# Spec 0063 — Skills best-practices + skill-creator authoring tools — Tasks

**For this plan:** `[[plan-skills-best-practices-skill-creator]]`

> **Implementer note:** every refactor in Phase C uses skill-improver (Phase B's deliverable). The spec does NOT prescribe target shape per skill — skill-improver decides at execution time. Owner mode (Rule 4): drive without checkpoints between phases. Stop only on a real blocker.

## Phase A — Pin skill-creator upstream version

### Task A.1 — Confirm upstream SHA

- [ ] `cd /Users/operator/www/octocat/zeno-agent/tmp/anthropic-skills && git rev-parse HEAD` → captures the upstream commit SHA. Already known: `5128e1865d670f5d6c9cef000e6dfc4e951fb5b9` (per recon).
- [ ] If the local clone has drifted (`git pull` shows updates), use `git pull --ff-only` then re-capture HEAD. The version pin always reflects the *current* state of the local clone, not whatever GitHub has now.

### Task A.2 — Write `version.txt`

- [ ] Create `.claude/skills/skill-creator/version.txt` with three lines:
  ```
  upstream: https://github.com/anthropics/skills/tree/main/skills/skill-creator
  sha: 5128e1865d670f5d6c9cef000e6dfc4e951fb5b9
  synced: 2026-04-30
  ```

### Task A.3 — Patch LICENSE.txt

- [ ] Open `.claude/skills/skill-creator/LICENSE.txt`, find the placeholder line `Copyright [yyyy] [name of copyright owner]` (currently around line 190).
- [ ] Replace with `Copyright 2026 Anthropic, PBC.` to match upstream byte-exact.
- [ ] `diff -r .claude/skills/skill-creator/ tmp/anthropic-skills/skills/skill-creator/` should now report only the `version.txt` addition (which doesn't exist upstream).

### Task A.4 — Commit Phase A

- [ ] `git add .claude/skills/skill-creator/version.txt .claude/skills/skill-creator/LICENSE.txt`
- [ ] Commit:
  ```
  chore(skills): pin skill-creator upstream version (spec 0063 Phase A)

  - .claude/skills/skill-creator/version.txt: upstream URL + SHA + sync date
  - LICENSE.txt: replace placeholder copyright line with Anthropic upstream
    text. .claude/skills/skill-creator/ is now byte-identical to upstream
    save for the new version.txt.
  ```

## Phase B — Author skill-improver via skill-creator

### Task B.1 — Read skill-creator's authoring guide

- [ ] Read `.claude/skills/skill-creator/SKILL.md` end-to-end. Note key sections: "Capture Intent", "Interview and Research", "Write the SKILL.md", "Skill Writing Guide", "Test Cases".
- [ ] Read `.claude/skills/skill-creator/references/schemas.md` to understand the eval/grading data shapes (helpful context but not needed for skill-improver).
- [ ] Re-read project's three Zeno skills (`agent/skills/zeno-development/SKILL.md`, `profiles/fn/skills/fn-code-review/SKILL.md`, `profiles/fn/skills/fn-sentry-fix/SKILL.md`) to understand the variety of shapes skill-improver must handle.

### Task B.2 — Draft `skill-improver/SKILL.md`

- [ ] Create `.claude/skills/skill-improver/` directory.
- [ ] Write `SKILL.md` as a workflow skill. Frontmatter must:
  - `name: skill-improver`
  - `description` covers EN + PT-BR triggers ("refactor skill", "atualizar skill", "melhorar skill", "skill audit", "skill best practices")
  - kebab-case name passes `^[a-z][a-z0-9-]*$`
- [ ] Body covers the workflow: read target skill → copy to `tmp/skill-snapshots/<name>-pre/` → load best-practices checklist + invariants playbook → audit → propose → wait for maintainer approval → apply → post-check invariants → commit. Body ≤ 300 lines.

### Task B.3 — Draft `references/best-practices-checklist.md`

- [ ] Create `.claude/skills/skill-improver/references/best-practices-checklist.md`. Source: `.claude/skills/skill-creator/SKILL.md` writing-guidelines sections.
- [ ] Format: checklist items the auditor can tick. Examples:
  - [ ] Frontmatter: `name` is kebab-case, single line. `description` is "pushy" + names trigger phrases (verbs/nouns) + states WHAT and WHEN. ≥ 3 trigger phrases visible.
  - [ ] Body length: under ~500 lines OR clearly justified longer.
  - [ ] Tone: imperative voice. "MUST"/"NEVER" used sparingly + with stated reasons.
  - [ ] Structure: scannable headings, no walls of text.
  - [ ] Multi-file: scripts/ for code, references/ for prose loaded on demand, assets/ for output templates. Empty if not needed.
- [ ] Cite skill-creator's SKILL.md by relative path so the checklist always resolves to upstream wording: `[skill-creator's authoring guide](../../skill-creator/SKILL.md)`.

### Task B.4 — Draft `references/multi-file-split-pattern.md`

- [ ] Create `.claude/skills/skill-improver/references/multi-file-split-pattern.md`. Cover:
  - When to split: body > ~300 lines AND distinct phases / sections / variants that can be loaded on demand.
  - When NOT to split: hard-gate dependencies on inline content (e.g., fn-code-review's pre-submit gate). The constraint is "what does the agent need in working memory at execution time?" — anything that does, stays inline.
  - How to split: `SKILL.md` keeps overview + workflow + trigger + invariant content; `references/<phase-or-topic>.md` for on-demand depth.
  - How to reference: inline pointer in SKILL.md like `> See [references/<file>](references/<file>.md) for detailed steps.`
  - Caps from spec 0062: 1 MB per file, 5 MB total per skill, ≤ 500 files per skill.

### Task B.5 — Draft `references/invariants-preservation.md`

- [ ] Create `.claude/skills/skill-improver/references/invariants-preservation.md`. Cover:
  - Pre-refactor: snapshot SKILL.md (and existing references/, if any) to `tmp/skill-snapshots/<name>-pre/`.
  - Pre-refactor: capture invariants to `tmp/skill-snapshots/<name>-pre/invariants.yaml` per the schema in spec 0063 Phase C universal gates (`description`, `trigger_phrases`, `output_templates`, `hard_gates`, `phase_ordering`).
  - Trigger-phrase capture: read the description, infer 5+ phrases EN + PT-BR that the description currently matches. Validate by mental simulation: would the SDK match this phrase against the description?
  - Output-template capture: `grep` the body for verbatim quoted strings (often inside ``` fences or after `>` blockquotes). Each verbatim quote is an invariant.
  - Hard-gate capture: search for "MUST", "NEVER", "DELETE", "ALWAYS" patterns. Each is an invariant — skill-improver may reframe ("we use X because Y" instead of "MUST use X") but the BEHAVIOR (use X) must remain enforced.
  - Phase-ordering capture: list the workflow steps in canonical order.
  - Post-refactor: re-read the new structure; for each captured invariant, locate where it lives now. If any invariant is missing or altered semantically, the refactor is rolled back.

### Task B.6 — Iterate via skill-creator's loop

- [ ] Per skill-creator's "Capture Intent" → "Write the SKILL.md" → "Run test cases" → "Iterate" loop, dry-run skill-improver mentally on each Zeno skill and ask: would the workflow + checklist + playbook produce a sensible refactor? If gaps surface, refine.
- [ ] Document iterations in a working note (≤ 200 words) for the PR description.

### Task B.7 — Commit Phase B

- [ ] `git add .claude/skills/skill-improver/`
- [ ] Commit:
  ```
  feat(skills): author skill-improver in .claude/skills/ (spec 0063 Phase B)

  New project-local Claude Code skill that audits an existing SKILL.md
  against Anthropic best-practices (sourced from skill-creator's SKILL.md
  via reference link, not paraphrased) and proposes a refactor that
  preserves the skill's invariants — description, trigger phrases,
  output templates, hard gates, phase ordering.

  References:
  - best-practices-checklist.md (audit items)
  - multi-file-split-pattern.md (when/how to split, citing spec 0062 caps)
  - invariants-preservation.md (snapshot + YAML schema + post-check)

  Authored via skill-creator iterative loop. Iterations: <N>.
  ```

## Phase C — Refactor Zeno's three skills using skill-improver

> **Universal per-skill flow** (apply uniformly to C1 → C2 → C3):
> 1. Snapshot to `tmp/skill-snapshots/<name>-pre/` (copy SKILL.md + any existing references/).
> 2. Capture invariants to `tmp/skill-snapshots/<name>-pre/invariants.yaml`.
> 3. skill-improver proposes refactor (markdown summary).
> 4. Owner approves proposal (this is me — autonomous mode, but explicit "approving" before each refactor in case mid-flight rethink is needed).
> 5. Apply proposal.
> 6. Post-refactor: re-read; verify each invariants.yaml entry still present + intact.
> 7. Commit. Body documents which checklist items improved + paste the post-check confirmation.
>
> If post-check fails, roll back (`git checkout -- <files>`) and iterate.

### Task C1.1 — Refactor zeno-development (smoke test for skill-improver)

- [ ] Snapshot: `mkdir -p tmp/skill-snapshots/zeno-development-pre && cp agent/skills/zeno-development/SKILL.md tmp/skill-snapshots/zeno-development-pre/`
- [ ] Capture invariants → `tmp/skill-snapshots/zeno-development-pre/invariants.yaml`
- [ ] Run skill-improver workflow → produces a proposal
- [ ] Approve proposal (owner gate; document the call inline as a comment in the commit body)
- [ ] Apply
- [ ] Post-check invariants
- [ ] Commit:
  ```
  refactor(skills): zeno-development per best-practices (spec 0063 Phase C1)

  Smoke test for skill-improver itself — lowest-stakes refactor target.

  Improvements: <list checklist items improved, OR "audit passed,
  zero-diff" if no change was needed>.

  Invariants preserved:
  - description trigger phrases: <count>
  - output templates: <count>
  - hard gates: <count>
  - phase ordering: intact

  Snapshot: tmp/skill-snapshots/zeno-development-pre/
  ```

### Task C2.1 — Refactor fn-code-review

- [ ] Same flow as C1.1, target: `profiles/fn/skills/fn-code-review/SKILL.md`
- [ ] **Specific attention:** the pre-submit gate's working-memory dependency on Templates A/B/C/D is an invariant. skill-improver MUST capture this in `hard_gates` or `output_templates` and verify the post-refactor structure preserves working-memory access.
- [ ] Commit `refactor(skills): fn-code-review per best-practices (spec 0063 Phase C2)`

### Task C3.1 — Refactor fn-sentry-fix

- [ ] Same flow, target: `profiles/fn/skills/fn-sentry-fix/SKILL.md`
- [ ] **Specific attention:** at 467 lines this is the strongest multi-file split candidate. If skill-improver decides to split:
  - Files land at `profiles/fn/skills/fn-sentry-fix/SKILL.md` + `profiles/fn/skills/fn-sentry-fix/references/*.md`
  - Caps respected: 1 MB/file, 5 MB total, ≤ 500 files (well within all three for any sensible split)
  - This is the **first profile-source multi-file skill in production**. Phase D's classify smoke test gates this.
- [ ] Commit `refactor(skills): fn-sentry-fix per best-practices (spec 0063 Phase C3)`

## Phase D — Quality gate + Docker rebuild + classify smoke + Slack E2E

### Task D.1 — Quality gate

- [ ] `pnpm run quality-gate`
- [ ] Expect: 30/30 turbo green. No new tests; no production code changed; the gate just confirms storage / worker / api / dashboard packages are unaffected.

### Task D.2 — Docker rebuild

- [ ] `PROFILE=fn pnpm run docker:build`
- [ ] Expect: image `zeno-agent:dev` rebuilt cleanly.

### Task D.3 — Container restart

- [ ] `PROFILE=fn pnpm run docker:down`
- [ ] `PROFILE=fn pnpm run docker:up`
- [ ] Confirm container name: `docker ps --format '{{.Names}}' | grep zeno-fn` → typically `zeno-fn-agent-1`.

### Task D.4 — Boot log check

- [ ] Tail boot logs: `docker logs <container> 2>&1 | grep -E "skills_seeded|skills_materialized|profile_watcher_started|zeno_online|skills_dashboard_orphan_cleanup_skipped|skill_path_invalid"`
- [ ] Expected on warm boot (current production DB):
  - `skills_seeded zenoDefault: 1, profile: 0, dashboard: 0` — `profile: 0` because INSERT-OR-IGNORE no-ops both rows.
  - `skills_materialized written: 3, deleted: 0` — symlinks for 3 skills (zeno-development + fn-code-review + fn-sentry-fix).
  - 3× `profile_watcher_started` (agent / profile / skills sources).
  - `zeno_online`.
  - **NO** `skills_dashboard_orphan_cleanup_skipped` WARNs.
  - **NO** `skill_path_invalid` rejections.
- [ ] If any expected event is missing OR an unexpected error appears, abort and investigate before proceeding to D.5.

### Task D.5 — Profile-source classify smoke test (FIRST PROD EXERCISE)

- [ ] Choose a target file inside the running container's profile skills:
  - If C3 produced a multi-file fn-sentry-fix: target `/app/profile/skills/fn-sentry-fix/references/<some-reference>.md`.
  - Otherwise: target `/app/profile/skills/fn-sentry-fix/SKILL.md`.
- [ ] Append a marker:
  ```
  docker exec <container> sh -c 'echo "<!-- e2e marker $(date -u +%s) -->" >> /app/profile/skills/<chosen-file>'
  ```
- [ ] Tail logs for ≤ 5 seconds: `docker logs <container> -f --since 10s 2>&1 | grep -E "skills_reloaded|skills_materialized"`
- [ ] Expected: both `skills_reloaded` AND `skills_materialized` events fire (debounced 250ms after the file write).
- [ ] **If no event fires within 5s:** abort. The `classify` profile-prefix branch in spec 0062 is broken. Steps:
  1. Revert C3 (the offending Phase C commit, if multi-file was the trigger).
  2. File a follow-up to spec 0062 with the failing reproduction.
  3. Stop here — Phase D fails until the classify path is fixed.
- [ ] If event fires: revert the marker line so the SKILL.md / reference file is back to its committed shape: `docker exec <container> sh -c 'sed -i "/<!-- e2e marker .* -->/d" /app/profile/skills/<chosen-file>'`

### Task D.6 — Slack E2E: zeno-development

- [ ] In `#C0EXAMPLE000` (`https://acme.slack.com/archives/C0EXAMPLE000`), send (mentioning the bot via `<@U0EXAMPLE000>`):
  ```
  <@U0EXAMPLE000> clone repo X (use a real repo, e.g. octocat/zeno-agent) and add a no-op comment to README.md, open a draft PR
  ```
- [ ] Wait for response (typically 30-60s).
- [ ] Compare output against baseline behavior of zeno-development pre-refactor:
  - Used `gh repo clone` (or equivalent) ✓
  - Created a worktree under `~/work/...` ✓
  - Followed conventional-commits format on the commit ✓
  - Opened the PR with proper title/body format ✓
- [ ] Pass criterion: same workflow steps, same output structure. Cosmetic differences in wording = OK. Different workflow = FAIL.

### Task D.7 — Slack E2E: fn-sentry-fix

- [ ] Issue selection per Phase D 3-tier preference:
  1. Best: a SENTRY-ID Operator resolved before via fn-sentry-fix. Search shell history / prior session transcripts.
  2. Backup: any open Sentry issue with an obvious stack trace.
  3. Fallback: simplest open Sentry issue, ESCALATE result is acceptable.
  - If none findable: ask Operator for a recommendation in a Slack thread (won't happen in autonomous mode — pick option 2 or 3).
- [ ] Send to channel: `<@U0EXAMPLE000> investigar essa issue do sentry: <SENTRY_URL>`
- [ ] Wait for completion (can take 2-5 minutes for full Phase 1-7).
- [ ] Compare output against baseline:
  - Phase 1: Sentry data fetched (issue title, breadcrumbs, traces) ✓
  - Phase 3: confidence gate decision logged ✓
  - If passed: Phase 5 hands off to zeno-development; Phase 7 produces PT-BR root-cause report
  - If escalated: Phase 3 escalation message in `#C0EXAMPLE001` (or wherever fn-sentry-fix routes escalations)
- [ ] Pass criterion: behavior matches one of the original Phase outcomes (PR or ESCALATE). Output format intact.

### Task D.8 — Slack E2E: fn-code-review

- [ ] Pick any small PR URL (a Zeno test PR works fine — the bot can review its own repo's PRs).
- [ ] Send: `<@U0EXAMPLE000> revisa essa PR: <PR_URL>`
- [ ] Wait for response (~1-2 minutes).
- [ ] Compare against baseline:
  - Reply uses one of Templates A/B/C/D ✓
  - "Forbidden in your output" gates honored (no emojis, no praise, no "Looks good!" without analysis) ✓
  - Slack-native formatting (no markdown headers in Slack) ✓
- [ ] Pass criterion: same template structure, same forbidden-words gating. If pre-submit gate misfires (template not matched, or forbidden word slipped through), Phase C2 needs a revisit.

### Task D.9 — Final 3-round review (Rule 2)

- [ ] R-final-1: re-read every changed file vs the spec. Note any drift. Reset on findings.
- [ ] R-final-2: run `git diff main...HEAD` end-to-end. Look for stale references, broken links, mismatched paths.
- [ ] R-final-3: re-read the spec's Constraints section; confirm each binding constraint is honored across all Phase C commits.

### Task D.10 — PR

- [ ] `git push -u origin feat/spec-0063-skills-best-practices`
- [ ] Use `/open-pr` slash command. Title: `feat: skills best-practices + skill-creator authoring tools (spec 0063)`. Body should include:
  - Phase summary
  - Per-skill diff stats
  - skill-improver authoring iterations note
  - Slack E2E results (3 triggers, all green)
  - classify smoke result (passed at <timestamp>)
  - Reference to `context/specs/2026-04-30-skills-best-practices-skill-creator/spec.md`
