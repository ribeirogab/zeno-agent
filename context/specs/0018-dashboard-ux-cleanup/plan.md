---
feature: dashboard-ux-cleanup
spec: "[[spec]]"
created: 2026-04-16
---
# Dashboard UX Cleanup — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (new primitives + multi-file refactor across `@zeno/ui` + dashboard + Paper). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace every native browser affordance (`window.confirm`) and every ad-hoc `<span>carregando…</span>` across the dashboard with proper primitives. Add `AlertDialog`, `Skeleton`, `EmptyState`, `ErrorState` to `@zeno/ui` with Paper frames and registry rows. Refactor 7+ dashboard files to use the new primitives.

**Architecture:** 4 new primitives added to `@zeno/ui` following the same source-only pattern as the existing 4. `AlertDialog` wraps `@radix-ui/react-alert-dialog` (new runtime dep). `Skeleton`/`EmptyState`/`ErrorState` are plain Tailwind components. Each primitive lands in Paper (per rule `ui-in-paper.md`) **before** code, then in `DESIGN.md`, then in code. Refactor consumes the new primitives in the dashboard.

**Tech Stack:** `@radix-ui/react-alert-dialog` (new dep — 1.1.x, aligned with dialog v1.1.15), existing Tailwind tokens, Paper MCP.

## Approach

Five phases. Primitives first (Paper → registry → code), refactor second, smoke third.

1. **Paper frames + registry rows** — for all 4 new primitives. Governance rule requires this before the code lands.
2. **Add primitives to `@zeno/ui`** — TDD for `AlertDialog` (interactive), render-only smoke for `Skeleton`/`EmptyState`/`ErrorState`. Install Radix alert-dialog dep.
3. **Refactor `cron-actions.tsx`** — replace `window.confirm` with `AlertDialog`. Smallest diff, proves the primitive works end-to-end.
4. **Refactor loading/empty/error states across 8 call sites** — use Skeleton/EmptyState/ErrorState consistently. Compose feature-level skeletons (`cron-list-skeleton`, `log-list-skeleton`) in `apps/dashboard/src/components/skeletons/`.
5. **Audit + Docker smoke + PR** — grep for leftovers (`window.*`, raw "carregando"), run full route walk, push, open PR.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `packages/ui/src/components/alert-dialog.tsx` | Destructive-confirmation modal wrapping `@radix-ui/react-alert-dialog` |
| `packages/ui/src/components/skeleton.tsx` | Generic shimmering block; CSS-only pulse |
| `packages/ui/src/components/empty-state.tsx` | Centered "nothing here yet" panel with title/desc/action |
| `packages/ui/src/components/error-state.tsx` | Centered "something went wrong" panel with optional retry |
| `packages/ui/tests/alert-dialog.test.tsx` | TDD — open/cancel/action flows |
| `packages/ui/tests/states.test.tsx` | Smoke renders for Skeleton / EmptyState / ErrorState |
| `apps/dashboard/src/components/skeletons/cron-list-skeleton.tsx` | Composed skeleton rows for Crons list |
| `apps/dashboard/src/components/skeletons/log-list-skeleton.tsx` | Composed skeleton rows for Logs list |
| `apps/dashboard/src/components/skeletons/session-list-skeleton.tsx` | Composed skeleton rows for Sessions list |
| `apps/dashboard/src/components/skeletons/settings-skeleton.tsx` | Composed skeleton panels for Settings |
| `apps/dashboard/src/components/skeletons/home-skeleton.tsx` | Stat row + activity row skeletons |
| `tmp/audit-porco-ux.sh` | One-shot audit grep (disposable) |

### EDIT

| File | Change |
|---|---|
| `packages/ui/package.json` | Add `@radix-ui/react-alert-dialog` dep |
| `packages/ui/src/index.ts` | Re-export the 4 new primitives |
| `packages/ui/DESIGN.md` | 4 new rows in Primitives table |
| `apps/dashboard/src/components/crons/cron-actions.tsx` | Replace `window.confirm` with `AlertDialog` wrapping existing Button |
| `apps/dashboard/src/routes/_authed/crons.index.tsx` | Replace "carregando…" with `<CronListSkeleton/>`; empty → `<EmptyState>` |
| `apps/dashboard/src/routes/_authed/crons.$id.tsx` | Skeleton on load; `<ErrorState onRetry={query.refetch}>` on error |
| `apps/dashboard/src/routes/_authed/sessions.index.tsx` | Skeleton + EmptyState |
| `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx` | Skeleton on load; ErrorState on error |
| `apps/dashboard/src/routes/_authed/settings.tsx` | Skeleton on load |
| `apps/dashboard/src/routes/_authed/index.tsx` | Home skeleton + ErrorState for activity |
| `apps/dashboard/src/routes/_authed/logs.tsx` | Skeleton on historical load; ErrorState on historical fail; EmptyState when filtered list is empty |
| `apps/dashboard/src/lib/home-subtitle.ts` | Return `''` when stats null (caller renders Skeleton) |

## Phase Ordering

Strict: Phase 1 (Paper) → Phase 2 (primitives in code) → Phase 3 (cron-actions refactor) → Phase 4 (skeleton/empty/error refactors) → Phase 5 (audit + smoke + PR).

Per the rule `context/rules/ui-in-paper.md`, primitives must exist in Paper before the code. Enforced by ordering, not by CI.

## Risks / Open Decisions

- **AlertDialog `asChild` pattern.** The Radix pattern wraps a native `Trigger`/`Action`/`Cancel` with the app's existing `Button` via `asChild`. Keeps variant styling consistent. See `cron-actions.tsx` snippet in spec.
- **Default `Action` variant.** Use `variant="accent"` (coral) for destructive emphasis; callers can override. Consider documenting this in `AlertDialog`'s JSDoc.
- **Skeleton sizing.** Match real row heights so the layout doesn't jump when data loads. Concrete sizes land in the composed skeletons (Phase 4), not the primitive.
- **`aria-busy` on Skeleton.** The primitive sets `aria-busy="true"` + `aria-live="polite"`. Screen readers announce loading. Low ROI for single-user, but cheap.
- **Sonner interaction with AlertDialog.** The success toast after delete (`toast.success('cron removido')`) keeps working; it's triggered by the mutation's `onSuccess`, not tied to the modal's close. Verify during Phase 3 smoke.
- **Home subtitle empty-string.** `home-subtitle.ts` returns `''`; `routes/_authed/index.tsx` must detect empty and render a Skeleton instead. One-line change.
- **Error-retry infinite loop.** `ErrorState.onRetry` just calls `query.refetch()`; no automatic retry. Safe because the user clicks deliberately.
- **Test flake on async portals.** Use `findByRole` (async) with `@testing-library/user-event` for modal tests. Sync `getByRole` will miss the portal before it mounts.
