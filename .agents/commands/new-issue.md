# New issue

Draft and file a GitHub issue against this repo, following the project's issue-template conventions.

## When to invoke

The user (or another agent) types `/new-issue` from Claude Code. Optional argument: a one-line title or description hint.

## Steps

1. **Pick the issue type.** Ask the user to pick one of:
   - `bug` — a reproducible defect.
   - `feature` — a proposal for a new capability or change.
   - `question` — a usage or behaviour question.

2. **Collect the title.** Ask the user for a short, imperative title. Suggest a Conventional Commits prefix matching the type:
   - `bug` → `fix(scope): ...`
   - `feature` → `feat(scope): ...`
   - `question` → `question: ...` (no Conventional Commits requirement; questions are not changes)

3. **Collect the body, mirroring the right template.** Use the `.github/ISSUE_TEMPLATE/` files literally:
   - `bug` (template file `bug-report.md`): description, repro steps, expected, actual, environment, additional context.
   - `feature` (template file `feature-request.md`): description, motivation / use case, alternatives considered, additional context.
   - `question` (template file `question.md`): question, what you have tried.

4. **Roadmap label decision.** For `bug` and `feature` only (NOT `question` — questions are not roadmap items), ask the user: "Should this issue be tracked on the public roadmap (`ROADMAP.md`)?" If yes, the issue gets the `roadmap` label.

5. **File the issue.** Run:

   ```bash
   gh issue create \
     --title "<title>" \
     --label "<bug|enhancement|question>[,roadmap]" \
     --body "$(cat <<'EOF'
   <body assembled from step 3>
   EOF
   )"
   ```

   The label list always includes the type label (`bug` for bugs, `enhancement` for features, `question` for questions) and conditionally `roadmap`.

6. **Report the issue number.** Capture the URL the CLI prints; report the number to the user.

7. **Roadmap update.** If the user chose to add the `roadmap` label in step 4, ask which section the new item belongs to (`Now`, `Next`, `Later`) and offer to draft an updated `ROADMAP.md` slotting the new issue in. The user reviews and accepts the diff; the agent commits the change with message `docs(roadmap): add #<N> <short-title>`.

## Sanitization

The issue body MUST NOT contain real personal identifiers (per `vault/rules/sanitization.md`). If the user types one in step 3, gently flag it and suggest the canonical placeholder. If the user insists, abort the command — the rule applies even to issue bodies.

## Hard constraints

- Do not deviate from the chosen template's body fields.
- Do not auto-add the `roadmap` label without asking.
- Do not file the issue silently — always report the number.
- Do not offer the roadmap label for the `question` type.
