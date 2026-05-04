---
status: shipped
feature: cron-scheduled-tasks
created: 2026-04-16
shipped: 2026-04-16
---
# Cron / Scheduled Tasks — Spec

**Status:** Draft
**Scope:** Recurring scheduled tasks for Zeno. Two flavors: **static** (declared in `profile/crons.yaml`, replaced on every boot) and **dynamic** (created via Slack chat through agent tools, persisted in DB). A runner inside the Zeno process wakes every 60s, executes due crons via the agent backend, posts results to a configured Slack destination, records history.

## Context

The user wants Zeno to act on a schedule: "@zeno todo dia às 9h me manda um resumo dos PRs abertos". This is a foundational capability for an always-on agent. OpenClaw and Hermes both ship cron-style scheduling; following that pattern.

DB foundation (spec 0005) already provides `crons` + `cron_runs` tables and repos. This spec wires runner + tools + static loader on top.

## Problem Statement

Zeno today only acts when explicitly mentioned. To unlock proactive behavior — daily summaries, hourly health checks, weekly reports — we need scheduling. Two natural authoring paths must work:
1. **Static** (file-based): I commit a YAML to `profile/` for crons that belong to my repo.
2. **Dynamic** (chat-based): I tell Zeno in Slack "every Monday at 9am do X". Zeno persists it.

## Non-Goals

1. **Distributed scheduling.** Single Zeno process; one runner. No leader election.
2. **Sub-minute granularity.** Cron expressions are minute-resolution. The runner ticks every 60s.
3. **Approval flow for cron-created actions.** When a cron runs, it executes the agent without human gating. Safety relies on the regular agent prompt + tools allowlist + workspace sandbox.
4. **Backfill missed runs.** If Zeno was offline at the scheduled time, that run is skipped (logged as `skipped`). No replay.
5. **Per-cron Slack channel auth.** All crons post via the bot's existing Slack token. No OAuth flow per cron.
6. **Timezone configuration in YAML.** Cron expressions evaluate in the container's TZ (default UTC unless overridden). Document this — user can set `TZ=America/Sao_Paulo` in `.env` if desired.

## Constraints

- **Same Node process.** No separate worker. Runner is a `setInterval` inside the main `index.ts`.
- **No external job queue.** The DB IS the queue (`crons.next_run_at`).
- **Replace-on-boot for static.** `profile/crons.yaml` is the source of truth for `source='static'` crons. On every boot, all static crons are dropped and re-inserted from YAML. Chat-source crons are untouched.
- **Default destination.** If a cron's `notify_conversation_id` is null, the runner logs the run output but does NOT post to Slack (with a warning log). Optional env fallback `ZENO_CRON_DEFAULT_CHANNEL` — if set, it's used.
- **Slack context injection.** When AgentCore builds an `AgentInput` from a Slack message, it prepends a small context preamble to the user message (current conversation_id, thread_id, user_id, ISO time). This is in the user message (not system prompt), so prompt cache stays valid. The agent reads this when calling cron tools to default `notify_to`.
- **In-process MCP server.** Cron CRUD tools (`cron_create`, `cron_list`, `cron_get`, `cron_pause`, `cron_resume`, `cron_delete`, `cron_run_now`) are registered as an in-process MCP server using the SDK's `createSdkMcpServer()` and `tool()` helpers. Passed to ClaudeCodeBackend alongside the file-config MCP servers.

## Design

### YAML format (`profile/crons.yaml`)

```yaml
# All entries here are reset on every boot. Crons created via Slack chat are not touched.
crons:
  - name: morning-pr-summary
    description: Resumo de PRs abertos toda manhã às 9h da semana
    schedule: "0 9 * * 1-5"          # cron expression (5-field)
    prompt: |
      Liste todos os PRs abertos em octocat/* e acme/*.
      Pra cada um, diga título, autor, idade, status de CI.
      Formato: bullets concisos, em PT-BR.
    notify:
      conversation_id: C12345        # required if you want Slack posting
      thread_id: null                # optional — null means top-level message
```

If `crons:` is empty or the file is missing, no static crons. Existing chat-source crons in the DB are preserved.

### Runner architecture

```
┌──────────────────────────────────────────┐
│  CronRunner (in main process)            │
│                                          │
│  setInterval(60_000) → tick()            │
│    1. due = repo.due(now)                │
│    2. for each cron in due:              │
│       a. run = cronRuns.start(cron.id)   │
│       b. output = backend.query(prompt)  │
│       c. send to Slack target (if any)   │
│       d. cronRuns.finish(run.id, ...)    │
│       e. next = parseCron(schedule)      │
│       f. crons.markRun(id, now, next)    │
└──────────────────────────────────────────┘
```

Concurrency: a single tick processes due crons sequentially (synchronous loop with awaits). If a cron's execution exceeds 60s, the next tick may overlap — the runner uses an `inFlight` Set keyed by cron id to skip already-running ones.

### Agent tools (in-process MCP server)

Register a "zeno" MCP server with these tools:

| Tool | Args | Purpose |
|---|---|---|
| `cron_create` | `name`, `description?`, `prompt`, `schedule`, `notify_conversation_id?`, `notify_thread_id?` | Create a chat-source cron |
| `cron_list` | `enabled?`, `source?` | List crons with filter |
| `cron_get` | `id` | Get cron + recent runs |
| `cron_pause` | `id` | Set enabled=false |
| `cron_resume` | `id` | Set enabled=true |
| `cron_delete` | `id` | Delete (only chat-source — refuse static) |
| `cron_run_now` | `id` | Execute immediately, update last_run_at |

All tools return JSON-as-text content following MCP convention.

### Slack context preamble

In `AgentCore.bind`, before calling backend, the user message is wrapped:

```
[slack_context]
conversation_id: C12345
thread_id: 1710000000.000100
user_id: U0EXAMPLE000
current_time: 2026-04-16T01:30:00Z
[/slack_context]

a cada hora me manda oi
```

This is concatenation in `userMessage`, NOT in `systemPrompt`. Cache safe.

### SOUL.md addendum

A short section instructs the agent: "When creating crons via `cron_create` and the user is in a Slack thread, default `notify_conversation_id` and `notify_thread_id` to the values from `[slack_context]`. Otherwise ask where to post."

### Files changed

| File | Change |
|---|---|
| `src/cron/parser.ts` | Wraps cron-parser; computes next run from a cron expression |
| `src/cron/static-loader.ts` | Reads profile/crons.yaml, validates with zod, returns CreateCronInput[] |
| `src/cron/runner.ts` | CronRunner class — setInterval, tick, execute |
| `src/cron/tools.ts` | createSdkMcpServer with 7 cron CRUD tools |
| `profile/crons.yaml` | New — empty `crons: []` template |
| `src/agent/backends/claude-code.ts` | Accept extra in-process MCP server alongside config-driven ones |
| `src/agent/core.ts` | Prepend slack_context preamble to user message |
| `src/index.ts` | Load static crons → replaceStaticSet, start CronRunner, register tools |
| `profile/SOUL.md` | Add cron tools usage note |
| `package.json` | Add `cron-parser` + `yaml` deps |
| `tests/cron/parser.test.ts` | New |
| `tests/cron/static-loader.test.ts` | New |
| `tests/cron/runner.test.ts` | New |

## Success Criteria

1. Boot logs: `cron_static_loaded count=N`, `cron_runner_started`.
2. Empty `profile/crons.yaml` (`crons: []`) loads cleanly with `count=0`.
3. From Slack: `@zeno cria um cron que toda hora me manda 'oi' aqui` → agent calls `cron_create` with current conversation, persists in DB, replies with cron id.
4. The runner picks up the new cron at the next minute boundary, executes it, posts "oi" reply to the same conversation.
5. From Slack: `@zeno lista os crons ativos` → agent calls `cron_list`, replies with table.
6. `@zeno deleta o cron X` → agent calls `cron_delete`. Confirms with user before destructive action.
7. Static crons defined in `profile/crons.yaml` survive restart (because they're re-loaded on boot from YAML).
8. Chat-source crons survive restart (because they're persisted in DB and never wiped).
9. Quality gate passes (biome + typecheck + knip + vitest).

## Risks

| Risk | Mitigation |
|---|---|
| Cron tick overlap if a run exceeds 60s | `inFlight` Set keyed by cron id; skip due crons already running |
| Slack rate limit on cron posts | Rare at 1-minute granularity; Bolt handles retries internally |
| Agent posts secrets in cron output | Same risk as any agent turn; SOUL.md already prohibits echoing tokens |
| YAML schema drift breaks parsing | Zod schema with clear errors; bad entries logged + skipped, others continue |
| Cron created in chat with bad schedule expression | Tool validates via cron-parser before insert; returns helpful error to agent |
| Container restart drops in-flight runs | The CronRun row stays in `running` state with no `finished_at` — visible in dashboard later. Not great but acceptable for v1; future spec could add stale-run cleanup on boot |

## Open Questions

None blocking. Decisions documented in this spec.
