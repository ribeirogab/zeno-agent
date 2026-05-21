---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page]]"
  - "[[bind-mount-rename-coupled-to-container-rebuild]]"
created: 2026-05-21
---
# `zeno restart --build` uses `zeno repo` (canonical path), not the current git worktree

`zeno restart fn --build` reads `package.json`, `apps/`, `packages/`, and the docker context from the canonical repo path returned by `zeno repo` (~`~/.zeno/zeno-agent`). When you are working in a git worktree under `.claude/worktrees/<slug>/`, the rebuild ignores your worktree code completely. The container that comes up is built from whichever branch happens to be checked out in the canonical repo — typically NOT your feature branch.

## Context

Hit during the E2E verification for spec [[../specs/2026-05-20-knowledge-browser-page/spec-knowledge-browser-page|2026-05-20-knowledge-browser-page]]. The worktree had:

```
docs/post-90-learnings  (worktree, with new commits)
└── feat/91-knowledge-browser-page  (created here, all the spec work)
```

While canonical `~/.zeno/zeno-agent` sat on the unrelated `docs/roadmap-add-90-91-92-knowledge` branch (v2026.5.20-1). `zeno restart fn --build` produced a container with:

- `/api/health` → `version: "v2026.5.20-1"` (canonical's package.json)
- `/api/knowledge/files` → 404 HTML (the new route doesn't exist in that branch)

The CLI binary `~/.local/bin/zeno` is also a symlink into `~/.zeno/zeno-agent/apps/cli/dist/index.js`. When you check out a different branch in the worktree, the symlinked CLI's dist is the canonical's last build — also from the wrong branch.

## How to Apply

To E2E a worktree branch against a real container:

1. **Push the worktree branch to origin** so it has a remote ref:
   ```bash
   git push -u origin <feature-branch>
   ```
2. **Detach the canonical repo at that commit** (cannot `checkout` the branch directly because the worktree already has it):
   ```bash
   cd ~/.zeno/zeno-agent
   git fetch origin <feature-branch>:refs/remotes/origin/<feature-branch>
   git checkout origin/<feature-branch>   # detached HEAD
   ```
3. **Reinstall + rebuild in canonical** so the CLI dist and workspace symlinks point at the right code:
   ```bash
   pnpm install
   pnpm --filter @zeno/knowledge build     # (any package the CLI bundles)
   pnpm --filter @zeno/cli build
   ```
4. **Now restart with --build:**
   ```bash
   zeno restart fn --build
   ```
5. Validate `/api/health` returns the expected version before assuming the rest works.
6. After E2E, restore canonical to its prior branch (`git checkout <prior-branch>`).

Quick proxy: if `/api/health` shows the wrong version after rebuild, the canonical repo is on the wrong commit — stop and fix that before debugging further.
