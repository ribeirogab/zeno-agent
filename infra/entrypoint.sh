#!/bin/sh
# Zeno container entrypoint.
#
# Spec 0050: skills as a runtime concept were removed. The previous
# skills-bootstrap step (merging /app/agent/skills + /app/profile/skills into
# /home/node/.claude/skills) is gone with them; if skills return as a
# concept (possibly bundled with connectors per the connectors-only-pivot
# learning), a future spec will reintroduce a different bootstrap.
#
# Spec 0044: the global GH_TOKEN-based git credential helper that used to
# live here was removed. GitHub auth is now per-installation via the
# GitHub App connector — `apps/worker/src/github/app-auth.ts` mints
# installation tokens and caches them; consumers (the `mcp__github-app-*`
# MCP tools, the `github-mcp-server` binary) read from that cache, not
# from `process.env.GH_TOKEN`. Scripts that still need to push/pull via
# `git` over HTTPS can use `gh auth git-credential`-style configuration
# scoped per-org instead of a global PAT.
#
# This script now only handles git identity from config.yaml.
set -eu

# Git identity from config.yaml (git_identity:) — profile first, agent fallback
CONFIG_FILE=""
for candidate in /app/profile/config.yaml profile/config.yaml /app/agent/config.yaml agent/config.yaml; do
  if [ -f "$candidate" ] && grep -q 'git_identity:' "$candidate" 2>/dev/null; then
    CONFIG_FILE="$candidate"
    break
  fi
done

if [ -n "$CONFIG_FILE" ]; then
  GIT_NAME=$(grep -A2 'git_identity:' "$CONFIG_FILE" | grep 'name:' | sed 's/.*name: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/' | head -1)
  GIT_EMAIL=$(grep -A3 'git_identity:' "$CONFIG_FILE" | grep 'email:' | sed 's/.*email: *"\{0,1\}\([^"]*\)"\{0,1\}/\1/' | head -1)
  if [ -n "$GIT_NAME" ] && [ -n "$GIT_EMAIL" ]; then
    git config --global user.name "$GIT_NAME"
    git config --global user.email "$GIT_EMAIL"
  fi
fi

exec "$@"
