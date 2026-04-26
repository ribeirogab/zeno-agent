---
status: shipped
feature: dashboard-visual-rebuild
created: 2026-04-26
shipped: 2026-04-26
---
# Dashboard Visual Rebuild — Spec

**Status:** Shipped
**Scope:** Rebuild every page in `apps/dashboard` to match `apps/design` visually, using the existing TanStack Query data layer in `apps/dashboard/src/lib/`. Connectors UI is explicitly out of scope (no backend yet). This is "Phase 2" of [[../0030-ui-primitive-lift/spec|spec 0030]] — the foundation lift is done; now the consumer composites get rebuilt against that foundation.

## Context

`apps/design` is the visual catalog (faithful Paper reproduction with mock fixtures); `apps/dashboard` is the production app (real data via TanStack Query against `apps/api`). After spec 0030 lifted the toast subsystem and Imperial Terminal tokens into `@zeno/ui`, both apps now share a primitive foundation — but `apps/dashboard`'s pages still render with their pre-existing layout/styling, which differs from the design catalog.

Spec 0030 explicitly deferred the composite rebuild ("Phase 2") and pre-decided several architectural commitments that this spec inherits without re-litigating: modals use Radix `Dialog` from `@zeno/ui` with controlled `open`/`onOpenChange` (no global `ModalProvider`); skeleton composites live in `apps/dashboard/src/components/skeletons/`; row-types are co-located with their consuming component (no central `data/types.ts`); and the two apps **never import from each other** — they share only through `@zeno/ui`. See `[[../../learnings/apps-design-role-and-ui-boundary]]` for the boundary policy.

`apps/dashboard` currently has ~2634 lines across all routes + components, including:
- 11 routes (login, `/`, `/crons`, `/crons/new`, `/crons/$id`, `/sessions`, `/sessions/$threadId`, `/logs`, `/settings`, plus `__root.tsx` and `_authed.tsx`)
- 7 sub-component domains (home, crons, sessions, logs, settings, layout, skeletons)
- 13 data hooks in `lib/use-*.ts` (`useCrons`, `useCron`, `useSessions`, `useSession`, `useLogs`, `useLogsStream`, `useSettings`, `useActivity`, `useStats`, `useSparkline`, `useNextCrons`, `useHealth`, `useOptimisticMutation`)
- 6 mutation factories in `lib/mutations.ts` (`useCreateCron`, `usePauseCron`, `useResumeCron`, `useDeleteCron`, `useRunNowCron`, `useRestartWorker`) with optimistic updates pre-wired on the cron mutations
- 7 test files (5 lib-helper tests untouched by visual rebuild; `sidebar.test.tsx` and `login.test.tsx` get rewritten alongside their components)

The data layer is solid; what's missing is the composite shell. Rebuilding the composites preserves all existing behavior (optimistic mutations, polling, toast feedback already migrated to `useToast()` from `@zeno/ui`) — only the markup and CSS change.

## Problem Statement

Dashboard's current pages predate the Imperial Terminal design system; they render with rougher visual approximations of what `apps/design` shows. New users hitting the production dashboard see a less polished experience than the design catalog promises. The two apps have drifted in shape too — dashboard has 5 composite skeletons, design has 7+ shaped to specific tables; dashboard has one `<Toaster />` placement, design has the full toast queue; dashboard's sidebar is 131 lines vs design's 252 lines (with status panel + user row + brand crest absent in dashboard). Without convergence, every future visual change has to be done twice and the dashboard never feels finished.

## Non-Goals

- **Touching `apps/design`.** It stays as the canonical visual catalog. Any change there is a separate PR/spec.
- **Touching `@zeno/ui` primitives.** If a primitive needs a new variant to support a design detail, that's a sibling spec — this one only consumes existing primitives.
- **Building any connector UI.** `/dashboard/connectors/*` and the connector-specific modals (`AddCatalogModal`, `AddCustomModal`, `UninstallConnectorModal`, `EditSecretModal`) are deferred until the backend exists. The sidebar nav omits any "connectors" item.
- **Changing the data layer.** `lib/use-*.ts`, `mutations.ts`, `api-client.ts`, `query-client.ts` are not modified. Helper modules (`cron-schedule.ts`, `format-error.ts`, `home-subtitle.ts`, `greeting.ts`) untouched (those were sanitized in spec 0030).
- **Changing routes.** TanStack Router file-based routes stay flat under `_authed/` (`crons.index.tsx`, `crons.$id.tsx`, etc.). The only route deletion is `crons.new.tsx` (folded into a modal opened from `/crons` per the new-cron-flow decision below). `route-tree.gen.ts` regenerates automatically.
- **Adding URL-driven empty-state previews.** Design uses `?empty=1` for catalog browsing; dashboard renders empty states purely from real data shape (`useCrons() returns []`, etc.).
- **Adding pixel-diff automation.** Visual verification is manual side-by-side with `apps/design`.
- **Adding new tests for pure-presentation components.** Only components with non-trivial logic get vitest coverage in this spec.
- **Versioning or stabilizing `@zeno/dashboard` as a published package.** It's an internal app; consumers are the `apps/api` build pipeline only.

## Constraints

- New branch `feat/dashboard-visual-rebuild` from `main`. Commits granular per file inside each phase.
- Dashboard's quality gate (`pnpm --filter @zeno/dashboard lint && typecheck && test && build`) must pass at the end of every phase.
- Composites import `Link` directly from `@tanstack/react-router`. They live inside `apps/dashboard` so the typed router is local. **This supersedes spec 0030's documented "Link by prop" rule for `DashboardSidebar` / `DashboardTopstrip`** — that rule was written when those composites were briefly considered for `@zeno/ui` (which can't depend on the router); since they're staying in `apps/dashboard`, direct import is the right call. Sidebar / topstrip take **no** `Link` prop. Spec 0030's "Link by prop" rule still applies to anything that ever moves into `@zeno/ui`.
- All toast feedback flows through `useToast()` from `@zeno/ui` (already mounted via `<ToastProvider>` in `__root.tsx` per spec 0030). No `sonner` imports anywhere.
- Each phase ends with a manual side-by-side visual verification: dev server for `apps/design` (port 5174) + `apps/dashboard` (port 3000 with `docker:up` running api), eyeball diff, console clean.
- Existing data-layer tests (`tests/lib/*.test.{ts,tsx}` — 5 files) are not touched. Component tests that target rebuilt files (`tests/components/sidebar.test.tsx`, `tests/routes/login.test.tsx`) get rewritten alongside the component in the same phase.

## Architectural Decisions Inherited from Spec 0030

These were ratified in spec 0030 and apply unchanged:

1. **Modal system**: every modal wraps `Dialog` / `AlertDialog` from `@zeno/ui` (Radix-based). No hand-rolled backdrop. Each modal is a self-contained component file.
2. **Modal API**: controlled `{ open, onOpenChange, …spec }`. State is local to the page that opens the modal. No global `ModalProvider` / `useModal()` switchboard.
3. **Skeletons**: layout-shaped composites (e.g. `CronsTableSkeleton`) live in `apps/dashboard/src/components/skeletons/`. The atomic `<Skeleton>` from `@zeno/ui` is the building block.
4. **Row types**: each composite that renders rows defines its own row-type interface co-located with the component. No central `data/types.ts` in `apps/dashboard`. Mappings from `useCrons()` (storage shape) to `CronTableRow` (presentational shape) happen at the component boundary.
5. **No cross-app imports**: `apps/dashboard` never imports from `apps/design` and vice versa. They share only through `@zeno/ui`.

## Decisions Specific to This Spec

Five clarifying questions answered during brainstorming:

1. **Migration strategy**: hybrid — Phase 1 ships the layout (sidebar + topstrip + `_authed.tsx`) which affects all pages; Phases 2–7 rebuild one page each in sequence.
2. **Existing components**: replaced fresh — old composites are deleted, new ones written from scratch using `apps/design` as the visual reference. Tests against deleted components are rewritten in the same phase.
3. **New-cron flow**: modal-only. `/crons/new` route is **deleted**. `<NewCronModal>` opens via local state from `/crons` when the user clicks `+ NEW CRON` — URL stays at `/crons` (matches `apps/design`'s pattern and the user's expressed preference for "no URL change on modal open").
4. **Phase ordering**: by user-flow priority — layout → home → crons → sessions → logs → settings → login. Layout first because it's shared. Login last because dashboard already has Imperial Terminal styling (likely small adjustments only).
5. **Empty home (first-run)**: 2-step adapted welcome — when `useStats().activeCrons === 0 && useActivity()` is empty, render the welcome heading + a 2-step checklist (slack token, first cron). The connector step from `apps/design`'s 3-step empty home is **dropped** since the connectors feature doesn't exist.

## Phase Plan

Each phase ends with: lint + typecheck + test + build green; manual visual verification side-by-side with `apps/design`.

### Phase 1 — Layout

**Surfaces affected**: every authed route (sidebar + topstrip render in `_authed.tsx` layout).

**Files**:
- New: `components/layout/dashboard-sidebar.tsx`, `components/layout/dashboard-topstrip.tsx`
- Modified: `routes/_authed.tsx` (mounts new components)
- Deleted: `components/layout/sidebar.tsx`, `components/layout/layout.tsx`
- Test rewritten: `tests/components/sidebar.test.tsx`

**Data wiring**: `useHealth()` → status panel pills (backend / slack / runner status + uptime).

**Notes**: sidebar nav omits any "connectors" entry (out of scope). 252px sticky width; brand crest + nav (5 items: home, crons, sessions, logs, settings) + status panel + user row.

**Heads-up about the existing test**: `tests/components/sidebar.test.tsx` is already broken before this spec — it imports `@/components/layout/Sidebar` (capital S, the file is lowercase) and asserts uppercase label text (`'Home'`, `'Crons'`, etc.) while the component renders lowercase. Don't waste time trying to make it pass against the current `sidebar.tsx`; rewrite the test against the new `<DashboardSidebar>` and let the old assertions go.

### Phase 2 — Home (`/`)

**Files**:
- Replaced: `components/home/{stat-tile,activity-row,next-cron-item}.tsx`
- Replaced: `components/skeletons/home-skeleton.tsx`
- Replaced: `routes/_authed/index.tsx`

**Data wiring**: `useStats()`, `useActivity()`, `useNextCrons()`, `useSparkline()`. Greeting via `greetingForHour()` + `homeSubtitle()`.

**Layout**: header (kicker, big greeting, subtitle, moon/kernel/thread meta) → 4 stat tiles (active crons / sessions 24h / runs today / failures 24h, with sparklines on tiles that have history) → two-column section: recent activity (left, 6 rows) and what's next (right, upcoming crons).

**Empty state**: when `useStats().activeCrons === 0 && useActivity()` returns `[]`, render `<HomeEmpty>` — welcome heading "Hi alex. Let's wire Zeno up." + 2-step checklist (slack token paste + create first cron).

### Phase 3 — Crons (`/crons`, `/crons/$id`)

**Files**:
- Replaced: `components/crons/{cron-row,cron-row-actions,cron-actions,cron-status-pill,cron-form,schedule-picker,cron-run-history-row}.tsx`
- New: `components/modals/new-cron-modal.tsx`, `components/modals/delete-cron-modal.tsx`
- Replaced: `components/skeletons/{crons-table-skeleton,cron-detail-runs-skeleton}.tsx`
- Replaced: `routes/_authed/crons.index.tsx`, `routes/_authed/crons.$id.tsx`
- **Deleted**: `routes/_authed/crons.new.tsx`

**Data wiring**: `useCrons()`, `useCron(id)`, `useCreateCron`, `useDeleteCron`, `usePauseCron`, `useResumeCron`, `useRunNowCron` (all already in `lib/mutations.ts` with optimistic updates).

**List**: header (kicker, "crons" title, helper text mentioning `static` vs `chat` source) + `+ NEW CRON` button (top-right) opens `<NewCronModal>` controlled by `useState(false)` in the page. Table with columns: name + description, schedule (cron expr + human), next run, source pill, status pill, actions (run / pause-or-resume / del). Row click navigates to `/crons/$id`. Per-row `del` button opens `<DeleteCronModal>` controlled by `useState<Cron | null>(null)`.

**Detail**: breadcrumb + header (cron name, description) + meta bar (cron expr badge + human + status pill + source + next-run countdown) + action buttons (pause, run-now) + prompt block (preformatted, gold left border) + stats strip (4 cells) + run history (expandable rows showing output).

**Empty state**: zero crons → `<CronsEmpty>` (diamond + "No crons yet." + helper + `+ NEW CRON` CTA opens modal).

### Phase 4 — Sessions (`/sessions`, `/sessions/$threadId`)

**Files**:
- Replaced: `components/sessions/{session-row,message-block,tool-call-block}.tsx`
- Replaced: `components/skeletons/sessions-table-skeleton.tsx`, new `components/skeletons/session-transcript-skeleton.tsx`
- Replaced: `routes/_authed/sessions.index.tsx`, `routes/_authed/sessions.$threadId.tsx`

**Data wiring**: `useSessions()`, `useSession(threadId)`.

**List**: header + filter row (search input filters by channel/msg/sess client-side, "X of Y threads" counter) + table (channel + thread, last user message, last activity, msgs count, backend pill).

**Detail**: header (channel + thread ts, session id, message count, backend) + transcript (chronological) showing alternating user/zeno bubbles + tool call blocks (cmd in mono, output indented) + live-row at the end if session is active.

**Empty state**: zero sessions → `<SessionsEmpty>` (diamond + "No threads yet." + helper + status pill "slack listener · ready · waiting for first event").

### Phase 5 — Logs (`/logs`)

**Files**:
- Replaced: `components/logs/{log-row,level-chips,log-search-input,log-json-block,time-range-select,following-toggle}.tsx`
- Replaced: `components/skeletons/log-list-skeleton.tsx`
- Replaced: `routes/_authed/logs.tsx`

**Data wiring**: `useLogs()` for paginated history, `useLogsStream()` for following mode (SSE).

**Layout**: header (kicker "observability", title, helper) + filter row (level chips + search input + range chips) + log list (rows: dot + ts + level + event + msg + cid; click row toggles JSON payload expand) + footer (X of Y log lines · filter summary · sse status).

**Empty state**: zero entries (data or filtered) → `<LogsEmpty>` (diamond + "No log entries in this range." + helper + 2 CTAs: "EXPAND TO 24H" sets range chip + "CLEAR FILTERS" zeroes level/search/range).

### Phase 6 — Settings (`/settings`)

**Files**:
- Replaced: `components/settings/{backend-card,mcp-server-row,profile-file-row,about-row}.tsx`
- New: `components/modals/restart-worker-modal.tsx`
- **Deleted**: `components/settings/restart-dialog.tsx`
- Replaced: `components/skeletons/settings-section-skeleton.tsx`
- Replaced: `routes/_authed/settings.tsx`

**Data wiring**: `useSettings()`, `useRestartWorker()` (already in `lib/mutations.ts`).

**Layout**: header + RESTART WORKER button (opens modal) + 4 sections: backend (single card with active backend + selected-at-boot meta), mcp servers (table from `profile/mcp.json`), profile files (table with paths), about (table with container, runtime, build, etc.).

**Modal**: `<RestartWorkerModal>` with corner brackets (gold), title "Restart the *worker*?", impact list (in-flight turns / slack listener / cron runner / api server), CANCEL / ↻ RESTART WORKER actions.

**Countdown behavior** (decision): the existing `restart-dialog.tsx` runs a 3-step countdown after the user clicks RESTART WORKER (3 → 2 → 1 → mutate, ~700ms each step) so the user can still cancel. **Drop this**. `apps/design`'s `<RestartWorkerModal>` is straight confirm — clicking ↻ RESTART WORKER fires the mutation immediately and closes the modal. Replace, don't preserve, to match design exactly. If the countdown is later valued, it comes back as a new spec/feature, not as a hidden carry-over.

### Phase 7 — Login (`/login`)

**Files**:
- Modified: `routes/login.tsx` (small adjustments — already Imperial Terminal styled)
- Verified: `tests/routes/login.test.tsx` (update assertions if visual structure changes)

**Notes**: lowest expected delta. Current dashboard login has Crest, CornerBrackets, password input with gold focus ring, terminal sequence. Phase 7 = visual diff + tweak anything that doesn't match design's `/dashboard/login`.

## User Stories / Scenarios

1. **As a returning user**, I open `/`, see my current cron count + recent activity + what's coming up next — same layout I see in the catalog. Sparklines on stat tiles match what design shows.
2. **As a first-time user with zero crons**, `/` renders the welcome heading + 2-step checklist instead of the empty stats grid. I can click step 2 → land on `/crons` with the new-cron modal open.
3. **As a user creating a cron**, I click `+ NEW CRON` on `/crons`. The modal opens — URL stays at `/crons`. I fill out name + schedule + prompt, submit. The new cron appears optimistically in the table, modal closes, toast says "*name* · cron created". A failed create shows toast `fail` + the row reverts.
4. **As a user deleting a cron**, I click `del` on a row → `<DeleteCronModal>` opens. Confirm → row disappears optimistically + toast.
5. **As an admin restarting the worker**, I click RESTART WORKER on `/settings` → modal with impact list opens. Confirm → toast `restarting worker…`.
6. **As a debugger**, I open `/logs`, filter by level=error and time=24h. Empty state appears with "EXPAND TO 24H" CTA → click → range chips switch.
7. **As a code reviewer of this PR**, I see one PR per phase (or one big PR with phase-tagged commits). Visual diff is verified manually side-by-side; quality gate is green.

## Success Criteria

1. All 7 phase deliverables shipped: every page in `apps/dashboard` (`/`, `/crons`, `/crons/$id`, `/sessions`, `/sessions/$threadId`, `/logs`, `/settings`, `/login`) visually matches the corresponding `apps/design` page.
2. Empty states render dynamically (skeleton during loading; empty card when query returns `[]`; data when populated). No flash of empty card during loading.
3. CRUD on `/crons` works end-to-end with optimistic mutations and toast feedback (success + fail paths).
4. `<RestartWorkerModal>` calls the same endpoint as `<RestartDialog>` (`POST /api/settings/restart`); old `restart-dialog.tsx` is deleted.
5. `/crons/new` route is deleted; navigation to `/crons` + button click opens the new-cron modal.
6. `pnpm --filter @zeno/dashboard lint && typecheck && test && build` is green at the end of every phase.
7. `apps/design` renders identically before and after this work (smoke screenshot at start, smoke screenshot at end of all phases).
8. Sidebar shows 5 nav items (home, crons, sessions, logs, settings); no "connectors" entry until that feature exists.
9. Spec doc reviewed by `spec-document-reviewer` (Approved) and user-approved before implementation begins.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Rebuilt composite drops a behavior the existing one had (focus management, keyboard nav, ARIA, polling cadence). | Before deleting each component, read the source carefully; enumerate non-obvious behaviors; reproduce in the new component. Smoke test the page after each phase. |
| A primitive in `@zeno/ui` needs a variant the design uses but the lib doesn't expose. | Stop the phase, file a sibling spec for the primitive change (or extend `@zeno/ui` in a separate commit), then resume. Don't hack visuals into the dashboard composite. |
| Test rewrite (`sidebar.test.tsx`, `login.test.tsx`) introduces a regression. | Tests get rewritten in the same phase as their target component. Quality gate at end of phase catches it before next phase starts. |
| `/crons/new` route deletion breaks a link or bookmark. | Phase 3 starts with `grep -rn "/crons/new" apps/dashboard/src` to find any remaining references; update them in the same phase. |
| Optimistic mutation interactions break because new component calls hook differently. | Data layer (`mutations.ts`, `useOptimisticMutation`) is **untouched**. New components import the same hooks; behavior is preserved by construction. |
| Empty state flashes during loading. | Always render skeleton when `isLoading` is true; only render empty card when `!isLoading && data?.length === 0`. Pattern enforced in every page. |
| Sidebar nav drift between this rebuild and a future connectors phase. | Sidebar accepts an internal `NAV_ITEMS` array; adding connectors later is a one-line addition + a new route. No hardcoded N=5 anywhere. |
| Long-running phases get blocked by an unrelated `quality-gate` failure (storage / worker lint). | Filter the gate to dashboard during phase work: `pnpm --filter @zeno/dashboard ...`. Only run the full `pnpm run quality-gate` at the very end (and only block on dashboard's status). |

## Open Questions

- [NEEDS CLARIFICATION: do the existing optimistic-mutation success toasts inside `useOptimisticMutation` stay where they are, or move to call sites? The current pattern (toast inside the hook via `successToast: 'cron created'`) is convenient but couples toast wording to mutation config. Resolution at start of Phase 3 — just inspect and decide; doesn't block design.]
- [NEEDS CLARIFICATION: should the welcome empty home's "paste slack token" step (step 1 of 2) link to a real UI for token entry, or just to docs? There's no token-entry UI today. Default: link to docs / show inline `.env` instructions; full UI is a separate spec if it ever happens.]
- [NEEDS CLARIFICATION: does `/login` need the small terminal-sequence animation (sequence of "handshake · ok / hmac · validating…" messages on submit) that exists in the current dashboard login? It's not visible in design's `/dashboard/login` static artboard. Phase 7 decision — keep if cute, drop if it breaks the design match.]

None of these block the design — all resolve during the implementation phase by direct inspection.
