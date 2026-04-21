---
name: dev-workflow
description: Clone repos using bare clones, work on them using git worktrees, and deliver changes via Pull Requests. Use this skill whenever the user asks you to clone, code, fix, edit, or open a PR on any repository.
---

# Dev Workflow

Structured git workflow for cloning repos and delivering code changes via PRs. Uses bare clones + worktrees so the main branch stays pristine and multiple tasks can run in parallel.

## Directory convention

```
/workspace/
└── <provider>/                         # github, gitlab, bitbucket…
    └── <owner>/                        # org or user
        ├── <repo>.git/                 # bare clone (git objects only)
        └── <repo>/
            ├── main/                   # worktree: default branch (READ-ONLY)
            ├── zeno/add-readme/        # worktree: active task
            └── zeno/fix-login/         # worktree: another active task
```

Provider is extracted from the clone URL: `github.com` → `github`, `gitlab.com` → `gitlab`.

## First clone of a repo

Run these steps when you encounter a repo for the first time (no `.git/` directory exists at the expected path).

```bash
# Variables (set these first)
PROVIDER="github"
OWNER="octocat"
REPO="my-app"
BARE="/workspace/${PROVIDER}/${OWNER}/${REPO}.git"
WORKTREES="/workspace/${PROVIDER}/${OWNER}/${REPO}"

# 1. Bare clone
gh repo clone "${OWNER}/${REPO}" -- --bare "${BARE}"

# 2. Fix fetch refspec (gh clone --bare doesn't set it correctly)
git -C "${BARE}" config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'

# 3. Fetch all branches
git -C "${BARE}" fetch origin

# 4. Detect default branch
DEFAULT_BRANCH=$(git -C "${BARE}" remote show origin | grep 'HEAD branch' | awk '{print $NF}')

# 5. Create main worktree (read-only reference)
git -C "${BARE}" worktree add "${WORKTREES}/main" "${DEFAULT_BRANCH}"
```

**If the repo is already cloned** (bare `.git/` exists): skip to "Starting a new task".

**If the main worktree already exists**: skip its creation, just update it with `git -C "${WORKTREES}/main" pull`.

## Starting a new task

Always run these steps before creating a new worktree:

```bash
# 1. Update all references from remote
git -C "${BARE}" fetch origin

# 2. Update the main worktree
git -C "${WORKTREES}/main" pull

# 3. Create a new worktree for the task
TASK_SLUG="add-email-validation"  # kebab-case description
git -C "${BARE}" worktree add "${WORKTREES}/zeno/${TASK_SLUG}" -b "zeno/${TASK_SLUG}"

# 4. Move into the worktree
cd "${WORKTREES}/zeno/${TASK_SLUG}"
```

**Branch naming:** always `zeno/<description-kebab>`. Examples: `zeno/add-email-validation`, `zeno/fix-login-bug`, `zeno/update-deps`.

**If `zeno/<slug>` already exists on remote:** append a suffix — `zeno/<slug>-2`, `zeno/<slug>-3`.

## Working in a worktree

Once inside the worktree, work normally:

```bash
# Read files, understand the codebase
# Make changes using Bash, Read, or file editing

# Stage and commit (conventional commits, English)
git add .
git commit -m "feat: add email validation to signup form"

# Multiple commits are fine — keep them focused
git add src/utils.ts
git commit -m "refactor: extract validation helpers"
```

**You may make multiple commits.** Keep each commit focused on one logical change.

**You may run project commands** (npm test, npm run build, etc.) to verify your work. Check the repo's `package.json`, `Makefile`, or README for available commands.

## Delivering work (Push + PR)

```bash
# 1. Push YOUR branch (the one you created)
git push -u origin "zeno/${TASK_SLUG}"

# 2. Detect the repo's default branch for PR target
DEFAULT_BRANCH=$(gh repo view "${OWNER}/${REPO}" --json defaultBranchRef --jq '.defaultBranchRef.name')

# 3. Open the PR
gh pr create \
  --repo "${OWNER}/${REPO}" \
  --base "${DEFAULT_BRANCH}" \
  --title "<type>: <concise description>" \
  --body "$(cat <<'PRBODY'
[Brief description of the changes made]
- [Summary of change 1]
- [Summary of change 2]
- [Summary of change 3]
PRBODY
)"
```

**After creating the PR:** post the URL in the Slack conversation so the user can review.

**PR rules:**
- Title and body in English.
- Title: `<type>: <concise description>` (feat, fix, docs, style, refactor, test, chore).
- Body: specific — describe exactly what was changed (not vague like "improve validation").
- Reference filenames with backticks, libraries in *italics*.

## Cleaning up worktrees

Only clean up when the user asks (e.g., `@zeno clean up worktrees for my-app`).

```bash
# List all worktrees
git -C "${BARE}" worktree list

# Remove a specific task worktree
git -C "${BARE}" worktree remove "${WORKTREES}/zeno/${TASK_SLUG}"

# Prune stale entries
git -C "${BARE}" worktree prune
```

**Never remove the `main` worktree** — it's the read-only reference.

## Edge cases

| Situation | What to do |
|---|---|
| Repo already cloned (bare exists) | Skip clone. Fetch + update main + create worktree. |
| Main worktree exists | Skip creation. Just `pull` to update. |
| Branch `zeno/X` exists on remote | Use `zeno/X-2`, `zeno/X-3`, etc. |
| Worktree dir exists, same branch | Reuse it — `cd` into it and continue. |
| Worktree dir exists, different branch | Tell user there's a conflict. Suggest `@zeno clean up worktrees`. Stop. |
| Repo uses `master` not `main` | Detected automatically via `gh repo view --json defaultBranchRef`. |
| Clone fails (no access) | Explain clearly. Suggest checking PAT scopes or SSO authorization. |
| User asks to push to existing branch | **Refuse.** Explain the rule. Offer to open a PR instead. |
| User asks to merge a PR | **Refuse.** This is the user's decision in GitHub. |
| User asks to force push | **Refuse.** Force push is never allowed, even on your own branches. |

## Important reminders

- The `main` worktree is **read-only**. Never stage, commit, or modify files there. It exists only as a reference for creating new worktrees.
- Always `fetch + pull main` before creating a new worktree. Stale main = stale branch = merge conflicts.
- One worktree per task. Don't reuse a worktree for a different task.
- The user reviews and merges PRs. You create them. That's the boundary.
