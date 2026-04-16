---
tags:
  - learning
  - reference
related:
  - "[[openclaw-architecture]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# ClaudeClaw — OpenClaw-lite as a Claude Code plugin

ClaudeClaw (`github.com/moazbuilds/claudeclaw`) is a "lightweight, open-source OpenClaw version built into your Claude Code." It's a Claude Code plugin: install via `claude plugin marketplace add moazbuilds/claudeclaw` + `claude plugin install claudeclaw`, then `/claudeclaw:start` from inside Claude Code. 5-minute setup, uses your Claude Code subscription directly (no API billing).

## Context

Studied 2026-04-15 as a counterpoint to full OpenClaw. ClaudeClaw explicitly markets itself as the answer to OpenClaw's complexity ("not 600K LOC"). It's structurally the closest comparable to what Zeno is today — important for understanding Zeno's competitive position.

## How to Apply

**What ClaudeClaw is:**
- A Claude Code plugin (runs inside `claude` CLI, not as a standalone daemon).
- Adds scheduling (Heartbeat, cron), multi-platform comms (Telegram text/image/voice, Discord DMs + threads + slash commands), and a web dashboard for job management.
- Uses Claude Code's own memory (`CLAUDE.md`) for state — no separate memory system.
- Each Discord thread gets its own isolated Claude CLI session.

**Stated differentiators vs full OpenClaw:**

| Aspect | ClaudeClaw | OpenClaw |
|---|---|---|
| Setup time | ~5 minutes | "Nightmare" |
| Cost model | Uses Claude Code subscription | "API overhead" |
| Deployment | Claude Code on any device/VPS | External infrastructure |
| Security | Claude Code defaults | "Nightmare" |
| Code size | Small plugin | ~600K LOC |

(Marketing language, but directionally honest — OpenClaw *is* a big monorepo.)

**Architecture (inferred):**
- TypeScript/JS plugin loaded by Claude Code.
- Hooks into Claude Code's slash command system (`/claudeclaw:*`).
- Plugin directories: `/commands`, `/prompts`, `/skills`, `/hooks`.
- Channel integrations run inside the plugin process.

**How ClaudeClaw is structurally similar to Zeno:**
- Both ride on Claude Code / Claude Agent SDK (no API key required — uses subscription).
- Both are single-process at the core (not a gateway daemon).
- Both adopt Claude's built-in memory story (`CLAUDE.md` / `USER.md`).
- Both target "personal assistant on messaging platforms", not "enterprise multi-agent".

**How Zeno differs from ClaudeClaw:**
- Zeno runs **outside** Claude Code (Node process using `@anthropic-ai/claude-agent-sdk`), not as a Claude Code plugin.
- ClaudeClaw is invoked from `claude` CLI interactively; Zeno is a bot that runs headless in Docker 24/7.
- Zeno owns the channel adapter directly (Slack Bolt); ClaudeClaw uses plugin hooks that Claude Code exposes.
- Zeno's spec/learnings/constitution knowledge vault is maintainer-facing; ClaudeClaw doesn't have an equivalent (leans entirely on `CLAUDE.md`).

**The tradeoff:**
- **ClaudeClaw path** (plugin): cheaper onboarding — anyone with Claude Code installed is one command from having a personal agent. But tied to Claude Code's lifecycle; Claude Code runs in terminal, not 24/7.
- **Zeno path** (standalone service): higher setup cost (Slack app, tokens, Docker, `/login`), but runs always-on without a terminal open. Better fit for "the agent receives DMs while I'm away from keyboard".

**What Zeno should consider borrowing:**
- **Folder-based isolation** for multi-context work — ClaudeClaw per-thread isolates a Claude CLI session. Zeno could adopt this per-thread pattern when adding session persistence (see `[[lessons-for-zeno-from-openclaw-hermes]]`).
- **Web dashboard** — out of MVP scope but a known pattern. Observing jobs/sessions/logs via HTTP instead of only Docker logs is a nice UX upgrade later.
- **Cron/heartbeat integration** — natural language scheduling ("remind me to stand up at 9am") is well-established territory; both ClaudeClaw and OpenClaw have it.

**What Zeno should NOT borrow:**
- **Being a Claude Code plugin** — Zeno is a server, not a CLI. Different product.
- **Relying on `CLAUDE.md` for runtime memory** — Zeno uses `USER.md` which is cleaner (single-purpose user profile, not mixed with dev-tool config).

**Key takeaway:** ClaudeClaw validates that a "personal agent riding Claude Code subscription, not full OpenClaw" is a legitimate product niche. Zeno targets adjacent niche (always-on Slack bot vs per-session plugin). The simplification instinct — fewer moving parts, ride existing tools — is correct.
