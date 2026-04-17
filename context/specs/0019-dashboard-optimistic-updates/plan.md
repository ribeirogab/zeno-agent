---
feature: dashboard-optimistic-updates
spec: "[[spec]]"
created: 2026-04-17
---
# Dashboard Optimistic Updates — Plan

**For this spec:** `[[spec]]`

**Goal:** Ship `useOptimisticMutation` as the default mutation pattern; migrate the five cache-affecting cron mutations; verify the instant-feedback UX with Playwright.

**Architecture:** One primitive wraps `useMutation` + declarative cache changes + auto snapshot/rollback + `invalidateSoon` + toasts. Each migrated mutation becomes ~10 lines of config. Temp IDs (`tmp_...`) let inserts (create, run-now) paint a provisional row that the invalidate replaces with the server row.

**Tech Stack:** TanStack Query v5 (existing), sonner (existing), Playwright MCP for smoke.

## Approach

Five phases, each a single commit:

1. **Primitive** — `use-optimistic-mutation.ts` + extracted `format-error.ts` + `temp-id.ts` + unit tests covering optimistic success, rollback, cancel-in-flight, degrade-without-optimistic.
2. **Migration** — rewrite the five cache-affecting mutations in `mutations.ts` to use the primitive. `useRestartWorker` stays. Run quality-gate.
3. **Temp-row visual polish** — `CronRow` + `CronRunHistoryRow` detect `id.startsWith('tmp_')` and apply `opacity-60 pointer-events-none`.
4. **Docs** — `context/conventions/code-style.md` section + `context/learnings/optimistic-mutation-pattern.md`.
5. **Playwright smoke** — `docker:build && docker:up`, run through the five scenarios, assert instant UI. Screenshot each.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `apps/dashboard/src/lib/use-optimistic-mutation.ts` | The primitive. |
| `apps/dashboard/src/lib/format-error.ts` | Shared error message formatter (was inline). |
| `apps/dashboard/src/lib/temp-id.ts` | `tempId(prefix)` for provisional IDs. |
| `apps/dashboard/tests/lib/use-optimistic-mutation.test.ts` | Unit tests. |
| `context/learnings/optimistic-mutation-pattern.md` | Project learning. |

### EDIT

| File | Change |
|---|---|
| `apps/dashboard/src/lib/mutations.ts` | 5 mutations rewritten atop primitive; `formatError` import from new location. |
| `apps/dashboard/src/components/crons/cron-row.tsx` | Dim temp rows. |
| `apps/dashboard/src/components/crons/cron-run-history-row.tsx` | Dim temp runs. |
| `context/conventions/code-style.md` | Add optimistic-mutation section. |
| `context/_index/conventions.md` | Link the new section. |
| `context/_index/learnings.md` | Link the new learning. |

## Phase Ordering

Strict: primitive → migration → polish → docs → smoke. Each phase has a green quality-gate checkpoint before committing.

## Risks / Open Decisions

- See spec.md "Risks and Mitigations" + "Open Questions".
- Plan-time decision: keep `formatError` extraction tight — one file, one export. Don't turn it into a mini error-formatting library.
- Plan-time decision: temp-row polish lands in Phase 3 and is ~8 lines across two files. If it starts to feel invasive, defer to a follow-up.
