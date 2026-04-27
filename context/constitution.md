---
status: canonical
created: 2026-04-15
---
# Zeno — Constitution

This document declares the non-negotiable principles of the Zeno project. Everything here has earned its place by being a decision we never want to re-litigate or a constraint we never want to forget. Agents and humans must read this file before making any substantive change.

If you are tempted to violate a rule here, stop and open a discussion first. Never silently work around the constitution.

## Why Zeno exists

Zeno is a personal agent that operates across the apps you use, by composing the connectors you install. The owner is described in `profiles/<name>/USER.md` (gitignored — see `profiles/default/USER.example.md` for the template). This repository is Zeno's workspace — the place where its identity, configuration, and operating knowledge live.

The architecture is intentionally layered, in order of weight:

- **Connectors are the product.** Every capability Zeno has beyond "read a message and reply" comes from a connector the operator installs via the dashboard. A connector is an MCP server that exposes typed tools (e.g. `mcp__github-app-acme__merge_pull_request`); the agent calls those tools to act in the external world. Without connectors, Zeno is a talking statue. The [agentskills.io](https://agentskills.io) open-standard composable-units philosophy inspired the connector model — units the operator installs, composes, and replaces without touching the core.
- **The channel is the I/O boundary.** Slack today; Discord, Telegram, email, etc. are pluggable additions tomorrow. The channel is how user requests come in and how the agent's reply goes back out — not a tool the agent uses.
- **The backend is the brain.** Pluggable reasoning engine (Claude Code today, alternatives possible). Orchestrates which connector tools to call.
- **The core is small and stable.** A channel adapter, a backend wire, a cron runner, a dashboard. It should rarely change.
- **Skills (deferred) are domain knowledge.** Skills are not part of the runtime in this iteration. When they return, they will likely be bundled with connectors — domain knowledge layered on top of connector capabilities to inform orchestration without granting power. This is a future direction; the concrete design is for a later spec.

The goal is that adding a capability is always a matter of installing or building a new connector, never of modifying the core. When in doubt between flexibility in the core and flexibility in the connector layer, the connector layer wins.

## Scope guardrails

- This repo is **Zeno's workspace**: source code of the agent, its specs, its operational knowledge. Not a place for unrelated experiments.
- **Personal scope.** Zeno is single-user — the user defined in `USER.md`. Multi-user (allowlists, OAuth per user, billing isolation) is explicitly deferred until the use case appears.
- **No production deploy concerns.** Zeno runs locally on the user's machine. Cloud migration is possible later (Docker-first design) but not a current goal.
- Do not add dependencies, tooling, or frameworks without first writing a learning or spec explaining the decision. Premature lock-in is the main risk during early growth.

## Architecture principles

- **Ports & adapters.** Three pluggable abstractions: `Channel` (message sources — Slack today, Discord/Telegram/etc. future), `AgentBackend` (reasoning engines — Claude Code today, Codex/Gemini future), and **Connector** (MCP tool surfaces the agent calls — DB-managed via the dashboard since spec 0032). The Agent Core orchestrator depends only on the first two interfaces; the agent backend itself consumes Connectors via the SDK's `mcpServers` map at query time. Adding a new channel, backend, or connector must be additive — never a modification to the core. Channel ≠ Connector — Slack is both, but they are distinct concepts (input/output adapter vs tool callable by the agent). See `[[learnings/channel-vs-connector]]`.
- **Capabilities come from connectors.** External capabilities are surfaced exclusively as MCP tools exposed by the connectors the operator installs via the dashboard. The agent does not have direct shell, filesystem, or web-fetch access at runtime. If a capability is missing, the answer is to install or build a connector for it, not to script around it.
- **Stateless per turn (current MVP).** No conversation memory between Slack mentions. Persistent thread sessions are a future iteration and require an explicit storage decision attached to a spec before being added.
- **Sandboxed execution.** The agent runs inside a Docker container with no shell or filesystem access of its own — capabilities flow exclusively through connector MCP subprocesses spawned by the worker. The container has no host filesystem access beyond mounted volumes (`workspace`, `USER.md` read-only).
- **OAuth, not API key.** Claude is accessed via `CLAUDE_CODE_OAUTH_TOKEN` (subscription auth), not `ANTHROPIC_API_KEY`. This aligns the cost model with personal use and respects the design constraint set by the user. Migration to API key (or enterprise auth) is reserved for the day Zeno serves multiple people.

Principles that frame all of the above:

- **Reversibility first.** Prefer choices that are easy to back out of.
- **One decision at a time.** Don't bundle stack choices; each should have its own rationale captured in a learning.
- **Write before you build.** If a solution isn't obvious in one sentence, use the spec flow (`/spec`).

## Tooling and workflow principles

**Stack (locked in via spec `0001-slack-zeno-mvp` + Task 0 discovery):**

- **Language:** TypeScript, strict mode.
- **Runtime:** Node.js 24 LTS — see `[[learnings/node-lts-current]]`.
- **Package manager:** pnpm.
- **Tests:** `vitest`. Unit tests for pure functions and well-mocked boundaries; smoke tests for integration.
- **Lint + format:** `biome` (single tool replaces ESLint + Prettier). Style rules in `[[conventions/code-style]]`.
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

- `context/` is **maintainer-facing documentation** — for humans or AI agents WORKING ON Zeno's source code. The Zeno running in production does NOT mount or read this directory; it would be source-code metadata, irrelevant to its runtime job (serving Slack messages).
- Runtime context the agent actually needs is narrow: who the user is (`USER.md`, mounted), the system prompt (built at boot), and the MCP tools exposed by the connectors the operator has enabled via the dashboard.
- Anything Zeno-specific that a future maintainer (or future-you) would want to know — principles, decisions, architecture, surprises, conventions — lives in `context/`.
- Only add notes here for things unique to Zeno. Generic patterns that apply to any project belong in global instructions or the user's global memory.
- When a decision is made about Zeno's stack or architecture, update this constitution **and** write a matching learning explaining the reasoning.

## What this constitution is not

- Not an architecture document. See `context/_index/learnings.md` for architecture notes.
- Not a style guide. See `context/conventions/` for code style conventions.
- Not a spec for any feature. Specs live in `context/specs/`.

This document exists to hold the things that would be catastrophic to forget.
