---
status: canonical
created: 2026-04-15
---
# Zeno — Constitution

This document declares the non-negotiable principles of the Zeno project. Everything here has earned its place by being a decision we never want to re-litigate or a constraint we never want to forget. Agents and humans must read this file before making any substantive change.

If you are tempted to violate a rule here, stop and open a discussion first. Never silently work around the constitution.

## Why Zeno exists

Zeno is a personal agent. The person who owns this instance is described in `USER.md` at the repo root (gitignored — see `USER.example.md` for the template). This repository is Zeno's workspace — the place where Zeno's identity, configuration, and operating knowledge live. It runs as a Dockerized Node/TypeScript process on the user's machine, connects to messaging channels (Slack first), and uses Claude Code (authenticated via OAuth) as its reasoning engine. The architecture is ports-and-adapters so additional channels (Discord, Telegram) and backends (Codex, Gemini) can be added without changing the core.

The initial scope is deliberately minimal: one channel (Slack), one backend (Claude Code), zero custom tools. Beyond MVP, Zeno is intended to grow into a development agent — clone repos, edit code, open PRs — invoked from Slack threads.

## Scope guardrails

- This repo is **Zeno's workspace**: source code of the agent, its specs, its operational knowledge. Not a place for unrelated experiments.
- **Personal scope.** Zeno is single-user — the user defined in `USER.md`. Multi-user (allowlists, OAuth per user, billing isolation) is explicitly deferred until the use case appears.
- **No production deploy concerns.** Zeno runs locally on the user's machine. Cloud migration is possible later (Docker-first design) but not a current goal.
- Do not add dependencies, tooling, or frameworks without first writing a learning or spec explaining the decision. Premature lock-in is the main risk during early growth.

## Architecture principles

- **Ports & adapters.** Two pluggable abstractions exist: `Channel` (message sources — Slack today, Discord/Telegram/etc. future) and `AgentBackend` (reasoning engines — Claude Code today, Codex/Gemini future). The Agent Core orchestrator depends only on these interfaces, never on concrete implementations. Adding a new channel or backend must be additive — never a modification to the core.
- **Zero custom tools by default.** Capabilities come from Claude Code's built-in toolset (`Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`). Custom tools require justification in a learning or spec — the bias is to teach the agent through the system prompt and let it use the shell.
- **Stateless per turn (current MVP).** No conversation memory between Slack mentions. Persistent thread sessions are a future iteration and require an explicit storage decision attached to a spec before being added.
- **Sandboxed execution.** Shell access (Bash tool) runs inside the Docker container only. The container has no host filesystem access beyond mounted volumes (`workspace`, `USER.md` read-only).
- **OAuth, not API key.** Claude is accessed via `CLAUDE_CODE_OAUTH_TOKEN` (subscription auth), not `ANTHROPIC_API_KEY`. This aligns the cost model with personal use and respects the design constraint set by the user. Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple people.

Principles that frame all of the above:

- **Reversibility first.** Prefer choices that are easy to back out of.
- **One decision at a time.** Don't bundle stack choices; each should have its own rationale captured in a learning.
- **Write before you build.** If a solution isn't obvious in one sentence, use the spec flow (`/spec`).

## Tooling and workflow principles

**Stack (locked in via spec `0001-slack-zeno-mvp` + Task 0 discovery):**

- **Language:** TypeScript, strict mode.
- **Runtime:** Node.js 24 LTS — see `[[learnings/node-lts-current]]`.
- **Package manager:** npm.
- **Tests:** `vitest`. Unit tests for pure functions and well-mocked boundaries; smoke tests for integration.
- **Logging:** `pino`, structured JSON to stdout. Each log entry carries an `event` field and (for request-scoped events) a `correlationId`.
- **Env validation:** `zod` — schema parsed at boot, fails fast on missing/malformed env.
- **Slack integration:** `@slack/bolt@4` with Socket Mode (outbound websocket; no public URL needed).
- **LLM:** `@anthropic-ai/claude-agent-sdk` in-process, authenticated via `CLAUDE_CODE_OAUTH_TOKEN`.
- **Container:** `node:24-slim` Debian-based — see `[[learnings/docker-node-image-variants]]`. Multi-stage build: deps → build → runtime.

**Workflow:**

- **Never push to `main`.** Always branch + PR. Pushing to `main`/`master` is blocked by convention — it triggers deploys/automations (see global rule 20).
- **Use `/open-pr`** to open pull requests. It generates title and description consistently.
- **Explicit consent for `git add`/`commit`/`push`.** No autonomous git writes.
- **Read-only database.** No write queries without approval.
- **Verify before implementing.** Before writing code that depends on third-party SDKs/CLIs, confirm current versions and idioms via discovery (Task 0 pattern). Capture findings as atomic notes in `[[_index/learnings|Learnings MOC]]`. The knowledge cutoff of any AI agent helping is months behind real time.

## Spec-Driven workflow

Before implementing any user request, assess whether the solution is obvious. If you cannot describe the complete solution in one sentence, use the Spec Kit flow: brainstorm → `spec.md` → `plan.md` → `tasks.md` → implement. If the solution is obvious, go direct. If almost obvious but with 1-2 open decisions, ask the user whether to spec or go direct.

Specs never get deleted. Shipped specs remain in `context/specs/` as historical record.

## Knowledge layering

- Project-specific knowledge lives in `context/`. Only add notes here for things unique to Zeno.
- Generic patterns that apply to any project should not be duplicated in this vault — they belong in global instructions or the user's global memory.
- When a decision is made about Zeno's stack or architecture, update this constitution **and** write a matching learning explaining the reasoning.

## What this constitution is not

- Not an architecture document. See `context/_index/learnings.md` for architecture notes.
- Not a style guide. See `context/conventions/` for code style conventions.
- Not a spec for any feature. Specs live in `context/specs/`.

This document exists to hold the things that would be catastrophic to forget.
