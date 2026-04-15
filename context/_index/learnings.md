---
tags:
  - moc
---
# Learnings — Map of Content

Atomic notes about Wesker's architecture, patterns, and gotchas. Categorized by tag.

Learnings here are specific to Wesker. Code style conventions live in `[[conventions|Conventions MOC]]`.

## `#concept` — Architecture and patterns

- [[../learnings/slack-mcp-vs-bolt|Slack MCP server vs Slack Bolt]] — MCP is pull-only; still need Bolt for ingress.
- [[../learnings/mcp-github-server-status|GitHub MCP server status]] — moved to github/github-mcp-server; `gh` + Bash is simpler for MVP.

## `#reference` — Environment and commands

- [[../learnings/claude-agent-sdk-typescript|Claude Agent SDK (TypeScript)]] — `query()` API, options, OAuth via env.
- [[../learnings/claude-code-oauth-token|Claude Code OAuth token]] — `claude setup-token` workflow for `CLAUDE_CODE_OAUTH_TOKEN`.
- [[../learnings/claude-code-cli-headless|Claude Code CLI — headless flags]] — `-p`, `--bare`, output formats.
- [[../learnings/slack-bolt-socket-mode|Slack Bolt Socket Mode]] — `@slack/bolt@4.7` minimal setup + scopes.
- [[../learnings/gh-repo-list-json|gh repo list with --json]] — fields and auth via `GH_TOKEN`.
- [[../learnings/node-lts-current|Node.js LTS status]] — Node 24 is current Active LTS (as of 2026-04).
- [[../learnings/docker-node-image-variants|Node.js Docker image variant]] — `node:24-slim` is the right default for Wesker.

## `#gotcha` — Things that tripped us up

- [[../learnings/claude-bare-mode-no-oauth|Claude Code `--bare` mode skips OAuth]] — use the SDK or drop `--bare`.
