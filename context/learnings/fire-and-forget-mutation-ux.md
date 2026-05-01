---
tags:
  - learning
  - dashboard
  - ux
related:
  - "[[../specs/2026-04-16-dashboard-crud/spec-dashboard-crud|spec 0013]]"
  - "[[db-as-contract-pattern]]"
created: 2026-04-16
---
# Fire-and-forget mutations: API 204 + 1.5s invalidate

The dashboard never polls command status. Any mutation (pause, resume, run-now, delete, create, restart) follows this exact flow:

1. UI calls `useMutation`, fires `POST /api/*/<action>`.
2. API validates, inserts a row in `commands`, returns `204 No Content` immediately (<10ms).
3. UI shows a toast (`"cron pausado"`) and calls `invalidateSoon(queryClient, [...keys], 1500)`.
4. Worker's 1s poller picks up the command in at most 1s, processes, writes result.
5. At T+1.5s the dashboard re-fetches the affected list/detail queries — sees the new state.

Total perceived latency: 1.5-2s, in the happy path.

## Context

Designed in spec 0013 brainstorm; implemented in Phase B mutations (`apps/dashboard/src/lib/mutations.ts`). Explicit non-goal: dashboard does not fetch `GET /api/commands/:id` to confirm success. If the command fails, the UI shows stale state and a future refetch reveals reality.

## Why accepted over command-status polling

- **Simpler code.** No new endpoint, no new hook, no new state in UI, no "command is still processing" spinner that the operator has to wait on.
- **No user lies.** 1.5s invalidation reliably catches the common case (fast handlers like pause/resume). When a slow handler is in flight (`cron_run_now` taking 30s), the UI just shows stale for a moment — the operator figures it out by refreshing or navigating.
- **Failures still surface.** Handler errors are logged to the `logs` table (spec 0014), visible on `/logs`. Silent failures are not invisible — they're just not annotated at the point of click.

## How to Apply

- **For every new mutation**, use the hook pattern in `apps/dashboard/src/lib/mutations.ts`: `useMutation` that fires `POST` + on `onSuccess` calls `invalidateSoon(qc, keys)` and shows a toast. Copy an existing one (e.g. `usePauseCron`) and tweak.
- **Invalidation key** = the list key + the detail key affected. `invalidateSoon(qc, [['crons'], ['crons', id]])` for any per-cron action.
- **For long-running mutations (run-now, restart)** pass a longer delay: `invalidateSoon(qc, keys, 5000)`. 1.5s is the floor; go up if the handler reliably exceeds it.
- **Error handling** = `onError` shows a toast with `formatError(err)`. Don't try to distinguish "API 404" from "API 409" in UI — the toast text from the API error body is enough.

## When to revisit

- Operator starts complaining they clicked-and-nothing-happened. That's the signal to add command-status polling — promote the backlog item to a real spec.
- A new mutation is semantically "synchronous from the user's perspective" (e.g., "I clicked save, did it save?" for a config UI). That breaks the fire-and-forget model; design that mutation with lifecycle tracking from the start.
