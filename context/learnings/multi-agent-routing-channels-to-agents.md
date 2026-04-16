---
tags:
  - learning
  - concept
related:
  - "[[openclaw-architecture]]"
  - "[[gateway-daemon-vs-single-process]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# Multi-agent routing — channels → agents mapping

OpenClaw's model for running more than one agent persona from the same gateway: configure a **routing table** that maps inbound sources (channels, senders, accounts) to named agents. Each agent has its own workspace, session store, tool allowlist, and model. Cross-agent messaging is an explicit tool (`sessions_send`), not implicit shared state.

## Context

Studied 2026-04-15. Zeno's MVP is explicitly single-agent (single persona, single workspace). This note captures the OpenClaw pattern in case Zeno later wants distinct personas for distinct contexts (e.g., work-facing vs personal-facing).

## How to Apply

**The concept:**

Instead of "one Zeno that knows everything", you have:
- `work-agent` — persona for work Slack channels, sees only work GitHub orgs
- `personal-agent` — persona for DMs, sees personal GitHub + Notion
- `ops-agent` — triggered by cron + monitoring alerts, has restricted tools

Routing is configuration, not code:
```jsonc
// ~/.openclaw/openclaw.json
{
  "agents": {
    "defaults": { "workspace": "~/.openclaw/workspace", "model": "…" },
    "work": {
      "workspace": "~/.openclaw/agents/work",
      "model": "anthropic/claude-opus-4.6",
      "tools": ["bash", "read", "edit", "slack.*", "sessions_*"]
    },
    "personal": {
      "workspace": "~/.openclaw/agents/personal",
      "model": "anthropic/claude-sonnet-4.6"
    }
  },
  "channels": {
    "slack": {
      "routes": [
        { "match": { "channel": "C-work-eng" }, "agent": "work" },
        { "match": { "userDM": true },          "agent": "personal" }
      ]
    }
  }
}
```

**Implications:**
- Each agent has its **own** workspace: different `SOUL.md`, different `USER.md` (or a shared one), different skills.
- Each agent has **isolated** session history — `work-agent` can't accidentally reference personal DMs.
- Cross-agent escalation via `sessions_send` tool: `work-agent` can message `personal-agent`'s session if needed (rare).

**Mapping to Zeno's actual use case (Operator's description):**

Operator said:
- Work projects at `acme` org + personal repos at `octocat`.
- Same Zeno, same Slack, operating on both.
- Future: Linear integration for tasks.

**Two paths:**

**(A) Single agent, tool-level scoping (RECOMMENDED to start):**
One Zeno persona, but it's aware of *context*. The user message itself establishes scope ("no repo X", "na org Y"). No routing table, no multiple agents — just Claude being smart about which PAT/scope to use per request. PAT already has access to both orgs (assuming SSO authorization).
- Pros: zero config overhead, Zeno stays trivially simple, works today.
- Cons: no hard wall between work and personal — a mistake could post a work PR link in a personal channel. Relies on Claude's judgment.

**(B) Two agents, routed by channel (FUTURE if needed):**
- `work-agent` is mentioned in work Slack channels; has access only to `acme` org PAT, work Linear workspace.
- `personal-agent` is in personal workspace / DMs; has `octocat` PAT, personal Linear.
- Isolated credentials → harder to cross-contaminate.
- Pros: real boundary; can revoke work access without touching personal.
- Cons: real config ceremony; requires multi-workspace Slack install or cross-workspace mapping.

**Triggers to move from (A) to (B):**
- Mistaken cross-posts become a real issue (you post a work URL to personal and someone notices).
- Credentials diverge (work-specific GitHub App, work-only Linear workspace).
- You want different personality / tone in work vs personal contexts (formal vs loose PT-BR).
- Compliance requires separation-of-duties at the bot level.

**What to NOT copy from OpenClaw:**
- Don't implement `sessions_send`-style cross-agent messaging unless you actually have a use case. It's cute but a state-leak risk.
- Don't route by sender identity alone (too easy to spoof in some channels). Route by the *channel* where the message lands, since channel membership is admin-controlled.

**For Zeno's implementation path, when (B) becomes real:**

The existing `Channel` port stays. Add a new level of abstraction:

```ts
interface AgentInstance {
  name: string;              // "work", "personal"
  persona: string;           // system prompt / SOUL.md
  backend: AgentBackend;     // distinct token, distinct tool allowlist
  userMdPath: string;
}

interface Router {
  pick(msg: IncomingMessage): AgentInstance;
}
```

`index.ts` boots N `AgentInstance`s instead of one `AgentCore`, and routes each incoming message through the `Router` before dispatching to the chosen instance's backend. Channel adapter is unchanged.

**TL;DR for Zeno now:** stay single-agent. Add a note to the spec when path-(B) triggers become relevant.
