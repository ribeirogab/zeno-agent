---
tags:
  - learning
  - reference
related:
  - "[[../specs/0001-slack-zeno-mvp/spec|Zeno MVP spec]]"
  - "[[slack-mcp-vs-bolt]]"
created: 2026-04-15
---
# Slack Bolt for JavaScript — Socket Mode

**Current version:** `@slack/bolt@4.7.0` (published 2026-04-09). Requires Node 18+. Socket Mode is built-in since Bolt 3.x; the v4 instantiation pattern is essentially unchanged from v3 for basic use cases.

## Context

Source: [@slack/bolt on npm](https://www.npmjs.com/package/@slack/bolt) and [Bolt JS Socket Mode docs](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/). Zeno uses Socket Mode to avoid exposing a public URL — the bot opens an outbound WebSocket and receives events through it.

## How to Apply

**Install:**
```bash
npm install @slack/bolt
```

**Env vars:** two tokens are required.
- `SLACK_BOT_TOKEN` — `xoxb-…` (Bot User OAuth Token, from the app's OAuth & Permissions page)
- `SLACK_APP_TOKEN` — `xapp-…` (App-Level Token with `connections:write` scope, from Basic Information)

**Required Slack app scopes** for the Zeno MVP:
- `app_mentions:read` — receive `@zeno-agent` mentions
- `chat:write` — post replies
- `im:history`, `im:read` — receive direct messages
- `reactions:write` — add/remove `:eyes:` / `:white_check_mark:`
- `users:read` — resolve user info for logging
- (App-Level token) `connections:write` — open the Socket Mode connection

**Minimal instantiation (TypeScript, ESM):**

```ts
import { App, LogLevel } from "@slack/bolt"

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
  logLevel: LogLevel.WARN,
})

// app_mention in channels
app.event("app_mention", async ({ event, client }) => {
  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts ?? event.ts,
    text: "ping",
  })
})

// DMs — filter by channel_type
app.message(async ({ message, client }) => {
  if (message.channel_type !== "im") return
  if ("bot_id" in message && message.bot_id) return  // ignore bot loops
  await client.chat.postMessage({
    channel: message.channel,
    text: "ping",
  })
})

await app.start()
```

**Threading rules (Slack-native UX):**
- Root mention → reply with `thread_ts = event.ts` (starts a new thread).
- Mention inside an existing thread → reply with `thread_ts = event.thread_ts`.
- DM → do not set `thread_ts`.

**Gotchas:**
- The `message` event fires for ALL messages the bot can see (including its own). Filter `bot_id`/`subtype` to avoid loops.
- `app.message(...)` matches every message; pair with `channel_type === "im"` to scope to DMs only (mentions are handled by `app_mention`).
- Slack enforces a 3-second ack window for events. Bolt ack's automatically before your handler runs, but any slow work (like calling Claude) must happen after ack — which is the default for `event()` handlers.

**v3 → v4 notes:** Most code compatible. Check [Bolt JS releases](https://github.com/slackapi/bolt-js/releases) for specific breaking changes if upgrading existing code.
