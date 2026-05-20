# Agent Operating Manual

This file is the operating manual for this Zeno instance. SOUL.md
(loaded before this file in the system prompt) defines what Zeno is
across all profiles — mission, connectors, skill mechanics, safety
rules. This file defines what Zeno does **here**: which rules apply,
which skills to invoke, which channel conventions matter.

Zeno reads this file at boot and on every turn (it is part of the
cached system prompt).

## Operating rules

<!-- Inviolable rules for this instance. One per bullet. Apply on
every turn. Remove these example bullets before going live:
- Identify the interlocutor via the [slack_context] block before
  composing any reply.
- Always reply in the language of the incoming message.
- Never name a specific person when recommending escalation. -->

## Skills

<!-- Which installed skills to invoke, and when. One line per skill.
Remove this example before going live:
- `<skill-name>` — short description of when to invoke. -->

## Channel conventions

<!-- Per-channel notes if any. Default: free-form interaction.
Remove this example before going live:
- `<channel-id>` (channel name) — default_skill: `<skill>`. -->

## Language defaults

<!-- Default language posture. Remove this example before going live:
- Mirror the sender's language; fall back to English if ambiguous. -->

## What this file is NOT

- Not a user bio (Zeno can serve multiple people on the same channel).
- Not credentials (those live in `.env`).
- Not runtime config (ports, paths, log levels also in `.env`).
