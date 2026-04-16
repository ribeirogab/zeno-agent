---
status: living
created: 2026-04-16
---
# Backlog — ideas, not specs

Running list of things that came up but don't justify a spec yet. Each item should be promoted to `context/specs/NNNN-name/` when (a) the underlying problem is felt in real use, or (b) the scope stops being "nice-to-have" and becomes "blocking something".

Don't build from this file directly. Use it to remember what was discussed and what to watch for.

## Dashboard — post-Phase-C polish

| Idea | Trigger to promote | Notes |
|---|---|---|
| Pagination UI for Crons list | >50 active crons OR operator reports scroll fatigue | API already accepts `limit`/`offset` params. UI is a "Load more" button or cursor; no infinite scroll (yagni). |
| Pagination UI for Sessions list | Same — currently default 50 | Same pattern as crons. |
| Filters on Sessions (channel, date, has-messages) | Operator reports "I can't find the thread from yesterday" | List is ordered `last_used_at DESC` today. First filter would be by channel. |
| Edit cron via UI | Operator reports Slack-based editing is slow | Form is 95% identical to create. Requires optimistic concurrency or last-write-wins — decide at spec time. |
| Command lifecycle tracking (polling `/api/commands/:id`) | Operator misses when a mutation fails silently | Currently fire-and-forget: API 204 → invalidate after 1.5s. Phase C can expose `GET /api/commands/:id` + hook `useCommandStatus` if needed. |
| Search within cron / session content | Operator reports "I remember Zeno said X but can't find it" | Requires full-text index in SQLite (FTS5) or client-side scan. FTS5 is more robust. |
| Playwright e2e suite | Regressions start happening between phases | Unit tests cover 90% of logic; e2e covers 5 canonical flows (login, create-cron, pause, run-now, restart). Separate spec. |
| Toggle backend (claude-code ↔ mock) from Settings | You actually want to switch at runtime (currently requires `.env` + restart) | Writes to `.env` from the UI open a security can. Probably stays out-of-scope permanently. |
| Edit `profile/*.md` from the Settings UI | Operator reports "I want to tweak SOUL.md without opening an editor" | Needs a write endpoint + re-check of the watcher not looping. Separate spec. |
| Mobile / responsive layout | You try to use the dashboard from a phone | Designed at 1440×900. A responsive pass is a real spec, not a bolt-on. |

## Agent / non-dashboard

| Idea | Trigger to promote | Notes |
|---|---|---|
| GitHub App (spec 0009, deferred since night-batch) | You sit down to do the interactive OAuth + want to move off `gh` CLI | Lets the agent clone / edit / open PRs as a first-class identity. |
| Dashboard chat with the agent | You decide "I want to talk to Zeno from the browser, not Slack" | Requires IPC between API and worker (socket or shared message queue) + a `WebChannel` adapter in the worker. Architectural call: keep worker as single-process owner of the agent, add IPC; OR extract `apps/agent` and have both Slack and API be thin adapters. |

## Tech debt (already accepted; revisit)

| Item | Where | When to revisit |
|---|---|---|
| Legacy `any` + `// biome-ignore` violations (~10) in pre-Phase-A code | `apps/worker/src/{agent,channels,storage}` | Dedicated cleanup spec when we touch those files for another reason. |
| Worker tsconfig disables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` | `apps/worker/tsconfig.json` | Same trigger — when we're already modifying worker code for another spec. |
| `watcher.test.ts > "debounces rapid edits"` is flaky ~1/5 on macOS | `apps/worker/tests/profile/watcher.test.ts` | Look at replacing `fs.watch` with chokidar if the flake starts failing CI consistently. |
| `loadMcpConfig` duplicated between worker and api | `apps/worker/src/agent/mcp.ts` + `apps/api/src/lib/mcp-snapshot.ts` | Extract to `packages/profile-config` when a third consumer appears. |
