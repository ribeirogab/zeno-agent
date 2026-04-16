---
tags:
  - moc
---
# Learnings — Map of Content

Atomic notes about Zeno's architecture, patterns, and gotchas. Categorized by tag.

Learnings here are specific to Zeno. Code style conventions live in `[[conventions|Conventions MOC]]`.

## `#concept` — Architecture and patterns

- [[../learnings/lessons-for-zeno-from-openclaw-hermes|Lessons for Zeno from OpenClaw and Hermes]] — synthesis + strategic positioning + what to adopt/defer.
- [[../learnings/workspace-markdown-files-pattern|Workspace markdown files pattern]] — SOUL.md, AGENTS.md, USER.md, MEMORY.md, SKILL.md as the emerging agent-config lingua franca.
- [[../learnings/tool-registry-autodiscovery-pattern|Tool registry with import-time auto-discovery]] — Hermes' elegant extension pattern.
- [[../learnings/gateway-daemon-vs-single-process|Gateway daemon vs single-process]] — when each wins; why Zeno stays single-process for now.
- [[../learnings/closed-learning-loop-self-improving-skills|Closed learning loop and self-improving skills]] — Hermes' bet; when it's worth adopting.
- [[../learnings/dm-pairing-allowlist-security|DM pairing / allowlist as first-class security]] — OpenClaw's pattern; when to enable in Zeno.
- [[../learnings/multi-agent-routing-channels-to-agents|Multi-agent routing — channels to agents]] — OpenClaw's pattern; triggers to adopt in Zeno.
- [[../learnings/slack-mcp-vs-bolt|Slack MCP server vs Slack Bolt]] — MCP is pull-only; still need Bolt for ingress.
- [[../learnings/mcp-github-server-status|GitHub MCP server status]] — moved to github/github-mcp-server; `gh` + Bash is simpler for MVP.

## `#reference` — Environment and commands

- [[../learnings/openclaw-architecture|OpenClaw architecture]] — TypeScript monorepo + gateway daemon + 22+ channels; full reference.
- [[../learnings/hermes-architecture|Hermes Agent architecture]] — Python, self-improving skills, serverless-ready; full reference.
- [[../learnings/claudeclaw-claude-code-plugin-pattern|ClaudeClaw — OpenClaw-lite as a Claude Code plugin]] — lightweight alternative, closest comparable to Zeno.
- [[../learnings/agent-skills-open-standard|Agent Skills open standard (agentskills.io)]] — SKILL.md format, portability across agents.
- [[../learnings/profile-isolation-via-env-var|Profile isolation via env var]] — Hermes' HERMES_HOME pattern for multi-instance.
- [[../learnings/claude-agent-sdk-typescript|Claude Agent SDK (TypeScript)]] — `query()` API, options, OAuth via env.
- [[../learnings/claude-code-oauth-token|Claude Code OAuth token]] — `claude setup-token` workflow for `CLAUDE_CODE_OAUTH_TOKEN`.
- [[../learnings/claude-code-cli-headless|Claude Code CLI — headless flags]] — `-p`, `--bare`, output formats.
- [[../learnings/slack-bolt-socket-mode|Slack Bolt Socket Mode]] — `@slack/bolt@4.7` minimal setup + scopes.
- [[../learnings/gh-repo-list-json|gh repo list with --json]] — fields and auth via `GH_TOKEN`.
- [[../learnings/node-lts-current|Node.js LTS status]] — Node 24 is current Active LTS (as of 2026-04).
- [[../learnings/docker-node-image-variants|Node.js Docker image variant]] — `node:24-slim` is the right default for Zeno.

## `#gotcha` — Things that tripped us up

- [[../learnings/claude-bare-mode-no-oauth|Claude Code `--bare` mode skips OAuth]] — use the SDK or drop `--bare`.
- [[../learnings/claude-code-cli-blocks-root|Claude Code CLI blocks `--dangerously-skip-permissions` as root]] — container must run as non-root for `permissionMode: 'bypassPermissions'`.
- [[../learnings/hermes-prompt-caching-invariants|Hermes' prompt-caching invariants]] — never alter past context mid-conversation; applies to Zeno too.
