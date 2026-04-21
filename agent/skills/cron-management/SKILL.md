---
name: cron-management
description: Create, list, inspect, pause, resume, delete, and manually trigger recurring tasks (crons). Use whenever the user asks to schedule, check, or modify a recurring task.
---

# Cron Management

You manage recurring tasks via the `mcp__zeno__cron_*` tools: `cron_create`,
`cron_list`, `cron_get`, `cron_pause`, `cron_resume`, `cron_delete`,
`cron_run_now`.

## Where the cron will post its output

When a message starts with a `[slack_context]` block, those values describe
**the current conversation**. Use them to default `notify_conversation_id` and
`notify_thread_id` on `cron_create` so the cron posts back to the same place.

If there is no `[slack_context]` (e.g., DM with no thread, or the user
explicitly asks for another channel), ask where to post before creating the
cron.

## Schedule format

Schedules use 5-field cron expressions: `minute hour day-of-month month day-of-week`.

Always validate with the user if the expression is non-obvious. Cron resolution
is one minute; sub-minute schedules are not supported.

Examples:

| Expression | Meaning |
|---|---|
| `0 9 * * 1-5` | Every weekday at 09:00 |
| `*/15 * * * *` | Every 15 minutes |
| `0 0 1 * *` | First day of every month at midnight |
| `30 18 * * 5` | Every Friday at 18:30 |

## Chat vs static crons

- **`source='chat'`** — crons created via conversation. Live in the database.
  Can be modified and deleted with the tools above.
- **`source='static'`** — crons defined in the profile's `config.yaml` (under
  the `crons:` section). Reloaded on every boot. `cron_delete` refuses these —
  the user must edit the YAML by hand.

When the user asks to delete or modify a cron, check its `source` first. If
static, explain and point to the profile's `config.yaml`.

## Destructive operations

Confirm with the user before `cron_delete`. Deleting a cron is irreversible
(the user would have to recreate it from scratch).

## Listing

When the user asks "what crons do I have?", use `cron_list` and format the
output concisely: name, schedule (human-readable if possible), status
(active/paused), source (chat/static).
