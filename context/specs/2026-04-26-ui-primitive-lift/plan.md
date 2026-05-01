---
feature: ui-primitive-lift
spec: "[[spec]]"
created: 2026-04-26
---
# UI Primitive Lift — Implementation Plan

> **For agentic workers:** Steps live in `[[tasks]]` and use checkbox (`- [ ]`) syntax for tracking. Execute task-by-task; commit after each task closes.

**Goal:** Move the toast system from `apps/design/src/lib/toast.tsx` into `@zeno/ui` as a generic primitive, reconcile design tokens so `apps/design` consumes `@zeno/ui/styles/tokens.css`, migrate the 3 `sonner` consumers in `apps/dashboard` to the new `@zeno/ui` toast, and drop the `sonner` dependency from both `packages/ui` and `apps/dashboard`.

**Architecture:** 5-phase bottom-up migration. Phase 1 scaffolds the toast subsystem in `@zeno/ui` (4 split files + tests) without touching consumers. Phase 2 reconciles tokens (Paper-arbitrated). Phase 3 switches `apps/design` over (delete `lib/toast.tsx`, fix import paths). Phase 4 migrates `apps/dashboard`'s 3 sonner sites and drops the dependency. Phase 5 final quality gate. All work on existing branch `feat/apps-design`.

**Tech Stack:** React 19, Tailwind CSS v4, vitest + happy-dom, biome (lint), turbo (orchestration), pnpm workspaces.

**Spec reference:** `[[spec]]` (`context/specs/2026-04-26-ui-primitive-lift/spec.md`).

---

## Approach

The toast in `apps/design/src/lib/toast.tsx` is one ~150-line file that combines four concerns: (1) context provider with queue state, (2) `useToast()` hook, (3) visual `<Toast>` row, (4) `<Toaster>` container. We split those concerns across 4 files in `packages/ui/src/components/toast/` so each file has one clear responsibility and grows independently. The public API is preserved exactly — `useToast()` returns `{ success, warn, fail, dismiss }`, `<ToastProvider>` wraps children, `<Toaster>` renders the stack. The only externally-visible change is `import { useToast } from '@/lib/toast'` → `import { useToast } from '@zeno/ui'`.

For tokens, `packages/ui/src/styles/tokens.css` becomes the single source of truth for colors, shadows, and shared animations. `apps/design/src/styles/globals.css` stops declaring those tokens and `@import`s them from `@zeno/ui` instead. Font tokens stay in each app's `globals.css` (they're project-specific). Where `tokens.css` and design's `globals.css` disagree (e.g. canvas color `#0A0A10` vs `#08090F`), we verify the canonical value against Paper before flipping. `apps/dashboard` already imports `@zeno/ui/styles/tokens.css` — it gets the reconciled values automatically.

The `sonner` removal is non-trivial because there are 3 active consumers in `apps/dashboard` (`mutations.ts`, `use-optimistic-mutation.ts`, `login.tsx`). All three are inside hooks or components, so they can adopt `useToast()` cleanly. The mapping is mechanical: `sonner.toast.success(msg)` → `useToast().success(msg)`, `sonner.toast.error(msg)` → `useToast().fail(msg)`. Once consumers migrate, we delete `packages/ui/src/components/sonner.tsx`, drop the re-export, and remove the dependency from both `package.json` files in a strict order so `pnpm --filter @zeno/ui build` doesn't break mid-step.

## Architecture

```
packages/ui/src/components/toast/
├── types.ts                 # ToastTone, internal Toast, ToastInput
├── toast-context.ts         # ToastContext + ToastContextValue
├── toast-provider.tsx       # <ToastProvider> — owns queue state, mounts Toaster
├── use-toast.ts             # useToast() hook — reads context, exposes API
├── toast.tsx                # <Toast> — single visual row (mover de design's ToastRow)
└── toaster.tsx              # <Toaster> — fixed top-right container, maps queue to <Toast> rows
```

**Why split this way?**
- `types.ts` + `toast-context.ts` are shared between provider and hook — extracting avoids circular deps.
- `<ToastProvider>` is the only component that mounts `<Toaster>` internally (today's behavior); keeping that wiring in one file makes the contract clear.
- `<Toast>` (single row) and `<Toaster>` (container) are independently renderable — useful for tests and Storybook-like consumers.
- `useToast()` is its own file so consumers importing only the hook don't pull in JSX.

Re-exports (`packages/ui/src/index.ts`):

```ts
export { ToastProvider, Toaster, useToast, type ToastTone } from './components/toast';
```

The barrel `packages/ui/src/components/toast/index.ts` re-exports `ToastProvider`, `Toaster`, `useToast`, and `ToastTone` from their respective files.

**Tokens reconciliation:**

```
Before:                              After:
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ packages/ui/styles/tokens.css│    │ packages/ui/styles/tokens.css│
│  - colors, shadows, animates │    │  - colors (reconciled)       │
│                              │    │  - shadows                   │
└──────────────────────────────┘    │  - shared animations         │
                                    └──────────┬───────────────────┘
┌──────────────────────────────┐               │
│ apps/design/styles/globals   │               │ @import
│  - DUPLICATES colors/shadows │  ──────►      ▼
│  - own animations (caret)    │    ┌──────────────────────────────┐
│  - fonts                     │    │ apps/design/styles/globals   │
└──────────────────────────────┘    │  - @import tokens.css        │
                                    │  - fonts (per-app)           │
                                    │  - design-only animations    │
                                    │  - resets / scrollbar        │
                                    └──────────────────────────────┘
```

## File Structure

### Files created (`@zeno/ui`)

| Path | Responsibility |
|---|---|
| `packages/ui/src/components/toast/types.ts` | `ToastTone` (exported), internal `Toast`, `ToastInput` types. |
| `packages/ui/src/components/toast/toast-context.ts` | `ToastContext` and `ToastContextValue`. |
| `packages/ui/src/components/toast/toast-provider.tsx` | `<ToastProvider>` — context + queue state, mounts `<Toaster>`. |
| `packages/ui/src/components/toast/use-toast.ts` | `useToast()` — returns `{ success, warn, fail, dismiss }`. |
| `packages/ui/src/components/toast/toast.tsx` | `<Toast>` — single visual row with tone styles + optional action button. |
| `packages/ui/src/components/toast/toaster.tsx` | `<Toaster>` — fixed top-right stack container. |
| `packages/ui/src/components/toast/index.ts` | Barrel: `ToastProvider`, `Toaster`, `useToast`, `ToastTone`. |
| `packages/ui/tests/toast/toast.test.tsx` | `<Toast>` renders all tones, action callback, close button. |
| `packages/ui/tests/toast/use-toast.test.tsx` | `useToast()` API: queue add/remove/auto-dismiss with fake timers. |
| `packages/ui/tests/toast/toaster.test.tsx` | `<Toaster>` renders multiple toasts in order. |

### Files modified

| Path | Change |
|---|---|
| `packages/ui/src/index.ts` | Add `export … from './components/toast'`; remove `export * from './components/sonner'`. |
| `packages/ui/package.json` | Remove `"sonner": "2.0.7"` from dependencies. |
| `apps/design/src/routes/__root.tsx` | Replace `import { ToastProvider } from '@/lib/toast'` → `import { ToastProvider } from '@zeno/ui'`. |
| `apps/design/src/styles/globals.css` | Add `@import "@zeno/ui/styles/tokens.css"`; remove duplicated colors/shadows; keep fonts + design-only animations + resets. |
| `packages/ui/src/styles/tokens.css` | Reconcile divergent values (canvas color, animation tokens). |
| `apps/design/src/<call sites>/*.tsx` | Update `import { useToast } from '@/lib/toast'` → `import { useToast } from '@zeno/ui'` across all files using the hook. |
| `apps/dashboard/src/lib/mutations.ts` | Migrate `import { toast } from 'sonner'` to `useToast()` hook usage. |
| `apps/dashboard/src/lib/use-optimistic-mutation.ts` | Migrate `import { toast } from 'sonner'` to `useToast()` hook usage. |
| `apps/dashboard/src/routes/login.tsx` | Migrate `import { toast } from 'sonner'` to `useToast()` hook usage. |
| `apps/dashboard/src/routes/__root.tsx` | Wrap content with `<ToastProvider>` (currently only mounts `<Toaster>`). |
| `apps/dashboard/package.json` | Remove `"sonner": "2.0.7"` from dependencies. |

### Files deleted

| Path | Reason |
|---|---|
| `apps/design/src/lib/toast.tsx` | Replaced by `@zeno/ui` toast subsystem. |
| `packages/ui/src/components/sonner.tsx` | Replaced by the new toast subsystem; consumers migrated. |

## Phase Ordering

| Phase | Goal | Depends on |
|---|---|---|
| 1 | Toast subsystem exists in `@zeno/ui` with tests; **no consumer changes yet** so the lift is invisible to design/dashboard. | — |
| 2 | Tokens reconciled in `tokens.css`; design's `globals.css` slimmed to fonts + design-only animations + resets, importing `@zeno/ui/styles/tokens.css`. | 1 (parallel possible but easier to gate) |
| 3 | `apps/design` switches to `@zeno/ui` toast — call site imports updated, `lib/toast.tsx` deleted. Smoke test passes. | 1 |
| 4 | `apps/dashboard` migrates 3 sonner sites to `useToast()`. `sonner.tsx` deleted. Re-export dropped from `index.ts`. `sonner` removed from both `package.json` files. `pnpm install` clean. | 1 |
| 5 | `pnpm run quality-gate` green across all workspaces. Final smoke + commit. | 2, 3, 4 |

Each phase ends in a green build state. If a phase fails its quality gate, fix before advancing.

## Risks / Open Decisions

Three open questions from the spec resolve during implementation, all in Phase 2 or 4:

1. **Canvas color `#0A0A10` vs `#08090F`** — resolves in Phase 2, Task 2.1 via `mcp__plugin_paper-desktop_paper__get_computed_styles` on a Paper artboard's canvas. Whichever Paper says wins.
2. **Sonner consumers in dashboard** — confirmed during plan writing: 3 sites (`mutations.ts`, `use-optimistic-mutation.ts`, `login.tsx`). Migration is mechanical (`toast.error → toast.fail`, `toast.success → toast.success`). Phase 4 covers it.
3. **Animation tokens divergence** — resolves in Phase 2, Task 2.2: inventory which `@zeno/ui` primitives consume which animations. Anything used by a primitive in `tokens.css`. Anything used only by design's composites stays in design's `globals.css`. Document the decision in the PR description.

Other risks already covered by the spec's Risks section (token visual regression, test flakiness with fake timers) — mitigations already documented there.

## Out of Scope (recap from spec)

- No composite work (sidebar, modals, skeletons in dashboard) — Phase 2 territory in a future spec.
- No `apps/design` refactor beyond the toast lift and tokens reconciliation.
- No cross-app imports between `apps/design` and `apps/dashboard`.
- No new packages, no version bumps, no Connectors feature.
