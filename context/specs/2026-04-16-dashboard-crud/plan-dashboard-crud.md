---
feature: dashboard-crud
spec: "[[spec-dashboard-crud]]"
created: 2026-04-16
---
# Dashboard CRUD — Plan

**For this spec:** `[[spec-dashboard-crud]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended — large plan, many files, coordinated API+worker+dashboard changes). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship Phase B of the web dashboard — Crons / Sessions / Settings UIs with live CRUD via a `commands` table polled by the worker every 1s.

**Architecture:** Introduces a new DB-mediated coordination channel (`commands` table) between the API and the worker. API inserts rows with `status='pending'` and returns 204 immediately; the worker polls every 1s, claims up to 10 pending rows atomically (`UPDATE ... RETURNING`), dispatches to handlers bound to existing repos + runner, and marks rows `success`/`failed`. Dashboard uses TanStack Query with a fire-and-forget invalidation pattern (toast + 1.5s delayed `invalidateQueries`). Session transcripts come from parsing the Claude Agent SDK's JSONL files on the `claude_home` volume — no new writes in the worker's hot path.

**Tech Stack:** Same as Phase A (Node 24 · TS strict · pnpm workspaces · Turborepo · Hono · Vite · React 19 · Tailwind v4 · shadcn/ui primitives · TanStack Router · TanStack Query · vitest · Docker). No new dependencies.

## Approach

Ten phases, each ending with a green quality gate. Phase ordering minimises breakage: foundational layers (storage + worker poller) land before API routes, which land before dashboard UI.

The plan is **TDD-shaped** for every non-UI unit (CommandRepo, CommandsPoller, each handler, API route handlers, JSONL parser). UI work (routes, components) gets smoke render tests only — visual fidelity is confirmed against the Paper artboards manually during the final Phase 10 smoke.

No new `any`, no `// biome-ignore` — same rules as Phase A. Legacy violations in pre-Phase-A code stay untouched.

## Architecture

```
┌─── Docker container ────────────────────────────────────────┐
│                                                             │
│  [worker] node apps/worker/dist/index.js                    │
│    ├── Slack Bolt + AgentCore + CronRunner + ProfileWatcher │
│    ├── CommandsPoller (setInterval 1000ms)                  │
│    │    claim → dispatch → handlers/*.ts → finish           │
│    └── writes to: crons, cron_runs, commands                │
│                                                             │
│  [api] node apps/api/dist/index.js                          │
│    ├── Hono :3000 (serves SPA + /api/*)                     │
│    ├── Routes:                                              │
│    │    /api/crons/**    (GET list/detail, POST mutations)  │
│    │    /api/sessions/** (GET list, GET transcript)         │
│    │    /api/settings/** (GET snapshot, POST restart)       │
│    └── inserts to: commands                                 │
│                                                             │
│  Shared: /workspace/zeno.db  (better-sqlite3 WAL)           │
│  Shared: /home/node/.claude  (SDK session JSONL files)      │
└─────────────────────────────────────────────────────────────┘
                       ▲
                       │ HTTP :3000 (cookie auth)
                       │
                  Browser SPA
                  ├── /crons, /crons/$id, /crons/new
                  ├── /sessions, /sessions/$threadId
                  └── /settings
```

## File Structure

### NEW files

| File | Responsibility |
|---|---|
| `packages/storage/src/repos/commands.ts` | `CommandRepo` — enqueue, claimPending, finish, recent, sweepStuck |
| `packages/storage/tests/commands.test.ts` | Unit tests for CommandRepo |
| `apps/worker/src/commands/poller.ts` | `CommandsPoller` — setInterval tick, dispatch, inFlight guard |
| `apps/worker/src/commands/dispatcher.ts` | `buildDispatcher({ repos, runner })` — maps `cmd.type` → handler |
| `apps/worker/src/commands/handlers/pause.ts` | Pause handler (CronRepo.update enabled=false) |
| `apps/worker/src/commands/handlers/resume.ts` | Resume handler (CronRepo.update enabled=true + recompute next_run_at) |
| `apps/worker/src/commands/handlers/run-now.ts` | RunNow handler (CronRunner.runOnce) |
| `apps/worker/src/commands/handlers/delete.ts` | Delete handler (CronRepo.delete) |
| `apps/worker/src/commands/handlers/create.ts` | Create handler (validate + CronRepo.create) |
| `apps/worker/src/commands/handlers/restart.ts` | Restart handler (finish → process.exit) |
| `apps/worker/tests/commands/**.test.ts` | Tests for poller + each handler |
| `apps/api/src/routes/crons.ts` | Crons routes (list, detail, create, pause, resume, runNow, delete) |
| `apps/api/src/routes/sessions.ts` | Sessions routes (list, detail+transcript) |
| `apps/api/src/routes/settings.ts` | Settings routes (snapshot, restart) |
| `apps/api/src/lib/read-session-jsonl.ts` | Parser: SDK JSONL → `SessionMessage[]` |
| `apps/api/src/lib/mcp-snapshot.ts` | Duplicated `loadMcpConfig` logic for the settings snapshot |
| `apps/api/tests/routes/crons.test.ts` | API integration tests (Hono test client) |
| `apps/api/tests/routes/sessions.test.ts` | API integration tests |
| `apps/api/tests/routes/settings.test.ts` | API integration tests |
| `apps/api/tests/lib/read-session-jsonl.test.ts` | JSONL parser tests with fixture |
| `apps/api/tests/fixtures/session.jsonl` | Fixture file for parser tests |
| `apps/dashboard/src/routes/_authed/crons.tsx` | Crons list route |
| `apps/dashboard/src/routes/_authed/crons.$id.tsx` | Cron detail route |
| `apps/dashboard/src/routes/_authed/crons.new.tsx` | Cron create modal route |
| `apps/dashboard/src/routes/_authed/sessions.tsx` | Sessions list route |
| `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx` | Session transcript route |
| `apps/dashboard/src/routes/_authed/settings.tsx` | Settings route |
| `apps/dashboard/src/components/crons/*.tsx` | CronRow, CronStatusPill, CronActions, CronRunHistoryRow, CronForm |
| `apps/dashboard/src/components/sessions/*.tsx` | SessionRow, MessageBlock |
| `apps/dashboard/src/components/settings/*.tsx` | ServiceStatus, ProfileFileRow, McpServerRow, RestartDialog |
| `apps/dashboard/src/lib/use-crons.ts` | TanStack Query hook for list |
| `apps/dashboard/src/lib/use-cron.ts` | Hook for detail |
| `apps/dashboard/src/lib/use-sessions.ts` | Hook for list |
| `apps/dashboard/src/lib/use-session.ts` | Hook for transcript |
| `apps/dashboard/src/lib/use-settings.ts` | Hook for snapshot |
| `apps/dashboard/src/lib/mutations.ts` | `useMutation` wrappers for every action |
| `apps/dashboard/src/lib/invalidate-soon.ts` | `invalidateSoon(queryClient, keys, delayMs=1500)` helper |
| `apps/dashboard/src/components/ui/dialog.tsx` | shadcn-style Dialog primitive (Radix) |

### EDIT files

| File | Change |
|---|---|
| `packages/storage/src/types.ts` | Add `Command`, `CommandType`, `CommandStatus`, `CreateCommandInput`, `CommandResult` |
| `packages/storage/src/migrations.ts` | Migration 2 creating `commands` table + index |
| `packages/storage/src/index.ts` | Re-export `CommandRepo` + types |
| `apps/worker/src/index.ts` | Instantiate `CommandRepo`, build poller, start/stop |
| `apps/api/src/server.ts` | Mount new routes with `requireAuth` |
| `apps/dashboard/src/components/layout/Sidebar.tsx` | `enabled: true` for Crons, Sessions, Settings; Logs stays disabled |
| `apps/dashboard/package.json` | Add `@radix-ui/react-dialog` devDep for the Dialog primitive |

## Phase Ordering

Ten phases. Don't move on if the gate is red.

1. **Storage foundation** — `commands` table migration + types + `CommandRepo` (TDD)
2. **Worker poller + handlers** — `CommandsPoller`, dispatcher, six handlers, wiring
3. **API crons routes** — list, detail, create, 4 mutation endpoints (TDD)
4. **API sessions routes** — list, transcript (TDD + JSONL parser + fixture)
5. **API settings routes** — snapshot + restart (TDD)
6. **Dashboard infra** — Sidebar activation, mutation helpers, Dialog primitive
7. **Dashboard crons** — list, detail, actions, create modal
8. **Dashboard sessions** — list, transcript
9. **Dashboard settings** — snapshot + restart
10. **Final smoke** — Docker build, end-to-end click-through, visual fidelity vs Paper artboards, open/refresh PR

## Risks / Open Decisions

All decided during implementation; capture the answer in the commit message.

- **`_authed` route group naming collisions:** TanStack Router's file-based router may pick up routes under `_authed/` differently from routes under `_authed.tsx`. The existing Phase A layout uses `_authed.tsx` (the group file) + `_authed/index.tsx`. Phase B adds `_authed/crons.tsx`, `_authed/crons.$id.tsx`, etc. This should "just work" but if TanStack can't reconcile, nest everything under `_authed/` as a real directory and keep Phase A's `_authed.tsx` as the route file for `_authed/index.tsx`. Verify when the first Phase 7 build runs.
- **Dialog implementation:** shadcn's Dialog wraps Radix Dialog. The plan installs `@radix-ui/react-dialog` and hand-writes the wrapper (same as Button/Input/Sonner in Phase A). If a different primitive primitive proves simpler — e.g. native `<dialog>` element — swap at component level.
- **Restart feedback UX:** `POST /api/settings/restart` returns 204 while the worker exits. The API stays up; the next `GET /api/health` still succeeds but shows `runner: unknown` until the worker boots. Dashboard's restart dialog shows a countdown and refetches `/api/health` every second for up to 10s. If feedback is too noisy, shorten to a fixed 3s "reiniciando…" toast. Decide during Phase 9.
- **JSONL parser idempotency:** If the same SDK entry appears twice in a file (SDK wrote a message, rewrote a correction), the parser currently yields two `SessionMessage` entries. For v1 we accept duplicates; later we can dedupe by SDK message id. No Phase B decision needed.
