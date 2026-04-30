# Invariants preservation

A refactor that changes the skill's invariants is not a refactor — it's a content change in disguise. This document defines the invariants, the YAML schema for capturing them, the per-key capture playbook, and the post-refactor verification procedure.

**Authority:** [skill-creator's SKILL.md](../../skill-creator/SKILL.md) for the WHAT/WHEN description model and the test-cases discipline that ground "preserved behavior".

---

## The five invariants

| Key | What it captures | Why it's invariant |
|---|---|---|
| `description` | The current frontmatter `description:` value (raw string) | The SDK matches this against user utterances. Any rewording risks shifting which utterances trigger the skill. |
| `trigger_phrases` | A list of 5+ phrases (EN + PT-BR) the description currently matches | The description's job is to match utterances. Capturing example utterances makes the invariant verifiable: would the new description still match each one? |
| `output_templates` | Verbatim quoted strings the skill emits — Slack reply formats, PR body templates, refusal messages, etc. | These are the user-visible product of the skill. Changing them is changing what the user sees. |
| `hard_gates` | "MUST", "NEVER", "ALWAYS", "DELETE", "FORBIDDEN" patterns + their behavioral effect | These are the skill's enforcement contract. Wording can change ("we use X because Y" instead of "MUST X") but the BEHAVIOR (use X) must remain enforced. |
| `phase_ordering` | The canonical workflow phases in order | The agent's mental model of the workflow. Reorder ⇒ the skill does a different thing. |

---

## YAML schema

File location: `tmp/skill-snapshots/<name>-pre/invariants.yaml`

```yaml
# Snapshot of <skill-name> invariants before refactor.
# Authored by skill-improver per spec 0063 Phase B.

description: |
  <verbatim copy of frontmatter description: value, including line breaks>

trigger_phrases:
  - phrase: "refactor this skill"
    lang: en
    rationale: "explicit verb match in description"
  - phrase: "auditar skill"
    lang: pt-br
    rationale: "explicit verb match"
  - phrase: "make this skill cleaner"
    lang: en
    rationale: "indirect — would the description match? mental simulation says yes via 'cleaner' → 'improve'"
  # ... 5+ entries total, mix of EN and PT-BR

output_templates:
  - id: success-reply
    location_pre: "SKILL.md lines 142-148"
    verbatim: |
      ## Review

      [content]
    notes: "Used by Slack reply formatter. Verbatim quote required."
  - id: refusal-message
    location_pre: "SKILL.md lines 87-89"
    verbatim: |
      I can't help with that — <reason>.
    notes: "Refusal text. Must remain identical to avoid retraining the user's expectations."

hard_gates:
  - id: pre-submit-template-match
    text_pre: "MUST match one of Templates A/B/C/D before emitting any reply."
    behavior: "Output is matched against template structure; emit blocked if no match."
    location_pre: "SKILL.md lines 201-205"
  - id: forbidden-praise
    text_pre: "NEVER emit 'Looks good' or 'LGTM' without analysis."
    behavior: "Specific phrases blocked from output."
    location_pre: "SKILL.md lines 220-225"

phase_ordering:
  - 1: "Fetch context"
  - 2: "Triage"
  - 3: "Confidence gate"
  - 4: "Hand-off rubric"
  - 5: "Zeno-development handoff"
  - 6: "PR review"
  - 7: "PT-BR root-cause report"
```

---

## Capture playbook

### `description`

Read the raw `description:` value from the frontmatter. Copy it verbatim into the YAML. Do not summarize, do not paraphrase. If the description is multi-line, preserve line breaks.

### `trigger_phrases`

Generate at least 5 phrases the description currently matches. Distribute across EN and PT-BR. Method:

1. **Verbs in the description.** "refactor", "audit", "improve" → derived phrases ("refactor this skill", "audit skill X", "improve this skill").
2. **Nouns + verbs.** "skill audit" / "skill best practices" — search-engine-style queries.
3. **PT-BR equivalents.** Translate each EN phrase or generate native PT-BR phrasings ("auditar skill", "melhorar skill", "atualizar skill").
4. **Indirect / paraphrase forms.** "this skill is too long", "make this skill cleaner", "limpar skill".

For each phrase, capture a `rationale` — *why* you believe the current description matches it. This makes the post-check verifiable: walk each rationale against the new description.

If you can't generate 5 phrases that the description plausibly matches, the description is probably under-specified — flag this as a `frontmatter` ✗ in the audit checklist.

### `output_templates`

Search the body for verbatim-quoted strings the skill is meant to emit:

- Strings inside ` ``` ` fenced code blocks labeled with no language hint (often raw output).
- Strings prefixed with `>` blockquotes (often quoted templates).
- Strings between explicit "emit this:" / "render exactly:" markers.
- HTML/Markdown templates with placeholder vars (`{NAME}`, `<URL>`).

For each:
- `id`: short kebab-case label.
- `location_pre`: file + line range (so post-check can confirm it survived).
- `verbatim`: the exact string.
- `notes`: what the skill uses it for + any "must remain identical" reasoning.

Be greedy — better to over-capture and discover later that some "templates" were just illustrative examples than to miss a real verbatim invariant.

### `hard_gates`

`grep -n -E '\b(MUST|NEVER|ALWAYS|FORBIDDEN|DELETE|MANDATORY)\b' SKILL.md`. For each match:

- `id`: short kebab-case label.
- `text_pre`: the verbatim instruction (the sentence containing the keyword).
- `behavior`: translate the instruction into a behavior. "MUST match Templates A/B/C/D" → "output is matched; emit blocked if no match".
- `location_pre`: file + line range.

The skill-improver may reframe the wording in the refactor — `"we use templates A/B/C/D because they normalize Slack formatting"` is fine in place of `"MUST use templates A/B/C/D"` — but the BEHAVIOR (use templates A/B/C/D, block emit if no match) must remain enforced. The post-check verifies the behavior, not the wording.

Edge case: instructions phrased without keywords ("Output is checked against the template list") count as hard-gates if they have enforcement teeth. Read the body holistically; don't rely only on grep.

### `phase_ordering`

List the canonical workflow phases in execution order. Source: SKILL.md's "Workflow", "Steps", "Process", or "Procedure" section. Use phase names as they appear in the file.

If phases are not numbered or labeled, derive an ordered list from h2/h3 headings in the workflow section. Capture the order — *not* the depth of each phase. The post-check verifies the order is intact, not that each phase has the same internal structure.

---

## Post-refactor verification

After the refactor is applied, walk every entry in `invariants.yaml` against the new structure:

### `description`

- Read the new frontmatter `description:` value.
- For each entry in `trigger_phrases`, mentally simulate: would the SDK match this phrase against the new description? Use the captured `rationale` to ground the check — does the new description still satisfy that rationale?
- If any phrase is no longer matched: the description is over-tightened. Loosen it or add explicit verbs/nouns until coverage is restored.
- If the description's *meaning* changed but trigger phrases still all match: validate that the new meaning matches the original WHAT. If not, the description is over-changed even if triggers survived.

### `output_templates`

- For each `id`, locate where the verbatim string lives in the new structure.
- Confirm byte-exact match. Whitespace, capitalization, punctuation — all identical.
- If the template moved from inline to a reference file, confirm the agent's workflow loads that reference *before* the emit point.
- If even one byte differs and the template was meant to be verbatim: ROLLBACK.

### `hard_gates`

- For each `id`, locate the gate's enforcement point in the new structure.
- Confirm the BEHAVIOR is preserved. Wording can change; behavior cannot.
  - Example pass: "MUST X" → "we use X because Y". Behavior: still does X. ✓
  - Example fail: "MUST X" → "consider X". Behavior: now optional. ✗ ROLLBACK.
- If the gate's working-memory dependency changed (was inline, now in a reference): trace the workflow. Does the reference load BEFORE the gate fires? If no, the gate is broken. ROLLBACK.

### `phase_ordering`

- Read the new workflow section.
- Confirm phases appear in the same order.
- Phases may be renamed ("Fetch Sentry data" → "Phase 1: Fetch") or extracted to references — but they may NOT be reordered.
- If reordered: the workflow has changed. ROLLBACK.

### Rollback procedure

If any invariant fails verification:

```bash
# Discard staged + unstaged changes to the skill
git checkout -- <skill-dir>/

# Or: restore from snapshot if git wasn't used
cp -r tmp/skill-snapshots/<name>-pre/* <skill-dir>/
```

Then re-iterate the proposal:
1. Note which invariant failed and how.
2. Update the proposal to either (a) preserve the invariant differently, or (b) document why the change is intentional and surface for owner review.
3. Re-apply.
4. Re-verify.

Loop until all invariants pass. If after 3 iterations any invariant still fails, surface to the maintainer — the refactor is fighting the skill.

---

## Anti-patterns

- **Skipping the snapshot.** Without the YAML, post-check is "looks fine to me" — useless against subtle drift.
- **Capturing 1-2 trigger phrases.** Five is the floor; 7-10 is better. The cost of one extra phrase is seconds; the cost of a description that no longer triggers is silent failure.
- **Treating wording-equivalence as behavior-equivalence.** "MUST X" and "should X" read similarly but enforce differently. Always verify behavior, not wording.
- **Verifying invariants in your head only.** Write the rationale in the YAML. Six weeks later when the skill misbehaves, the YAML is the audit trail.
- **Capturing invariants the agent doesn't actually emit.** "I think this template is verbatim" without confirmation = noise. If unsure, dry-run the skill (or read the workflow until the emit point is clear) — confirm before capturing.
