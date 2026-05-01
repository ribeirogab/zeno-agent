---
feature: dashboard-logs
spec: "[[spec-dashboard-logs]]"
created: 2026-04-16
---
# Dashboard Logs — Plan

**For this spec:** `[[spec-dashboard-logs]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended — multi-workspace coordination across storage + logger + worker + api + dashboard). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the final dashboard phase — a Logs page with historical filtering + live-tail via SSE, backed by a new `logs` SQLite table written from inside pino via a `dbSink` transport.

**Architecture:** `@zeno/logger` gains an optional `dbSink` that intercepts each pino NDJSON line and writes an extracted row to `logs` in SQLite, without introducing a runtime dep on `@zeno/storage`. The worker owns a daily retention sweep. The api exposes two endpoints: `GET /api/logs` (list with indexed filters + cursor pagination) and `GET /api/logs/stream` (per-request 500ms polling over an indexed `id > sinceId` query). The dashboard renders filter bar + expandable rows + a Following toggle that swaps between TanStack Query and an `EventSource`.

**Tech Stack:** No new deps. Reuses pino multistream, better-sqlite3, Hono SSE, TanStack Query, native `EventSource`. Node 24 + TS strict + Vite + React 19 + Tailwind v4.

## Approach

Seven phases, each ends with a green quality gate. TDD for every non-UI unit.

1. **Storage** — migration 3 + `LogRepo` + compile-time structural assertion
2. **Logger** — `dbSink` option via pino multistream, `LogSink` interface
3. **Worker retention + wiring** — `LogsRetention` helper, wire `dbSink`, boot/shutdown integration
4. **API `/api/logs`** — list endpoint with filters + cursor
5. **API `/api/logs/stream`** — SSE with per-request 500ms poll
6. **Dashboard infra** — hooks, sidebar activation, shared filter types
7. **Dashboard page** — `/logs` route + 6 components + page wiring

Subagent-driven execution: ~15 tasks, each self-contained.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `packages/storage/src/repos/logs.ts` | `LogRepo` — insert (sync), list (cursor), listSince (sinceId), sweep (delete old); compile-time `LogSink` assertion |
| `packages/storage/tests/logs.test.ts` | CRUD + filter combinations + sweep count |
| `packages/logger/tests/db-sink.test.ts` | Sink interception, field extraction, failure path |
| `apps/worker/src/logs/retention.ts` | `LogsRetention` — start/stop + sweep cron |
| `apps/worker/tests/logs/retention.test.ts` | Sweep-at-start + interval scheduling |
| `apps/api/src/routes/logs.ts` | `GET /api/logs` + `GET /api/logs/stream` |
| `apps/api/tests/routes/logs.test.ts` | List filters + SSE emit path |
| `apps/dashboard/src/lib/use-logs.ts` | Historical list hook (TanStack Query) |
| `apps/dashboard/src/lib/use-logs-stream.ts` | SSE hook (native `EventSource`) |
| `apps/dashboard/src/lib/log-filters.ts` | Shared types + preset→ISO conversion |
| `apps/dashboard/src/routes/_authed/logs.tsx` | Page component |
| `apps/dashboard/src/components/logs/LevelChips.tsx` | Level filter |
| `apps/dashboard/src/components/logs/LogSearchInput.tsx` | Text input for `q` |
| `apps/dashboard/src/components/logs/TimeRangeSelect.tsx` | Preset dropdown |
| `apps/dashboard/src/components/logs/FollowingToggle.tsx` | Pill toggle |
| `apps/dashboard/src/components/logs/LogRow.tsx` | Row with expand |
| `apps/dashboard/src/components/logs/LogJsonBlock.tsx` | `<pre>` payload |

### EDIT

| File | Change |
|---|---|
| `packages/storage/src/types.ts` | Add `Log`, `CreateLogInput`, `LogFilter`, `LogLevel` |
| `packages/storage/src/migrations.ts` | Migration 3 — `logs` table + 4 indexes |
| `packages/storage/src/index.ts` | Re-export `LogRepo` + types |
| `packages/logger/src/index.ts` | Accept `dbSink?: LogSink`; build pino multistream when set |
| `apps/worker/src/config.ts` | Add `LOGS_RETENTION_DAYS` to zod (default 7) |
| `apps/worker/src/index.ts` | Instantiate `LogRepo`, pass as `dbSink`, start/stop retention |
| `apps/api/src/config.ts` | No change needed (api doesn't run retention) |
| `apps/api/src/index.ts` | Instantiate `LogRepo`, pass as `dbSink` |
| `apps/api/src/server.ts` | Add `logRepo: LogRepo` to `AppDeps`, mount `/api/logs` |
| `apps/dashboard/src/components/layout/Sidebar.tsx` | Set `Logs` item `enabled: true` |

## Phase Ordering

Top-down: storage → logger → worker → api → dashboard. Each phase leaves the system in a working state; the dashboard depends on the api, which depends on the logger-with-sink + the table, which depends on the storage layer.

## Risks / Open Decisions

All decided during implementation; capture in commit messages.

- **Hono SSE helper variant.** Try `streamSSE` from `hono/streaming` first. If `onAbort` or heartbeat handling is awkward, fall back to `return c.body(new ReadableStream({ start, cancel }))` and hand-write the framing. The SSE polling logic is the contract; how Hono wraps it is secondary.
- **EventSource auto-reconnect.** Native `EventSource` reconnects with an implementation-defined delay (~3s in Chromium). Accept it; the `id:` line in each SSE event enables `Last-Event-ID` so the server resumes cleanly.
- **In-memory log buffer in the dashboard.** Following mode keeps last 500 rows to avoid unbounded growth. When the toggle flips OFF, the rows stay visible until next filter change or reload.
- **Level filter encoding.** API accepts `level=info|warn|error` (strings). The `LogRepo` translates to pino numeric (30/40/50). "All" = absent query param.
- **Test mock strategy for SSE.** Hono test client supports `app.request()` which returns a `Response` with a readable body. Read the first few events + assert structure + close. Full integration with real `setInterval` timing is not worth faking in unit tests; covered by the Phase 10 smoke.
