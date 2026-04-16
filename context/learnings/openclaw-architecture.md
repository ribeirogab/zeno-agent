---
tags:
  - learning
  - reference
related:
  - "[[hermes-architecture]]"
  - "[[agent-skills-open-standard]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
  - "[[workspace-markdown-files-pattern]]"
created: 2026-04-15
---
# OpenClaw — architecture reference

OpenClaw (openclaw.ai, github.com/openclaw/openclaw) is a self-hosted TypeScript personal AI assistant that routes messages from 22+ channels (Slack, Telegram, WhatsApp, Discord, iMessage…) to isolated agent sessions, each with its own workspace, tools, and model. Positioned as "messaging-native" — the product is the always-on assistant, the gateway is just the control plane.

## Context

Studied 2026-04-15 as part of competitive analysis for Zeno. OpenClaw is the most mature "personal AI assistant" framework to date — Zeno occupies the same problem space.

## How to Apply

**Core processes:**
- **Gateway** (`openclaw gateway --port 18789`): single long-running daemon. Installed as launchd (macOS) or systemd (Linux) user service via `openclaw onboard --install-daemon`. Centralizes session management, channel routing, tool dispatch, event streams.
- **Agent** (per session): the LLM loop + tool execution. Isolated per inbound channel/peer if configured.
- **Node** (optional): iOS/Android/macOS companion apps that pair via WebSocket and act as remote voice/canvas surfaces.

**Runtime layout:**
```
~/.openclaw/
├── openclaw.json                     # main config
├── workspace/
│   ├── AGENTS.md                     # injected into agent prompt
│   ├── SOUL.md                       # agent personality/instructions
│   ├── TOOLS.md                      # available tools reference
│   └── skills/<skill>/SKILL.md       # custom user skills (agentskills.io format)
├── sessions/                         # persisted session data
└── pairing/                          # DM allowlist store

[repo layout]
├── packages/           # pnpm monorepo
├── extensions/         # channel integrations (slack, discord, telegram, whatsapp…)
├── skills/             # bundled skills
├── apps/               # macOS/iOS/Android companion apps
├── openclaw.mjs        # CLI entry
└── pnpm-workspace.yaml
```

**Built-in tool families:**
- `browser`, `canvas`, `nodes`, `cron`, `sessions`, channel-specific (`slack.*`, `discord.*`)
- File: `read`, `write`, `edit`, `bash`, `process`
- Cross-session: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`

**Minimal config (`~/.openclaw/openclaw.json`):**
```json
{ "agent": { "model": "<provider>/<model-id>" } }
```

**Channel pattern:** each channel is a long-poll/subscribe listener that emits `inbound message` events to the gateway. Outbound via tool calls (e.g., `slack.send`). 22+ channels: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, Microsoft Teams, Matrix, Feishu, LINE, Mattermost, Nextcloud Talk, Nostr, IRC, and more.

**Multi-agent routing:** config routes different inbound sources to different agents. Each agent = isolated workspace + session store + tool allowlist. Typical use: `#channel-a` → `work-agent`, DMs → `personal-agent`.

**Security model (layered):**
- **Main session**: tools run on host with full access (trusted, single-user personal).
- **Non-main sessions** (optional): per-session Docker sandbox via `agents.defaults.sandbox.mode: "non-main"`. Typical sandbox allowlist: `bash`, `process`, `read`, `write`, `edit`, `sessions_*`. Denylist: `browser`, `canvas`, `nodes`, `cron`, channel tools.
- **DM pairing** (default `dmPolicy: "pairing"`): unknown senders get a pairing code; require `openclaw pairing approve <channel> <code>` before agent responds.

**Skills:**
- Compatible with agentskills.io open standard (see `[[agent-skills-open-standard]]`).
- Types: **bundled** (shipped), **managed** (ClawHub registry at clawhub.com), **workspace** (user-authored).
- Discovery: metadata injected into agent prompt via `AGENTS.md` / `TOOLS.md`.

**Chat commands** (work across channels): `/status`, `/new`, `/reset`, `/compact`, `/think <level>`, `/verbose on|off`, `/trace on|off`, `/usage off|tokens|full`, `/restart`, `/activation mention|always`.

**Distinctive strengths:**
1. Channel breadth (22+) with a unified control plane.
2. First-class DM pairing — security by default.
3. Optional per-session Docker sandboxing.
4. Companion apps (macOS/iOS/Android) as remote input/output.
5. Persistent sessions across platform boundaries (via `sessions_*` tools).
6. Local-first — the gateway runs on your machine, not in the cloud.

**Distinctive costs (why Zeno should NOT blindly copy):**
- Huge surface area: monorepo with ~600K LOC per community claims ("ClaudeClaw" markets itself as "not 600K LOC complexity").
- Setup involves daemon install, pairing approval, workspace file authoring — not friction-free.
- Gateway-as-daemon implies ops responsibility: daemon restarts, logs rotation, upgrade paths (`openclaw update --channel stable|beta|dev`).
- Companion apps need code signing (macOS) — extra moving parts.

**When it's the right tool:** you want an assistant across many messaging platforms (not just work Slack), you value sandbox-first security, you'll author many custom agents for different contexts.

**When it's overkill:** single-user, single-channel (Slack), single-agent scope — the Zeno MVP case. See `[[lessons-for-zeno-from-openclaw-hermes]]` for what to adopt vs leave behind.
