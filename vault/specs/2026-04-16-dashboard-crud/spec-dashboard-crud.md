---
status: shipped
feature: dashboard-crud
created: 2026-04-16
shipped: 2026-04-16
---
# Dashboard CRUD — Spec

**Status:** Draft
**Scope:** Phase B of Zeno's web dashboard. Adds the Crons, Sessions, and Settings pages on top of the foundation shipped in spec 0012. Introduces a `commands` table + worker poller as the coordination channel for all API→worker mutations. Implements the five Paper artboards for those screens (Crons list, Cron detail, Sessions list, Session detail, Settings). Logs + SSE streaming remain deferred to Phase C (spec 0014).

## Context

Spec 0012 shipped the dashboard foundation — monorepo restructure, Hono API with HMAC cookie auth, Vite + React SPA with Home + Login. The sidebar already renders all five nav items (Home, Crons, Sessions, Settings, Logs) but four of them are disabled placeholders. Phase B activates Crons, Sessions, and Settings; Logs stays disabled until Phase C.

The key architectural addition in Phase B is the `commands` table. Until now the worker and API share state only through read-mostly SQLite tables (`sessions`, `crons`, `cron_runs`). Phase B introduces the first writes from the API that the worker must *act on* — pausing a cron, running one now, restarting the process. Per the constitution ("DB is the contract between worker and API, zero direct IPC") this coordination happens through a new `commands` table polled by the worker every second. This pattern is designed once here and reused by Phase C (log commands, future admin actions).

The second architectural addition is the Session transcript view. Each Slack thread maps to a Claude Agent SDK session; the full message history lives in the SDK's internal JSONL files under `~/.claude/projects/-workspace/<sessionId>.jsonl`. Those files are already persisted via the `claude_home` Docker volume shared between worker and API. Phase B reads them on-demand from the API.

## Problem Statement

Phase A proves the dashboard works end-to-end (login + Home + stats) but delivers negligible operational value: you can see counts, not *do* anything. Today, every operator action still requires Slack:

- Pausing a cron to silence it during a deploy freeze → `@zeno pausa o cron X`
- Investigating why a cron failed → `pnpm run docker:logs | grep cron` + `docker exec` + `sqlite3`
- Re-running a cron to test a fix → `@zeno roda o cron X agora`
- Reading a thread transcript the next day → open Slack, scroll through app mentions
- Restarting the agent after a profile edit → `docker compose restart zeno-agent`

Phase B moves all of those to the dashboard. The Slack path stays as the "chat" interface for creating things via natural language (the `cron_create` MCP tool is unchanged); the dashboard becomes the deliberate-action console — list, inspect, act, confirm.

## Non-Goals

1. **Editing an existing cron via the UI.** Editing (changing schedule, prompt, notify target) stays Slack-only. The form would be 95% identical to create but adds pre-population and optimistic concurrency — not worth the effort given Slack is fluid for imperative rewording. Delete + recreate covers hard edits.
2. **Editing `profile/` files from the UI.** `SOUL.md`, `USER.md`, `crons.yaml`, `mcp.json` are edited with a real text editor. The watcher picks up changes. Phase B shows file metadata only (bytes, mtime).
3. **Toggling backend / MCP server enable flags at runtime.** Both require restart to apply cleanly. Phase B exposes a restart button; switching happens by editing `.env` / `profile/mcp.json` + restart.
4. **Pagination UI** for Crons or Sessions lists. API accepts `limit`/`offset` query params (default `limit=50`) but the dashboard renders the default page only. Add a "Load more" button if lists start exceeding 50 rows in real use.
5. **Search / filter UX** beyond the one `enabled=true|false` dropdown on Crons. Sessions list has zero filters in Phase B. Add when real volume demands it.
6. **Logs page + SSE streaming.** Phase C (spec 0014).
7. **Command lifecycle tracking from the UI.** API returns `204 No Content` on mutation — the dashboard does not poll `GET /api/commands/:id` for progress. Feedback comes from toasts + query invalidation. Adding per-command tracking is a Phase C concern if the fire-and-forget UX causes confusion in practice.
8. **Real-time updates via WebSocket / SSE.** TanStack Query's default refetch-on-focus + explicit invalidation after mutations is the update mechanism. SSE enters with Logs.
9. **Multi-user, roles, per-user audit.** Single-user tool; every command is "by the operator".
10. **Playwright e2e tests.** Phase B uses vitest unit + integration. E2E gets its own spec if needed.

## Constraints

- **Docker-only execution.** Same as Phase A: no new `pnpm dev` scripts, everything via `pnpm docker:*`. `pnpm run quality-gate` stays local for IDE feedback.
- **No `any`, no `// biome-ignore`.** Existing legacy violations are out of scope; new code is held to the rule.
- **DB is the contract between API and worker.** All mutations go through the `commands` table. No internal HTTP server on the worker, no Unix sockets, no shared in-memory state.
- **Same-origin cookie auth unchanged.** Every new `/api/*` route sits behind `requireAuth`. The SPA uses the same `apiFetch` + `apiFetch`-based mutations it already has.
- **Fire-and-forget mutation model.** API inserts a command row, returns `204` immediately. Worker processes within one poll tick (1s). Dashboard refetches after a short delay (1.5s) and shows a toast on submit. No command-id returned to the client; no command status polling.
- **`commands` poller runs inside the worker process.** Single 1s `setInterval` that claims up to 10 pending rows per tick and processes them sequentially. An `inFlight` Set keyed by command id (or by the (type, target_id) pair for `cron_run_now`) prevents duplicate handling when a slow command overlaps a tick.
- **SDK JSONL is the transcript source.** API parses `~/.claude/projects/-workspace/<sessionId>.jsonl` on-demand. No new writes from the worker. If the SDK's JSONL shape changes in an upgrade, the parser is the only thing that needs updating.
- **Restart-safety for the commands table.** On worker boot, the poller sweeps `status='processing'` rows and marks them as `failed` with `error='worker_restarted'`. Prevents "stuck" rows from interrupting the fleet of new pending ones.
- **Delete of `source='static'` crons is rejected by the API** (not enqueued). Static crons live in `profile/crons.yaml`; delete via UI would be overwritten on next boot anyway.

## Design

### Database — new `commands` table (migration 2)

```sql
CREATE TABLE commands (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  payload        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at   TEXT,
  completed_at   TEXT,
  result         TEXT,
  correlation_id TEXT NOT NULL
);
CREATE INDEX commands_pending_idx ON commands(status, created_at) WHERE status = 'pending';
```

Where:
- `type`: one of `cron_create | cron_pause | cron_resume | cron_delete | cron_run_now | worker_restart`
- `payload`: JSON-encoded args — e.g. `{"cronId":"..."}` or the full `CreateCronInput` for `cron_create`
- `status`: `pending | processing | success | failed`
- `result`: JSON — on `success`, `{}` or a shape the command decides; on `failed`, `{"error":"..."}`
- `correlation_id`: generated by the API (ULID or UUID), echoed in log lines so a command can be traced across processes

New `CommandRepo` in `@zeno/storage`:
- `enqueue(input: { type, payload?, correlationId }): Command` — synchronous insert with `status='pending'` (better-sqlite3 is sync).
- `claimPending(limit: number): Command[]` — synchronous. Implemented as a single atomic statement inside `db.transaction(...)`: `UPDATE commands SET status='processing', processed_at=CURRENT_TIMESTAMP WHERE id IN (SELECT id FROM commands WHERE status='pending' ORDER BY created_at LIMIT ?) RETURNING *`. Returns the claimed rows. better-sqlite3 is single-writer and synchronous, so the transaction here is defensive rather than concurrency-critical, but we code it correctly.
- `finish(id, status: 'success' | 'failed', result?): void` — synchronous. Sets `completed_at`, `result`.
- `recent(limit: number): Command[]` — for future admin view (not used in Phase B UI).
- `sweepStuck(): number` — synchronous. Sets `status='failed'`, `result='{"error":"worker_restarted"}'` on any `processing` row. Called once on worker boot.

### Worker changes

**New: `apps/worker/src/commands/poller.ts`**

```typescript
export class CommandsPoller {
  private timer: NodeJS.Timeout | null = null;
  /**
   * Reentrancy guard for long-running handlers (notably `cron_run_now`, which
   * calls the agent backend and can take 2–30s). Keyed by `cmd.id`. Rows are
   * only ever claimed once from the DB (transaction on `claimPending`), so this
   * Set is NOT protecting against double-claim — it guards the in-memory
   * promise chain when the next tick fires while a handler is still awaiting.
   */
  private readonly inFlight = new Set<string>();

  constructor(private readonly opts: CommandsPollerOptions) {}

  start(): void {
    // On boot: any row left in 'processing' from a prior run is abandoned work.
    // Mark them failed so the UI reflects reality; the operator can re-enqueue.
    const swept = this.opts.commandRepo.sweepStuck();
    if (swept > 0) this.opts.logger.warn({ event: 'commands_swept', count: swept });
    this.timer = setInterval(() => { void this.tick(); }, this.opts.tickMs ?? 1000);
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  private async tick(): Promise<void> {
    const claimed = this.opts.commandRepo.claimPending(10);
    // Handlers are processed sequentially within a tick. This is a deliberate
    // simplicity choice: a slow `cron_run_now` will delay other commands in
    // the same batch by up to ~30s. Acceptable because:
    //   1. `cron_run_now` is rare (operator-triggered, one at a time)
    //   2. Fast handlers (pause/resume/delete/create/restart) complete in <10ms
    //   3. The next tick fires in 1s, so other pending rows queue up naturally
    // If this becomes a problem, split long-running types onto a dedicated
    // async lane — not a Phase B concern.
    for (const cmd of claimed) {
      if (this.inFlight.has(cmd.id)) continue; // shouldn't happen with atomic claim; defensive
      this.inFlight.add(cmd.id);
      try { await this.handle(cmd); }
      finally { this.inFlight.delete(cmd.id); }
    }
  }

  private async handle(cmd: Command): Promise<void> {
    switch (cmd.type) {
      case 'cron_pause': return this.handlers.pause(cmd);
      case 'cron_resume': return this.handlers.resume(cmd);
      case 'cron_run_now': return this.handlers.runNow(cmd);
      case 'cron_delete': return this.handlers.delete(cmd);
      case 'cron_create': return this.handlers.create(cmd);
      case 'worker_restart': return this.handlers.restart(cmd);
      default: return this.finishFailed(cmd, `unknown command type: ${cmd.type}`);
    }
  }
}
```

Handlers live in `apps/worker/src/commands/handlers/*.ts`. Each handler:
1. Parses `cmd.payload` via a Zod schema
2. Performs the mutation against the existing repos (`CronRepo.update`, `CronRunRepo.start` via `CronRunner.runOnce`, etc)
3. On success: `commandRepo.finish(cmd.id, 'success', {...})`
4. On error: `commandRepo.finish(cmd.id, 'failed', { error })`

The `worker_restart` handler: log, finish the command, `process.exit(0)`. The container's Docker `restart: unless-stopped` policy brings it back up. Any pending commands at the moment of restart wait until the new worker process boots + its poller picks them up.

**Wiring in `apps/worker/src/index.ts`**: instantiate `CommandRepo`, build `CommandsPoller` with handlers bound to the existing `crons`/`cronRuns`/`runner` instances, `poller.start()`, `poller.stop()` in the shutdown handler.

### API endpoints (new in `apps/api`)

All behind `requireAuth` unless noted.

| Method | Path | Body | Returns | Worker action |
|---|---|---|---|---|
| `GET` | `/api/crons` | — | `Cron[]` | Read `CronRepo.list(filter)` (supports query `?enabled=true&source=static\|chat`) |
| `GET` | `/api/crons/:id` | — | `{ cron: Cron, recentRuns: CronRun[] }` (last 20) | 404 on miss |
| `POST` | `/api/crons` | `CreateCronInput` (Zod-validated) | `204` | Enqueues `cron_create` |
| `POST` | `/api/crons/:id/pause` | — | `204` | Enqueues `cron_pause` with `{cronId}`. 404 if not found. |
| `POST` | `/api/crons/:id/resume` | — | `204` | Enqueues `cron_resume`. 404 if not found. |
| `POST` | `/api/crons/:id/run-now` | — | `204` | Enqueues `cron_run_now`. 404 if not found. |
| `DELETE` | `/api/crons/:id` | — | `204` | 404 if not found; `409` if `source='static'`; else enqueues `cron_delete` |
| `GET` | `/api/sessions` | — | `Session[]` (limit=50 default, `?limit=N` accepted up to 200) | Read `SessionRepo.list()` ordered `last_used_at DESC` |
| `GET` | `/api/sessions/:threadId` | — | `{ session: Session, messages: SessionMessage[] }` | Read session row + parse JSONL |
| `GET` | `/api/settings` | — | `SettingsSnapshot` | See below |
| `POST` | `/api/settings/restart` | — | `204` | Enqueues `worker_restart` |

**`SettingsSnapshot` shape:**

```typescript
{
  backend: { name: 'claude-code' | 'mock', selectedVia: 'ZENO_BACKEND env' };
  slack: { connected: boolean; botUserId: string | null };  // from /api/health
  mcpServers: Array<{ name: string; status: 'enabled' | 'skipped' | 'disabled'; reason?: string }>;
  profileFiles: Array<{ path: string; bytes: number; mtime: string }>;  // SOUL.md, USER.md, crons.yaml, mcp.json
}
```

The API has no direct access to runtime state of slack/backend inside the worker; those come from re-reading `/api/health` internally (or duplicated env lookups where applicable).

**For `mcpServers`**: the `loadMcpConfig` logic currently lives in `apps/worker/src/agent/mcp.ts` (~60 lines: `PROFILE_CANDIDATES` path resolution, `${VAR}` env interpolation, `_disabled` stripping). Phase B **duplicates** this helper into `apps/api/src/lib/mcp-snapshot.ts` rather than extracting a package. Rationale: 60 lines, two call sites, no divergence in behavior expected in Phase B. If a third consumer appears (e.g., a future CLI) or if the format needs to evolve meaningfully, extract to `packages/profile-config` as a separate commit. This decision is locked in; the plan should not re-open it.

**`SessionMessage` shape** (from the JSONL parser):

```typescript
{
  id: string;              // SDK message id
  role: 'user' | 'assistant' | 'system';
  author: string;          // 'Operator' (from the Slack context preamble) | 'Zeno' (assistant) | '(system)'
  timestamp: string;       // ISO
  text: string;            // concatenated text blocks
  toolCalls: Array<{ tool: string; input: unknown }>;  // inline tool_use events
}
```

The parser lives in `apps/api/src/lib/read-session-jsonl.ts` and is Zod-validated + unit-tested against a fixture file. Unparseable lines produce a single message with `role='system'`, `text='[unparseable line N]'` and are logged but don't crash the endpoint.

### Dashboard routes + components

```
apps/dashboard/src/routes/_authed/
├── index.tsx               (existing — Home)
├── crons.tsx               (Crons list)
├── crons.$id.tsx           (Cron detail)
├── crons.new.tsx           (Create modal as a route — opens overlaid on /crons via search-param or Route context)
├── sessions.tsx            (Sessions list)
├── sessions.$threadId.tsx  (Session transcript)
└── settings.tsx            (Settings page)
```

**New component folders:**
- `components/crons/` — `CronRow`, `CronStatusPill`, `CronActions` (dropdown with pause/resume/run-now/delete), `CronRunHistoryRow`, `CronForm`
- `components/sessions/` — `SessionRow`, `MessageBlock` (Operator vs Zeno styling from Paper artboard)
- `components/settings/` — `ServiceStatus` (reuses the sidebar's status-row visual), `ProfileFileRow`, `McpServerRow`, `RestartDialog`

**New hooks:** `lib/use-crons.ts`, `use-cron.ts`, `use-sessions.ts`, `use-session.ts`, `use-settings.ts`, plus a `lib/mutations.ts` with `useMutation` wrappers per action that invalidate the right query keys on success.

**Sidebar update:** `components/layout/Sidebar.tsx` — remove `enabled: false` from Crons, Sessions, Settings. Logs still disabled with "Phase C" title attr.

### Mutation UX pattern (canonical example: Pause)

1. User clicks the "Pause" item in `CronActions` dropdown for a row in `/crons`.
2. TanStack `useMutation` fires `POST /api/crons/:id/pause`.
3. Button goes into a pending state; `toast.info('pausando…')` renders.
4. API inserts a `cron_pause` command row, returns `204`.
5. `onSuccess` from the mutation: `setTimeout(() => queryClient.invalidateQueries({ queryKey: ['crons'] }), 1500)`. Also fires a success toast `'cron pausado'`.
6. Meanwhile, the worker's poller (at most 1s later) picks up the row, calls `crons.update(id, { enabled: false })`, marks command `success`.
7. The 1.5s-delayed invalidation triggers a refetch of `/api/crons`; the row now renders as "Paused".

**Failure modes:**
- API 404 (cron doesn't exist anymore) → mutation error → toast with `err.message`.
- API 409 (e.g., delete of static cron) → mutation error → toast with the API's error message.
- Worker crash between API insert and processing → command stays `pending`; when worker restarts, it picks up from the `pending` index. Dashboard's next invalidation reflects the delayed result.
- Worker fails the handler → command row ends as `status='failed'`. Phase B UI does not surface this — the user sees the unchanged state and will notice. Phase C can add a toast that polls for failures if needed.

### Cron create modal

Route `/_authed/crons.new.tsx` renders an overlay modal above the `/crons` list. The form mirrors `CreateCronInput` (name, description, schedule, prompt, notify_conversation_id, notify_thread_id). Validation reuses the same Zod schema the API accepts. On submit → `POST /api/crons`. On success → close modal, invalidate `['crons']`, toast `'cron criado'`. "notify_conversation_id" is a plain text input for Phase B (user pastes a Slack channel id) — a channel picker is a Phase C or later concern.

### Files changed

| Action | Path |
|---|---|
| NEW | `packages/storage/src/types.ts` — add `Command`, `CommandType`, `CommandStatus`, `CreateCommandInput` |
| NEW | `packages/storage/src/repos/commands.ts` + tests (`packages/storage/tests/commands.test.ts`) |
| EDIT | `packages/storage/src/migrations.ts` — migration 2 |
| EDIT | `packages/storage/src/index.ts` — re-export `CommandRepo` + types |
| NEW | `apps/worker/src/commands/poller.ts` + tests |
| NEW | `apps/worker/src/commands/handlers/{pause,resume,run-now,delete,create,restart}.ts` + tests |
| EDIT | `apps/worker/src/index.ts` — instantiate + start + stop poller |
| NEW | `apps/api/src/routes/crons.ts` + tests |
| NEW | `apps/api/src/routes/sessions.ts` + tests |
| NEW | `apps/api/src/routes/settings.ts` + tests |
| NEW | `apps/api/src/lib/read-session-jsonl.ts` + tests (fixture file under `apps/api/tests/fixtures/`) |
| NEW | `apps/api/src/lib/mcp-snapshot.ts` — duplicates `loadMcpConfig` logic from `apps/worker/src/agent/mcp.ts` (see Design section). Extract to a package only when a third consumer appears. |
| EDIT | `apps/api/src/server.ts` — mount new routes with `requireAuth` |
| NEW | `apps/dashboard/src/routes/_authed/{crons,crons.$id,crons.new,sessions,sessions.$threadId,settings}.tsx` |
| NEW | `apps/dashboard/src/components/{crons,sessions,settings}/**` |
| NEW | `apps/dashboard/src/lib/{use-crons,use-cron,use-sessions,use-session,use-settings,mutations}.ts` |
| EDIT | `apps/dashboard/src/components/layout/Sidebar.tsx` — enable nav items |
| EDIT | `context/specs/2026-04-16-dashboard-crud/spec.md` — this file |

## User Stories / Scenarios

1. **Operator pauses a cron from the UI.**
   - Navigate `/crons`, find the cron, click its "⋯" → Pause.
   - Toast: "pausando…".
   - In the common case the status pill turns to "Paused" within ~2s (API 204 is immediate, worker tick fires within 1s, dashboard invalidates queries at +1.5s). If a `cron_run_now` is already executing on the worker when Pause is enqueued, the pause waits for it to finish (up to ~30s) because handlers run sequentially inside a tick — see the poller design note.
   - Worker logs show `command_processed type=cron_pause result=success`.

2. **Operator creates a new cron.**
   - Click "New cron" on `/crons`. Modal opens with empty form.
   - Fill name, description, schedule, prompt, notify channel id. Submit.
   - Modal closes, list refetches, new cron appears in ~2s. Toast: "cron criado".
   - If the schedule is invalid (Zod fails), form shows inline error — no request sent.

3. **Operator re-runs a cron to verify a fix.**
   - From `/crons/$id`, click "Run now".
   - Toast: "execução iniciada".
   - The cron fires within 1s (picked up by the commands poller, which calls `runner.runOnce(cron)`).
   - A new row appears in the run history list when the run finishes (2–30s depending on the agent turn). List refetches via the invalidation cycle.

4. **Operator inspects a thread's transcript.**
   - `/sessions` shows the most recent 50 threads with channel + last-user-message preview.
   - Click a row → `/sessions/:threadId` renders the full transcript: alternating user and Zeno messages, with tool calls shown as subtle inline annotations under Zeno's turns.
   - If the SDK JSONL file is missing (session expired or volume wiped), the page shows "[sem transcript disponível]" — metadata still renders.

5. **Operator restarts the worker after editing `profile/mcp.json`.**
   - Edit the file on the host; watcher logs `mcp_change_requires_restart`.
   - In `/settings`, click "Restart worker".
   - Confirmation dialog. On confirm, `POST /api/settings/restart` → `204`.
   - Toast: "reiniciando…". Within 3s the worker process exits, Docker brings it back, `/api/health` starts reporting `runner: ticking` again.
   - The API process itself is not restarted — it stays up serving the dashboard during the brief worker downtime.

6. **Operator opens `/settings`.**
   - Three sections render: Backend (name, selection source), MCP servers (list with status + reason), Profile files (name + bytes + mtime).
   - "Restart worker" button at the bottom. No other mutations in Phase B.

## Success Criteria

1. `pnpm run quality-gate` is green after Phase B: all Phase A tests still pass, plus the new tests — `CommandRepo` unit tests, `CommandsPoller` unit tests, each handler's unit tests, `apps/api` integration tests for every new route (via Hono test client), JSONL parser unit tests with a fixture, and at least a smoke render test per new dashboard route.
2. Docker container boots with both processes online (`[worker] zeno_online` + `[api] api_listening`). `/api/health` returns `runner: ticking` once a cron has fired.
3. `curl -X POST -H 'Cookie: zeno_auth=…' http://localhost:3000/api/crons/<id>/pause` returns `204`; within ~2s (in the absence of a concurrent long-running command) the next `GET /api/crons/<id>` shows `enabled: false`.
4. Browser at `/crons`: list renders; pause/resume/run-now/delete actions on chat-source crons work end-to-end; delete on static cron returns a clear error toast.
5. Browser at `/crons/new`: modal opens; submitting a valid form creates a cron visible in `/crons` within 2s.
6. Browser at `/sessions/:threadId`: transcript renders with alternating user + Zeno turns for at least one real thread in the DB.
7. Browser at `/settings`: three sections render with current DB + filesystem state; "Restart worker" triggers a visible restart.
8. Paper fidelity: the five artboards render with the locked palette, correct typography, and consistent sidebar across all screens.
9. No `any`, no `// biome-ignore` in any code added by this spec.
10. `commands` table remains empty at rest after a normal session (no stuck rows, all recent rows in `success` or `failed` terminal states).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `commands` poller busy-loops on a failing handler, filling the log | Each handler wraps its work in try/catch that always calls `commandRepo.finish` (never throws uncaught). Logs at `error` level include `correlationId` for grouping. |
| SDK JSONL format changes in a future `@anthropic-ai/claude-agent-sdk` release | Parser is isolated in one file with a fixture-based unit test. Parser normalizes to our own `SessionMessage` shape so consumers don't break. A failing parse yields a placeholder message, not a 500. |
| Race: API sees cron still enabled, user clicks Pause, worker hasn't processed yet, user clicks Resume → two pending commands | Idempotent handlers (pause of already-paused cron is a no-op). Order of `status` transitions follows creation time. No correctness issue; UI briefly shows stale state. |
| `worker_restart` fires while a `cron_run_now` is in-flight → stuck `processing` row | Worker-boot `sweepStuck()` marks them `failed`. User sees old run discarded; can click "Run now" again. |
| Dashboard-initiated `cron_delete` races with a concurrent tick of the same cron | The runner may have already called `CronRunRepo.start(cronId)` and begun executing when the delete lands. Since `cron_runs.cron_id` has `ON DELETE CASCADE` to `crons.id`, the in-flight `cron_runs` row is removed along with the cron itself. Subsequent `CronRunRepo.finish()` and `CronRepo.markRun()` calls UPDATE zero rows (silent no-op), and the run vanishes from the Home activity timeline. No partial/orphan records. Acceptable for v1. |
| JSONL parse of a 10MB+ session file blocks the API event loop | Accept; real sessions rarely exceed 1MB. If observed, stream-read with readline instead of `readFileSync`. YAGNI for Phase B. |
| API serves stale `/api/settings` MCP list because `profile/mcp.json` is re-read on every call | That's desired — the worker's in-memory state isn't queryable from the API process. If this becomes a bottleneck (it won't at single-user scale), add a 5s cache in the route. |
| Fire-and-forget mutations leave the user uncertain on failure | Accepted trade-off (spec 0013, non-goal #7). Add command-status polling in Phase C if this hurts UX. |
| `loadMcpConfig` is duplicated between `apps/worker` and `apps/api` | Duplication is intentional for Phase B (60 lines × 2, no format divergence expected). A follow-up spec extracts to `packages/profile-config` when a third consumer appears or the shape evolves. |
| New mutations don't trigger Query invalidations reliably because of stale `queryKey` conventions | Document the key conventions in `lib/query-client.ts` comments: `['crons']`, `['crons', id]`, `['sessions']`, `['sessions', threadId]`, `['settings']`. All mutations invalidate the list key they affect plus the detail key if applicable. |

## Open Questions

None blocking. Tactical details decided during implementation:

- Exact visual treatment of tool calls in the Session transcript (inline pill vs small subtext vs collapsible). Start with a muted mono subtext under Zeno's turns; iterate if it looks noisy.
- Whether the Cron create modal is a true modal or a route-as-dialog. Pick whichever TanStack Router integrates cleaner with its own route-leave prompts. Either works for the user.
- Polling interval of `commands` poller: 1s is the target; if perf testing shows it's too chatty, raise to 2s. `useStats` and `useActivity` on Home don't need changes — they already poll the same data the commands feed into.
