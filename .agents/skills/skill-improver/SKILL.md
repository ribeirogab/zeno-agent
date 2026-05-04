---
name: skill-improver
description: Refactor or audit an existing skill against Anthropic best-practices while preserving its purpose, trigger behavior, and output format. Use when the user asks to improve, refactor, audit, or update a skill — including English phrases like "refactor this skill", "audit skill X", "apply best practices to skill", "improve this skill", "skill audit", "make this skill cleaner", AND Portuguese phrases like "melhorar skill", "atualizar skill", "auditar skill", "aplicar boas práticas", "refatorar skill", "limpar skill". This skill does NOT create new skills (use `skill-creator` for that) and does NOT change WHAT a skill does — only HOW it's organized.
---

# Skill Improver

Refactor existing skills following Anthropic's best-practices guidance (sourced from [`skill-creator`](../skill-creator/SKILL.md)) **without changing what the skill does**. Trigger phrases, output formats, hard-gates, and phase ordering are invariants — captured before any change and verified after.

## When to use

The user asks to:

- "refactor", "audit", "improve", "atualizar", "auditar", "melhorar", "aplicar boas práticas" + reference to a skill (path or name)
- "this skill is too long" / "this skill has too many sections" / "split this skill"
- "apply Anthropic best-practices to skill X"

The user is NOT asking to:

- Create a new skill from scratch → use `skill-creator`.
- Change a skill's behavior, trigger, or output format → that's a content change, not a refactor. Push back: "this isn't a refactor — what should the skill DO differently?"

## Workflow

### Step 1 — Identify the target

Get the absolute path to the skill's `SKILL.md`. Examples:

- `agent/skills/zeno-development/SKILL.md` (zeno_default source — image-baked)
- `profiles/<example>/skills/code-review/SKILL.md` (profile source)
- `/workspace/skills/<name>/SKILL.md` (dashboard source — uploaded zip)
- `.claude/skills/<name>/SKILL.md` (project-local Claude Code skill)

If the skill already has a `references/` directory, list it. Note any `scripts/` or `assets/`.

### Step 2 — Snapshot the current state

Copy the entire skill directory tree to `tmp/skill-snapshots/<name>-pre/`. This is the diff anchor. Use plain `cp -r`:

```bash
mkdir -p tmp/skill-snapshots/<name>-pre/
cp -r <skill-dir>/* tmp/skill-snapshots/<name>-pre/
```

### Step 3 — Capture invariants

Write `tmp/skill-snapshots/<name>-pre/invariants.yaml` per the schema in [`references/invariants-preservation.md`](references/invariants-preservation.md). The five required keys: `description`, `trigger_phrases`, `output_templates`, `hard_gates`, `phase_ordering`.

This file is the **contract** the post-refactor must honor. Skip nothing — better to over-capture than miss an invariant.

### Step 4 — Audit against best-practices

Read [`references/best-practices-checklist.md`](references/best-practices-checklist.md). Walk each item, ticking ✓ or ✗ on the current skill:

- Frontmatter strength (description "pushy", trigger phrases visible, kebab-case name)
- Body length (under ~500 lines, or clearly justified longer)
- Tone (imperative, "MUST"/"NEVER" used sparingly with stated reasons)
- Structure (scannable headings, no walls of text)
- Multi-file applicability (when split helps, when it hurts — see `multi-file-split-pattern.md`)

For each ✗, note WHY in one sentence. The audit output is a markdown summary.

### Step 5 — Propose the refactor

Write a proposal as a markdown summary covering:

1. **What changed** — bullet list of structural changes (sections consolidated, references created, tone reframings).
2. **Which checklist items improved** — map each ✗ from Step 4 to a fix.
3. **Invariants-preservation evidence** — for each entry in `invariants.yaml`, explain where it lives in the new structure.
4. **Risk notes** — anything that could go wrong (hard-gates whose working-memory dependencies might break if moved to a reference; templates whose verbatim quoting is fragile; etc.).

Show the proposal to the maintainer. **Do not write any production file yet.**

### Step 6 — Maintainer approval gate

Wait for explicit approval (or rejection-with-changes). If rejected, iterate the proposal — do not push approval. Common reasons for rejection: scope too aggressive (audit found 8 things, propose only the top 2-3); too cosmetic (no improvement worth the risk); missing an invariant in the analysis.

If the maintainer is autonomous (this is also valid), the gate becomes a self-approval moment. State the call inline.

### Step 7 — Apply

Whatever shape the proposal landed on, write it. Constraints that bind regardless of shape:

- Description still matches every entry in `invariants.yaml::trigger_phrases` (mental simulation).
- Every output template from `invariants.yaml::output_templates` lives somewhere in the new structure (inline or referenced).
- Every hard-gate from `invariants.yaml::hard_gates` is preserved as a behavioral instruction (may be reworded to "we do X because Y" instead of "MUST X" — but the agent still does X).
- `phase_ordering` is intact — same workflow, same gating.
- If multi-file: spec 0062's caps respected (1 MB/file, 5 MB total, ≤ 500 files).

### Step 8 — Verify post-refactor

Re-read the new structure. For each invariant in `invariants.yaml`:

- Locate where it now lives.
- Confirm semantic equivalence (description matches same trigger phrases; templates verbatim; gates enforced).

If any invariant is missing or altered: **roll back** (`git checkout -- <files>` or `cp tmp/skill-snapshots/<name>-pre/* <skill-dir>/`) and iterate the proposal.

### Step 9 — Commit

Commit body documents:

- Which checklist items improved (mapped from Step 4 ✗'s).
- Post-check confirmation (each invariant traced to its new location).
- Reference to the snapshot dir for diff inspection.

Example:

```
refactor(skills): <skill-name> per best-practices (spec 0063 Phase C<N>)

Improvements:
- Description tightened — added 2 PT-BR trigger phrases.
- Sections consolidated 12 → 7 (Edge cases + Important reminders → Pitfalls).
- Tone: 4 MUSTs reframed as why-clauses.

Invariants preserved:
- description trigger phrases: 7 captured, all matched in new description.
- output templates: 4 verbatim quotes preserved (templates A/B/C/D inline).
- hard gates: 3 captured, 3 preserved.
- phase ordering: intact.

Snapshot: tmp/skill-snapshots/<skill-name>-pre/
```

## Workflow patterns

### Pattern A: zero-diff outcome

Audit passes, no improvement worth the risk. Valid outcome — commit a "audit passed, no change needed" with the snapshot YAML in the body. Ships traceability without churn.

### Pattern B: minor polish

Audit finds 2-3 small ✗'s (description could be tighter, one redundant section). Apply directly without proposal-iteration. Single-file in, single-file out.

### Pattern C: multi-file split

Body is over 300-500 lines AND distinct phases that load independently. See [`references/multi-file-split-pattern.md`](references/multi-file-split-pattern.md) for the decision rubric. Higher risk → expect a longer proposal-iteration cycle.

### Pattern D: blocking constraint

Audit finds something that LOOKS like an improvement but breaks an invariant — e.g., move templates A/B/C/D to a reference file, but the pre-submit gate needs them in working memory. Do NOT apply. Document in the proposal as "considered + rejected: <reason>".

## Anti-patterns

- **Don't change behavior.** If the refactor would mean the skill produces a different output for the same input, that's a content change, not a refactor.
- **Don't over-prescribe form.** Three different sensible refactors of the same skill are usually all valid. Pick the one that improves the most checklist items at the lowest risk — not "the best" in some abstract sense.
- **Don't skip the snapshot.** Without `tmp/skill-snapshots/<name>-pre/`, post-refactor diff comparison is impossible and rollback becomes a guess.
- **Don't bundle multiple refactors.** One commit per skill. Each commit independently revertable.

## References

- [`references/best-practices-checklist.md`](references/best-practices-checklist.md) — audit items, sourced from skill-creator's authoring guide.
- [`references/multi-file-split-pattern.md`](references/multi-file-split-pattern.md) — when to split, how to split, citing spec 0062's multi-file infra.
- [`references/invariants-preservation.md`](references/invariants-preservation.md) — the YAML schema + capture playbook + post-check procedure.
- Canonical authoring guide: [`../skill-creator/SKILL.md`](../skill-creator/SKILL.md).
