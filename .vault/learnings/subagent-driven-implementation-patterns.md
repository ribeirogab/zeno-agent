---
tags:
  - learning
  - workflow
  - meta
created: 2026-04-16
---
# Subagent-driven implementation — briefing patterns that work

Phase A, B, and C of the dashboard were all executed subagent-driven: one fresh subagent per task, main agent reviews diffs between tasks. That's ~45+ subagent runs across the session. Patterns that made this work:

## Briefing template

Every subagent dispatch follows this shape:

```
You are executing **Task X.Y** of the implementation plan at
`/path/to/tasks.md`.

**Working directory:** /path/to/repo (branch `feat/foo`).

**Project rules — non-negotiable:**
- Never use `any` in TypeScript.
- Never write `// biome-ignore` comments.
- Conventional commits in English, no AI attribution.
- Stay focused: only this task.

**Task X.Y — <title>:**

Read the FULL task in `tasks.md` (search for "### Task X.Y"). Execute all N steps.

**Critical notes:** <inline hints that would bite a literal interpretation>

**When done, report:**
- Commit hash.
- <specific fact the main agent needs to verify progress>

Do NOT push.
```

## What the "Critical notes" capture

These are the landmines a subagent working strictly from `tasks.md` would step on. Examples:
- "The snippet's step 4 has a typo in the import path — use `@zeno/storage` not `@/storage`."
- "The previous task's subagent noticed the migrations interface uses `sql:` not `up:`. Match that."
- "The `AppDeps` shape was extended last task; update all 7 test helpers accordingly."
- "Target test count: 61 prior + 6 new = 67."

Without these, subagents either replicate mistakes faithfully or rewrite things the plan expected to keep. A good plan minimizes Critical notes; when a plan is thin, the notes fill the gap.

## Review loop between tasks

After each subagent returns:
1. Verify commit hash exists in `git log`.
2. Run `pnpm run quality-gate` (or equivalent) if changes are substantial.
3. Scan the subagent's report for "deviations" or "notes" — they're often the place to catch a drift.
4. Don't re-read the diff unless the report surfaces something suspicious. Trust + verify, not inspect-everything.

## Combine adjacent tasks when they share state

Task 3.3 and 4.1 of spec 0014 were entwined: 3.3 alone leaves typecheck broken; 4.1 adds the `AppDeps` field that 3.3 needs. Dispatching both in one subagent with "do A then B, commit twice" was faster and avoided a red-tree interlude.

## When to switch from subagent to inline

- Single-file change, < ~30 lines — just do it inline, dispatch overhead > task.
- Debugging a smoke-test failure — inline is faster; the main agent has full context.
- Meta/planning work (writing specs, PR descriptions) — inline.

The decision bar: "would a subagent with only the tasks file be able to do this better than I would?" If no, inline.

## Pitfalls observed

- **Subagent tries to fix adjacent issues.** The brief "only this task" matters; without it, subagents refactor orthogonal code they notice is "also broken". Remind them explicitly.
- **Subagent skips verification.** Reports like "task done" without a run output. Reject: re-dispatch asking for a specific fact.
- **Subagent commits secrets.** Rare but possible. Staging-specific file lists (`git add <explicit files>`) in the task help; `git add -A` patterns are a landmine.
- **Subagent pushes without being told.** Always include "Do NOT push" explicitly.
