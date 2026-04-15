---
feature: slack-wesker-mvp
spec: "[[spec]]"
created: 2026-04-15
---
# Wesker MVP — Implementation Plan

**For this spec:** `[[spec]]`

## Goal

Build and ship the MVP described in the spec: a Dockerized Node/TypeScript process that receives Slack mentions/DMs, forwards them to Claude Code (authenticated via OAuth), and posts natural-language answers — using "list GitHub repos in org X" as the end-to-end validation scenario.

## Approach

The implementation follows **ports & adapters** literally. Two interfaces — `Channel` (message sources) and `AgentBackend` (LLM CLIs) — are defined first; then one implementation of each (`SlackChannel`, `ClaudeCodeBackend`) is wired by a small `Agent Core` orchestrator. Adding Discord, Codex, or Gemini later will be pure aditive work in a single directory.

The agent exposes **zero custom tools** in the MVP. All capabilities come from Claude Code's built-in toolset (primarily `Bash`). "List repos" is not a function we write — it's Claude running `gh repo list <org> --json name,description --limit 100` inside the container, guided by the system prompt. This keeps the codebase tiny and defers the "typed tools vs shell" question until a real need appears.

Authentication to Claude is via the `/login` OAuth flow of the Claude Code CLI installed inside the container, not `ANTHROPIC_API_KEY`. Session persists in a named Docker volume. The first login is interactive and documented in the README. GitHub auth uses a PAT with `repo` + `read:org`.

The plan front-loads **Task 0 (Discovery)** as a non-code checkpoint that validates current versions, flags, and best practices across all external dependencies. The current Claude (training cutoff May 2025) is one year behind the present date (April 2026); anything material that changed since then is caught here before it bleeds into wrong code. Every subsequent code task proceeds on assumptions validated by Task 0.

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
       │       spawns `claude -p …`       │
       └────────────────┬─────────────────┘
                        │  subprocess in container
                        ▼
       ┌──────────────────────────────────┐
       │  Container sandbox               │
       │  gh + git + node + claude        │
       │  workspace/ volume               │
       │  claude-home volume (OAuth)      │
       └──────────────────────────────────┘
```

**Component responsibilities:**

- **`Channel`** (port, `src/channels/types.ts`) — defines `start`, `send`, `stop`, and the normalized `IncomingMessage` / `MessageTarget` shapes. Knows nothing about specific platforms.
- **`SlackChannel`** (`src/channels/slack/adapter.ts`) — implements `Channel` using `@slack/bolt` in Socket Mode. Normalizes Slack events into `IncomingMessage`, sends replies to the correct thread/DM.
- **`AgentBackend`** (port, `src/agent/types.ts`) — defines `query(input): Promise<output>`. Knows nothing about specific LLMs or CLIs.
- **`ClaudeCodeBackend`** (`src/agent/backends/claude-code.ts`) — implements `AgentBackend` by spawning the `claude` CLI inside the container. Parses stream-json output. Translates known error modes (auth expired, rate limit) into typed exceptions.
- **`AgentCore`** (`src/agent/core.ts`) — wires a `Channel` to an `AgentBackend`. Handles correlation IDs, reaction acks, error translation to human-readable Slack messages, structured logging.
- **`system-prompt`** (`src/agent/system-prompt.ts`) — the multiline string defining Wesker's identity, language, tools, and safety rules.
- **`config`** (`src/config.ts`) — loads and validates env vars with zod. Fails fast on boot if anything is missing or malformed.
- **`index.ts`** — composition root. Instantiates config, backend, channels, core; runs boot-time health checks; starts channels; sets up graceful shutdown.

## Tech Stack

- **Runtime:** Node.js LTS (verify in Task 0 — target ≥ 22, prefer 24 if it's the active LTS)
- **Language:** TypeScript (strict mode)
- **Slack SDK:** `@slack/bolt` with Socket Mode
- **Logging:** `pino` (structured JSON, stdout)
- **Env validation:** `zod`
- **Testing:** `vitest`
- **Dev runner:** `tsx`
- **Container base:** `node:<lts>-slim` (Debian-based, has apt for installing `gh`, `git`, `bash`)
- **Claude Code:** installed via the official `curl -fsSL https://claude.ai/install.sh | bash`, pinned to `~/.local/bin/claude`, OAuth session in volume `claude-home:/root/.claude`
- **`gh` CLI:** installed from official Debian repo
- **Persistence:** two named Docker volumes — `claude-home` (OAuth session), `workspace` (future repo clones; empty in MVP)

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
- `Dockerfile` — Multi-stage build (deps → build → runtime) with `gh`, `git`, `claude`
- `docker-compose.yml` — Single `wesker` service, `claude-home` and `workspace` volumes
- `README.md` — Setup, `/login` flow, smoke-test checklist, architecture TL;DR
- `SMOKE.md` — Step-by-step verification of every spec success criterion

**Updates to existing files (Task 1):**
- `AGENTS.md` — rename `Zerk` → `Wesker`
- `context/constitution.md` — rename, update "Why … exists" paragraph with finalized decisions
- `context/_index/home.md`, `specs.md`, `learnings.md`, `conventions.md`, `rules.md` — rename in titles/body
- `.gitignore` — add `.env`, `node_modules`, `dist/`

## Phase Ordering

Phases are grouped by what can be validated independently. Each phase ends with a working state that could theoretically be shipped in isolation.

1. **Discovery & Rename (Tasks 0–1)** — Non-code preparation. Confirms assumptions; cleans up residual `Zerk` references. End state: project is named Wesker everywhere.
2. **Project Bootstrap (Tasks 2–3)** — Node project scaffolding, config loading. End state: `npm run dev` runs a no-op process that validates env and exits cleanly.
3. **Core Types (Tasks 4–5)** — Ports defined. End state: TS compiles, no runtime behavior yet.
4. **Slack Adapter (Tasks 6–7)** — `SlackChannel` connects to Slack, echoes messages back (temporary). End state: mention in Slack → echo reply in thread.
5. **Claude Code Backend (Tasks 8–9)** — `ClaudeCodeBackend` can be invoked programmatically and returns text. Validated via a one-shot dev script before wiring into the channel. End state: local script runs a hardcoded prompt through the backend, prints the reply.
6. **Wire Core + System Prompt (Tasks 10–11)** — `Agent Core` glues everything. End state: mention → Claude reply in thread (still running locally via `npm run dev`).
7. **Container (Tasks 12–13)** — Dockerfile + compose. End state: everything works inside the container, including `/login` flow.
8. **Docs & Smoke (Tasks 14–15)** — README, SMOKE.md, manual smoke-test pass. End state: spec's Success Criteria all observable.

## Risks / Open Decisions

**Locked in before coding (via brainstorming):**
- Ports & adapters architecture, two ports defined (Channel, AgentBackend).
- Claude Code OAuth (not API key).
- PAT for GitHub (App is next iteration).
- Socket Mode for Slack.
- Zero custom tools in MVP.
- TS / Node / Docker.

**Open during implementation:**
- **Exact `claude -p` invocation and output format.** Best-known pattern is `claude -p "<prompt>" --append-system-prompt "<sys>" --output-format stream-json`, but flags may have changed. Task 0 verifies against current docs. If the flag surface differs, update `ClaudeCodeBackend` before Task 8. If the `stream-json` shape changed, update the parser accordingly.
- **Claude Agent SDK (Node) availability.** If a mature SDK with OAuth support exists now (npm `@anthropic-ai/claude-agent-sdk` or similar), we may prefer it over subprocess-per-request. Task 0 checks. If switching, revise Task 8 to use the SDK API; the `AgentBackend` interface remains unchanged — only internals of `ClaudeCodeBackend` move.
- **MCP Slack server.** If `@modelcontextprotocol/server-slack` (or equivalent) exposes Slack as Claude tools directly, we could technically skip writing `SlackChannel` and let Claude both receive and reply via MCP. Task 0 checks. **Likely outcome: we still want `SlackChannel` as the receive side (MCP is pull/call, not push/subscribe), but we might register the MCP server for outbound actions.** Decision is made in Task 0 with concrete evidence.
- **Node LTS version.** Target "active LTS" at the time of implementation. Task 0 confirms. Update `.nvmrc`, `Dockerfile`, `package.json` `engines` coherently.
- **Dockerfile patterns.** Multi-stage build is the target (deps → build → runtime), but if `distroless` or `bookworm-slim` choices have shifted, Task 0 notes and Task 12 absorbs.

**Risks that are accepted (documented, not blocking):**
- OAuth session expiry during a conversation will surface as a user-visible Slack message rather than a silent failure. That's the MVP's answer.
- Cold-start latency may push past the 30s warm-path target on first mention after a restart. README documents this as non-guarantee.
- Solo workspace means no allowlist; this is a deliberate non-goal per spec and must be reversed the moment workspace multi-tenancy changes.

---

Execution plan is in `[[tasks]]`.
