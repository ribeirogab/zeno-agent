---
tags:
  - learning
  - concept
related:
  - "[[openclaw-architecture]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# DM pairing / allowlist as first-class security

OpenClaw treats "who is allowed to talk to this agent" as a mandatory, explicit configuration — not a post-hoc add-on. Default policy is **pairing**: unknown senders get a one-time code; sender must be approved via CLI before the agent responds. This is a pattern worth copying the moment Zeno's workspace stops being solo.

## Context

Studied 2026-04-15. Zeno's current `main` branch explicitly has **no allowlist** because the Slack workspace is personal/solo — documented as a spec Non-Goal and a constitution scope guardrail. OpenClaw's pattern is the template for how to flip that switch when needed.

## How to Apply

**OpenClaw's three modes (`dmPolicy`):**

| Mode | Behavior | Use case |
|---|---|---|
| `pairing` (default) | Unknown sender sees "send `/pair <code>`"; agent ignores messages until `openclaw pairing approve <channel> <code>` is run. | Solo personal assistant that shares a workspace with teammates; only the owner gets responses. |
| `open` + `allowFrom` allowlist | Any sender in the allowlist gets direct access; others are silently ignored. | Small team where you manage the list externally (HR system, OIDC group). |
| `open` + `allowFrom: ["*"]` | Anyone can talk to the agent. Flagged as "not recommended" by `openclaw doctor`. | Public help desks. Rare. |

**Per-channel override:** `dmPolicy` is set per channel (`channels.slack.dmPolicy`, `channels.discord.dmPolicy`, etc.), so your Slack workspace can be `pairing` while an internal Matrix channel is `open`.

**Pairing flow:**
1. Unknown sender DMs the bot.
2. Bot replies with a short pairing code (e.g., `ABC123`): "I don't know you yet — ask the owner to run `openclaw pairing approve slack ABC123` to let us talk."
3. Owner runs the approve command on their machine (CLI tool, not in-band).
4. Future messages from that Slack user ID are accepted.
5. Pairings stored in `~/.openclaw/pairing/`, encrypted.

**Audit / health check:** `openclaw doctor` surfaces risky configs — `dmPolicy: "open"` with wide allowlist, missing pairings, expired tokens.

**Mapping to Zeno (proposed):**

When Zeno's workspace becomes multi-user (or the Slack app is installed somewhere with more than just you):

1. **Add an allowlist** — `ALLOWED_SLACK_USER_IDS` env var or a new mount like `ALLOWED_USERS.md`. Keep it simple: comma-separated Slack user IDs, check on every `message_received`.
2. **Ignore silently** unless user is on the list — `handler_ignored` log event, no Slack reply. Silent because responding "sorry I don't know you" to random probes leaks that a bot is live.
3. **Pairing is overkill initially** — for Operator's work + personal use case, a simple env-var allowlist is enough. Adopt pairing only if you're distributing Zeno to friends or running it in shared channels.

**Conclusion for Zeno now:**
- Current state (no allowlist, workspace is solo) is documented and acceptable.
- The *moment* any condition below is true, implement at least env-var allowlist:
  - Someone else joins the Slack workspace where Zeno lives.
  - Zeno's bot user gets invited to any channel with non-Operator members.
  - Zeno is deployed on a machine anyone else can reach.
- The constitution's "Personal scope" guardrail should state this allowlist-trigger explicitly, so a future-you in a hurry doesn't skip it.

**Existing references in Zeno:**
- `context/specs/0001-slack-zeno-mvp/spec.md` Non-Goal #1 documents this deferral.
- `context/constitution.md` Scope guardrails mention single-user.
- `src/channels/slack/adapter.ts` — no allowlist check; the point to add it is inside `dispatch()` right after `normalizeSlackEvent`.
