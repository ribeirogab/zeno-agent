---
tags:
  - moc
---
# Specs — Map of Content

All specs for Zeno features, past and current. Specs never get deleted — shipped specs remain as historical record.

## Workflow trigger

Before implementing a user request, ask: "Can I describe the complete solution in one sentence?" If no → use the Spec Kit flow. If yes → go direct. If almost → ask the user.

Template: `[[../specs/_template/spec|_template/spec]]`

## Active

_(none)_

## Active

_(none)_

## Design-only

- [[../specs/0008-dashboard-design/spec|0008 — Dashboard Design (Paper artboards)]] — visual design, no code footprint.

## Shipped

- [[../specs/0020-cron-schedule-picker/spec|0020 — Cron Schedule Picker]] (2026-04-17) — `SchedulePicker` replaces raw cron input; 7 presets + custom escape hatch; humanized preview via `cronstrue`.
- [[../specs/0019-dashboard-optimistic-updates/spec|0019 — Dashboard Optimistic Updates]] (2026-04-17) — `useOptimisticMutation` primitive; five cron mutations migrated; instant-feedback UX with <50ms click-to-render, rollback on error, invalidate as server-reality safety net.
- [[../specs/0018-dashboard-ux-cleanup/spec|0018 — Dashboard UX Cleanup]] (2026-04-17) — `AlertDialog` / `Skeleton` / `EmptyState` / `ErrorState` primitives in `@zeno/ui`; `window.confirm` + raw "carregando…" removed.
- [[../specs/0017-paper-design-system/spec|0017 — Paper Design System]] (2026-04-17) — "Hearty island" Paper file organized (Foundations · Primitives · Patterns · Feature components · Pages) + `packages/ui/DESIGN.md` registry + `ui-in-paper` governance rule.
- [[../specs/0016-ui-package/spec|0016 — Extract @zeno/ui Package]] (2026-04-17) — shadcn primitives moved to `packages/ui/`; source-consumed via Bundler resolution; tokens CSS ships with the package.
- [[../specs/0015-dashboard-kebab-case/spec|0015 — Dashboard Kebab-Case Rename]] (2026-04-17) — component filenames under `apps/dashboard/src/components/**` normalized to kebab-case; rule codified in `conventions/code-style.md`.
- [[../specs/0014-dashboard-logs/spec|0014 — Dashboard Logs (Phase C)]] (2026-04-16) — `/logs` route with filters, SSE live-tail, expandable payload.
- [[../specs/0013-dashboard-crud/spec|0013 — Dashboard CRUD (Phase B)]] (2026-04-16) — cron create/pause/resume/delete + run-now from the dashboard.
- [[../specs/0012-dashboard-foundation/spec|0012 — Dashboard Foundation (Phase A)]] (2026-04-16) — Vite + TanStack + shadcn SPA served by the api.
- [[../specs/0011-mock-backend/spec|0011 — Mock Backend]] (2026-04-16) — `ZENO_BACKEND=mock` for offline dev without OAuth.
- [[../specs/0010-profile-hot-reload/spec|0010 — Profile Hot Reload]] (2026-04-16) — `profile/` watcher rebuilds the system prompt without restart.
- [[../specs/0007-cron-scheduled-tasks/spec|0007 — Cron Scheduled Tasks]] (2026-04-16) — `profile/crons.yaml` + chat-source crons with fire-and-forget commands.
- [[../specs/0006-session-persistence/spec|0006 — Session Persistence]] (2026-04-16) — Slack threadId ↔ Claude SDK sessionId mapping persisted in SQLite.
- [[../specs/0005-database-foundation/spec|0005 — Database Foundation]] (2026-04-16) — SQLite via `better-sqlite3`; migrations in `packages/storage`.
- [[../specs/0004-mcp-configuration/spec|0004 — MCP Configuration]] (2026-04-16) — `profile/mcp.json` loader with per-server enable/skip reasons.
- [[../specs/0003-thread-sessions/spec|0003 — Thread Sessions]] (2026-04-16) — `thread_ts`-keyed session resumption via SDK.
- [[../specs/0002-dev-workflow/spec|0002 — Dev Workflow]] (2026-04-16) — quality-gate + docker workflow + skill inventory.
- [[../specs/0001-slack-zeno-mvp/spec|0001 — Slack Zeno MVP]] (2026-04-15) — agente pessoal via Slack que consulta GitHub via Claude Code (OAuth) + `gh` CLI.
