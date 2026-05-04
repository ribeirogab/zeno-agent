---
created: 2026-04-26
updated: 2026-04-29
tags: [architecture, ports-and-adapters]
related:
  - "[[../specs/2026-04-26-connectors-backend/spec-connectors-backend|2026-04-26-connectors-backend]]"
  - "[[../specs/2026-04-25-connectors-ui/spec-connectors-ui|2026-04-25-connectors-ui]]"
  - "[[../specs/2026-04-29-slack-channel/spec-slack-channel|2026-04-29-slack-channel]]"
  - "[[channel-as-connector-cutover|cutover playbook]]"
  - "[[../constitution|constitution]]"
---

> **2026-04-29 update:** spec 0058 unified Slack into the `connectors` table with `kind='channel'`. The "Slack tokens vivem em `.env`" sections below are HISTORICAL — Slack tokens now live in DB `connector_secrets` like every other integration. The Channel/Connector conceptual distinction (transport-the-agent-runs-inside vs tool-the-agent-calls) still holds; only the storage divergence is gone. See [[channel-as-connector-cutover|cutover playbook]] for the migration narrative + observations.

# Channel vs Connector — two external integrations, two roles

## The shape

Every external Zeno integration falls into **one of two categories** (or both, like Slack):

### Channel — input/output adapter

How the operator talks to Zeno and how Zeno responds. Implements the `Channel` interface in `apps/worker/src/channels/<name>/adapter.ts`. Responsibilities:

- Receive messages (mentions, DMs) and hand them to `AgentCore`
- Post replies
- React to / update messages
- Request approvals (via reactions, in worker modes)

**Slack** is the only Channel today. Telegram, WhatsApp, email, Discord — all become new Channels in the future without changing the core (constitution §Architecture: "Channels and backends are plugs").

Tokens live in `profile/<name>/.env`. Boot configuration, not runtime.

### Connector — MCP server callable as a tool

External capability that the **agent** calls at runtime. Implements the MCP protocol (stdio or HTTP/SSE). Responsibilities:

- Expose tools (`tools/list`)
- Execute tool calls (`tools/call`)

Connectors are managed by the dashboard starting from spec 0034 — DB-first, hot-reload without restart, with 3-state permissions per tool. Tokens live in the `connector_secrets` table. Runtime configuration, mutable.

## When a platform is both

**Slack is the paradigmatic case**: same bot, same workspace, but two distinct roles.

| Aspect | Slack as Channel | Slack as Connector |
|---|---|---|
| Who triggers | operator (mentions @zeno) | agent (decides to call tool) |
| Direction | receives + responds | calls tool, gets response |
| Tokens | `.env` (boot) | `connector_secrets` (DB, managed by the UI) |
| Reload | worker restart | next agent turn |
| Can exist without the other? | yes (Channel without Connector = bot that listens but has no tool surface) | yes (Connector without Channel = agent posts in another workspace that listens to nothing) |

Other potential examples (future):

- **Telegram**: almost certainly becomes a Channel (input). A Telegram Connector only if the agent needs to call things in conversations other than replying in the thread.
- **GitHub**: Channel makes no sense (Zeno isn't a GitHub bot). But Connector yes — Linear/PRs/issues are tool surface.
- **Email**: can become a Channel (replies to DMs by email), can become a Connector (agent sends email to third parties).

## Principle

> **Every external Zeno integration fits into Channel, Connector, or both. Think first about which role the integration occupies before implementing.**

Channel = operator's input ↔ output. Connector = agent's tool surface. Confusing the two leads to weird APIs (e.g., trying to post a message as a tool when the Channel already has `reply()`).

## What this changes in practice

- **Adding a new chat platform** (Telegram, etc.): start with the Channel. Connector comes if there's a concrete reason.
- **Adding a productivity SaaS** (Linear, Notion, Granola): Connector only. There's no user input there.
- **Slack-shaped** platforms (Discord eventually): probably will be both.

## Future direction — unification (operator decision, 2026-04-26)

The operator wants to **merge Channel and Connector** into a single concept. The idea: every external integration is a Connector; some Connectors have an extra "category" that says whether they also accept user input (like `channel`). This allows managing Slack, Telegram, WhatsApp, email — all through the same dashboard, with the same install/secrets/tools UX.

Why it hasn't been done yet:
- The `Channel` interface today is richer than MCP (post message, react, update message, wait for reaction as approval). Mapping that to MCP tools is feasible but not trivial — some of those operations need to happen outside an agent turn (e.g., approval during an in-progress turn).
- The input loop (Slack Socket Mode → AgentCore) has a series of hooks (slack_context preamble, correlation id, thread state) that are hardcoded to the Channel today.
- Slack tokens today carry two roles: app-level (Socket Mode WebSocket) and bot (REST API). Connector only needs the bot. The dashboard would have to accept both.

When to pull this:
- Proposed spec: `00XX-channels-as-connectors`. Adds a `category: 'channel' | 'tool'` (or `is_channel: bool`) column to the `connectors` table. UI gains a "Channels" vs "Tools" filter/grouping.
- Bonus: each Channel-connector also gains the tools of the corresponding MCP server (Slack post_message etc.) without being configured twice.
- Prerequisite: extract the `Channel` interface into a shape that can be instantiated from a connector row + secrets.

Leaving in this note: the operator said "doesn't need to be done now, just leave it noted somewhere so we can pull it right after."

## References

- Constitution §Why Zeno exists and §Architecture principles.
- Spec 0032 §Database — `connectors` table is only for the Connector side; Channel does not live in DB.
- `apps/worker/src/channels/` (Channel adapters) vs `packages/mcp-discover/` (Connector helpers).
