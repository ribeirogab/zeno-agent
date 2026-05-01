---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-04-15-slack-zeno-mvp/spec|Zeno MVP spec]]"
  - "[[slack-bolt-socket-mode]]"
  - "[[mcp-github-server-status]]"
created: 2026-04-15
---
# Slack MCP server vs Slack Bolt — when to use which

The official **Slack MCP server** (GA since Feb 2026, at `https://mcp.slack.com/mcp`) exposes Slack operations as tools for LLM agents: search messages, send messages, read threads, manage canvases, etc. It is **pull-only** — the agent calls tools to perform actions. It does NOT provide push/subscribe for incoming events.

**Slack Bolt** is a client library for building Slack apps: it opens the event subscription (HTTP webhook or Socket Mode) and calls handlers on incoming messages. Bolt is the **ingress** layer; MCP is the **action** layer.

## Context

During Zeno discovery, the Slack MCP server looked like a possible simplification — maybe Claude could handle both sides via MCP and we could skip `SlackChannel`. The answer is: no, because MCP doesn't subscribe. You still need Bolt (or an equivalent) to receive mentions/DMs in real time.

Source: [Slack MCP server docs](https://docs.slack.dev/ai/slack-mcp-server/).

## How to Apply

**For Zeno MVP:** use Bolt exclusively. MCP Slack server adds complexity with no benefit in the read-repos flow (Bolt handles both receiving the mention AND posting the reply; no LLM tool call needed for "send message").

**When to consider MCP Slack server:** if Zeno starts doing workflows where the LLM decides ad-hoc to interact with Slack beyond just replying to the user — e.g.,
- "go post a summary of this PR in #eng-daily" (cross-channel posting)
- "search Slack for the last time we discussed migration" (search tool)
- "create a canvas with these notes" (canvas tool)

Those are natural MCP tool calls. You'd register the Slack MCP server in the SDK's `mcpServers` option, keep Bolt for ingress, and let Claude pick whichever path fits.

**Setup caveats (when/if adopting):**
- Only directory-published or internal apps can connect to the MCP server. Unlisted apps are prohibited.
- Workspace admins must approve the MCP client integration.
- Auth: OAuth 2.0 with user-scoped tokens. Scopes depend on the tool (`search:read.public`, `chat:write`, `canvases:write`, etc.).
- Special rate limits for message search and send.

**Recommendation for Zeno roadmap:**
- MVP (current): Bolt only.
- Iteration with GitHub App: still Bolt only — LLM uses `gh` via Bash, so no Slack-side tools needed.
- When Zeno is expected to post/search across the workspace autonomously: register Slack MCP as a tool for the SDK. Keep Bolt for ingress.
