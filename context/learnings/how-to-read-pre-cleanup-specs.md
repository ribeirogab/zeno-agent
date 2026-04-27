---
tags:
  - learning
  - convention
related:
  - "[[connectors-only-pivot]]"
  - "[[../specs/0049-zeno-redefinition/spec|spec 0049]]"
  - "[[../constitution|constitution]]"
created: 2026-04-27
---
# How to read pre-cleanup specs and learnings

Specs and learnings dated before April 2026 with `status: superseded` in their frontmatter reflect Zeno's earlier "skills as the product" thesis. The pivot to connectors-only landed in spec 0049 (and its companion code-cleanup specs 0050 + 0051). When reading superseded artifacts, treat their prescriptions as **historical record**, not current architecture.

## Context

The pre-pivot architecture had two parallel power surfaces (skills + connectors) and a guardrails system on top to police the skill side. The pivot collapsed everything to a single capability surface — connectors — and removed the guardrails-classifier-approval flow that depended on shell-rooted skill behavior. See [[connectors-only-pivot]] for the durable lesson.

Many specs and learnings were written assuming the old thesis. Rather than rewriting them (which would lose the lineage of how the project actually evolved), the convention is: mark them `status: superseded` in their frontmatter, add a short banner under the frontmatter pointing at the superseder, leave the body intact. A future contributor reading them sees the historical content with a flag warning them not to treat it as canonical.

## How to Apply

When you open a `context/specs/00XX-*/spec.md` or `context/learnings/*.md` whose frontmatter shows `status: superseded`:

1. **Read the banner first.** It cites the spec or learning that supersedes the file and gives a one-paragraph rationale.
2. **Translate vocabulary in your head.** Old → new mappings:
   - "skill" → "domain knowledge that may return possibly bundled with connectors"
   - "skill layer wins" → "connector layer wins"
   - "shell tool" / "Bash" / "Read" / "Write" / "built-in toolset" (in the runtime context) → "connector MCP tools"
   - "agentskills.io as Zeno's standard" → "agentskills.io inspired the connector model; skills' return is a future decision"
   - "Haiku classifier" / "Slack approval" / "always-sensitive rules" → "connector permission toggle in the dashboard" (the only surviving gate)
3. **Don't apply the prescriptions.** A superseded spec might say "add a skill that does X" — the modern answer is "install or build a connector that exposes a tool for X, and let the agent compose it".
4. **Use them for archaeology, not direction.** They explain how Zeno arrived at where it is; they do not point at where it's going.

If you find a spec or learning that *seems* to describe the old thesis but is **not** marked superseded, raise it: either the file should be marked, or it has content the predicate ("would a reader treat this as canonical and reintroduce skills as primary?") clears. The decision table for the supersede pass lives in `context/specs/0049-zeno-redefinition/tasks.md` (Task 5.1) as the working record.
