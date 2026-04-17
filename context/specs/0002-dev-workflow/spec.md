---
status: shipped
feature: dev-workflow
created: 2026-04-16
shipped: 2026-04-16
---
# Dev Workflow — Spec

**Status:** Draft
**Scope:** Teach Zeno how to clone repos, work on them using git worktrees, and open PRs — all via Slack. Zero code changes; delivery is two markdown files (SOUL.md update + SKILL.md).

## Context

Zeno MVP (spec 0001) proved the end-to-end loop: Slack mention → Claude Agent SDK → Bash/gh → response. The agent already has `git`, `gh`, `Bash`, `Read`, `Glob`, `Grep` available inside the container, plus a persistent `/workspace` volume. What's missing is the **knowledge** of how to use these tools for a structured dev workflow — directory conventions, worktree patterns, branch naming, PR conventions, and safety guardrails.

This spec fills that gap with two markdown files the agent reads at runtime from `profile/`. No TypeScript, no Dockerfile, no config changes.

## Problem Statement

Today Zeno can answer questions ("list repos in org X") but cannot **act on code**. The user wants to say `@zeno-agent clone octocat/my-app, fix the login bug, and open a PR` and have Zeno do it. For that to work reliably and safely, Zeno needs:

1. A directory convention so repos don't collide and worktrees are organized.
2. A git workflow pattern (bare clone + worktrees) so the main branch stays pristine.
3. Safety rules so Zeno never pushes to existing branches or merges PRs.
4. PR conventions so the output is consistent and reviewable.

## Non-Goals

1. **Thread sessions / persistent conversation.** Each Slack message is still stateless. Dev tasks must be completable in a single turn ("clone X, do Y, open PR"). Multi-turn iteration is spec 0003+.
2. **Approval flow for destructive ops.** Zeno's workflow is inherently non-destructive: it creates branches and PRs. It never pushes to existing branches, never merges, never deletes. No approval UX needed.
3. **SSH cloning.** Uses HTTPS via `gh repo clone` (authenticated by `GH_TOKEN`). Zero SSH key management.
4. **Repo allowlist.** Any repo accessible by the PAT is fair game. Workspace is solo.
5. **CI/CD integration.** Zeno opens the PR; CI runs on its own. Zeno doesn't watch CI status.
6. **Code review / PR merge.** Zeno creates PRs for the user to review and merge. It never merges.

## Constraints

- **Zero code changes.** Delivery is `profile/SOUL.md` (updated) + `profile/skills/dev-workflow/SKILL.md` (new). The agent reads these at boot and follows the instructions.
- **Single-turn tasks.** Without thread sessions, the entire clone → edit → commit → PR flow must happen in one agent invocation. Claude Agent SDK handles multi-step tool use loops internally, so this is feasible for focused tasks.
- **Volume persistence.** `/workspace` is a Docker named volume. Bare clones and worktrees persist across container restarts. No cleanup happens automatically.
- **HTTPS only.** `gh repo clone` uses HTTPS + `GH_TOKEN`. No SSH key provisioning.

## Directory Convention

```
/workspace/
└── <provider>/                         # github, gitlab, bitbucket…
    └── <owner>/                        # org or user
        ├── <repo>.git/                 # bare clone (git objects only)
        └── <repo>/
            ├── main/                   # worktree: default branch (read-only reference)
            ├── zeno/add-readme/        # worktree: active task
            └── zeno/fix-login/         # worktree: another active task
```

**Rules:**
- Provider extracted from clone URL (github.com → `github`).
- Bare clone path: `/workspace/<provider>/<owner>/<repo>.git/`
- Worktrees live under: `/workspace/<provider>/<owner>/<repo>/<branch-name>/`
- The `main` worktree is a read-only reference — Zeno NEVER commits to it.
- Each task gets a fresh worktree branched from `main` (or the repo's default branch).

## Git Workflow

### First clone of a repo

```bash
# 1. Bare clone
gh repo clone <owner>/<repo> -- --bare /workspace/github/<owner>/<repo>.git

# 2. Fix bare clone fetch refspec (gh clone --bare doesn't set it right)
git -C /workspace/github/<owner>/<repo>.git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'

# 3. Fetch all branches
git -C /workspace/github/<owner>/<repo>.git fetch origin

# 4. Create main worktree (detect default branch name)
DEFAULT_BRANCH=$(git -C /workspace/github/<owner>/<repo>.git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
git -C /workspace/github/<owner>/<repo>.git worktree add /workspace/github/<owner>/<repo>/main $DEFAULT_BRANCH
```

### Starting a new task

```bash
# 1. Update references
git -C /workspace/github/<owner>/<repo>.git fetch origin

# 2. Update main worktree
git -C /workspace/github/<owner>/<repo>/main pull

# 3. Create task worktree from main
git -C /workspace/github/<owner>/<repo>.git worktree add \
  /workspace/github/<owner>/<repo>/zeno/<task-slug> -b zeno/<task-slug>
```

### Delivering work

```bash
# 1. Stage, commit (inside the worktree)
cd /workspace/github/<owner>/<repo>/zeno/<task-slug>
git add .
git commit -m "<type>: <concise description>"

# 2. Push the branch
git push -u origin zeno/<task-slug>

# 3. Open PR targeting the repo's default branch
gh pr create \
  --repo <owner>/<repo> \
  --base $DEFAULT_BRANCH \
  --title "<type>: <concise description>" \
  --body "<PR body following template>"
```

### Cleaning up worktrees (on user request)

```bash
# List active worktrees
git -C /workspace/github/<owner>/<repo>.git worktree list

# Remove a specific worktree
git -C /workspace/github/<owner>/<repo>.git worktree remove \
  /workspace/github/<owner>/<repo>/zeno/<task-slug>

# Prune stale worktree entries
git -C /workspace/github/<owner>/<repo>.git worktree prune
```

## Safety Rules

**Absolute rule:** Zeno may only `git push` branches it created in the current worktree via `git worktree add -b`. If a branch existed before Zeno's `worktree add -b`, Zeno does not push to it.

**Prohibited actions (no exceptions):**
- `git push` to any branch Zeno did not create
- `git push --force` or `git push --force-with-lease` (any branch, even own)
- `gh pr merge` (user decides in GitHub)
- `git branch -D` / `git push --delete` (no branch deletion)
- `gh repo delete` (no repo deletion)
- `git commit` in the `main` worktree (read-only reference)

**Branch naming:** `zeno/<description-kebab>` — e.g., `zeno/add-email-validation`, `zeno/fix-login-bug`.

**Commit convention:** conventional commits in English (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `style:`). No AI attribution.

## PR Convention

- Title and body always in **English**.
- Title format: `<type>: <concise description>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Body must be specific and direct:
  - BAD: "Add support for new fields to improve user identification"
  - GOOD: "Add `email` column to `users` table"
- Reference filenames with backticks, libraries in *italics*.
- Body template:

```
[Brief description of the changes made]
- [Summary of change 1]
- [Summary of change 2]
- [Summary of change 3]
```

- Target branch: repo's default branch (detected via `gh repo view --json defaultBranchRef`).
- After creating the PR, Zeno posts the link in the Slack thread/DM.

## Edge Cases

| Scenario | Behavior |
|---|---|
| Repo already bare-cloned | Skip clone, go straight to fetch + worktree |
| Main worktree already exists | Skip creation, just `pull` to update |
| Branch `zeno/X` already exists on remote | Append suffix: `zeno/X-2`, `zeno/X-3`… |
| Worktree directory already exists | Reuse if same branch; if different branch, surface the conflict to the user and stop — suggest `@zeno limpa worktrees` to resolve |
| Repo uses `master` instead of `main` | Detect via `gh repo view --json defaultBranchRef` |
| Clone fails (no access, repo not found) | Explain clearly, suggest checking PAT scopes/SSO |
| PR create fails (no push permission) | Explain clearly, suggest forking or PAT scopes |
| User asks to push to main | Refuse. Explain the rule. Offer to open a PR instead. |
| User asks to merge a PR | Refuse. Explain this is the user's decision in GitHub. |
| User asks to clean up worktrees | List worktrees, remove the ones the user confirms (or all with merged PRs). |

## Success Criteria

1. `@zeno-agent clona o repo octocat/zeno-agent` → bare clone at `/workspace/github/octocat/zeno-agent.git/`, worktree `main` created and up-to-date. Zeno confirms in Slack.
2. `@zeno-agent no repo octocat/zeno-agent, cria um arquivo hello.md com "Hello from Zeno" e abre uma PR` → new worktree `zeno/add-hello-md`, file created, committed, pushed, PR opened targeting default branch, link posted in Slack.
3. User asks `@zeno-agent faz push na main do octocat/zeno-agent` → Zeno refuses, explains the rule, offers PR alternative.
4. `@zeno-agent limpa os worktrees do octocat/zeno-agent` → lists worktrees, removes task worktrees (keeps `main`), reports what was cleaned.
5. Second task on same repo (already cloned): `@zeno-agent no repo octocat/zeno-agent, adiciona uma seção "Contributing" no README e abre PR` → reuses existing bare clone, fetches, creates new worktree from updated main, delivers PR.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Single-turn limitation: complex dev tasks may not fit in one agent invocation (~60s timeout). | Keep tasks focused ("fix X in file Y"). Multi-turn iteration deferred to thread-sessions spec. |
| `/workspace` volume grows unbounded (cloned repos + worktrees never auto-cleaned). | Worktrees kept until user requests cleanup. Document `@zeno limpa worktrees` as the pattern. |
| Bare clone fetch refspec not set correctly by `gh clone --bare`. | Explicit `git config remote.origin.fetch` step in the workflow (documented in skill). |
| Agent hallucinates wrong git commands or skips safety checks. | Rules are in SOUL.md (loaded at boot into system prompt). Skill provides exact command sequences. |

## Open Questions

None. All decisions resolved during brainstorming (2026-04-16).

## Deliverables

| File | Action | Purpose |
|---|---|---|
| `profile/SOUL.md` | Update | Add `## Dev workflow` section with safety rules and conventions |
| `profile/skills/dev-workflow/SKILL.md` | Create | Full worktree-based dev workflow with directory convention, commands, edge cases |
