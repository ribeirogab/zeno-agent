---
tags:
  - moc
---
# Learnings — Map of Content

Atomic notes about Zeno's architecture, patterns, and gotchas. Categorized by tag.

Learnings here are specific to Zeno. Code style conventions live in `[[conventions|Conventions MOC]]`.

## `#concept` — Architecture and patterns

- [[../learnings/lessons-for-zeno-from-openclaw-hermes|Lessons for Zeno from OpenClaw and Hermes]] — synthesis + strategic positioning + what to adopt/defer.
- [[../learnings/async-local-storage-for-sdk-callbacks|AsyncLocalStorage for per-call state in SDK callbacks]] — how `GuardedBackend` gives per-call context to the SDK's constructor-level `canUseTool` hook.
- [[../learnings/classifier-reuses-oauth-via-sdk-query|Classifier reuses OAuth via SDK query()]] — auxiliary LLM calls inside Zeno reuse the agent SDK with empty tools; no API key, no new dep.
- [[../learnings/workspace-markdown-files-pattern|Workspace markdown files pattern]] — SOUL.md, AGENTS.md, USER.md, MEMORY.md, SKILL.md as the emerging agent-config lingua franca.
- [[../learnings/tool-registry-autodiscovery-pattern|Tool registry with import-time auto-discovery]] — Hermes' elegant extension pattern.
- [[../learnings/gateway-daemon-vs-single-process|Gateway daemon vs single-process]] — when each wins; why Zeno stays single-process for now.
- [[../learnings/closed-learning-loop-self-improving-skills|Closed learning loop and self-improving skills]] — Hermes' bet; when it's worth adopting.
- [[../learnings/dm-pairing-allowlist-security|DM pairing / allowlist as first-class security]] — OpenClaw's pattern; when to enable in Zeno.
- [[../learnings/multi-agent-routing-channels-to-agents|Multi-agent routing — channels to agents]] — OpenClaw's pattern; triggers to adopt in Zeno.
- [[../learnings/slack-mcp-vs-bolt|Slack MCP server vs Slack Bolt]] — MCP is pull-only; still need Bolt for ingress.
- [[../learnings/mcp-github-server-status|GitHub MCP server status]] — moved to github/github-mcp-server; `gh` + Bash is simpler for MVP.
- [[../learnings/db-as-contract-pattern|DB is the contract between worker and API]] — zero IPC; every coordination goes through a SQLite table (commands, logs, sessions).
- [[../learnings/fire-and-forget-mutation-ux|Fire-and-forget mutation UX]] — API 204 + 1.5s invalidate, no command-status polling in the dashboard.
- [[../learnings/two-logger-bootstrap-pattern|Two-logger bootstrap pattern]] — boot logger (pre-DB, stdout only) + main logger (dbSink) inside `main()`.
- [[../learnings/shadcn-copy-not-library|shadcn primitives are code you own]] — hand-write the shape, audit per-file, never run the CLI in this repo.
- [[../learnings/structural-interface-across-packages|Structural interface across packages]] — declare minimal interface in consumer; producer satisfies by shape; no cross-package runtime dep.
- [[../learnings/tailwind-v4-source-directive-cross-package|Tailwind v4 `@source` directive for cross-package components]] — workspace packages self-register their content globs in `tokens.css`.
- [[../learnings/lowercase-pill-convention|Lowercase pill convention]] — status pills lowercase, kickers and filter chips uppercase.
- [[../learnings/optimistic-mutation-pattern|Optimistic-mutation primitive over TanStack useMutation]] — declarative wrapper handles snapshot/restore/invalidate; each mutation becomes ~10 lines of config.
- [[../learnings/docker-multi-profile-via-compose|Multi-profile isolation via Docker Compose]] — same image, N compose files, N profile dirs; shared claude_home, isolated workspace volumes.
- [[../learnings/skill-scoped-credentials-pattern|Skill-scoped credentials pattern]] — AWS keys, GitHub App private key, and Terraform all live inside the skill folder; referenced via env vars per-command.
- [[../learnings/github-app-token-rotation|GitHub App token rotation]] — JWT → installation token exchange; per-org env vars; 55-min refresh loop; primary token overrides GH_TOKEN.

## `#reference` — Environment and commands

- [[../learnings/openclaw-architecture|OpenClaw architecture]] — TypeScript monorepo + gateway daemon + 22+ channels; full reference.
- [[../learnings/hermes-architecture|Hermes Agent architecture]] — Python, self-improving skills, serverless-ready; full reference.
- [[../learnings/claudeclaw-claude-code-plugin-pattern|ClaudeClaw — OpenClaw-lite as a Claude Code plugin]] — lightweight alternative, closest comparable to Zeno.
- [[../learnings/agent-skills-open-standard|Agent Skills open standard (agentskills.io)]] — SKILL.md format, portability across agents.
- [[../learnings/profile-isolation-via-env-var|Profile isolation via env var]] — Hermes' HERMES_HOME pattern for multi-instance.
- [[../learnings/claude-agent-sdk-typescript|Claude Agent SDK (TypeScript)]] — `query()` API, options, OAuth via env.
- [[../learnings/claude-sdk-jsonl-transcript-shape|Claude Agent SDK JSONL transcript shape]] — where session transcripts live + parser strategy.
- [[../learnings/claude-code-oauth-token|Claude Code OAuth token]] — `claude setup-token` workflow for `CLAUDE_CODE_OAUTH_TOKEN`.
- [[../learnings/claude-code-cli-headless|Claude Code CLI — headless flags]] — `-p`, `--bare`, output formats.
- [[../learnings/claude-sdk-settings-sources-skills|Claude Agent SDK settingSources for skill auto-discovery]] — SDK does NOT auto-load skills; `settingSources: ['user']` is required.
- [[../learnings/slack-bolt-socket-mode|Slack Bolt Socket Mode]] — `@slack/bolt@4.7` minimal setup + scopes.
- [[../learnings/gh-repo-list-json|gh repo list with --json]] — fields and auth via `GH_TOKEN`.
- [[../learnings/node-lts-current|Node.js LTS status]] — Node 24 is current Active LTS (as of 2026-04).
- [[../learnings/docker-node-image-variants|Node.js Docker image variant]] — `node:24-slim` is the right default for Zeno.
- [[../learnings/moduleresolution-split-worker-vs-dashboard|`moduleResolution` split: NodeNext in packages, Bundler in apps]] — what each workspace uses and why.

## `#gotcha` — Things that tripped us up

- [[../learnings/claude-bare-mode-no-oauth|Claude Code `--bare` mode skips OAuth]] — use the SDK or drop `--bare`.
- [[../learnings/claude-code-cli-blocks-root|Claude Code CLI blocks `--dangerously-skip-permissions` as root]] — container must run as non-root for `permissionMode: 'bypassPermissions'`.
- [[../learnings/hermes-prompt-caching-invariants|Hermes' prompt-caching invariants]] — never alter past context mid-conversation; applies to Zeno too.
- [[../learnings/sdk-mcp-server-type-not-exported|SDK MCP server type not exported]] — in-process MCP servers need a cast at the call boundary; SDK union doesn't include them.
- [[../learnings/hot-reload-needs-getter-not-snapshot|Hot-reload needs getter, not snapshot]] — long-lived components must read mutable state via `() => T`, not a captured value.
- [[../learnings/pnpm-only-built-dependencies|pnpm `onlyBuiltDependencies` for native modules]] — non-interactive way to allow postinstall scripts; required for Docker + CI.
- [[../learnings/sqlite-current-timestamp-tiebreaker|SQLite CURRENT_TIMESTAMP tie-breaker]] — second-precision ties; use `rowid` to break them for deterministic ORDER BY.
- [[../learnings/tanstack-router-flat-file-nesting|TanStack Router flat-file naming needs `.index`]] — `foo.tsx` becomes a layout route when `foo.bar.tsx` exists.
- [[../learnings/sqlite-autoincrement-for-stable-cursors|SQLite AUTOINCREMENT for stable cursors]] — `INTEGER PRIMARY KEY` reuses rowid after DELETE; AUTOINCREMENT doesn't.
- [[../learnings/better-sqlite3-writer-contention|better-sqlite3 writer-lock contention]] — raw insert is µs; a long transaction blocks the other process.
- [[../learnings/logger-factory-dbsink-propagation|Module-level loggers skip the dbSink]] — pass the logger through constructors for events to reach the logs table.
- [[../learnings/appdeps-growth-propagates-to-tests|AppDeps growth propagates to tests]] — a new field means sweeping all api test helpers; don't miss one.
- [[../learnings/workspace-node-modules-in-docker|pnpm workspace node_modules in Docker]] — each workspace's `node_modules/` must be copied into the runtime image, not just the root.
- [[../learnings/macos-case-insensitive-git-mv|macOS case-insensitive FS needs two-step `git mv`]] — case-only renames silently no-op; rename through an intermediate name.
- [[../learnings/peer-react-in-workspace-ui-package|Peer React in workspace UI package]] — deps-level React causes two-instances hook errors; peer + dev is the fix.
- [[../learnings/slack-mrkdwn-vs-markdown|Slack mrkdwn ≠ GitHub markdown]] — Claude emits `**bold**`, Slack needs `*bold*`; convert at the channel adapter, not the prompt.
- [[../learnings/git-credential-helper-for-token-rotation|Git credential helper for token rotation]] — never embed tokens in clone URLs; use a helper that reads GH_TOKEN from env at runtime.

## `#meta` — Workflow and process

- [[../learnings/spec-review-loop-catches-real-bugs|Spec review loop catches real design bugs]] — the `spec-document-reviewer` subagent finds what I miss; don't skip it.
- [[../learnings/subagent-driven-implementation-patterns|Subagent-driven implementation patterns]] — briefing templates, review loops, when to go inline instead.
