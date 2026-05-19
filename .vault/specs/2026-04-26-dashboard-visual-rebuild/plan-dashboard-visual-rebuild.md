---
feature: dashboard-visual-rebuild
spec: "[[spec-dashboard-visual-rebuild]]"
created: 2026-04-26
---
# Dashboard Visual Rebuild — Implementation Plan

> **For agentic workers:** Steps live in `[[tasks-dashboard-visual-rebuild]]` and use checkbox (`- [ ]`) syntax. Branch: `feat/dashboard-visual-rebuild` (newly created from `main`). Each phase ends with a quality gate (lint + typecheck + test + build on `apps/dashboard`) and a manual visual verification side-by-side with `apps/design`.

**Goal:** Rebuild every page in `apps/dashboard` to match `apps/design` visually, using the existing TanStack Query data layer. Connectors UI is out of scope.

**Architecture:** 7-phase rebuild. Phase 1 ships layout (sidebar + topstrip) which is shared by every authed page. Phases 2–7 rebuild one page each in user-flow order: home → crons → sessions → logs → settings → login. Inherits architectural commitments from spec 0030 (Radix Dialog modals, controlled API, skeletons in `components/skeletons/`, row types co-located, no cross-app imports). Composites in `apps/dashboard` import `Link` directly from `@tanstack/react-router` (the router is local; supersedes 0030's "Link by prop" for sidebar/topstrip).

**Tech Stack:** React 19, TanStack Router (file-based routes, typed `Link`), TanStack Query (data hooks pre-wired), `@zeno/ui` primitives (Button, Pill, Dot, Skeleton, Crest, Losango, Spark, Input, EmptyState, ErrorState, CornerBrackets, Chip, Dialog, AlertDialog, ToastProvider, Toaster, useToast), Tailwind v4 with `@import "@zeno/ui/styles/tokens.css"`, biome lint, vitest + happy-dom.

**Spec reference:** `[[spec-dashboard-visual-rebuild]]` (`context/specs/2026-04-26-dashboard-visual-rebuild/spec.md`).

---

## Approach

The data layer is already complete and battle-tested: 13 hooks in `apps/dashboard/src/lib/use-*.ts` cover every query the dashboard performs against `apps/api`, and 6 mutation factories in `lib/mutations.ts` already implement optimistic updates with cache invalidation via `useOptimisticMutation`. Toast feedback flows through `@zeno/ui`'s `useToast()` (migrated in spec 0030). The composite shell is what's missing — sidebar / topstrip / per-page composites / modals / skeletons that match `apps/design`'s Imperial Terminal styling.

For each phase, we **delete the existing composites fresh** (chosen during brainstorming over refactor-in-place to avoid contamination from old layout choices) and write new ones using `apps/design` as the visual reference. The rebuilt component imports the same data hook the deleted one used; behavior is preserved by construction. Tests that target deleted composites (`tests/components/sidebar.test.tsx`, `tests/routes/login.test.tsx`) are rewritten in the same phase as the component.

For modals, the spec is unambiguous: each is its own file under `components/modals/`, wraps Radix `Dialog` (or `AlertDialog` for destructive), takes `{ open, onOpenChange, …spec }` props, and is mounted by the page that opens it via `useState` controlled state. No global `ModalProvider`. The existing `restart-dialog.tsx`'s 3-step countdown is dropped — design's `<RestartWorkerModal>` is straight confirm.

For empty states, every page renders one of three branches based on data shape:
- `isLoading` → skeleton component
- `data?.length === 0` (or equivalent for non-array) → empty card
- otherwise → populated content

The `?empty=1` URL preview from `apps/design` is catalog-only and never enters dashboard.

The `/crons/new` route is deleted — spec 0030 + this spec's brainstorming both confirm modals don't change URL. `<NewCronModal>` opens via local state in `crons.index.tsx` when the user clicks `+ NEW CRON`.

## Architecture

```
apps/dashboard
   ├──→ @zeno/ui                     (primitives + tokens.css + toast)
   ├──→ @tanstack/react-router       (typed Link + route tree)
   └──→ @tanstack/react-query        (data hooks already wired)

apps/design                          (untouched — visual reference only)
   └──→ @zeno/ui

(no cross-app imports between apps/design and apps/dashboard)
```

**Per-page render contract** (every page in `_authed/*` follows the same shape):

```tsx
function PageScreen() {
  const { data, isLoading } = useResource();   // existing hook from lib/use-*.ts

  if (isLoading) return <ResourceSkeleton />;  // composite from components/skeletons/
  if (!data || data.length === 0) return <ResourceEmpty />;  // co-located with page
  return <ResourceContent data={data} />;
}
```

**Per-modal contract**:

```tsx
// page that opens the modal
function CronsListScreen() {
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Cron | null>(null);
  const createCron = useCreateCron();
  const deleteCron = useDeleteCron();

  return (
    <>
      <CronsTable
        crons={crons}
        onNewCron={() => setShowNew(true)}
        onDelete={(cron) => setPendingDelete(cron)}
      />
      <NewCronModal
        open={showNew}
        onOpenChange={setShowNew}
        onCreate={(input) => createCron.mutateAsync(input)}
      />
      <DeleteCronModal
        open={pendingDelete !== null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        cron={pendingDelete}
        onConfirm={() => {
          if (pendingDelete) deleteCron.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
```

## File Structure

### Files created

| Path | Responsibility |
|---|---|
| `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` | 252px sticky sidebar — brand crest + nav (5 items) + status panel (`useHealth()`) + user row |
| `apps/dashboard/src/components/layout/dashboard-topstrip.tsx` | Sticky top bar — breadcrumb + ⌘K hint |
| `apps/dashboard/src/components/modals/new-cron-modal.tsx` | New-cron modal — name, schedule, source toggle, notify channel, prompt; submit calls `onCreate` |
| `apps/dashboard/src/components/modals/delete-cron-modal.tsx` | Destructive delete confirmation with summary list of what gets deleted |
| `apps/dashboard/src/components/modals/restart-worker-modal.tsx` | Gold runtime confirm (no countdown) — title, impact list, CANCEL / RESTART WORKER |
| `apps/dashboard/src/components/skeletons/crons-table-skeleton.tsx` | Table-shaped skeleton matching the rebuilt CronsTable layout |
| `apps/dashboard/src/components/skeletons/sessions-table-skeleton.tsx` | Sessions list skeleton |
| `apps/dashboard/src/components/skeletons/cron-detail-runs-skeleton.tsx` | Run history skeleton (rows, last-row no-border) |
| `apps/dashboard/src/components/skeletons/session-transcript-skeleton.tsx` | Transcript skeleton (alternating bubbles) |

### Files replaced (delete + rewrite)

| Path | Phase | Notes |
|---|---|---|
| `apps/dashboard/src/components/home/{stat-tile,activity-row,next-cron-item}.tsx` | 2 | Match design's home layout |
| `apps/dashboard/src/components/skeletons/home-skeleton.tsx` | 2 | Header + 4 stat tiles + 2-column section |
| `apps/dashboard/src/routes/_authed/index.tsx` | 2 | Adds empty-home branch when `useStats().activeCrons === 0` |
| `apps/dashboard/src/components/crons/{cron-row,cron-row-actions,cron-actions,cron-status-pill,cron-form,schedule-picker,cron-run-history-row}.tsx` | 3 | All 7 cron composites |
| `apps/dashboard/src/components/skeletons/cron-list-skeleton.tsx` | 3 | Renamed → `crons-table-skeleton.tsx` |
| `apps/dashboard/src/routes/_authed/crons.index.tsx` | 3 | Mounts `<NewCronModal>` + `<DeleteCronModal>` via local state |
| `apps/dashboard/src/routes/_authed/crons.$id.tsx` | 3 | Detail with prompt block, stats strip, run history |
| `apps/dashboard/src/components/sessions/{session-row,message-block,tool-call-block}.tsx` | 4 | All 3 session composites |
| `apps/dashboard/src/components/skeletons/session-list-skeleton.tsx` | 4 | Renamed → `sessions-table-skeleton.tsx` |
| `apps/dashboard/src/routes/_authed/sessions.{index,$threadId}.tsx` | 4 | List + transcript |
| `apps/dashboard/src/components/logs/{log-row,level-chips,log-search-input,log-json-block,time-range-select,following-toggle}.tsx` | 5 | All 6 log composites |
| `apps/dashboard/src/components/skeletons/log-list-skeleton.tsx` | 5 | Row skeletons matching log layout |
| `apps/dashboard/src/routes/_authed/logs.tsx` | 5 | Filter row + log list + footer + empty branch |
| `apps/dashboard/src/components/settings/{backend-card,mcp-server-row,profile-file-row,about-row}.tsx` | 6 | All 4 settings composites |
| `apps/dashboard/src/components/skeletons/settings-skeleton.tsx` | 6 | Renamed → `settings-section-skeleton.tsx` |
| `apps/dashboard/src/routes/_authed/settings.tsx` | 6 | Mounts `<RestartWorkerModal>` via local state |
| `apps/dashboard/src/routes/login.tsx` | 7 | Modify in place — small visual adjustments |
| `apps/dashboard/tests/components/sidebar.test.tsx` | 1 | Rewritten against `<DashboardSidebar>` |
| `apps/dashboard/tests/routes/login.test.tsx` | 7 | Updated assertions if structure changed |

### Files deleted

| Path | Reason |
|---|---|
| `apps/dashboard/src/components/layout/sidebar.tsx` | Replaced by `dashboard-sidebar.tsx` |
| `apps/dashboard/src/components/layout/layout.tsx` | Folded into `_authed.tsx` |
| `apps/dashboard/src/routes/_authed/crons.new.tsx` | Folded into `<NewCronModal>` opened from `/crons` |
| `apps/dashboard/src/components/settings/restart-dialog.tsx` | Replaced by `restart-worker-modal.tsx` |

### Files modified (no rewrite)

| Path | Phase | Change |
|---|---|---|
| `apps/dashboard/src/routes/_authed.tsx` | 1 | Mounts new sidebar + topstrip |
| `apps/dashboard/src/routes/__root.tsx` | — | Already has `<ToastProvider>` from spec 0030 |

### Files untouched

- All 13 data hooks in `apps/dashboard/src/lib/use-*.ts`
- All 6 mutation factories in `apps/dashboard/src/lib/mutations.ts`
- `apps/dashboard/src/lib/{api-client,query-client,format-error,cron-schedule,greeting,home-subtitle,invalidate-soon,log-filters,temp-id}.ts`
- `apps/dashboard/src/components/icons.tsx` (icons already match design vocabulary)
- `apps/dashboard/src/styles/globals.css` (already imports `@zeno/ui/styles/tokens.css` from spec 0030)
- `apps/dashboard/src/route-tree.gen.ts` (auto-regenerates when routes change)
- `apps/dashboard/{tsconfig,vite.config,package}.json`
- All 5 lib-helper test files (`tests/lib/*.test.{ts,tsx}`)
- `packages/ui/*` (this spec only consumes; no new primitives)
- `apps/design/*` (untouched per spec)

## Phase Ordering

| Phase | Surface | Depends on |
|---|---|---|
| 1 | Layout (sidebar + topstrip + `_authed.tsx`) | — |
| 2 | Home (`/`) | 1 |
| 3 | Crons (`/crons`, `/crons/$id`) | 1 |
| 4 | Sessions (`/sessions`, `/sessions/$threadId`) | 1 |
| 5 | Logs (`/logs`) | 1 |
| 6 | Settings (`/settings`) | 1 |
| 7 | Login (`/login`) | — (independent of `_authed.tsx`) |

Each phase ends in a green build state. Quality gate at end of phase: `pnpm --filter @zeno/dashboard lint && typecheck && test && build`. If a phase fails its gate, fix before advancing — never carry red into the next phase.

Manual visual verification at end of each phase: open `apps/design` (port 5174 via `pnpm --filter @zeno/design dev`) + `apps/dashboard` (port 3000 via `pnpm run docker:up`) side by side, navigate to the corresponding route, eyeball-diff. Console clean in both browsers.

## Risks / Open Decisions

Three open questions resolve during implementation, all in early phases:

1. **`useOptimisticMutation`'s `successToast` config string vs call-site toast** — the data layer has both patterns coexisting today. Phase 3 inspects each cron mutation's call site and decides whether to keep the config-driven toast or move it to the page handler. Doesn't block design; doesn't gate Phase 3 start.
2. **Empty-home "paste slack token" step destination** — there's no token-entry UI today. Phase 2 default: link to docs / inline `.env` instructions. If a real UI is wanted, separate spec.
3. **Login terminal-sequence animation** — the existing dashboard login plays a sequence of mock terminal messages on submit (`handshake · ok / hmac · validating…`). Design's `/dashboard/login` static artboard doesn't show this. Phase 7 decision: keep if it doesn't fight the design match, drop if it does.

Other risks already covered by spec 0031's Risks section (component behavior regression, primitive needs new variant, optimistic mutation interactions, sidebar nav drift) — mitigations documented there.

## Out of Scope (recap from spec)

- No connector UI work, no "connectors" sidebar item, no connector modals
- No data-layer changes (hooks, mutations, api-client all untouched)
- No `@zeno/ui` primitive changes
- No `apps/design` changes
- No automated pixel-diff tooling
- No new tests for pure-presentation components
- No route changes beyond deleting `crons.new.tsx`
