---
status: shipped
feature: ui-primitive-lift
created: 2026-04-26
shipped: 2026-04-26
---
# UI Primitive Lift — Spec

**Status:** Shipped
**Scope:** Lift the toast system from `apps/design` into `@zeno/ui` as a generic primitive, reconcile design tokens between the two so `apps/design` consumes `@zeno/ui/styles/tokens.css`, and document — without implementing — the future composite migration that will populate `apps/dashboard` with sidebar/topstrip/modals/skeletons matching the design catalog.

## Context

Today the project has three places where UI lives:

- **`packages/ui`** (`@zeno/ui`) — generic primitives: `Button`, `Pill`, `Dot`, `Skeleton`, `Crest`, `Losango`, `Spark`, `Input`, `EmptyState`, `ErrorState`, `CornerBrackets`, `Chip`, `Dialog`/`AlertDialog` (Radix wrappers), and `tokens.css`. Already in use by `apps/dashboard` (9 atoms imported across components/). Has its own vitest suite.
- **`apps/design`** (`@zeno/design`) — the visual design catalog. ~50 files. Faithfully reproduces every Paper artboard: `DashboardSidebar`, `DashboardTopstrip`, 8 modals (new-cron, delete-cron, edit-secret, restart-worker, uninstall-connector, add-catalog, add-custom, modal-shell), 3 explicit skeleton composites + 6 inline skeletons, `CatalogGrid`, custom `lib/toast.tsx` with `ToastProvider`/`useToast()`, custom `lib/modal.tsx` with `ModalProvider`/`useModal()`/`ModalSpec` switchboard. Self-contained tokens in `globals.css` (intentionally does not import from `@zeno/ui`). Routes under `/dashboard/...`.
- **`apps/dashboard`** (`@zeno/dashboard`) — the production app. ~70 files. Has its own sidebar (~150 lines), its own composite skeletons, all hooks for TanStack Query / mutations / api-client, `restart-dialog.tsx` using `@zeno/ui`'s `Dialog`. Routes flat (`/`, `/crons`, `/sessions`…).

Two parallel UI implementations have drifted. The dashboard's pages don't visually match the design catalog. Each app has its own toast (design = custom, dashboard = `sonner` declared but unused), its own composite skeletons, its own sidebar.

The natural impulse is to lift everything from `apps/design` into `@zeno/ui` and wire both apps to consume from there. This impulse is wrong: `@zeno/ui` is a **generic primitives library** intended to be reusable by any project (other internal Zeno tools, future agents). It should not contain `NewCronModal` or `DashboardSidebar` — those are Imperial Terminal composites specific to the Zeno dashboard.

This spec separates "what is genuinely a primitive" (small, lift now) from "what is a project-specific composite" (document, build later in `apps/dashboard`). Crucially: `apps/design` and `apps/dashboard` will share **only `@zeno/ui`**. They never import from each other.

## Problem Statement

The toast implementation in `apps/design/src/lib/toast.tsx` is a generic UI primitive (provider + hook + visual bar component, ~150 lines), but it lives inside an app rather than the shared UI library. Tokens are duplicated between `packages/ui/src/styles/tokens.css` and `apps/design/src/styles/globals.css` — with small but real divergences (canvas color: `#0A0A10` in ui vs `#08090F` in design; ui has `--color-hairline` and pulse animations, design has caret animation; ui-only vs design-only). `apps/dashboard` has `sonner` declared but no proven consumer.

Without resolving this, future composite work (Phase 2: sidebar, modals, skeletons in `apps/dashboard`) has no clear primitive foundation to build on, and the design app cannot serve as a reliable smoke test for the shared visual layer.

## Non-Goals

- **Moving any composite to `@zeno/ui`.** No `NewCronModal`, `DashboardSidebar`, `CronsTableSkeleton`, or `CatalogGrid` go to the primitives library. `@zeno/ui` stays project-agnostic.
- **Building composites in `apps/dashboard`.** Sidebar, modals, skeletons, catalog grid for the dashboard are explicitly Phase 2 — a future spec implements them after this foundation lands.
- **Refactoring `apps/dashboard` pages to match `apps/design` visually.** Phase 2 territory.
- **Cross-app imports.** `apps/design` never imports from `apps/dashboard` and vice versa. They share only `@zeno/ui`.
- **Refactoring `apps/design` beyond toast/tokens.** The 8 modals, sidebar, topstrip, skeletons, catalog grid in `apps/design` stay exactly where they are. Their internal API and call sites do not change.
- **Removing `apps/design`'s custom `lib/modal.tsx` (`ModalProvider`/`useModal`/`ModalSpec`).** Stays in design — it's used by the design's composites which stay in design.
- **Refactoring design's modals onto Radix `Dialog`.** Stays as `ModalShell` in design. Future dashboard composites use Radix Dialog (documented decision below) but design is untouched.
- **Connectors feature.** No backend, no dashboard UI. The design's connector pages stay as visual catalog entries.
- **Adding new primitives beyond toast.** No `<SidebarShell>` generic, no `<TableRowSkeleton>` primitive — those are over-engineering for a need that doesn't exist yet.
- **Creating any new package** beyond modifying `@zeno/ui`.
- **Changing routes** in either app. URLs stay as today.
- **Adding semver / versioning** to `@zeno/ui`. Internal monorepo, callers update with the package.

## Constraints

- Branch: work happens on `feat/apps-design` (existing). No new branch.
- `@zeno/ui`'s peer dependencies stay React-only. No `@tanstack/react-router`, no data-fetch libraries, no app-specific code.
- Visual: `apps/design` must look identical before and after the lift. The toast component, in particular, must render with the same Imperial Terminal styling (gold barlight, mono uppercase variant labels, 4s auto-dismiss, optional action button).
- API: the `useToast()` API must remain `{ success, warn, fail, dismiss }` so design's ~20 call sites compile unchanged after fixing import paths.
- Quality gate: `pnpm run quality-gate` (lint + typecheck + test across all workspaces) must pass at PR-ready state.
- Tests: every new component in `@zeno/ui` (the toast subsystem) must have at least one vitest file covering observable behavior (renders without errors, queue add/remove, auto-dismiss timing, ESC dismissal, action-button callback).

## User Stories / Scenarios

This spec primarily benefits other engineers / future-self, not end users. Scenarios are observable through code:

1. **As an engineer working on a new internal tool**, I install `@zeno/ui` and import `{ ToastProvider, Toaster, useToast }` to get Imperial Terminal toast notifications without copying code from `apps/design` or pulling `apps/dashboard` as a dep.
2. **As an engineer working on the design catalog**, I open `apps/design`, edit a route, and see toast notifications fire identically to before — the migration is invisible to my workflow.
3. **As an engineer maintaining the design tokens**, I change `--color-canvas` in `packages/ui/src/styles/tokens.css` once, and both `apps/design` and `apps/dashboard` pick it up because both import the same file.
4. **As an engineer starting Phase 2 (dashboard composites)**, I read this spec's documented inventory + decisions and know exactly what to build, with what API, on what foundation, in `apps/dashboard/src/components/`.
5. **As a code reviewer of Phase 2's PR**, I check that each new composite (a) imports primitives from `@zeno/ui`, (b) does not import from `apps/design`, (c) follows the documented architectural decisions (Radix Dialog for modals, controlled modal API, Link by prop, row types co-located).

## Architectural Decisions (for reference + future Phase 2)

These decisions came from the brainstorming session. They are recorded here as the contract Phase 2 must follow when it builds the composites in `apps/dashboard`.

### Modal system — Radix `Dialog`

When Phase 2 builds the modals in `apps/dashboard`, they wrap `Dialog` / `AlertDialog` from `@zeno/ui` (Radix-based, with focus trap, scroll lock, and ARIA). They do **not** use the hand-rolled `ModalShell` pattern from `apps/design`.

### Modal API — controlled, no global provider

Each modal accepts `open` and `onOpenChange` props. No `useModal()` global state. State is local to the component that opens the modal:

```tsx
function CronRow({ cron, onDelete }) {
  const [showDelete, setShowDelete] = useState(false);
  return (
    <>
      <button onClick={() => setShowDelete(true)}>del</button>
      <DeleteCronModal
        open={showDelete}
        onOpenChange={setShowDelete}
        name={cron.name}
        onConfirm={() => onDelete(cron.id)}
      />
    </>
  );
}
```

### Routing — `Link` by prop

Composite components in `apps/dashboard` accept the `Link` component as a prop instead of importing `@tanstack/react-router` directly. This is also the policy any future `@zeno/ui` component that needs navigation must follow:

```tsx
export interface DashboardSidebarProps {
  items: SidebarItem[];
  active: string;
  Link: ComponentType<{ to: string; activeProps?: …; children: ReactNode; className?: string }>;
  runtime: RuntimeStatus;
  user: { name: string; subtitle?: string };
}
```

`SidebarItem` is `{ id: string; label: string; shortcut?: string; to: string; badge?: number }`.

### Skeletons — composites in `apps/dashboard`

The atomic `<Skeleton>` stays in `@zeno/ui`. Layout-shaped skeletons (`<CronsTableSkeleton>`, `<SessionsTableSkeleton>`, `<LogListSkeleton>`, `<HomeSkeleton>`, `<SettingsSectionSkeleton>`, `<CronDetailRunsSkeleton>`, `<SessionTranscriptSkeleton>`) are composites that compose `<Skeleton>` and live in `apps/dashboard/src/components/skeletons/`.

### Row types — co-located, not central

Each composite that renders rows (e.g. `<CronTable>`) defines its own row type interface co-located with the component:

```ts
// apps/dashboard/src/components/crons/cron-table.tsx
export type CronTableRow = {
  id: string;
  name: string;
  description: string;
  scheduleExpr: string;
  scheduleHuman: string;
  nextRun: string;
  nextRunAbsolute: string;
  source: 'chat' | 'static';
  status: 'active' | 'paused' | 'failed';
};
```

No central `data/types.ts` in `@zeno/ui`. The dashboard maps from `useCrons()` (which returns the storage shape) to `CronTableRow` at the component boundary.

### Composite inventory (Phase 2 backlog)

Layout (in `apps/dashboard/src/components/layout/`):
- `<DashboardSidebar>` — `{ items, active, runtime, user, Link }`. 252px sticky; brand crest + nav (5–6 items) + status panel + user row.
- `<DashboardTopstrip>` — `{ crumbs, Link }`. Sticky top, breadcrumb + ⌘K hint.

Modals (in `apps/dashboard/src/components/modals/`, all controlled with `{ open, onOpenChange, … }`, all built on `Dialog`/`AlertDialog` from `@zeno/ui`):
- `<NewCronModal>` `{ onCreate?: (name: string) => void }`
- `<DeleteCronModal>` `{ name, onConfirm? }`
- `<EditSecretModal>` `{ name, helper?, onSave?: (value: string) => void }`
- `<RestartWorkerModal>` `{ onConfirm? }`
- (Connector modals — `UninstallConnectorModal`, `AddCatalogModal`, `AddCustomModal` — are deferred until the connectors backend exists.)

Skeletons (in `apps/dashboard/src/components/skeletons/`):
- `<CronsTableSkeleton>`, `<SessionsTableSkeleton>`, `<LogListSkeleton>`, `<HomeSkeleton>`, `<SettingsSectionSkeleton>`, `<CronDetailRunsSkeleton>`, `<SessionTranscriptSkeleton>`.

Each composite is built fresh in `apps/dashboard`. Visual reference: the corresponding component in `apps/design`. No code import between the two apps.

## Implementation Plan (this spec)

### 1. Move toast to `@zeno/ui`

Source: `apps/design/src/lib/toast.tsx` (single file, ~150 lines, contains `ToastProvider`, `useToast`, `Toaster`, internal Toast component, types).

Destination: split into 4 files under `packages/ui/src/components/toast/`:

```
packages/ui/src/components/toast/
├── toast-provider.tsx     # <ToastProvider> — context + queue state
├── use-toast.ts           # useToast() hook returning { success, warn, fail, dismiss }
├── toast.tsx              # <Toast> — visual bar (gold barlight + mono label + body + optional action + close ×)
└── toaster.tsx            # <Toaster> — fixed top-right container that renders the stack from context
```

Re-export in `packages/ui/src/index.ts`:
```ts
export { ToastProvider, Toaster, useToast, type ToastTone } from './components/toast';
```

Rationale: `apps/design/src/lib/toast.tsx` today exports only `ToastTone`, `ToastProvider`, `useToast` (the internal `ToastInput` and `Toast` types are file-local — keep them file-local in the ui too, since they're construction details consumers don't need). After the lift, `Toaster` is added as a fourth export (currently it lives unnamed inside design's `toast.tsx`; we extract it as a named component).

The exported API matches design's current API exactly:
```tsx
const toast = useToast();
toast.success(<>linear · enabled</>);
toast.warn(<>cron · running…</>, { durationMs: 1800 });
toast.fail(<>command not found</>);
toast.dismiss(id);
```

### 2. Reconcile tokens

Resolution rule: when `tokens.css` and `globals.css` disagree, the value that matches Paper wins. Verify via `mcp__plugin_paper-desktop_paper__get_computed_styles` on the canvas of a known artboard before flipping any value.

Known divergences to resolve:

| Token | `tokens.css` | design's `globals.css` | Action |
|---|---|---|---|
| `--color-canvas` | `#0A0A10` | `#08090F` | Verify against Paper, set both to the winner |
| `--color-hairline` | `rgba(255, 230, 170, 0.06)` | (missing) | Confirm design doesn't need it; if it does, add to design via the imported tokens.css automatically |
| `--animate-caret` | (missing) | `caret 1s steps(2) infinite` + `@keyframes` | Lift to `tokens.css` if any other project might use a caret-blink (likely yes). Otherwise leave in design. |
| `--animate-pulse-jade/carmine/gold` | present | (missing) | Already used by `<Dot>` in `@zeno/ui` — stays in `tokens.css`. |

**Font tokens stay in design's `globals.css`.** `tokens.css` today does not declare `--font-sans` / `--font-serif` / `--font-mono` (font stacks are defined in `apps/design/src/styles/globals.css` and `apps/dashboard/src/styles/globals.css` directly). Promoting font tokens to `tokens.css` is out of scope for this spec — fonts can vary per project and forcing one stack on every `@zeno/ui` consumer is wrong. So:

- The `@theme` block of design's `globals.css` is reduced from "everything" down to "the font stacks plus any animation tokens not in `tokens.css`".
- The `@theme` block of dashboard's `globals.css` keeps its current font declarations (no change).

After reconciliation:
- `apps/design/src/styles/globals.css` becomes approximately:
  ```css
  @import "tailwindcss";
  @import "@zeno/ui/styles/tokens.css";

  @source "../routes/**/*.{ts,tsx}";

  @theme {
    --font-sans: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    --font-serif: 'Fraunces', 'Iowan Old Style', Georgia, serif;
    --font-mono: 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    /* + any --animate-* not promoted to tokens.css */
  }

  @keyframes caret { /* if --animate-caret stays in design only */ }

  @layer base { /* resets, scrollbar, body radial-gradient, ::selection */ }
  ```
  — with the entire color/shadow block of `@theme` removed (it now comes from `@zeno/ui/styles/tokens.css`).

### 3. Update `apps/design` import paths

Two import sites to fix in `apps/design/src/`:
1. `__root.tsx` — `<ToastProvider>` and `<Toaster>` come from `@zeno/ui` (or the file in design that mounts them).
2. Every call site using `useToast()` — change `import { useToast } from '@/lib/toast'` to `import { useToast } from '@zeno/ui'`.

After this, `apps/design/src/lib/toast.tsx` is deleted. `apps/design/src/lib/modal.tsx` stays (it's design's own composite glue, out of scope).

### 4. Drop `sonner` from `apps/dashboard` and `@zeno/ui`

Pre-check: `grep -r "from 'sonner'" apps/dashboard/src` and `grep -rn "Toaster" apps/dashboard/src` (the `Toaster` symbol from `@zeno/ui` today wraps `sonner`). If consumers exist, replace them with `useToast()` / `<Toaster>` from `@zeno/ui` (post-lift, `Toaster` is the new toast container, not the sonner wrapper). If the refactor on a consumer is non-trivial, escalate as a sub-decision.

**Sequencing matters** — perform in this exact order or `pnpm --filter @zeno/ui build` will fail mid-step:

1. Replace `apps/dashboard/src` consumers (if any) with the new `@zeno/ui` toast API.
2. Delete `packages/ui/src/components/sonner.tsx`.
3. Remove the `Toaster` (sonner-based) re-export from `packages/ui/src/index.ts`. The new `Toaster` (toast-based) re-export from Step 1 takes the same name slot.
4. Remove `"sonner": "2.0.7"` from `packages/ui/package.json` dependencies.
5. Remove `"sonner": "2.0.7"` from `apps/dashboard/package.json` dependencies (note: pinned exact, no caret).
6. `pnpm install` to lock the removal.

### 5. Tests for the lifted toast

In `packages/ui/tests/toast/`:

| File | What it verifies |
|---|---|
| `toast.test.tsx` | `<Toast>` renders success/warn/fail with the correct color class on the left bar. Action button fires its `onAction` callback. The × close button fires `onClose`. |
| `use-toast.test.tsx` | `useToast().success(...)` adds an entry to the provider's queue. Calling `dismiss(id)` removes it. After `durationMs` (default 4000ms, overridable per call), the entry is auto-dismissed. Tests use `vi.useFakeTimers()`. |
| `toaster.test.tsx` | `<Toaster>` renders the stack in z-index 50. With multiple toasts, all render in order. |

Existing primitive tests (`packages/ui/tests/*.test.tsx` for button, chip, dot, etc.) are unaffected.

## Success Criteria

1. `pnpm --filter @zeno/ui build && pnpm --filter @zeno/ui test` is green and now exports `ToastProvider`, `Toaster`, `useToast`.
2. `apps/design/src/lib/toast.tsx` no longer exists. `grep -r "lib/toast" apps/design/src/` returns no matches. All `useToast()` call sites in `apps/design` resolve via `@zeno/ui`.
3. `apps/design/src/styles/globals.css` starts with `@import "tailwindcss"; @import "@zeno/ui/styles/tokens.css";`. The `@theme` block defining colors/shadows is gone (moved into the imported tokens.css), or reduced to fonts/animations not present in `tokens.css`.
4. `grep "sonner" apps/dashboard/package.json packages/ui/package.json` returns no matches. `pnpm install` is clean.
5. `apps/design` rendered visually before-and-after looks identical at every route. Manual screenshot comparison + smoke test of all toast variants (success/warn/fail) firing from existing call sites (cron run-now, connector toggle, modal create, modal save, restart worker, etc.).
6. `pnpm run quality-gate` is green across all workspaces (lint + typecheck + test + build).
7. The spec doc at `context/specs/0030-ui-primitive-lift/spec.md` has been reviewed by the `spec-document-reviewer` subagent with status "Approved" and the user has reviewed and approved it.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Token reconciliation introduces a subtle visual regression (e.g. canvas `#08090F` → `#0A0A10` is a 2-bit blue shift; might be the right call but might be visible). | Screenshot every `apps/design` route before changes. Decide canonical value via `mcp__plugin_paper-desktop_paper__get_computed_styles` (Paper is the source of truth). Apply, re-screenshot, diff. If `apps/dashboard` was relying on the old value through `tokens.css`, it gets the new value too — accept and verify via build + manual check. |
| Toast lift breaks `apps/design` call sites at ~20 locations. | API kept identical (`{ success, warn, fail, dismiss }`). Only import paths change. After the lift, navigate every route in `apps/design` and trigger at least one toast variant per surface (cron list run-now, connector toggle, modal save, settings restart). Console clean. |
| `apps/dashboard` has a hidden `sonner` consumer that breaks when the dependency is removed. | Grep before removing. If found, replace with `@zeno/ui`'s `useToast()` (1-line API change since both expose `success/warn/error` semantics). If the consumer is non-trivial, surface as a sub-decision before completing this spec. |
| Animations divergent (`--animate-caret` vs `--animate-pulse-*`). | Inventory every `@keyframes` and `--animate-*` in both files. For each: if used by an `@zeno/ui` primitive (e.g. `<Dot>` uses pulse), it stays in `tokens.css`. If only used by design composites or by design routes inline, it stays in design's `globals.css` (under `@theme` for the animation token + a `@keyframes` block separately). Document the decision in the PR description. |
| New tests for the lifted toast fail due to `happy-dom` / `vi.useFakeTimers()` quirks (timer-based tests can be flaky). | Use `@testing-library/user-event` which handles real-async behavior cleanly. For auto-dismiss tests, use `vi.advanceTimersByTime(durationMs)` inside `act()`. If a test is flaky, reproduce + fix before merging — do not skip. |
| Branch `feat/apps-design` is "feature-design"-themed but this work is foundational. PR title might confuse reviewers. | Spec doc is committed early in the PR; reviewers can see the trail from earlier visual work into the foundation lift. PR title: `feat(ui): lift toast and reconcile tokens (spec 0030)`. |

## Open Questions

- [NEEDS CLARIFICATION: confirm canonical value of `--color-canvas` via Paper. Either `#0A0A10` or `#08090F` — Paper's artboard background is the arbiter. Resolves during implementation, does not block design.]
- [NEEDS CLARIFICATION: does `apps/dashboard` have an active `sonner` consumer? Run `grep -r "from 'sonner'" apps/dashboard/src` during implementation. If yes, the toast lift PR includes the consumer migration. If not, just remove the dep.]
- [NEEDS CLARIFICATION: animation tokens `--animate-caret` (design) and `--animate-pulse-*` (ui) — promote both to `tokens.css` or keep split? Resolution: inventory which primitives in `@zeno/ui` consume which animation. Anything consumed by a primitive must be in `tokens.css`. Animations only consumed by design's composites can stay in design's `globals.css`.]

None of these block the design — all resolve during the implementation phase by direct inspection.
