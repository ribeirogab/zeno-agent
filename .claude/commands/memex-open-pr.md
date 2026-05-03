# Open a Pull Request

## User Instructions: `$ARGUMENTS`

This section contains the user-provided arguments for the Pull Request generation process. Make sure to strictly follow any specific instructions provided here before continuing.

---

## General Rules

- The `$ARGUMENTS` will typically be like: "open pr to main", "to feature/login", "to develop"
- Before anything, **check the current branch**:

  ```bash
  git branch --show-current
  ```

- Verify if the current branch has been pushed to origin:

  ```bash
  git ls-remote --heads origin <CURRENT_BRANCH>
  ```

  - If the branch is **not in origin**, push it automatically and continue:

    ```bash
    git push -u origin <CURRENT_BRANCH>
    ```

---

## New PR Workflow

1. **Validate Target Branch**

   - Extract or request the target branch based on `$ARGUMENTS`. If missing, explicitly ask the user.
   - Fetch the latest version:

     ```bash
     git fetch origin <TARGET_BRANCH>
     ```

2. **Open PR in WIP mode**

   - Immediately open a PR with a temporary WIP title and description:

     ```bash
     gh pr create --base <TARGET_BRANCH> \
       --title "WIP: Temporary PR Title" \
       --body "WIP: Temporary PR Description" \
       --label "enhancement" \
       --assignee @me \
       --draft
     ```

   - Only skip `--assignee @me` if `$ARGUMENTS` explicitly says otherwise.
   - If a label is explicitly mentioned in `$ARGUMENTS`, replace `enhancement` with that label.

3. **Retrieve PR Diff**

   - After PR creation, retrieve the diff to analyze the changes:

     ```bash
     gh pr diff <PR_NUMBER>
     ```

4. **Edit Title and Description**

   - Immediately update the PR title and description following the rules, without asking for user approval:

     ```bash
     gh pr edit <PR_NUMBER> --title "<FINAL_TITLE>" --body "<FINAL_DESCRIPTION>"
     ```

---

## Pull Request Structure

- PR titles must always be in English
- PR descriptions must always be in English
- Follow the format: `<type>: <concise description>`
- Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## General PR Description Rules

- Reference filenames or code snippets with backticks (\`)
- Mention libraries or services in *italics*
- Only describe relevant changes — avoid trivial edits like "line break fix" unless it's the only change
- **CRITICAL: Be specific and direct in descriptions. Describe exactly what was changed in the code:**
  - BAD: "Add support for new fields to improve user identification"
  - GOOD: "Add `email` column to `users` table"
  - BAD: "Improve data validation"
  - GOOD: "Add CPF validation to the registration form"
  - BAD: "Fix bug in the system ensuring data integrity"
  - GOOD: "Fix discount calculation when coupon is expired"

---

## MANDATORY: PR Description Template

```txt
[Brief description of the changes made]
- [Summary of change 1]
- [Summary of change 2]
- [Summary of change 3]
```
