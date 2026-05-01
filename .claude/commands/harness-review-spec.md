---
description: External evaluator that reviews a spec against the constitution and the vault, flagging violations, vagueness, and duplication
argument-hint: <optional: path to spec folder, or current spec if omitted>
---

# Review Spec — External Evaluator Pass

Run an **independent** review of a spec written by the agent. This is the second pair of eyes between the spec author's own self-review and the handoff to `harness-writing-plans`. The point is to catch the things the author rationalized past.

**Announce at start:** "Reviewing spec against constitution and vault..."

## Inputs

1. **Target spec.** If `$ARGUMENTS` is a path under `context/specs/`, read that folder. Otherwise scan `context/specs/` for the most recent `YYYY-MM-DD-*` folder modified and confirm with the user before proceeding.
2. **Constitution.** Read `context/constitution.md` in full — it defines the non-negotiables this spec must respect.
3. **Vault background.** Skim the relevant indices: `context/_index/learnings.md`, `context/_index/conventions.md`, `context/_index/rules.md`. You are looking for prior knowledge the spec may have ignored or duplicated.

## What to evaluate

For the target `spec.md`, return a finding for each of the categories below. Each finding is one of `PASS`, `WARN`, or `FAIL`. Reserve `FAIL` for issues that should block handoff.

### 1. Constitution compliance

Read every rule in `context/constitution.md`. For each rule, ask: does this spec violate, weaken, or sidestep it? Quote the constitution line and the spec line when reporting.

`FAIL` if any rule is violated. `WARN` if a rule is sidestepped without acknowledgement. `PASS` otherwise.

### 2. Acceptance Criteria — concrete and testable

Locate the `## Acceptance Criteria` section. Evaluate every bullet:

- Is it **binary** (yes/no, not "good enough")?
- Is it **observable** by someone other than the implementer?
- Could it be verified in **under a minute** with a fixture or a curl?
- Does it avoid **vague verbs**: "works", "handles gracefully", "is robust", "is fast" (without a number), "is simple"?

`FAIL` if the section is missing, empty, contains only `{{placeholder}}` text, or every bullet is vague. `WARN` if some bullets are vague but at least one is testable. `PASS` if all bullets are concrete.

### 3. Required sections present and non-empty

The spec template defines: Context, Problem Statement, Non-Goals, Constraints, User Stories / Scenarios, Acceptance Criteria, Risks and Mitigations, Open Questions. For each:

- `FAIL` if the heading is missing.
- `WARN` if the section exists but is empty or only `{{placeholder}}`.
- `PASS` if there is real content, or the author wrote `N/A — <reason>`.

`Open Questions` is allowed to be empty if and only if the author wrote `None.`; silence is not the same as resolution.

### 4. Duplication of existing knowledge

For each major decision in the spec, search `context/learnings/`, `context/conventions/`, and `context/rules/` for prior notes covering the same ground. If a learning already answers a question the spec re-litigates, surface it.

`FAIL` if the spec contradicts an existing learning without acknowledging it. `WARN` if it duplicates without citing. `PASS` if existing notes are correctly referenced.

### 5. Scope discipline

Compare the **Problem Statement** with the **Non-Goals** and the **Acceptance Criteria**. Look for:

- Acceptance criteria that go beyond the stated problem (scope creep).
- Non-goals that are actually implied by the acceptance criteria (lying to ourselves).
- A problem statement so broad that no spec could close it (rewrite needed).

`FAIL` only on the third case. `WARN` on the first two.

### 6. Open Questions left unresolved

Every `[NEEDS CLARIFICATION: ...]` marker is a blocker. Same for any acceptance criterion that references an open question.

`FAIL` if any clarification marker survived. `PASS` if `Open Questions` lists `None.` or every question has a documented resolution.

## Output format

```
## Spec Review — <feature-slug>

| # | Category                                | Status | Note |
|---|-----------------------------------------|--------|------|
| 1 | Constitution compliance                 | PASS   |      |
| 2 | Acceptance Criteria — concrete/testable | FAIL   | Bullet 3: "handles errors gracefully" — no observable check |
| 3 | Required sections present               | WARN   | Non-Goals is empty |
| 4 | Duplication of existing knowledge       | PASS   |      |
| 5 | Scope discipline                        | PASS   |      |
| 6 | Open Questions resolved                 | FAIL   | Line 47: [NEEDS CLARIFICATION: which auth provider?] |

### Verdict

**Block handoff** — 2 FAILs must be addressed before `harness-writing-plans`.

### Suggested edits

1. Rewrite Acceptance Criteria bullet 3:
   - Was: "Handles errors gracefully"
   - Suggested: "On a 5xx upstream response, the endpoint returns 502 with body `{\"code\":\"UPSTREAM_ERROR\"}` and emits a `upstream_error` log line"
2. Resolve [NEEDS CLARIFICATION: which auth provider?] before continuing — propose: "Use the same provider as the rest of the project (see `context/learnings/auth-stack.md`)"
```

## Verdict rules

- **Any FAIL** → `Block handoff`. Do not proceed to `harness-writing-plans`.
- **Only WARNs** → `Approve with notes`. Author may proceed but should address WARNs in the next pass.
- **All PASS** → `Approved`. Hand off to `harness-writing-plans`.

## Key rule

This command is a **second opinion**, not a rubber stamp. If the spec author already self-reviewed and approved, that is exactly when the external pass is most valuable — the failure mode is the author rationalizing past their own gaps. Be specific, quote line numbers, and never say "looks good" without checking against the constitution and the vault.
