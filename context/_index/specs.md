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

## Drafted / created earlier (status frontmatter still `draft`)

- [[../specs/0002-dev-workflow/spec|0002 — Dev Workflow]]
- [[../specs/0003-thread-sessions/spec|0003 — Thread Sessions]]
- [[../specs/0004-mcp-configuration/spec|0004 — MCP Configuration]]
- [[../specs/0005-database-foundation/spec|0005 — Database Foundation]]
- [[../specs/0006-session-persistence/spec|0006 — Session Persistence]]
- [[../specs/0007-cron-scheduled-tasks/spec|0007 — Cron Scheduled Tasks]]
- [[../specs/0008-dashboard-design/spec|0008 — Dashboard Design (Paper artboards)]]
- [[../specs/0010-profile-hot-reload/spec|0010 — Profile Hot Reload]]
- [[../specs/0011-mock-backend/spec|0011 — Mock Backend]]
- [[../specs/0012-dashboard-foundation/spec|0012 — Dashboard Foundation (Phase A)]]
- [[../specs/0013-dashboard-crud/spec|0013 — Dashboard CRUD (Phase B)]]
- [[../specs/0014-dashboard-logs/spec|0014 — Dashboard Logs (Phase C)]]

_Note: many of the above were implemented and merged; the `status:` frontmatter was never flipped to `shipped`. Treat `git log` as the source of truth for what is actually in `main` until the frontmatter is rebased._

## Shipped

- [[../specs/0018-dashboard-ux-cleanup/spec|0018 — Dashboard UX Cleanup]] (2026-04-17) — `AlertDialog` / `Skeleton` / `EmptyState` / `ErrorState` primitives in `@zeno/ui`; `window.confirm` + raw "carregando…" removed.
- [[../specs/0017-paper-design-system/spec|0017 — Paper Design System]] (2026-04-17) — "Hearty island" Paper file organized (Foundations · Primitives · Patterns · Feature components · Pages) + `packages/ui/DESIGN.md` registry + `ui-in-paper` governance rule.
- [[../specs/0016-ui-package/spec|0016 — Extract @zeno/ui Package]] (2026-04-17) — shadcn primitives moved to `packages/ui/`; source-consumed via Bundler resolution; tokens CSS ships with the package.
- [[../specs/0015-dashboard-kebab-case/spec|0015 — Dashboard Kebab-Case Rename]] (2026-04-17) — component filenames under `apps/dashboard/src/components/**` normalized to kebab-case; rule codified in `conventions/code-style.md`.
- [[../specs/0001-slack-zeno-mvp/spec|0001 — Slack Zeno MVP]] (2026-04-15) — agente pessoal via Slack que consulta GitHub via Claude Code (OAuth) + `gh` CLI.
