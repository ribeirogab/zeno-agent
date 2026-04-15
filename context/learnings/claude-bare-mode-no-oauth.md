---
tags:
  - learning
  - gotcha
related:
  - "[[claude-code-cli-headless]]"
  - "[[claude-code-oauth-token]]"
created: 2026-04-15
---
# Claude Code `--bare` mode skips OAuth

`claude --bare -p "…"` does NOT read OAuth credentials from `~/.claude/`. In bare mode, Anthropic auth must come from `ANTHROPIC_API_KEY` or `apiKeyHelper` in the settings JSON. There is no way to use an OAuth session with `--bare`.

## Context

Surfaced during discovery for Wesker. The temptation was to use `--bare` to get deterministic behavior (skip auto-discovery of hooks/MCP/CLAUDE.md) in the container, relying on the OAuth session from `claude /login`. Both the docs are explicit: "Bare mode skips OAuth and keychain reads."

## How to Apply

If you want OAuth auth with programmatic invocation, you have two options:

1. **Use the Agent SDK** with `CLAUDE_CODE_OAUTH_TOKEN` env var (obtained via `claude setup-token`). This is Wesker's chosen path — see [[claude-agent-sdk-typescript]] and [[claude-code-oauth-token]].
2. **Use `claude -p` WITHOUT `--bare`** and live with the env's auto-discovery (hooks, CLAUDE.md, project MCP config). Only viable when you control the environment tightly.

**If using `--bare`, you must set `ANTHROPIC_API_KEY`.** This defeats the purpose of using a Claude subscription.

**Symptom if missed:** `--bare` invocation fails with an "not authenticated" error despite `~/.claude/` being populated, leading to time wasted on "why doesn't my login work?" The fix is to drop `--bare` or switch auth methods.
