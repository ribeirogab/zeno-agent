---
status: shipped
feature: dashboard-logs
created: 2026-04-16
shipped: 2026-04-16
related:
  - "[[../../learnings/db-as-contract-pattern]]"
---
# Dashboard Logs — Spec

**Status:** Draft
**Scope:** Phase C of Zeno's web dashboard — the last phase. Adds a Logs page with historical filtering + live-tail. Introduces a new `logs` SQLite table written by a pino transport attached inside both the worker and the api processes. Implements the `Zeno · Logs` artboard from spec 0008 with filter bar, log rows, and expandable JSON payload.

## Context

Phases A (spec 0012) and B (spec 0013) shipped the dashboard foundation + CRUD. The fifth screen from spec 0008 — the Logs page — was deferred to Phase C because it needs infrastructure that the first two phases don't: a way to persist structured log lines for query, and a live-streaming mechanism so the operator can tail logs without polling.

Today logs are pino-formatted JSON emitted to stdout and captured only by `docker compose logs`. That works for `grep` from the CLI, but not for a filtered view in a browser: no time-range query, no event-name filter, no expand-to-inspect-payload. The worker and api already share a SQLite database via the `workspace` volume and already use `@zeno/logger` (a thin factory around pino). Adding a second pino write stream that inserts into a new `logs` table is the smallest change that unlocks everything the Paper artboard promises.

Phase C is the last dashboard spec. When this ships the dashboard is considered feature-complete per spec 0008; any follow-up work (pagination UI, full-text search, log download, edit-profile-via-UI, backend toggle) is tracked in `context/backlog.md` as nice-to-haves, not blockers.

## Problem Statement

Today, debugging Zeno requires a terminal: `pnpm run docker:logs | grep cron_run_failed`, or `sqlite3 /workspace/zeno.db "SELECT * FROM cron_runs ..."`. This is fine for me at a keyboard; embarrassing to show to anyone else; and painful from a phone. The Paper artboard for Logs solves this with four concrete affordances:

1. Filter by level (All / Info / Warn / Error) without re-grepping
2. Filter by event name prefix or correlation id
3. Time range preset (last 1h / 24h / 7d)
4. Expand any row to see the full JSON payload (stack trace, correlationId, raw error)

A "Following" live-tail toggle makes it useful *while something is happening*, not just afterwards. Phase C builds all of that.

## Non-Goals

1. **Full-text search inside message/payload.** Phase C filters on indexed columns only (`level`, `event` prefix, `correlation_id` exact). Content search (`message LIKE %...%` or FTS5) is a backlog item — add when the operator asks for it.
2. **Log export / download as JSONL.** Nice for offline triage; not worth building until asked for.
3. **Alerting on error rate.** Out of dashboard scope.
4. **Custom time range picker.** Phase C has three presets (1h / 24h / 7d). A calendar/datetime picker is a bigger UX problem; postpone.
5. **Multi-select level filter.** "All / Info / Warn / Error" is single-select per the Paper artboard. If the operator ever wants "warn OR error but not info", YAGNI until proven.
6. **Retention policy beyond a single env-tunable number.** Default 7 days, configurable via `LOGS_RETENTION_DAYS`. No per-level / per-event retention tiering.
7. **Remote log ingestion / forwarding.** Zeno runs locally. Logs stay in SQLite + stdout. A spec for cloud-hosted Zeno can revisit this.
8. **Backfilling existing docker logs.** The moment the transport is wired is T=0 for the logs table. Historical pino output from before the transport remains only in `docker logs`.
9. **Paginated `/api/logs` UI beyond cursor-based "load more".** The historical list defaults to 100 most recent with a cursor-id query param. A page number / jump-to-page UI is backlog.
10. **Playwright e2e for the live-tail flow.** Covered by smoke; formal e2e is its own spec.

## Constraints

- **Docker-only execution.** Same as Phases A/B. No new `pnpm dev` scripts.
- **No `any`, no `// biome-ignore`** in new code.
- **DB is the contract between worker and API.** The logs table is the contract for this feature. Both processes write to it (worker and api both generate logs). API is the only reader for the SPA.
- **Zero impact on processes that don't configure a `dbSink`.** `@zeno/logger`'s signature stays backward compatible — current `createLogger({ service })` callers keep working with no changes. The dbSink is optional; tests don't pass it.
- **`@zeno/logger` does not depend on `@zeno/storage`.** Would create a dependency surface we don't want (logger is a leaf package today). Instead, `@zeno/logger` defines a minimal `LogSink` interface; `LogRepo` from `@zeno/storage` satisfies it structurally at the call site.
- **Writes are synchronous.** better-sqlite3 is sync; the transport calls `logRepo.insert(...)` inline inside the pino stream callback. The raw insert cost is ~1-5µs per line. The realistic upper bound on a log write isn't raw insert latency but **writer-lock contention** with other writes to the same DB — SQLite serialises writers, so a running `db.transaction(...)` in the worker (e.g., `commandRepo.claimPending` or a batch-insert elsewhere) briefly blocks the api's log-sink insert. At Zeno's observed log volume (<10 lines/s steady state), this is not a problem; at 1000+ lines/s with long worker transactions, it becomes one. The Risks table documents the mitigation path (in-memory ring buffer + periodic flush) if profiling ever shows saturation.
- **Retention runs in the worker.** One process owns the delete sweep; the api stays read-only for this table. Daily cadence via `setInterval(86_400_000)` starting at boot.
- **SSE over long-lived HTTP, no WebSocket.** Browser `EventSource` is trivial, auto-reconnects with `Last-Event-ID` support, works with Hono out of the box.
- **Single-tenant assumption.** At most one SSE subscriber at a time; the per-request polling loop is acceptable.

## Design

**No backfill.** The `logs` table is populated exclusively by the pino sink going forward from the moment migration 3 runs. No boot-time migration reads or parses historical docker stdout. Pre-existing lines from `docker logs` remain only there.

### New table `logs` (migration 3)

```sql
CREATE TABLE logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts             TEXT NOT NULL,
  level          INTEGER NOT NULL,
  service        TEXT NOT NULL,
  event          TEXT,
  correlation_id TEXT,
  message        TEXT,
  payload        TEXT NOT NULL
);
CREATE INDEX logs_ts_desc_idx ON logs(ts DESC);
CREATE INDEX logs_level_idx ON logs(level);
CREATE INDEX logs_event_idx ON logs(event);
CREATE INDEX logs_correlation_idx ON logs(correlation_id);
```

Field rationale:
- **`id` `INTEGER PRIMARY KEY AUTOINCREMENT`** (not `ROWID` or `INTEGER PRIMARY KEY` alone). Pure rowid is reused after delete; `AUTOINCREMENT` guarantees monotonic strictly-increasing values even after retention sweep. This is load-bearing for the SSE `since=<lastId>` cursor: the server must be able to say "give me rows with id > N" and trust that new rows always have id > all previously emitted ones.
- **`ts`** TEXT ISO 8601. Derived from pino's `time` field (`stdTimeFunctions.isoTime` is already configured in `createLogger`). Using the pino-emitted time (not `CURRENT_TIMESTAMP`) preserves real event order even if a future batch buffer delays a write.
- **`level`** INTEGER pino numeric level (10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal). Cheaper to index than a string.
- **`service`** TEXT — `'worker'` or `'api'`.
- **`event`** and **`correlation_id`** — extracted at transport time from the JSON payload. They're the only two columns indexed beyond level + ts because the artboard shows filtering by them.
- **`message`** TEXT — pino's `msg` field. Not indexed; displayed but not filtered in Phase C.
- **`payload`** TEXT — the full JSON line as emitted by pino, including `level`, `time`, `service`, and every custom key. This is what the UI shows when a row is expanded.

### `LogRepo` in `@zeno/storage`

```typescript
export interface Log {
  id: number;
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface CreateLogInput {
  ts: string;
  level: number;
  service: string;
  event: string | null;
  correlationId: string | null;
  message: string | null;
  payload: string;
}

export interface LogFilter {
  level?: number;          // exact match; undefined means "any"
  q?: string;              // see note below
  since?: string;          // ISO; inclusive
  until?: string;          // ISO; exclusive
  cursorId?: number;       // pagination: return rows with id < cursorId
  sinceId?: number;        // SSE: return rows with id > sinceId
  limit?: number;          // default 100, max 500
}
```

**`q` semantics (precise):** case-insensitive `event` prefix match OR case-sensitive `correlation_id` exact match. SQL predicate:

```sql
(event LIKE ? || '%' COLLATE NOCASE OR correlation_id = ?)
```

Both parameters bind the raw `q` value. `event` matches prefix (not substring) because event names follow `snake_case` conventions the operator types left-to-right (`cron_run` → matches `cron_run_success`, `cron_run_failed`, etc.). `correlation_id` matches exact because it's a UUID — partial matches would be noise.

Methods:
- `insert(input: CreateLogInput): void` — sync
- `list(filter: LogFilter): { logs: Log[]; nextCursorId: number | null }` — used by `GET /api/logs`. Order by `id DESC` (newest first); `nextCursorId` is the smallest `id` in the result if `limit` was reached, else `null`.
- `listSince(filter: LogFilter & { sinceId: number }): Log[]` — used by the SSE poll. Order by `id ASC` so the client sees chronological order as rows arrive. No cursor; caller manages `sinceId`.
- `sweep(olderThanIso: string): number` — `DELETE WHERE ts < ?`. Returns row count for logging the sweep result.

### `@zeno/logger` extension

The factory gains an optional `dbSink`:

```typescript
export interface LogSink {
  insert(input: {
    ts: string;
    level: number;
    service: string;
    event: string | null;
    correlationId: string | null;
    message: string | null;
    payload: string;
  }): void;
}

export interface CreateLoggerOptions {
  service: string;
  dbSink?: LogSink;
}

export function createLogger(options: CreateLoggerOptions): Logger;
```

`LogSink` is declared inside `@zeno/logger`. `LogRepo` from `@zeno/storage` satisfies the shape structurally; at the call site, consumers pass their `LogRepo` instance as `dbSink`. No runtime dep between the packages.

**Known coupling:** the structural satisfaction holds only as long as `LogSink.insert`'s parameter shape and `CreateLogInput` stay in sync. A future addition of a required field to `CreateLogInput` that isn't mirrored in `LogSink` will not produce a compile error at the logger package boundary (since the logger only sees its own `LogSink`). Mitigation: `packages/storage/src/repos/logs.ts` includes a compile-time assertion — e.g. `const _assignable: LogSink = {} as Pick<LogRepo, 'insert'>;` — so a drift breaks the build on the storage side where both types are visible.

Implementation: when `dbSink` is set, `createLogger` builds pino with `pino.multistream([ stdoutStream, sinkStream ])`. The sinkStream is a Writable that:
1. Parses each chunk as JSON (pino writes NDJSON to streams)
2. Extracts `ts = parsed.time`, `level = parsed.level`, `service = parsed.service`, `event = parsed.event ?? null`, `correlationId = parsed.correlationId ?? null`, `message = parsed.msg ?? null`, `payload = chunk.toString()`
3. Calls `dbSink.insert({...})`
4. Swallows any parse/insert error and logs a fallback line to stderr (via `console.error`) rather than blowing up — the sink must never take down the process

When `dbSink` is absent, pino has a single stream (stdout). Identical behavior to today.

### Retention cron (worker)

The worker instantiates a `LogsRetention` helper that:
1. On `start()`: run `logRepo.sweep(now - RETENTION_DAYS)` immediately, then schedule `setInterval(86_400_000)` for daily runs
2. Logs the sweep result (count + threshold) via the same logger. The `WHERE ts < ?` predicate guarantees the sweep's own log line (whose `ts` is `now`) is never eligible for deletion, regardless of ordering between the DELETE and the log-write call.
3. On `stop()`: clear interval

`RETENTION_DAYS` from env `LOGS_RETENTION_DAYS` (default `7`). Validated via the worker config zod schema at boot.

### API endpoints

| Method | Path | Query | Returns | Auth |
|---|---|---|---|---|
| `GET` | `/api/logs` | `level` (enum info\|warn\|error), `q` (string), `since` (iso), `until` (iso), `limit` (1-500, default 100), `cursorId` (int) | `{ logs: Log[]; nextCursorId: number \| null }` | cookie |
| `GET` | `/api/logs/stream` | same as `/api/logs` minus `limit`/`cursorId`, plus optional `sinceId` | SSE stream — heartbeat comment `:ping\n\n` every 30s; each matching log as `data: {json}\n\n` with `id: {numericId}` line for `Last-Event-ID` support | cookie |

**SSE implementation detail.** Per-request Node interval at 500ms. `lastId` **must be captured inside the `streamSSE` callback**, after the connection is open, so that any log row inserted between request arrival and the first poll is still picked up on the very next 500ms tick:

```
async function streamHandler(c) {
  // auth applied via middleware before this
  const filter = parseFilter(c.req.query);
  return streamSSE(c, async (stream) => {
    // Resolve lastId here (not earlier) — closes the race between request
    // parsing and the first poll tick. If client supplied sinceId, honor it.
    let lastId = filter.sinceId ?? (logRepo.list({ limit: 1 }).logs[0]?.id ?? 0);
    let lastHeartbeat = Date.now();
    const interval = setInterval(async () => {
      if (stream.closed) return clearInterval(interval);
      const batch = logRepo.listSince({ ...filter, sinceId: lastId });
      for (const log of batch) {
        await stream.writeSSE({ id: String(log.id), data: JSON.stringify(log) });
        lastId = log.id;
      }
      // heartbeat every ~30s
      if (Date.now() - lastHeartbeat > 30_000) {
        await stream.write(':ping\n\n');
        lastHeartbeat = Date.now();
      }
    }, 500);
    // keep alive until client disconnects
    await new Promise(resolve => stream.onAbort(() => { clearInterval(interval); resolve(undefined); }));
  });
}
```

(Hono's `streamSSE` helper handles the headers/buffering. The exact shape may shift during implementation, but the pattern is fixed: per-connection poll at 500ms with an indexed `sinceId` query.)

### Dashboard route

`apps/dashboard/src/routes/_authed/logs.tsx`. Layout:

```
┌──────────────────────────────────────────────────────────────┐
│ OBSERVABILITY                                                │
│ Logs                        ┌──────────────────────────────┐ │
│ Filter, search, …            │ ●  Following             │ │
│                              └──────────────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│ [All] Info  Warn  Error   [search event: or correlationId:]  Last 1h ▾
├──────────────────────────────────────────────────────────────┤
│ ● 23:42:00.142  INFO   cron_run_success       morning-pr... │
│ ● 23:38:11.043  ERROR  backend_error_raw      Auth failed…  │
│   ├ expanded: { "level": 50, "time": ..., "payload": ...}   │
│ ● ...                                                        │
└──────────────────────────────────────────────────────────────┘
```

State:
- `following: boolean` — toggle; default OFF
- `filters: { level, q, timeRange }`
- `logs: Log[]` — max 500 in memory, oldest-out when following is ON

Following OFF → `useLogs(filters)` (TanStack Query) fetches up to 100 most recent matching rows.
Following ON → `useLogsStream(filters)` opens an `EventSource` to `/api/logs/stream?...`. On message, prepend to the `logs` state array. When filters change, close and reopen the stream with the new query (Phase C simplification; could be smarter later).

Switching toggle back to OFF: close stream, keep the accumulated rows visible until the next filter change or page reload.

### Components

| File | Responsibility |
|---|---|
| `components/logs/LevelChips.tsx` | Segmented control with 4 options; controls `filters.level` |
| `components/logs/LogSearchInput.tsx` | Single text input with placeholder showing the search syntax; controls `filters.q` |
| `components/logs/TimeRangeSelect.tsx` | Native `<select>` with 3 presets; controls `filters.timeRange` (mapped to `since` at query time) |
| `components/logs/FollowingToggle.tsx` | Pill with status dot; controls `following` |
| `components/logs/LogRow.tsx` | Single row; collapsed by default; `onClick` toggles expanded state |
| `components/logs/LogJsonBlock.tsx` | `<pre>` with the row's `payload` pretty-printed |

### Sidebar update

`apps/dashboard/src/components/layout/Sidebar.tsx` — `Logs` nav item becomes `enabled: true`. Phase A/B already included it as disabled.

### File structure

| Action | Path |
|---|---|
| EDIT | `packages/storage/src/types.ts` (add `Log`, `CreateLogInput`, `LogFilter`) |
| EDIT | `packages/storage/src/migrations.ts` (migration 3) |
| NEW | `packages/storage/src/repos/logs.ts` + tests |
| EDIT | `packages/storage/src/index.ts` (re-export) |
| EDIT | `packages/logger/src/index.ts` (dbSink option) |
| NEW | `packages/logger/tests/db-sink.test.ts` |
| NEW | `apps/worker/src/logs/retention.ts` + tests |
| EDIT | `apps/worker/src/config.ts` (add `LOGS_RETENTION_DAYS` to zod schema) |
| EDIT | `apps/worker/src/index.ts` (instantiate `LogRepo`, pass `dbSink`, start/stop retention) |
| EDIT | `apps/api/src/index.ts` (instantiate `LogRepo`, pass `dbSink`) |
| NEW | `apps/api/src/routes/logs.ts` + tests |
| EDIT | `apps/api/src/server.ts` (mount `/api/logs` + `/api/logs/stream`, inject `LogRepo` via `AppDeps`) |
| NEW | `apps/dashboard/src/routes/_authed/logs.tsx` |
| NEW | `apps/dashboard/src/components/logs/*.tsx` (6 components listed above) |
| NEW | `apps/dashboard/src/lib/use-logs.ts` |
| NEW | `apps/dashboard/src/lib/use-logs-stream.ts` |
| EDIT | `apps/dashboard/src/components/layout/Sidebar.tsx` (enable Logs nav) |

## User Stories / Scenarios

1. **Operator investigates a failed cron.**
   - Navigate `/logs`. Default view: 100 most recent lines, all levels.
   - Click the `Error` chip → list filters to error-level lines only.
   - Type `cron_run_failed` into the search box → list further filters to rows with that event prefix.
   - Click the target row → expands below to show the full JSON payload including stack trace.

2. **Operator wants live feedback while triggering a run.**
   - On `/logs`, flip Following toggle ON.
   - In another tab, clicks "Run now" on a cron.
   - Within ~500ms, the `/logs` page shows `command_processing type=cron_run_now`, then `cron_run_start`, then `cron_run_success`.
   - Toggle OFF → stream closes; rows stay visible.

3. **Operator investigates a cross-process correlation.**
   - Finds an error on `/logs` with `correlationId: abc-123`.
   - Types `abc-123` into search → list shows all logs (worker + api) carrying that correlation id.

4. **Retention happens silently.**
   - Worker logs `logs_retention_swept count=N days=7` once per day.
   - `sqlite3 /workspace/zeno.db "SELECT COUNT(*) FROM logs WHERE ts < datetime('now','-7 days')"` returns 0.

## Success Criteria

1. `pnpm run quality-gate` green: new tests for `LogRepo` (insert, list filters, sinceId cursor, sweep), `@zeno/logger` db-sink interception, `LogsRetention` scheduling, `/api/logs` filter combinations, SSE emit loop, logs-route smoke render. All prior tests still pass.
2. `pnpm run docker:build && pnpm run docker:up` succeeds; boot log lines `zeno_online`, `api_listening`, `commands_poller_started`, and `logs_retention_scheduled` are all present.
3. After 10s of uptime, `sqlite3 /workspace/zeno.db "SELECT COUNT(*) FROM logs"` returns ≥ 20 (startup + heartbeat events have accumulated).
4. `curl -sf 'http://localhost:3000/api/logs?level=info&limit=5' -b "zeno_auth=..."` returns 5 rows matching the filter in JSON.
5. Browser at `/logs`: list renders; Following toggle works; level chips filter; search narrows; expanding a row shows JSON.
6. `curl -sf 'http://localhost:3000/api/logs/stream' -b "..."` streams text/event-stream with `data:` lines as new logs arrive.
7. After `docker compose restart zeno-agent`, querying the table returns log lines from *before* the restart (e.g., the last `zeno_online` event before shutdown is visible via `GET /api/logs?q=zeno_online`) — confirms logs persist across restart.
8. Artificially write 10000 log lines; `SELECT id` shows strictly monotonic ids even after a sweep.
9. Visual fidelity to Paper artboard `Zeno · Logs` — palette, typography, sidebar consistency.
10. Zero `any` or `// biome-ignore` in new code.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Write latency blocks the event loop under high log volume, or writer-lock contention between worker and api delays log inserts during long DB transactions | Two distinct failure modes with one mitigation. Raw insert is ~1-5µs; at Zeno's observed steady-state rate (<10 lines/s split across worker + api) this is negligible. Writer-lock contention can briefly stall a log-sink insert while the other process holds a transaction open — acceptable at current scale. If either becomes a problem, add an in-memory ring buffer + periodic batch flush inside `@zeno/logger`; the schema and sink interface accommodate the strategy change without consumer impact. |
| Circular dependency between `@zeno/logger` and `@zeno/storage` | The logger defines a structural `LogSink` interface. `LogRepo` satisfies it by shape only. No import from `@zeno/storage` in `@zeno/logger`. |
| Logger transport parses pino NDJSON twice (once by pino, once by sink) | Acceptable overhead for the write path; the JSON.parse on ~400 byte pino lines costs ~2µs. The alternative — having pino emit pre-parsed objects via a custom formatter — adds more surface than it saves. |
| Pino stream backpressure if the sink throws | The sink's `insert` is sync and never async, so backpressure cannot queue. Any throw inside `insert` is caught by the outer try in the stream `write` method and logged to stderr; the log line is dropped but pino doesn't crash. |
| `logs` table grows unbounded if retention fails silently | Sweep runs at boot too (not only daily). A failed sweep logs `logs_retention_failed err=...` and the scheduler keeps retrying daily. Operator can manually run `sqlite3 /workspace/zeno.db "DELETE FROM logs WHERE ts < datetime('now','-7 days')"` if ever needed. |
| AUTOINCREMENT wastes ids + storage | AUTOINCREMENT uses a separate `sqlite_sequence` table with a single row tracking max id. Additional overhead is 1 update per insert (~1µs) and 1 table row. Worth it for the monotonic SSE cursor. |
| SSE connection leaks if the per-request `setInterval` isn't cleared on disconnect | Hono `streamSSE` exposes `stream.onAbort(cb)`; the cb clears the interval. Tested manually by closing the browser tab and observing no interval leak in the worker process. |
| Multiple SSE subscribers × 500ms polling overload the DB | Single-user assumption; at most one subscriber at a time. If multi-user ever appears, add a single server-side poll loop that fans out to subscribers — trivial refactor. |
| Logger fallback `console.error` on sink failure creates a log that the sink would have captured, causing confusion during debug | Accept the inconsistency: if the sink is broken, you want to know via stderr (visible in `docker logs`), not via the Logs page (which requires the sink to work). |
| Operator accidentally filters by a time range that excludes all recent logs and thinks the system is dead | Time range picker clearly labeled; "Following" toggle is the escape hatch (ignores time filter, just shows new arrivals). Empty state shows "sem resultados nos filtros atuais" rather than a confusing silent empty list. |

## Open Questions

None blocking. Implementation-time decisions (captured in the plan commit):
- Exact Hono SSE helper API (`streamSSE` vs hand-rolled `c.body(new ReadableStream(...))`) — pick whichever handles `onAbort` cleanly.
- Whether `use-logs-stream` uses native `EventSource` or a library. Native is fine; no deps beat adding deps.
- Whether the filter bar on mobile/small viewport collapses to a drawer. Out of scope (desktop-only per spec 0008 non-goals).
