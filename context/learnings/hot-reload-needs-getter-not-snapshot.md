---
tags:
  - learning
  - architecture
  - hot-reload
related:
  - "[[../specs/2026-04-16-profile-hot-reload/spec|spec 0010]]"
  - "[[../specs/2026-04-16-cron-scheduled-tasks/spec|spec 0007]]"
created: 2026-04-16
---
# Long-lived components must read mutable state via a getter, not a captured snapshot

`AgentCore` and `CronRunner` originally took `systemPrompt: string` in their constructor — a snapshot captured at boot. That snapshot was invisible to a later reload of `agent/SOUL.md`: the watcher could update a holder all it wanted, the snapshot in the closure never moved.

Switching the option from `systemPrompt: string` to `getSystemPrompt: () => string` makes the dependency dynamic. Each turn (each cron fire) calls the getter and gets the current value — including any reloads that happened since boot.

## Context

Discovered during spec 0010 (profile hot-reload). The `AgentCore` constructor stored `this.opts.systemPrompt` and used it on every Slack turn. After hot-reload, `promptHolder.value` updated but `this.opts.systemPrompt` still pointed at the boot-time string. Same trap in `CronRunner.execute()`.

## How to Apply

When designing a long-lived component that consumes config that may change at runtime:

- Accept `() => T` instead of `T` in the constructor options.
- Call the getter at the latest possible point — at use, not at construction.
- The caller owns the mutable holder (`{ value: T }` or similar); the consumer just reads.
- This pattern composes cleanly with file-watcher hot-reload, env-driven runtime config, and feature flags.

The cost is one extra function call per use, which is irrelevant compared to the cost of a stale config silently wasting an agent turn.
