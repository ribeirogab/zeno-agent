---
tags:
  - learning
  - architecture
related:
  - "[[../specs/0013-dashboard-crud/spec|spec 0013]]"
  - "[[../specs/0014-dashboard-logs/spec|spec 0014]]"
  - "[[../constitution]]"
created: 2026-04-16
---
# DB is the contract between worker and API

The worker (Slack listener + cron runner + agent) and the API (Hono HTTP server for the dashboard) run as separate Node processes in the same container. They never call each other directly — no HTTP, no Unix socket, no shared in-memory state. The **only** coordination channel is SQLite tables. This is written into the constitution and every time something wanted to violate it, the violation wasn't worth it.

## Context

Emerged first as a design constraint in spec 0012 (api read-only against tables the worker writes). Got its first write use case in spec 0013 (`commands` table: API enqueues, worker processes). Got its first fan-in use case in spec 0014 (`logs` table: both processes write, API reads for the dashboard).

## Concrete usages

| Table | Writer | Reader(s) | Purpose |
|---|---|---|---|
| `sessions`, `crons`, `cron_runs` | Worker | Worker + API | Agent state + read-by-dashboard |
| `commands` | API (enqueue) + Worker (claim/finish) | Worker poller, API not needed | API→worker mutation channel |
| `logs` | Worker + API (via pino dbSink) | API (for /api/logs) | Unified observability |

## Why this holds

- **Reversibility.** Today both processes are in one container. Tomorrow the API could move to a sidecar, another container, another host. DB on a mounted volume is the simplest migration path that doesn't need re-architecting.
- **Crash independence.** If the API crashes mid-mutation-processing, the worker doesn't notice; it sees a `pending` command row on its next poll and processes it. No retry logic in the API.
- **Debuggability.** Every interaction is a SQL query. You can replay a state from the tables alone.
- **Port & adapters.** The worker is not a server that the API calls. The worker is an agent that reads events. The "Channel" abstraction in the constitution covers Slack, Discord, Telegram — but the API is a weird channel because it's read-only. `commands` makes it a proper channel.

## How to Apply

- **Any new API→worker mutation gets a row in `commands`** (or a new table with the same lifecycle: pending → processing → success/failed, atomic claim via `UPDATE...RETURNING`, sweep on boot). Don't reach for IPC.
- **Any new observability surface gets a table**, not a side file or in-memory pub/sub. SSE endpoints poll that table at 500ms — indexed queries are cheap.
- **Keep worker-only state in the worker.** Don't push runtime state (e.g., in-flight agent turn) into the DB unless the API needs to read it. If the API wants to know "is worker processing?", it asks via a table that the worker updates as a side effect of processing — not a "worker-please-tell-me" RPC.

## When to reconsider

- **Sub-100ms latency required end-to-end.** DB-as-contract introduces at most a 1s + 500ms = 1.5s pipe (poller + SSE). Dashboard chat with the agent would want faster. That's the one named exception in the spec 0013 brainstorm.
- **Multi-host deployment.** SQLite file-based sharing breaks. Switch to Postgres + LISTEN/NOTIFY, or proper IPC.

Neither applies at Zeno's current scale.
