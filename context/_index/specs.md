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

- [[../specs/2026-04-23-documentation-platform/spec|0027 — Documentation Platform]] (draft) — Fumadocs + llms.txt for agent-friendly docs site in `apps/docs/`.
- [[../specs/2026-04-24-skill-final-reaction/spec|0028 — Skill-controlled Final Reaction]] (draft) — in-process MCP (`set_final_reaction`, `slack_react`, `slack_unreact`) + optional `AgentOutput.finalReaction` so skills can override the core's default ✅.

## Deferred

- [[../specs/2026-04-26-connectors-e2e/spec|0035 — Connectors E2E Validation + Testing]] (deferred 2026-04-26) — full automated suite with 22 scenarios + 4× consecutive clean rule. Manual validation guide in spec 0034 covers the operator path; revisit once the surface stabilizes.

## Shipped

- [[../specs/2026-04-26-connectors-dashboard/spec|0034 — Connectors Dashboard]] (2026-04-26) — `/connectors` route + Hono API (15 endpoints) + 4 worker handlers (create/update/refresh-tools/uninstall) + Slack catalog entry + `@zeno/mcp-discover` workspace package + frontend port from `apps/design`.
- [[../specs/2026-04-26-remote-mcp-runtime/spec|0033 — Remote MCP Runtime]] (2026-04-26) — HTTP/SSE transport via `@modelcontextprotocol/sdk`; `discoverTools` with stdio + remote paths; reserved keys `__MCP_TYPE__` / `__MCP_AUTHORIZATION__`.
- [[../specs/2026-04-26-connectors-backend/spec|0032 — Connectors Backend Foundation]] (2026-04-26) — migration 5 (4 tables) + `ConnectorRepo` + DB-first MCP loader + `connector_permission` policy in pipeline + invocation logging + `mcp.json` cutover warning.
- [[../specs/2026-04-23-imperial-terminal-rebranding/spec|0026 — Imperial Terminal Rebranding]] (2026-04-24) — full visual rebuild: tokens, fonts, primitives, all 8 screens, 2 API endpoints. Based on `tmp/rebranding/zeno/` prototype.

## Design-only

- [[../specs/2026-04-16-dashboard-design/spec|0008 — Dashboard Design (Paper artboards)]] — visual design, no code footprint.

## Shipped

- [[../specs/2026-04-21-multi-profile-isolation/spec|0022 — Multi-Profile Isolation]] (2026-04-21) — `profiles/<name>/` directories with isolated `.env`, skills, config, compose files; `docker.sh` wrapper; concurrent instances.
- [[../specs/2026-04-21-agent-profile-split/spec|0021 — Agent / Profile Split]] (2026-04-21) — `agent/` (identity, committed) split from `profile/` (user config, gitignored); skills-first positioning; entrypoint symlinks; built-in Playwright skill + MCP.
- [[../specs/2026-04-17-cron-schedule-picker/spec|0020 — Cron Schedule Picker]] (2026-04-17) — `SchedulePicker` replaces raw cron input; 7 presets + custom escape hatch; humanized preview via `cronstrue`.
- [[../specs/2026-04-17-dashboard-optimistic-updates/spec|0019 — Dashboard Optimistic Updates]] (2026-04-17) — `useOptimisticMutation` primitive; five cron mutations migrated; instant-feedback UX with <50ms click-to-render, rollback on error, invalidate as server-reality safety net.
- [[../specs/2026-04-16-dashboard-ux-cleanup/spec|0018 — Dashboard UX Cleanup]] (2026-04-17) — `AlertDialog` / `Skeleton` / `EmptyState` / `ErrorState` primitives in `@zeno/ui`; `window.confirm` + raw "carregando…" removed.
- [[../specs/2026-04-16-paper-design-system/spec|0017 — Paper Design System]] (2026-04-17) — "Hearty island" Paper file organized (Foundations · Primitives · Patterns · Feature components · Pages) + `packages/ui/DESIGN.md` registry + `ui-in-paper` governance rule.
- [[../specs/2026-04-16-ui-package/spec|0016 — Extract @zeno/ui Package]] (2026-04-17) — shadcn primitives moved to `packages/ui/`; source-consumed via Bundler resolution; tokens CSS ships with the package.
- [[../specs/2026-04-16-dashboard-kebab-case/spec|0015 — Dashboard Kebab-Case Rename]] (2026-04-17) — component filenames under `apps/dashboard/src/components/**` normalized to kebab-case; rule codified in `conventions/code-style.md`.
- [[../specs/2026-04-16-dashboard-logs/spec|0014 — Dashboard Logs (Phase C)]] (2026-04-16) — `/logs` route with filters, SSE live-tail, expandable payload.
- [[../specs/2026-04-16-dashboard-crud/spec|0013 — Dashboard CRUD (Phase B)]] (2026-04-16) — cron create/pause/resume/delete + run-now from the dashboard.
- [[../specs/2026-04-16-dashboard-foundation/spec|0012 — Dashboard Foundation (Phase A)]] (2026-04-16) — Vite + TanStack + shadcn SPA served by the api.
- [[../specs/2026-04-16-mock-backend/spec|0011 — Mock Backend]] (2026-04-16) — `ZENO_BACKEND=mock` for offline dev without OAuth.
- [[../specs/2026-04-16-profile-hot-reload/spec|0010 — Profile Hot Reload]] (2026-04-16) — `profile/` watcher rebuilds the system prompt without restart.
- [[../specs/2026-04-16-cron-scheduled-tasks/spec|0007 — Cron Scheduled Tasks]] (2026-04-16) — `profile/crons.yaml` + chat-source crons with fire-and-forget commands.
- [[../specs/2026-04-16-session-persistence/spec|0006 — Session Persistence]] (2026-04-16) — Slack threadId ↔ Claude SDK sessionId mapping persisted in SQLite.
- [[../specs/2026-04-16-database-foundation/spec|0005 — Database Foundation]] (2026-04-16) — SQLite via `better-sqlite3`; migrations in `packages/storage`.
- [[../specs/2026-04-16-mcp-configuration/spec|0004 — MCP Configuration]] (2026-04-16) — `profile/mcp.json` loader with per-server enable/skip reasons.
- [[../specs/2026-04-16-thread-sessions/spec|0003 — Thread Sessions]] (2026-04-16) — `thread_ts`-keyed session resumption via SDK.
- [[../specs/2026-04-16-dev-workflow/spec|0002 — Dev Workflow]] (2026-04-16) — quality-gate + docker workflow + skill inventory.
- [[../specs/2026-04-15-slack-zeno-mvp/spec|0001 — Slack Zeno MVP]] (2026-04-15) — agente pessoal via Slack que consulta GitHub via Claude Code (OAuth) + `gh` CLI.
