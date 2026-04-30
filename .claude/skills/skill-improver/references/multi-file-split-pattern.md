# Multi-file split pattern

When a `SKILL.md` grows past Anthropic's soft ceiling (~500 lines, sometimes felt earlier at ~300), the question isn't *whether* to split — it's whether splitting helps the agent or hurts it. This document is the decision rubric.

**Authority:** [skill-creator's SKILL.md](../../skill-creator/SKILL.md) authoring guide for soft caps + working-memory rationale. [Spec 0062](../../../../context/specs/0062-skills-multi-file-infrastructure/spec.md) for the runtime caps Zeno enforces (1 MB/file, 5 MB total per skill, ≤ 500 files).

---

## When to split

A multi-file split is the right call when ALL of these hold:

1. **Body length > ~300 lines.** Below that, the agent reads the whole file in one shot and structure isn't the bottleneck. Above ~500 lines, structure starts to bottleneck the agent's context — each invocation pays the full read cost even for trivial sections.
2. **Distinct phases / topics / variants exist** that load independently. Phase 1's procedure and Phase 7's procedure don't reference each other; the agent rarely needs both in working memory simultaneously.
3. **Each candidate slice is self-contained.** A reader could jump into the slice without backtracking to the main file for definitions or context.
4. **The agent can decide on the fly which slice it needs.** The SKILL.md body has enough overview to route — "for advanced X, see references/advanced-x.md" — and the agent doesn't have to load all references just to figure out which one is relevant.

If any of those don't hold, prefer single-file with stronger hierarchy (more h2/h3 sections, tighter headings) over a split that fights the agent.

## When NOT to split

A split is the **wrong** call when ANY of these hold:

1. **Hard-gates depend on inline content.** Examples:
   - `fn-code-review`'s pre-submit gate requires Templates A/B/C/D in working memory. Moving them to a reference file means the agent emits output before the reference loads, breaking the gate.
   - `fn-sentry-fix`'s Phase 3 confidence gate references the trigger keywords — if those move to a reference, the gate decision happens with stale or missing context.
   - Any "before you emit X, validate against Y" pattern where Y must be in working memory at emit time.
2. **The workflow is single-procedural and tightly coupled.** A 12-step deployment runbook where step 4 depends on the output of step 3 doesn't benefit from being split into 12 reference files — the agent needs all 12 in working memory to execute the workflow correctly.
3. **The references would be tiny.** Three 30-line reference files is worse than one 200-line SKILL.md — overhead cost (link resolution, file reads, mental model fragmentation) exceeds the benefit.
4. **The skill is stable and shipping.** Don't split a battle-tested 600-line skill just because it's over the soft cap. The cost of breaking an invariant exceeds the benefit of conforming to a guideline. Ship cosmetic improvements separately.

## How to split

Decision: which content stays in `SKILL.md`, which moves to `references/`?

### SKILL.md keeps

- **Frontmatter.** Always.
- **One-paragraph overview** of WHAT the skill does (1-3 sentences).
- **"When to use" / trigger surfaces.** The agent reads these to decide whether the skill applies — they must be in working memory before any reference loads.
- **Workflow outline.** Phase names, ordering, hand-offs. Just enough that the agent knows the shape — depth lives in references.
- **Hard-gates.** Anything the agent must enforce at gate-execution time (pre-submit checks, post-output validators, refusal lists). These cannot be moved to references because gates fire before references load.
- **Verbatim output templates** the agent might quote without further reading (e.g., a 3-line success format). For longer templates, see "Output templates" below.
- **References table of contents.** A short list at the bottom — `> See [references/x.md](references/x.md) for X.`

### references/ takes

- **Phase-deep procedures.** "Phase 3 detailed steps" go in `references/phase-3.md` if Phase 3 is more than ~80 lines.
- **Edge-case handling.** "Handling rate limits" / "Handling 5xx errors" / "When the API returns 422" — each its own file when they're each non-trivial.
- **Optional procedures.** "Power-user mode" / "Advanced configurations" — agent loads only when the user invokes them.
- **Long output templates.** A 60-line HTML template that the agent quotes verbatim can live in a reference — but only if the agent loads the reference *before* it emits the template (e.g., the workflow has a "Step 4: render the report" step that explicitly references the template).
- **Background / conceptual context.** "Why we use approach X over approach Y" — useful for the agent to understand intent but not needed at every invocation.

### Linking pattern

In `SKILL.md`, point to references with a relative-path link near the section that needs them:

```markdown
### Phase 3 — Confidence gate

Decide between PR and ESCALATE per the rubric.

> See [references/phase-3-confidence-rubric.md](references/phase-3-confidence-rubric.md) for the full decision tree, edge cases, and worked examples.
```

The link tells the agent *when* to load the reference. Don't dump all reference links at the top — that loads everything eagerly.

## Caps (spec 0062 runtime enforcement)

| Cap | Value | Why |
|---|---|---|
| Per-file size | 1 MB | Safety against accidental huge blob |
| Per-skill total | 5 MB | Same |
| Files per skill | ≤ 500 | Filesystem hygiene |

Practical sanity:

- 5 MB of markdown ≈ 1 million words. If you're approaching this, the skill is doing too much — split it into multiple skills.
- 500 files is absurd for prose. If you have 500 references files, you're modeling each FAQ entry as a separate file when they should be sections of one.
- Aim for ~3-7 reference files per skill. More than that and the agent has trouble routing; fewer and the split probably wasn't worth it.

## Worked examples

### Example 1: zeno-development (210 lines)

**Single-file. Don't split.** Below the cap, single procedural workflow (clone → branch → commit → PR), each step builds on the previous. Splitting would only fragment context.

### Example 2: fn-code-review (319 lines)

**Borderline single-file. Strong reasons NOT to split.** Despite being slightly above the comfortable single-file ceiling, the pre-submit gate's Templates A/B/C/D MUST be in working memory at output time. Moving templates to references breaks the gate — explicit anti-pattern.

If a refactor is desired here, the play is to tighten *within* the single file (remove redundancy, reframe MUSTs as why-clauses, consolidate sections) — not split.

### Example 3: fn-sentry-fix (467 lines)

**Strong split candidate.** Distinct phases (1: fetch Sentry data, 2: triage, 3: confidence gate, 4: hand-off rubric, 5: zeno-development handoff, 6: PR review, 7: PT-BR root-cause report). Each phase is self-contained. Phases 4-7 only fire after Phase 3's gate passes — the agent doesn't need them in working memory unless the gate passed.

A sensible split:
- `SKILL.md` — frontmatter, overview, workflow outline (Phase 1 → 7 names + hand-offs), hard-gates (Phase 3 confidence gate decision rubric stays inline because gate-execution timing).
- `references/phase-1-sentry-fetch.md` — full fetch procedure + edge cases.
- `references/phase-3-confidence-detail.md` — worked examples of gate decisions (the *rubric* stays inline; *examples* are reference).
- `references/phase-5-zeno-handoff.md` — the handoff protocol.
- `references/phase-7-ptbr-report-template.md` — the verbatim PT-BR report template.

But: skill-improver decides at execution time based on the actual content. The above is illustrative, not prescriptive.

## Anti-patterns

- **Splitting prematurely.** A 250-line file that *might* grow doesn't need a split now. Refactor when you actually feel the pain.
- **Splitting by file type instead of concern.** Don't have `references/code-blocks.md` and `references/text-only.md`. Split by phase/topic/variant.
- **Reference files that reference each other in chains.** `phase-3.md` says "see phase-3-edge-cases.md which says see phase-3-edge-cases-rate-limits.md" — by the third hop the agent has lost the plot. One level of indirection only.
- **No top-level overview in SKILL.md.** If the agent has to load 5 references just to know what the skill does, the SKILL.md is too thin.
- **Splitting hard-gates into references.** Always wrong. See "When NOT to split" item 1.
