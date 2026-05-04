# Best-practices checklist

Audit items derived from [skill-creator's SKILL.md](../../skill-creator/SKILL.md) (Anthropic, Apache 2.0). When the upstream evolves, this checklist may go stale — recheck against `.claude/skills/skill-creator/version.txt` (synced SHA) and refresh if needed.

This is a **checklist**, not a rulebook. Tick ✓ or ✗ for each item; document the WHY in one sentence.

---

## Frontmatter

- [ ] **Name is kebab-case** (`^[a-z][a-z0-9-]*$`). No spaces, no underscores, no capitals. Required by Zeno's reconciler regex.
- [ ] **Name is unique** in the target FS root (`agent/skills/`, `profiles/<n>/skills/`, `/workspace/skills/`, or `.claude/skills/`).
- [ ] **Description is "pushy"** — names trigger phrases (verbs/nouns the user might say). Anthropic's guidance: descriptions tend to *under-trigger*, so err on overspecifying triggers.
- [ ] **Description states WHAT and WHEN** in one or two sentences. WHAT = the skill's purpose. WHEN = the user-utterance shapes that should activate it.
- [ ] **Trigger phrases are visible** — at least 3 concrete phrases that would match. For Zeno: include both English AND Portuguese phrases (operator switches languages).
- [ ] **Description is one paragraph**, not a multi-line list. The SDK uses it for matching — formatting beyond plain prose isn't reliably parsed.

## Body length

- [ ] **Under ~500 lines** (Anthropic's soft ceiling). Beyond that, structure starts to bottleneck the agent's context.
- [ ] **If over the ceiling**, justify why. If "phases load independently" → strong candidate for multi-file split (see `multi-file-split-pattern.md`). If "single procedural workflow that all needs to be in working memory" → keep single-file with hierarchy.
- [ ] **No walls of text.** Each h2 section ≤ 100 lines.

## Tone

- [ ] **Imperative voice for steps.** "Read the file", not "You should read the file" or "The file is read".
- [ ] **"MUST" / "NEVER" used sparingly.** Each one should have a stated reason. Anthropic's guidance: prefer "we use bare clones because they save disk space and let multiple worktrees share git history" over "MUST use bare clones".
- [ ] **No needless hedging.** "perhaps consider possibly looking at" is noise. The skill is a procedure — say what to do.
- [ ] **No emojis in instructions** unless the agent's target output specifically needs them (e.g., a Slack reply skill).

## Structure

- [ ] **Headings tell the story.** Reading just the h2/h3 headings in order should give the gist of the workflow.
- [ ] **Sections grouped by phase or concern.** Not "Misc" or "Other" — every section has a clear topic.
- [ ] **Lists are short.** A 30-bullet list is a section disguised as a list — break it up.
- [ ] **Code blocks have language hints** (` ```bash `, ` ```yaml `, etc.) so the agent's syntax-aware tooling can format correctly.
- [ ] **Hard-gates are visually distinct** — bold, fenced, or in their own section. The agent must NOT skim past them.

## Multi-file applicability

- [ ] **References (`references/`) for prose loaded on demand.** Phase-deep details, edge-case handling, optional procedures. The SKILL.md links to them with relative paths.
- [ ] **Scripts (`scripts/`) for deterministic code.** Helper executables (Python / Bash / Node) that the agent runs. NOT for prose.
- [ ] **Assets (`assets/`) for output templates.** Files used as part of the skill's output (HTML templates, fonts, icons).
- [ ] **None of the above if not needed.** A 200-line single-file SKILL.md with no scripts/refs/assets is fine. Don't add directories for the sake of it.

## Hard-gates and working memory

- [ ] **Anything the agent needs at gate-execution time stays inline.** Pre-submit checks, post-output validators, refusal-list strings — these MUST be in `SKILL.md` body, not a reference. The agent loads references on demand; if the gate fires before the reference loads, the gate breaks.
- [ ] **Verbatim output templates** (Slack reply formats, HTML headers) can go either way. If the agent quotes them word-for-word, they're invariants; either inline or in a reference is fine, but the new location must be reachable BEFORE the agent emits output.
- [ ] **Phase ordering is sacred.** Whatever the original phase 1 → 2 → 3 → ... was, the refactor preserves the same ordering. Phases may be renamed or extracted to references, but never reordered.

## Behavior preservation

- [ ] **Description still triggers on captured trigger phrases.** Mentally simulate: would the SDK match each invariant trigger phrase against the new description? If any phrase is now ambiguous, refine the description.
- [ ] **Output format preserved.** If the original skill produced "## Review\n\n[blocker / suggestion / nitpick]" the refactor doesn't change that to "**Review:**". Verbatim invariants are verbatim.
- [ ] **Workflow preserved.** Same gating, same decision points, same hand-offs to other skills.

---

## How to use this checklist during an audit

1. Read the target SKILL.md + any references/.
2. Walk the checklist top to bottom. For each item, mark ✓ (pass), ✗ (fail), or N/A (not applicable to this skill).
3. For each ✗, write one sentence: WHY does it fail, and WHAT would fix it (without breaking invariants).
4. Aggregate to a proposal markdown summary. Carry forward only the ✗'s where the fix's value clearly exceeds the risk.
5. Skip cosmetic ✗'s on a stable shipping skill. The point is to *improve the skill's effectiveness*, not to make the file look prettier.
