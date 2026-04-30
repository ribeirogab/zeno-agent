---
status: draft
feature: skills-best-practices-skill-creator
created: 2026-04-30
shipped: null
---
# Spec 0063 — Skills best-practices + skill-creator authoring tools

**Status:** Draft
**Scope:** Make Zeno's three runtime skills (`zeno-development`, `fn-code-review`, `fn-sentry-fix`) follow Anthropic's skill-authoring best-practices — without losing any of their current purpose or trigger behavior — by introducing a project-local Claude Code authoring toolchain in `.claude/skills/`. **Zeno's runtime is not touched.**

## Context

Zeno's skills (the markdown playbooks loaded into the agent at runtime) were written before Anthropic published the `skill-creator` skill that documents the canonical authoring guidance. They predate spec 0062 (multi-file infrastructure), so all three are single-file `SKILL.md` documents — even `fn-sentry-fix` at 467 lines, which is over the ~500-line ceiling Anthropic's guide flags as the point where multi-file split starts paying off.

Anthropic publishes a **`skill-creator`** skill at `https://github.com/anthropics/skills/tree/main/skills/skill-creator` (Apache 2.0). It's not a runtime tool — it's a **dev-time playbook for the human (or Claude Code) authoring a skill**. The full guide lives inline in its `SKILL.md` (~32 KB), covering: trigger description tuning, three-level loading (metadata / SKILL.md body / bundled refs), anatomy (`scripts/` for deterministic code, `references/` for on-demand docs, `assets/` for output templates), domain organization, writing patterns, and the iterative draft → eval → improve loop.

The skill-creator copy is **already physically present** in this repo at `.claude/skills/skill-creator/` (full directory tree, byte-identical to upstream save for a single LICENSE placeholder line). It was committed at some point without a version pin, so there's no traceability of which upstream commit it tracks.

The project's `.claude/skills/` directory contains Claude Code skills that are **only loaded when editing this repo via Claude Code** — they don't ship in Zeno's runtime image. Existing entries: `brainstorming`, `recall`, `writing-plans`, `skill-creator` (already there). The spec adds one more: `skill-improver`.

## Problem Statement

Three concrete problems:

1. **No traceability of skill-creator version.** The copy at `.claude/skills/skill-creator/` has no `version.txt` or commit SHA pin, so a future maintainer can't tell whether it's stale relative to Anthropic's upstream.

2. **No mechanical workflow for refactoring an existing skill.** When the maintainer notices a Zeno skill drifting from best practices (frontmatter weak, body too long, structure flat), there's no playbook for how to refactor — and crucially, no guarantee that the refactor preserves the skill's original trigger behavior and intent.

3. **Zeno's three skills don't follow current best practices.** Concretely:
   - `zeno-development` (210 lines) — fine on length, but mixes prerequisites + workflow + edge cases without clear sectioning that a maintainer can scan.
   - `fn-code-review` (319 lines) — heavy use of "MUST"/"NEVER" gates that the skill-creator guide flags as the wrong tone. Reframe to *why* clauses.
   - `fn-sentry-fix` (467 lines) — over the ceiling. Should split into multi-file using spec 0062's infrastructure (`SKILL.md` slim + per-phase `references/*.md`). This is also the **first production proof** that spec 0062's multi-file infra works for a real profile-source skill, not just the synthetic smoke test from spec 0062's E2E.

## Non-Goals

- **Out of scope: changing what the Zeno skills DO.** Refactor preserves the skill's purpose, trigger phrases, behavior, and output format. The "what" and "when to trigger" are invariants. Only the "how it's organized" varies.
- **Out of scope: installing skill-creator into Zeno's runtime image.** Zeno doesn't author skills at runtime — the maintainer (Claude Code in this repo) does. skill-creator stays in `.claude/skills/`, which is dev-tooling, not Zeno's `agent/skills/`.
- **Out of scope: Python in the Zeno container.** skill-creator's Python scripts (`quick_validate.py`, `run_eval.py`, etc) run in the maintainer's local environment when needed — they're not invoked by Zeno's worker.
- **Out of scope: full eval-loop tooling.** skill-creator ships an optimization loop (`run_loop.py`) that calls `claude -p` to eval skill descriptions against test prompts. That's an opt-in workflow for the maintainer; this spec doesn't require setting up a Claude Code CLI in the dev environment. Maintainer can use the manual draft → review → ship cycle, which the SKILL.md explicitly documents as the headless fallback.
- **Out of scope: cosmetic-only refactoring.** Each refactor must produce a *measurable* improvement against a defined checklist. If a skill already passes the checklist, leave it alone.
- **Out of scope: a separate "best-practices" doc in `context/conventions/`.** Anthropic's guidance lives inline in `.claude/skills/skill-creator/SKILL.md` — duplicating it elsewhere creates a drift target. The skill-improver references skill-creator's SKILL.md directly.
- **Out of scope: refactoring the project-local Claude Code skills (`brainstorming`, `recall`, `writing-plans`).** They serve a different audience (Claude Code as project maintainer, not Zeno as agent). If they need refactoring, that's a separate spec.

## Constraints

- **Refactor preserves trigger compatibility.** A skill's `description` field is what makes the SDK match it against incoming user prompts. Any change to `description` must be tested for regression against the skill's known trigger phrases. If the original description triggered on "review this PR" / "code review", the new description must still trigger on those phrases.
- **Refactor preserves output format.** Skills like `fn-code-review` and `fn-sentry-fix` produce structured output (Slack templates, PT-BR root-cause reports, etc.). The refactor cannot change template wording, channel routing, or section order in the output. Templates that the skill quotes verbatim stay verbatim.
- **Multi-file split is the only structural change permitted.** Refactor can split a `SKILL.md` into `SKILL.md` + `references/*.md`, but cannot rearrange logic across phase boundaries. If the original skill says "Phase 1 → Phase 2 → Phase 3", the new multi-file version says the same with the same gating. The reader's mental model is identical.
- **`fn-sentry-fix` split must respect spec 0062's caps.** Per-file ≤ 1 MB, total ≤ 5 MB, file count ≤ 500. fn-sentry-fix is 30 KB total — well under all caps.
- **Multi-file structure follows skill-creator's anatomy.** `references/*.md` for prose loaded on demand. No `scripts/` or `assets/` unless functionally needed (none are needed for this refactor — the skills are pure prompts, no executables).
- **Reversibility.** Each Phase C refactor (one per Zeno skill) lands as a separate commit. Any refactor that breaks behavior gets reverted as a single revert without affecting the others.
- **Constitution principles:** Rule of Parsimony (don't duplicate Anthropic's guidance; reference it). Rule of Repair (E2E proves the refactor didn't break runtime behavior). Rule of Transparency (the skill-improver's checklist is a markdown doc the maintainer can read, not a hidden agent prompt).

## User Stories / Scenarios

1. **Maintainer wants to create a new Zeno skill.** Says to Claude Code: "Create a new skill that does X." Claude Code recognizes the trigger from `.claude/skills/skill-creator/SKILL.md`'s description, follows the iterative authoring loop, produces a draft skill in `agent/skills/<name>/` or `profiles/<n>/skills/<name>/`, and asks the maintainer to validate before committing.

2. **Maintainer wants to refactor an existing Zeno skill.** Says: "Refactor `fn-sentry-fix` to follow best practices." Claude Code recognizes the trigger from `.claude/skills/skill-improver/SKILL.md`. The improver: (a) reads the current SKILL.md and extracts the invariants — purpose, trigger phrases, output format, phase ordering; (b) audits against a checklist (frontmatter strength, body length, tone, structure, multi-file applicability); (c) proposes a refactor plan that preserves the invariants; (d) asks the maintainer to confirm the plan; (e) applies the refactor; (f) re-reads the result and verifies the invariants are still intact; (g) commits.

3. **Maintainer wants to verify skill-creator is up to date.** Reads `.claude/skills/skill-creator/version.txt` to see which upstream SHA is pinned. Compares against `git ls-remote https://github.com/anthropics/skills HEAD`. If drift: optionally re-sync (out of scope for this spec; mechanical task once the version pin exists).

4. **Zeno (in production) handles a Sentry issue after fn-sentry-fix is split.** Operator pings Zeno with a Sentry URL. Zeno's worker has loaded the new slim `SKILL.md` from `profiles/fn/skills/fn-sentry-fix/SKILL.md`. The agent reads the `## When triggered` section, follows the workflow, follows the `→ see references/phase-1-discovery.md` pointer when it needs that level of detail, completes the issue per the same output contract as before. Operator sees the same end result; only the internals changed.

## Success Criteria

**Phase A — version pinning (skill-creator)**
- [ ] `.claude/skills/skill-creator/version.txt` exists with three lines: `upstream`, `sha`, `synced` (URL of upstream repo, full commit SHA from `tmp/anthropic-skills/.git/HEAD`, ISO date of when this version was pinned).
- [ ] `.claude/skills/skill-creator/LICENSE.txt`'s copyright line replaced with `Copyright 2026 Anthropic, PBC.` to match upstream exactly (currently has placeholder `[yyyy] [name of copyright owner]`).
- [ ] No new files added beyond `version.txt` and the LICENSE patch. The skill-creator is otherwise byte-identical to upstream.

**Phase B — author skill-improver (using skill-creator)**
- [ ] `.claude/skills/skill-improver/SKILL.md` exists with valid frontmatter (`name: skill-improver`, `description` covering both English and Portuguese trigger phrases like "refactor skill", "atualizar skill", "melhorar skill", "skill audit"), kebab-case name passes regex `^[a-z][a-z0-9-]*$`.
- [ ] `.claude/skills/skill-improver/references/best-practices-checklist.md` exists with audit items derived from skill-creator's SKILL.md (frontmatter strength, body length thresholds, tone, structure). Items are checkboxes the auditor can tick when reviewing a target skill. Cites skill-creator as the canonical source via relative path link.
- [ ] `.claude/skills/skill-improver/references/multi-file-split-pattern.md` exists with: when to split (>300 lines AND distinct phases), how to split (extract phases to `references/`, keep SKILL.md as overview + workflow + trigger), how to reference inside SKILL.md (`See [phase-1-discovery.md](references/phase-1-discovery.md) for detailed steps`). Cites spec 0062's multi-file infra.
- [ ] `.claude/skills/skill-improver/references/invariants-preservation.md` exists with the playbook: (a) snapshot original SKILL.md description and key trigger phrases before refactor; (b) extract output formats (templates, channel IDs, section orders) verbatim; (c) confirm "what" + "when to trigger" + "output shape" appear identically in the new structure; (d) test that trigger phrases still match the new description.
- [ ] skill-improver's body is under 300 lines (it's a workflow skill, not a phase-deep reference; if it exceeds 300, split it itself).
- [ ] **The skill-improver was authored by following skill-creator's workflow.** PR description includes a brief prose note (e.g., "authored via skill-creator iterative loop, ~3 iterations: initial draft → refined invariants playbook → audit checklist clarified after first dry-run on zeno-development"). This is a required prose note, not a gated checklist item — substance matters more than format.

**Phase C — apply `skill-improver` to refactor Zeno's three skills**

The spec does NOT prescribe target structure, line counts, section names, or whether each skill should split into multi-file. Those are skill-improver's job. The spec only sets the constraints (Constraints section above) and the gates below. Each skill goes through the skill-improver workflow (read → audit → propose → confirm → apply → verify invariants), one commit per skill, in this order: `zeno-development` → `fn-code-review` → `fn-sentry-fix`.

*Universal per-skill gates (apply to all three):*
- [ ] **Pre-refactor snapshot:** copy the current SKILL.md (and any existing `references/`) to `tmp/skill-snapshots/<name>-pre/`. The snapshot is the regression baseline for diff + behavior comparison.
- [ ] **Pre-refactor invariants capture:** skill-improver writes a YAML file at `tmp/skill-snapshots/<name>-pre/invariants.yaml` with these keys:
  ```yaml
  description: |
    <full description text verbatim>
  trigger_phrases:           # 5+ phrases EN + PT-BR
    - "review this PR"
    - "revisa essa PR"
    - ...
  output_templates:          # verbatim quoted strings/sections from the body
    - id: "Template A"
      text: |
        <full template text>
  hard_gates:                # exact phrases the agent must continue to honor
    - "DELETE the entire draft"
    - "NEVER expose user secrets in logs"
  phase_ordering:            # workflow steps in canonical order
    - "Phase 1: Discovery"
    - "Phase 2: Deep analysis"
    - ...
  ```
  This file is the contract the post-refactor must honor and the diff anchor for the post-refactor invariants check.
- [ ] **skill-improver proposes the refactor.** The proposal is a markdown summary covering: (a) what changed (diff overview), (b) which best-practices-checklist items improved, (c) explicit invariants-preservation evidence — for each captured invariant, a pointer to where it lives in the new structure. Maintainer reviews + approves the proposal before any file is written.
- [ ] **Apply the refactor.** Whatever shape skill-improver produced — single-file polish, multi-file split, anything in between — gets written. The only structural rule the spec enforces: if multi-file, the structure must respect spec 0062's caps (5 MB total, 1 MB per file, 500 files) and conventions (`SKILL.md` at root, `references/*.md` for on-demand prose, no `scripts/` or `assets/` unless functionally needed).
- [ ] **Post-refactor invariants check.** skill-improver re-reads the new structure and confirms each captured invariant is present and intact. If any invariant is missing or altered, refactor is rolled back and re-iterated.
- [ ] **Each refactor is one commit, independently revertable.** Commit body documents which best-practices-checklist items improved + a copy of the invariants-preservation evidence. No bundling.

*Skill-specific notes (constraints only, NOT prescribed shape):*
- `zeno-development` is currently 210 lines, single-file. Already under typical ceilings — skill-improver may decide no structural change is needed beyond minor polish, or may decide to consolidate redundant sections. Either is acceptable as long as gates pass. **Zero-diff outcome is acceptable** — if skill-improver's audit finds nothing to improve, the commit still lands documenting "audit passed, no change needed" + the invariants snapshot.
- `fn-code-review` is currently 319 lines, single-file. Contains a pre-submit gate that searches the body's literal text for forbidden phrases AND requires Templates A/B/C/D to be available at execution time for rewriting. The gate's working-memory dependency is an invariant captured in the pre-refactor pass — skill-improver decides how to respect it (likely: keep inline, but skill-improver's call).
- `fn-sentry-fix` is currently 467 lines, single-file — over Anthropic's typical ~500-line ceiling. Strong candidate for multi-file split, but the decision is skill-improver's. Whatever shape lands, it's the **first profile-source skill exercising spec 0062's multi-file infra in production** if the split happens, which makes Phase D's classify smoke test even more important.

**Phase D — quality gate + E2E**
- [ ] `pnpm run quality-gate` — 30/30 turbo green. No new tests; no production code changes; the gate just re-validates that nothing in the storage/worker/api/dashboard packages is affected by skill content changes.
- [ ] Docker rebuild (`PROFILE=fn pnpm run docker:build`) — image builds clean.
- [ ] zeno-fn boot (`PROFILE=fn pnpm run docker:up`) verified by:
  - **Test environment assumption:** the `dashboard` field reflects the count of UPSERTs from `/workspace/skills/`. The expected values below assume a clean test environment with **no dashboard-source skills** in the volume — the typical state of a fresh zeno-fn boot. If the test container has dashboard-source skills installed (e.g., from prior E2E runs), the field will be non-zero; that's not a regression, just a different starting state. Verify by inspecting `/workspace/skills/` before the boot test.
  - **Cold-boot path** (fresh DB): boot log MUST show `skills_seeded zenoDefault: 1, profile: 2, dashboard: 0` — zeno-development from agent + fn-code-review + fn-sentry-fix from profile, newly inserted.
  - **Warm-boot path** (current production DB): boot log shows `skills_seeded zenoDefault: 1, profile: 0, dashboard: 0` — `profile` field is the count of NEWLY-INSERTED rows per spec 0053 INSERT-OR-IGNORE semantics (both profile rows already exist). The implementer must not interpret `profile: 0` as a regression.
  - Either way: NO error logs related to `skills_seeded`, no `skills_dashboard_orphan_cleanup_skipped` WARNs, no `skill_path_invalid` rejections.
- [ ] Symlink check inside container: each profile skill resolves to its canonical path. For any skill that came out of Phase C as multi-file (skill-improver's call), the symlink target must contain the full multi-file structure (`SKILL.md` + `references/`).
- [ ] **Profile-source watcher classify smoke test (NEW — first time exercised in production).** Spec 0062 line 99 added the `classify` extension that maps `(source: 'profile', filename: 'skills/<name>/...')` → `'skills'` so edits inside profile skills fire hot-reload. Spec 0062's E2E only proved this for `dashboard` source. **Smoke target** = any file under any profile skill's canonical dir; if Phase C produced a multi-file skill, target one of its references; otherwise target the profile skill's `SKILL.md` directly. Steps:
  1. Confirm the container name: `docker ps --format '{{.Names}}' | grep zeno-fn` (typically `zeno-fn-agent-1`).
  2. Inside the container, append a byte to the chosen profile-skill file. Concrete example: `docker exec <container> sh -c 'echo "<!-- e2e marker -->" >> /app/profile/skills/fn-sentry-fix/SKILL.md'`. If Phase C produced a multi-file skill, target one of its references files instead (e.g., `fn-sentry-fix/references/phase-1-discovery.md`).
  3. Tail worker logs for ~5s: `docker logs <container> -f --since 10s`.
  4. Expected: `skills_reloaded` + `skills_materialized` log events fire (debounced 250ms). If no event fires, the `classify` profile-prefix branch is broken — STOP, file follow-up to spec 0062, revert the offending Phase C commit if multi-file was the trigger.
- [ ] **E2E in `#C0EXAMPLE000` (per Rule 1):**
  - Send a message that triggers `zeno-development` (e.g., "clone repo X and add Y"). Zeno reads the (now slimmer) SKILL.md and executes. Same workflow, same output.
  - **Send a Sentry URL that triggers `fn-sentry-fix`.** Goal: exercise the full skill end-to-end and confirm output matches the original behavior. **Issue selection** (preference order):
    1. A SENTRY-ID Operator previously resolved via fn-sentry-fix where confidence-gate-passed AND PR-opened (best — exercises the full Phase 1→7 chain including any references files Phase C may have produced). If known, use it.
    2. Any open Sentry issue with an obvious / well-documented stack trace (the agent will likely pass the confidence gate and trigger the PR path).
    3. If neither is available, run the test against the simplest open Sentry issue. If the agent ESCALATES instead of opening a PR, that's still a valid behavior preservation check (ESCALATE was a valid output of the original skill too) — the test passes as long as the ESCALATE shape matches the original Phase 3 output.
    The implementer asks Operator for a recommended issue if the local repo / shell history yields nothing.
  - Send a PR URL to trigger `fn-code-review`. Zeno reads the (single-file) SKILL.md and posts the reply in Slack format A/B/C/D as before.
  - Verify: each end-state output matches what the original skill produced. No regression.

**Branch review (Rule 2 — 3 consecutive clean):**
- [ ] R1, R2, R3 with reset on any BLOCKING.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Any refactor changes behavior subtly (agent loses a hard-gate, skips a malformed reference link, drops a verbatim template, etc.). | skill-improver's invariants-preservation playbook (Phase B reference file) + universal Phase C gates (pre-snapshot, invariants capture, proposal review, post-refactor invariants check). E2E in Slack on a real trigger per skill (Rule 1) is the final gate; revert if output drifts from baseline. |
| Refactored description triggers worse than original (under-triggers in PT-BR or EN). | skill-improver captures 5+ trigger phrases (EN + PT-BR) in the pre-refactor invariants snapshot; the post-refactor description is checked phrase-by-phrase before the refactor lands. |
| Phase C produces a multi-file output that exposes a bug in spec 0062's profile-source handling (e.g., the `classify` profile-prefix branch never fires). | Phase D's classify smoke test (file-edit → expect `skills_reloaded` log within 5s) is gated BEFORE the Slack E2E. If smoke fails, revert the offending Phase C commit and file a follow-up to spec 0062. |
| skill-improver itself is buggy (its own checklist is wrong, its invariants check is incomplete). | The maintainer uses skill-creator's iterative loop to author skill-improver in Phase B (eat-your-own-dog-food). Phase C's first refactor (`zeno-development`, the lowest-stakes target) acts as a smoke test for skill-improver itself — any failure rolls back into Phase B refinement before touching the higher-stakes skills. |
| Refactor PR is large (multiple skill files changed at once). | Phase C ships one refactor per commit (`zeno-development` → `fn-code-review` → `fn-sentry-fix`). Each commit is independently revertable. The PR reviewer spot-checks by commit. |

## Open Questions

None — the counterpoint round resolved the five owner decisions:
- skill-creator stays at `.claude/skills/skill-creator/` (Zeno's runtime image is untouched).
- No Python deps added to Zeno's container.
- No dashboard "Marketplace" affordance.
- No paraphrased best-practices doc — the skill-improver's references files cite skill-creator's SKILL.md directly.
- One-skill-at-a-time refactor (each commit independently revertable). **Spec does not prescribe target shape per skill** — that's skill-improver's job at execution time. The shape is open; the **Constraints section above (trigger compatibility, output format preservation, multi-file caps from spec 0062, reversibility, etc.) still binds** every Phase C refactor regardless of shape.

## References

- Spec 0052 (skills v1, single SKILL.md): `context/specs/0052-skills/spec.md`
- Spec 0053 (source enum): `context/specs/0053-zeno-default-skills/spec.md`
- Spec 0062 (skills multi-file infra): `context/specs/0062-skills-multi-file-impl/spec.md`
- Anthropic skill-creator upstream: https://github.com/anthropics/skills/tree/main/skills/skill-creator (Apache 2.0)
- Already in repo: `.claude/skills/skill-creator/SKILL.md` (canonical authoring guide)
