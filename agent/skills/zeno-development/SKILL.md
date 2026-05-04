---
name: zeno-development
description: Clone repos using bare clones + git worktrees, develop changes, deliver via Pull Requests. Use this skill whenever the user asks you to clone, code, fix, edit, refactor, implement a feature, or open a PR on any repository — including PT-BR phrasings like "clonar repo", "refatorar", "abrir PR", "corrigir bug", "implementar feature". Covers branch naming, quality gate discovery, commit conventions, and PR delivery rules.
---

# Zeno Development

Structured git workflow for cloning repos and delivering code changes via PRs. Uses bare clones + worktrees so the main branch stays pristine and multiple tasks can run in parallel without stepping on each other.

This is a **default Zeno skill** — it ships with the agent and applies to any profile. Profile-specific skills (e.g. `acme-code-review`) layer on top of this baseline.

## Prerequisites

This skill assumes:

- A `github-app-*` connector is installed via the dashboard for the org you want to work in. The connector exposes the GitHub App tokens the operator wired up; without it, `gh` and `git push` will fail with 401/403.
- Capabilities `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep` are enabled in `/settings/agent-capabilities` (default-on for fresh installs).
- The container has `/workspace` mounted as a writable volume.

If any prerequisite is missing, stop, tell the operator clearly what's missing, and suggest the fix (e.g. "Install a GitHub App connector pointing at `org-name`").

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
# Variables (set these first — replace with your own GitHub org / username)
PROVIDER="github"
OWNER="<your-github-username>"
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

## Reading project docs (MANDATORY)

After cloning or entering a repo, **before making ANY changes**, read the following files from the repo root if they exist:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.claude/CLAUDE.md`

Follow their instructions. If they specify a package manager, coding conventions, forbidden directories, or any other rules — those override your defaults for that repo.

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

## Quality gate (MANDATORY before every commit)

Before committing, discover and run the repo's quality gate. Check these sources in priority order:

1. **`CLAUDE.md` / `AGENTS.md`** — may list explicit commands (e.g., `pnpm run quality-gate`).
2. **`package.json` scripts** — look for `lint`, `typecheck`, `test`, `build`, `quality-gate`, `check`, `ci`.
3. **`.github/workflows/*.yml`** — read CI workflow files to find what commands run on PRs. This is the ground truth for what the CI will check.

Run everything the CI would run. If anything fails, **fix the issue first** — never commit broken code. Re-run until everything passes.

## Working in a worktree

Once inside the worktree, work normally:

```bash
# Read files, understand the codebase
# Make changes using Bash, Read, or file editing

# Stage and commit
git add .
git commit -m "feat: short description of the change"

# Multiple commits are fine — keep them focused
git add src/utils.ts
git commit -m "refactor: extract validation helpers"
```

**You may make multiple commits.** Keep each commit focused on one logical change.

## Commit rules

- **Format:** conventional commits — `<type>: <concise description>`.
- **Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
- **Language:** match the repo's existing style (read `git log --oneline -20` to learn it). If unclear, default to English. Per-team language preferences are configured via the active profile's skills if needed.
- **NEVER** include `Co-Authored-By`, `Generated by`, or any reference to Claude, Anthropic, AI, or any agent in commit messages. Commits must be indistinguishable from human-authored ones.

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
[Brief description of the changes]
- [Summary of change 1]
- [Summary of change 2]
- [Summary of change 3]
PRBODY
)"
```

**After creating the PR:** post the URL in the conversation so the user can review.

**PR rules:**
- Title: `<type>: <concise description>` (feat, fix, docs, style, refactor, test, chore).
- Body: be specific — describe exactly what changed (not vague stuff like "improve validation").
- Reference filenames with backticks, libraries in *italics*.
- If the repo has `.github/PULL_REQUEST_TEMPLATE.md`, use it as the body template, filling sections in the team's working language.
- Match the team's working language (read existing PRs to learn it).

## Cleaning up worktrees

Only clean up when the user asks (e.g., `clean up worktrees for my-app`).

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
| Worktree dir exists, different branch | Tell user there's a conflict. Suggest cleaning up worktrees. Stop. |
| Repo uses `master` not `main` | Detected automatically via `gh repo view --json defaultBranchRef`. |
| Clone fails (no access) | Explain clearly. Suggest checking the GitHub App connector is installed and has access to the org. |
| User asks to push to existing branch | **Refuse.** Explain the rule. Offer to open a PR instead. |
| User asks to merge a PR | **Refuse.** This is the user's decision in GitHub. |
| User asks to force push | **Refuse.** Force push is never allowed, even on your own branches. |

## Cross-cutting invariants

A few constraints span multiple phases — restated here so you don't lose sight of them mid-task. Each is also enforced at its phase section above; this is the cross-section recap.

- The `main` worktree is **read-only**. Never stage, commit, or modify files there. It exists only as a reference for creating new worktrees.
- The user reviews and merges PRs; you create them. That's the boundary.
- Your commits are invisible — no agent attribution, ever (no `Co-Authored-By`, `Generated by`, or any reference to Claude / Anthropic / AI / agent).
