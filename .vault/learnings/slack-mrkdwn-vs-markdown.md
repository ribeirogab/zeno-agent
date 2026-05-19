---
tags:
  - learning
  - gotcha
related:
  - "[[slack-bolt-socket-mode]]"
created: 2026-04-21
---
# Slack mrkdwn ≠ GitHub-flavored markdown — convert at the channel adapter

Claude emits standard markdown (`**bold**`, `[text](url)`, `# heading`). Slack's mrkdwn uses different syntax (`*bold*`, `<url|text>`, no headings). Sending raw markdown to Slack renders broken formatting (literal asterisks instead of bold).

## Context

Discovered after the first live test of the acme skill. Zeno's AWS query response had `**11 EC2 rodando**` appearing as literal `**` characters in Slack.

## How It Works

The fix is a `toSlackMrkdwn(text)` function called in the Slack adapter's `send()` method. It converts:
- `**bold**` → `*bold*` (Slack bold)
- `__bold__` → `*bold*` (Slack bold)
- `[text](url)` → `<url|text>` (Slack link)
- `# Heading` → `*Heading*` (bold on its own line — Slack has no heading support)

It preserves:
- Fenced code blocks (``` ... ```) — content inside is not rewritten
- Inline code (`` `code` ``) — protected via placeholder swap
- Single-asterisk italic (`*italic*`) — left alone (becomes Slack bold, acceptable tradeoff)
- Bullet lists, blockquotes — identical in both formats

## How to Apply

Convert at the **channel adapter layer**, not in the prompt or skill. This way every skill/response benefits automatically, and Claude keeps outputting standard markdown (which it's best at). The function lives in `apps/worker/src/channels/slack/format.ts`.

When adding a new channel adapter (Discord, Telegram, etc.), implement its own format converter for that channel's markup syntax.
