# New PR

Draft and open a pull request against this repo, following the project's PR template, sanitization rule, and release flow.

## When to invoke

The user (or another agent) types `/new-pr` from Claude Code. Optional argument: a one-line PR title or summary hint.

## Steps

1. **Branch check.** Run `git branch --show-current`. Refuse to proceed if on `main` (the project's flow is "branch → PR → squash-merge into main"; opening a PR from main into main is incoherent). If on a feature branch, continue.

2. **Quality gate.** Run:

   ```bash
   pnpm run quality-gate
   ```

   Abort with the gate's error output if it fails. The user's job is to fix the issue and re-invoke `/new-pr`.

3. **Sanitization heuristic check.** Diff the branch against `main` and grep for known leak patterns (the maintainer's known real identifiers, common employer slugs, real-looking emails, GitHub installation IDs longer than `12345678`):

   ```bash
   git diff main...HEAD | grep -iE 'gabriel|gblosr|@gmail\.com|installation_id.*[0-9]{7,}'
   ```

   If there are matches, list them to the user and ask: "These look like they might violate the sanitization rule. Continue anyway?" If the user says yes, proceed. If no, abort.

4. **Push the branch** if not already pushed:

   ```bash
   if ! git ls-remote --heads origin "$(git branch --show-current)" | grep -q .; then
     git push -u origin "$(git branch --show-current)"
   fi
   ```

5. **Draft the PR title** in Conventional Commits format. Suggest one based on the most recent commits on the branch; let the user edit.

6. **Draft the PR body** matching `.github/PULL_REQUEST_TEMPLATE.md`'s shape. Spec and issue references MUST be real markdown links pointing at the branch on origin (`https://github.com/<owner>/<repo>/blob/<branch>/<path>`), not bare backticked paths — outsiders reading the PR cannot click a backticked path:

   ```markdown
   ## Summary

   <1–3 bullets describing what changes and why>

   -

   ## Spec / issue

   Spec: [<path-or-title>](https://github.com/<owner>/<repo>/blob/<branch>/.vault/specs/<slug>/spec.md)
   Closes: #<N>

   ## Test plan

   <bulleted markdown checklist of how to verify>

   - [ ]

   ## Sanitization

   - [x] No real identifiers introduced in this diff (per [`.vault/rules/sanitization.md`](../.vault/rules/sanitization.md)).

   ## Quality gate

   - [x] `pnpm run quality-gate` is green locally.
   ```

   Both the Sanitization and Quality gate boxes are written as `- [x]` (already-checked) because steps 2 and 3 verified them in this session.

   **Body line-wrapping (critical).** GitHub renders every single `\n` in a PR body as `<br>` (GFM hard-line-break extension, enabled in issue/PR/comment bodies but NOT in repo `.md` files). Treat each paragraph as ONE line in the heredoc; separate paragraphs with a blank line. Do NOT hard-wrap mid-paragraph at column 72/80 — the wraps become visible breaks in the rendered PR. Code fences, lists, and tables follow standard Markdown wrapping and are unaffected.

7. **Open the PR.** Run:

   ```bash
   gh pr create \
     --title "<title>" \
     --body "$(cat <<'EOF'
   <body from step 6>
   EOF
   )" \
     --label "<type-label>" \
     --assignee "@me"
   ```

   - `--label` MUST be set. Pick the type label that matches the PR's primary purpose: `enhancement` (new feature or capability), `bug` (defect fix), `docs` if the change is documentation-only and the repo has a `docs` label, or `roadmap` if the PR closes a roadmap-tagged issue. Multiple labels may be added with comma separation.
   - `--assignee "@me"` self-assigns the PR to the operator who is opening it. Outsiders need to know who owns the PR's review and merge.

8. **Report the PR URL** to the user.

9. **Roadmap reminder.** If the PR closes a `roadmap`-labeled issue, suggest the user update `ROADMAP.md` to move that item from `Now` / `Next` / `Later` into `Recently shipped`. Offer to draft the diff.

## Hard constraints

- Do not push to `main` directly.
- Do not open a PR if the quality gate is red.
- Do not silently include the maintainer's real identifiers in the PR title or body.
- Do NOT use backticked file paths for the Spec / issue field — always a clickable markdown link to the file on the PR's branch.
- Do NOT open a PR without `--label` and `--assignee "@me"`. Both are mandatory.
- The Sanitization heuristic is advisory — the canonical contract lives in `.vault/rules/sanitization.md`.
