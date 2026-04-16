---
feature: slack-zeno-mvp
spec: "[[spec]]"
created: 2026-04-15
---
# Zeno MVP — Implementation Plan

**For this spec:** `[[spec]]`

## Goal

Build and ship the MVP described in the spec: a Dockerized Node/TypeScript process that receives Slack mentions/DMs, forwards them to Claude Code (authenticated via OAuth), and posts natural-language answers — using "list GitHub repos in org X" as the end-to-end validation scenario.

## Approach

The implementation follows **ports & adapters** literally. Two interfaces — `Channel` (message sources) and `AgentBackend` (reasoning engines) — are defined first; then one implementation of each (`SlackChannel`, `ClaudeCodeBackend`) is wired by a small `Agent Core` orchestrator. Adding Discord, Codex, or Gemini later will be pure aditive work in a single directory.

The agent exposes **zero custom tools** in the MVP. All capabilities come from Claude Code's built-in toolset (primarily `Bash`). "List repos" is not a function we write — it's Claude running `gh repo list <org> --json name,description --limit 100` inside the container, guided by the system prompt. This keeps the codebase tiny and defers the "typed tools vs shell" question until a real need appears.

Claude is accessed **in-process via `@anthropic-ai/claude-agent-sdk`** (the official TypeScript SDK — see `[[../../learnings/claude-agent-sdk-typescript]]`). Authentication uses the subscription OAuth token, not an `ANTHROPIC_API_KEY`. The token is minted once per container via `claude setup-token` and stored in `.env` as `CLAUDE_CODE_OAUTH_TOKEN` — see `[[../../learnings/claude-code-oauth-token]]`. The `claude` CLI is installed in the image for this setup step; at runtime, only the SDK is used (no subprocess per request). GitHub auth is a PAT with `repo` + `read:org` at `GH_TOKEN`.

The plan front-loads **Task 0 (Discovery)** as a non-code checkpoint that validates current versions, flags, and best practices across all external dependencies. The current Claude (training cutoff May 2025) is one year behind the present date (April 2026); anything material that changed since then is caught here before it bleeds into wrong code. Every subsequent code task proceeds on assumptions validated by Task 0. The discovery findings for this spec are atomic notes in `context/learnings/` indexed by the Learnings MOC.

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Slack       │  │  Discord     │  │  Telegram    │
│  Adapter     │  │  Adapter     │  │  Adapter     │  ...
│  (MVP)       │  │  (future)    │  │  (future)    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       └────────┬────────┴─────────────────┘
                │  IncomingMessage (normalized)
                ▼
       ┌──────────────────────────────────┐
       │  Agent Core                      │
       │  — channel-agnostic              │
       │  — backend-agnostic              │
       │  — emits structured logs         │
       └────────────────┬─────────────────┘
                        │  AgentInput
                        ▼
       ┌──────────────────────────────────┐
       │  AgentBackend (interface)        │
       │   └── ClaudeCodeBackend (MVP)    │
       │       @anthropic-ai/claude-      │
       │       agent-sdk · query()        │
       └────────────────┬─────────────────┘
                        │  in-process agent loop
                        ▼
       ┌──────────────────────────────────┐
       │  Container sandbox               │
       │  gh + git + node + claude (CLI   │
       │  only for setup-token)           │
       │  workspace/ volume               │
       └──────────────────────────────────┘
```

**Component responsibilities:**

- **`Channel`** (port, `src/channels/types.ts`) — defines `start`, `send`, `stop`, and the normalized `IncomingMessage` / `MessageTarget` shapes. Knows nothing about specific platforms.
- **`SlackChannel`** (`src/channels/slack/adapter.ts`) — implements `Channel` using `@slack/bolt` in Socket Mode. Normalizes Slack events into `IncomingMessage`, sends replies to the correct thread/DM.
- **`AgentBackend`** (port, `src/agent/types.ts`) — defines `query(input): Promise<output>`. Knows nothing about specific LLMs or CLIs.
- **`ClaudeCodeBackend`** (`src/agent/backends/claude-code.ts`) — implements `AgentBackend` by calling `query()` from `@anthropic-ai/claude-agent-sdk` in-process. Consumes the async iterator of SDK messages, extracts the final `result` text and tool-call summary. Translates known error modes (auth expired, rate limit, timeout) into typed `AgentBackendError` values.
- **`AgentCore`** (`src/agent/core.ts`) — wires a `Channel` to an `AgentBackend`. Handles correlation IDs, reaction acks, error translation to human-readable Slack messages, structured logging.
- **`system-prompt`** (`src/agent/system-prompt.ts`) — the multiline string defining Zeno's identity, language, tools, and safety rules.
- **`config`** (`src/config.ts`) — loads and validates env vars with zod. Fails fast on boot if anything is missing or malformed.
- **`index.ts`** — composition root. Instantiates config, backend, channels, core; runs boot-time health checks; starts channels; sets up graceful shutdown.

## Tech Stack

- **Runtime:** Node.js 24 LTS (confirmed in Task 0 — see `[[../../learnings/node-lts-current]]`)
- **Language:** TypeScript (strict mode)
- **Agent runtime:** `@anthropic-ai/claude-agent-sdk` (in-process; OAuth via `CLAUDE_CODE_OAUTH_TOKEN`)
- **Slack SDK:** `@slack/bolt@4` with Socket Mode
- **Logging:** `pino` (structured JSON, stdout)
- **Env validation:** `zod`
- **Testing:** `vitest`
- **Dev runner:** `tsx`
- **Container base:** `node:24-slim` (see `[[../../learnings/docker-node-image-variants]]`)
- **Claude Code CLI:** installed via the official `curl -fsSL https://claude.ai/install.sh | bash` — used **only for `claude setup-token`** (one-time OAuth token minting), not at runtime
- **`gh` CLI:** installed from official Debian repo
- **Persistence:** one named Docker volume — `workspace` (future repo clones; empty in MVP). No `claude-home` volume needed: the OAuth token lives in `.env` as an env var, not in `~/.claude/` session files.

## File Structure

Every file the MVP creates, with single-line responsibility:

**Runtime source (`src/`):**
- `src/index.ts` — Composition root; boot + shutdown
- `src/config.ts` — Env loading + zod schema
- `src/logger.ts` — Single pino instance export
- `src/channels/types.ts` — `Channel`, `IncomingMessage`, `MessageTarget` interfaces
- `src/channels/slack/adapter.ts` — `SlackChannel` class implementing `Channel`
- `src/channels/slack/normalize.ts` — Pure function: Bolt event → `IncomingMessage` (extracted so it's trivially testable)
- `src/agent/types.ts` — `AgentBackend`, `AgentInput`, `AgentOutput`, `AgentBackendError` kinds
- `src/agent/core.ts` — Orchestrator wiring channels to backend
- `src/agent/system-prompt.ts` — Exports the system prompt string
- `src/agent/backends/claude-code.ts` — `ClaudeCodeBackend` class implementing `AgentBackend`

**Tests (`tests/`):**
- `tests/config.test.ts` — Valid/invalid env cases
- `tests/channels/slack/normalize.test.ts` — Bolt event normalization cases (mention, DM, malformed)
- `tests/agent/backends/claude-code.test.ts` — Spawn args, output parsing, error classification (spawn mocked)

**Project root:**
- `package.json` — Scripts, deps, engine field
- `package-lock.json` — Lockfile
- `tsconfig.json` — TS config (strict, ESM, Node resolution)
- `.nvmrc` — Pin Node major version
- `.env.example` — Variables required (no real secrets)
- `.dockerignore` — Excludes `node_modules`, `.env`, etc.
- `USER.example.md` — Template for the per-user profile (committed)
- `USER.md` — Per-user profile (gitignored; loaded at boot, injected into the system prompt)
- `Dockerfile` — Multi-stage build (deps → build → runtime) with `gh`, `git`, `claude` (CLI for `setup-token` only)
- `docker-compose.yml` — Single `zeno-agent` service, `workspace` volume, `USER.md` and `context/` bind-mounts (`context/` is Zeno's own knowledge vault, read-only)
- `README.md` — Setup, `setup-token` flow, smoke-test checklist, architecture TL;DR
- `SMOKE.md` — Step-by-step verification of every spec success criterion

**Updates to existing files (Task 1):**
- `context/constitution.md` — finalize "Architecture principles" and "Tooling and workflow principles" sections (drop "not yet decided" placeholders)

## Phase Ordering

Phases are grouped by what can be validated independently. Each phase ends with a working state that could theoretically be shipped in isolation.

1. **Discovery & Rename (Tasks 0–1)** — Non-code preparation. Confirms assumptions; cleans up residual `Zeno` references. End state: project is named Zeno everywhere.
2. **Project Bootstrap (Tasks 2–3)** — Node project scaffolding, config loading. End state: `npm run dev` runs a no-op process that validates env and exits cleanly.
3. **Core Types (Tasks 4–5)** — Ports defined. End state: TS compiles, no runtime behavior yet.
4. **Slack Adapter (Tasks 6–7)** — `SlackChannel` connects to Slack, echoes messages back (temporary). End state: mention in Slack → echo reply in thread.
5. **Claude Code Backend (Tasks 8–9)** — `ClaudeCodeBackend` can be invoked programmatically and returns text. Validated via a one-shot dev script before wiring into the channel. End state: local script runs a hardcoded prompt through the backend, prints the reply.
6. **Wire Core + System Prompt (Tasks 10–11)** — `Agent Core` glues everything. End state: mention → Claude reply in thread (still running locally via `npm run dev`).
7. **Container (Tasks 12–13)** — Dockerfile + compose. End state: everything works inside the container, including `setup-token` flow.
8. **Docs & Smoke (Tasks 14–15)** — README, SMOKE.md, manual smoke-test pass. End state: spec's Success Criteria all observable.

## Risks / Open Decisions

**Locked in before coding (via brainstorming):**
- Ports & adapters architecture, two ports defined (Channel, AgentBackend).
- Claude Code OAuth (not API key).
- PAT for GitHub (App is next iteration).
- Socket Mode for Slack.
- Zero custom tools in MVP.
- TS / Node / Docker.

**Resolved by Task 0 (findings in `context/learnings/`):**
- ✅ Claude Agent SDK (Node) is mature and supports OAuth — chosen over subprocess per request.
- ✅ Slack MCP server is pull-only; Bolt still needed for ingress. No change to architecture.
- ✅ GitHub MCP server: superseded by `github/github-mcp-server`; for MVP, `gh` + Bash is simpler. No change.
- ✅ Node 24 is the target LTS.
- ✅ `node:24-slim` is the Dockerfile base.

**Risks that are accepted (documented, not blocking):**
- OAuth session expiry during a conversation will surface as a user-visible Slack message rather than a silent failure. That's the MVP's answer.
- Cold-start latency may push past the 30s warm-path target on first mention after a restart. README documents this as non-guarantee.
- Solo workspace means no allowlist; this is a deliberate non-goal per spec and must be reversed the moment workspace multi-tenancy changes.
- `CLAUDE_CODE_OAUTH_TOKEN` usage is community-documented; Anthropic policy restricts third-party OAuth for products. For personal scope this is acceptable; for a multi-tenant future, migrate to API key or enterprise auth.

---

Execution plan is in `[[tasks]]`.
