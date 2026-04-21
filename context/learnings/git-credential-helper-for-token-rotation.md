---
tags:
  - learning
  - gotcha
related:
  - "[[github-app-token-rotation]]"
created: 2026-04-21
---
# Use a git credential helper instead of embedding tokens in clone URLs

`gh repo clone` embeds the current `GH_TOKEN` value directly in the remote URL as `https://x-access-token:TOKEN@github.com/...`. When the token rotates (e.g., GitHub App installation tokens expire every hour), existing clones break silently — pushes use the stale embedded token and fail with 401.

## Context

Discovered when testing GitHub App auth in Zeno. The `dev-workflow` skill does bare clones via `gh repo clone ... --bare`. First clone embedded the PAT; after switching to app tokens the old clone still pushed as the personal user.

## How It Works

The fix is a global git credential helper that reads `GH_TOKEN` from the current environment at runtime:

```gitconfig
[credential "https://github.com"]
    helper = !f() { echo "username=x-access-token"; echo "password=${GH_TOKEN}"; }; f
    useHttpPath = true
```

Set once in `/home/node/.gitconfig` (via the container entrypoint). Every `git push/pull/fetch` resolves the token dynamically from the env var — no stale embedded URLs.

Also: `git remote set-url origin https://github.com/org/repo.git` (without the token) must be applied to any repos cloned BEFORE the helper was configured. And any repo-level `[user]` overrides (name/email baked in by the old clone) must be removed via `git config --unset user.name` / `user.email`.

## How to Apply

- Always configure a global credential helper in the container entrypoint (see `infra/entrypoint.sh`).
- Never rely on tokens embedded in clone URLs for long-lived repos.
- When migrating from PAT to GitHub App tokens, audit existing bare clones for stale `remote.origin.url` and `[user]` config.
