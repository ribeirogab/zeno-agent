---
tags:
  - learning
  - concept
related:
  - "[[openclaw-architecture]]"
  - "[[hermes-architecture]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# Gateway daemon vs single-process: when each wins

Both OpenClaw and Hermes converged on a **gateway daemon** as the long-running service that multiplexes multiple messaging channels + multiple agent sessions + tool dispatch. Zeno today is a **single-process Node app** that handles one channel. This note documents the tradeoff: when the gateway pattern becomes worth its cost, and when staying single-process is the right call.

## Context

Captured during 2026-04-15 competitive analysis. The gateway pattern is the most architecturally invasive difference between Zeno and its inspirations — and probably the #1 thing a casual observer would say "Zeno is missing."

## How to Apply

**Gateway daemon pattern** (OpenClaw, Hermes):
```
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Slack        │  │  Telegram     │  │  Discord      │   channels
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
                  ┌─────────────────┐
                  │  Gateway daemon │   long-running, installed as
                  │                 │   launchd/systemd user service
                  └────────┬────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
      session A        session B         session C
    (agent+tools)    (agent+tools)     (agent+tools)
```

- **Pros:**
  - One process to install, monitor, upgrade across *n* channels.
  - Shared session store — same user's DMs in Slack and Telegram can converge.
  - Cross-session tools (`sessions_send`, `sessions_spawn`) work because everything's in one address space.
  - Platform adapter code is isolated (`extensions/slack/`, `platforms/telegram.py`); adding a channel doesn't touch the core.
  - Central scheduler / cron lives once.

- **Cons:**
  - Real ops: daemon restart hooks, graceful reload, logs rotation, crash recovery, upgrade path (OpenClaw's `openclaw update --channel stable|beta|dev`).
  - Single point of failure for all channels.
  - State recovery complexity grows with session count.
  - Upgrade dance is nontrivial: Hermes has a `_config_version` in `config.yaml`, bumped to trigger migrations — 5 versions so far.
  - Security blast radius: one agent's compromise can leak cross-session state unless per-session sandbox is enforced.

**Single-process pattern** (Zeno today):
```
┌───────────────┐
│  Slack        │
└───────┬───────┘
        │
        ▼
  ┌──────────────────────────┐
  │  Zeno (one Node process) │
  │  Bolt Socket Mode +      │
  │  ClaudeCodeBackend       │
  └──────────────────────────┘
```

- **Pros:**
  - No daemon management: `docker compose up` is the full deploy story.
  - Clear scope: one user, one channel, one LLM invocation per request.
  - No upgrade migrations: restart the container, done.
  - Easy to reason about — the whole program fits in your head.

- **Cons:**
  - Adding channels = new process *or* stuffing more into the same one.
  - No native cross-channel memory without a separate persistence layer.
  - Scheduled tasks / cron would need to be added deliberately (not free).

**The tipping point — when gateway pays off:**

Gateway overhead starts paying when **any two** are true:
- 3+ channels running simultaneously.
- Cross-channel state matters (user talks in Slack + Telegram; you want one agent memory).
- You need scheduled / proactive actions (`@zeno remind me at 9am`).
- You want multi-agent routing (personal DMs vs work channels go to different agents).
- You're past single-user.

**Zeno today:** solo user, one channel, no cross-channel needs, no proactive scheduling, no multi-agent. **Single-process wins.**

**If Zeno adds a second channel (e.g., Telegram)** — first reaction should be: can we add a `TelegramChannel` implementing the existing `Channel` port, running in the same process? Yes, for two or three channels. Only move to a separate gateway daemon pattern when the single process becomes a bottleneck (tens of channels, or you want platform adapters to be separately deployable).

**If Zeno adds cross-channel memory** — that's a persistence decision (shared SQLite, etc.), NOT a daemon decision. Solve that independently.

**If Zeno adds scheduled actions** — add a cron module in the same process. Only externalize to a daemon when you want cron to survive the main process crashing.

**Anti-pattern to avoid:** copying OpenClaw's gateway structure just because "big agents have gateways." The gateway is a response to specific product goals (multi-platform, multi-agent, cross-session memory). Without those goals, it's pure overhead.
