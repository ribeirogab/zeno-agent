---
status: shipped
feature: dashboard-ux-cleanup
created: 2026-04-16
shipped: 2026-04-17
---
# Dashboard UX Cleanup — Spec

**Status:** Shipped
**Scope:** Replace every native browser affordance and every ad-hoc loading/error text in the dashboard with proper primitives. Add the missing primitives (`AlertDialog`, `Skeleton`, `EmptyState`, `ErrorState`) to `@zeno/ui` and to the Paper design system. Remove `window.confirm`. Remove "carregando…" raw-span placeholders. Centralize empty and error states so they look intentional instead of accidental.

## Context

Audit of `apps/dashboard/src/**` surfaces four recurring rough edges:

1. **`window.confirm` on cron delete** (`crons/cron-actions.tsx`). Browser-rendered JS alert — font, position, language, and visuals are entirely outside our dark theme and Zeno's identity.
2. **"carregando…" as raw `<span>`** appears in 7 files (`settings.tsx`, `crons.$id.tsx`, `sessions.$threadId.tsx`, `logs.tsx`, `index.tsx`, `sessions.index.tsx`, `crons.index.tsx`) plus the `home-subtitle.ts` helper. Every occurrence is a one-off text node; the app looks like a work-in-progress.
3. **Inline error states** with bare text ("erro ao carregar", "sem resultados") appear in several routes without a shared component. Visual drift guaranteed.
4. **No confirmation pattern** beyond `window.confirm`. When 0018 lands, any future destructive action (delete cron, delete session, shutdown worker) already has a primitive to reach for.

Specs 0015–0017 set up the physical infrastructure: kebab-case filenames, `@zeno/ui` package, Paper catalog. This spec fills that infrastructure with the missing UX components and retires the shortcuts that predate it.

## Problem Statement

The dashboard does its job, but it looks like a prototype in three specific ways:

- **Native browser UI bleeds through.** A JS `confirm()` modal in a carefully-designed dark app is jarring. It also can't be styled, can't accept custom buttons, can't be keyboard-trapped for accessibility in the way shadcn primitives are.
- **Loading states are plain text.** "carregando…" in `text-text-secondary` is technically not broken; it's just obviously not designed. It breaks the "intentional" feel the spec 0008 palette and typography aim for.
- **Empty and error states** are inconsistent — sometimes a plain sentence, sometimes a longer explanation, never framed as UI.

None of these blocks shipping, but together they make the dashboard feel 80% done.

## Non-Goals

1. **Refactoring business logic.** Mutation hooks, query hooks, SSE plumbing — all untouched. This spec is purely presentational.
2. **Adding undo for destructive actions.** `toast.success('cron removido')` stays plain; an undo affordance is a separate UX design, out of scope.
3. **Introducing route-level Suspense boundaries.** Loading states are inline-component level, not route-level. React Suspense in TanStack Router is a bigger refactor; not warranted today.
4. **Animating empty/loading states.** Skeletons can pulse (cheap CSS); elaborate transitions are not in scope.
5. **Replacing sonner.** Toasts already work. This spec adds new toast call sites, not a new toast engine.
6. **Internationalizing copy.** Copy stays PT-BR for Zeno's personal use.
7. **Adding primitives beyond what the audit demands.** If this spec adds `AlertDialog`, `Skeleton`, `EmptyState`, `ErrorState` — that's all. No speculative additions (`Popover`, `Tooltip`, `DropdownMenu`) unless a call site demands them here.
8. **Regenerating the Paper eight pages** to reflect new loading/empty states. New frames for the four new primitives only. Page artboards can be refreshed in a future pass.

## Constraints

- **`@zeno/ui` is delivered by spec 0016** before this spec starts. Every new primitive lands there, not in `apps/dashboard`.
- **Paper frames first.** Per the governance rule from spec 0017, each new primitive gets a Paper frame + registry row *before* the code lands.
- **No `window.*` modal calls** anywhere after this spec ships. Lint-searchable via `grep -r "window\.\(confirm\|alert\|prompt\)" apps/` returning zero hits.
- **Dark-only, palette-locked.** All new primitives use tokens from `packages/ui/src/styles/tokens.css`.
- **Accessibility inherited from Radix.** `AlertDialog` builds on `@radix-ui/react-alert-dialog` (new dep). Focus-trap, keyboard dismiss, aria-roles come for free.
- **No `any`, no `// biome-ignore`.**
- **Copy stays in PT-BR lowercased style** matching existing toast messages ("cron removido", "execução iniciada"). New strings follow the same voice.
- **One new Radix dep only.** `@radix-ui/react-alert-dialog` is the only net-new runtime dep. `Skeleton`/`EmptyState`/`ErrorState` are plain Tailwind components.

## Design

### New primitives in `@zeno/ui`

**`AlertDialog`** — destructive-confirmation modal.

```typescript
// packages/ui/src/components/alert-dialog.tsx
// Structure mirrors shadcn/ui's AlertDialog: Root, Trigger, Content, Header,
// Title, Description, Footer, Cancel, Action. Built on @radix-ui/react-alert-dialog.
```

Props API identical to existing `Dialog` primitive where sensible; `Action` button defaults to `variant="accent"` (coral) for destructive emphasis; `Cancel` defaults to `variant="ghost"`.

**`Skeleton`** — generic shimmering block.

```typescript
// packages/ui/src/components/skeleton.tsx
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-panel', className)}
      aria-busy="true"
      aria-live="polite"
    />
  );
}
```

Callers size it via Tailwind: `<Skeleton className="h-4 w-32" />`. Rounded, pulsing, uses `bg-panel` so it sits comfortably on `bg-canvas`. CSS-only pulse — no JS.

**`EmptyState`** — "nothing here yet" panel.

```typescript
// packages/ui/src/components/empty-state.tsx
export function EmptyState({ title, description, action }: {
  title: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element;
```

Layout: centered column, title in `text-sm text-text-primary`, description in `text-xs text-text-tertiary`, optional action slot below (typically a `Button`). No icon by default.

**`ErrorState`** — "we failed to load this" panel.

```typescript
// packages/ui/src/components/error-state.tsx
export function ErrorState({ title, description, onRetry }: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}): JSX.Element;
```

Default title: "algo deu errado". Description is optional. If `onRetry` is provided, renders a small `Button variant="ghost" size="sm"` labeled "tentar de novo".

All four get:

- A frame in Paper (Primitives page).
- A row in `packages/ui/DESIGN.md`.
- Included in `packages/ui/src/index.ts` barrel export.

### Replacement matrix

| File | Before | After |
|---|---|---|
| `apps/dashboard/src/components/crons/cron-actions.tsx` | `window.confirm(...)` guarding `deleteCron.mutate(id)` | `AlertDialog` with title "remover cron?", description mentioning the cron name, Cancel (ghost) + Action (accent, label "remover") |
| `apps/dashboard/src/routes/_authed/crons.index.tsx` | `<span>carregando…</span>` + empty-list text | `<Skeleton />` rows while loading; `<EmptyState title="nenhum cron ainda" action={<Button>novo cron</Button>}>` when list empty |
| `apps/dashboard/src/routes/_authed/crons.$id.tsx` | `<span>carregando…</span>` + error bare text | Skeleton for the header+actions area; `<ErrorState onRetry={query.refetch}>` on error |
| `apps/dashboard/src/routes/_authed/sessions.index.tsx` | `<span>carregando…</span>` + empty text | Skeleton rows; `EmptyState` when none |
| `apps/dashboard/src/routes/_authed/sessions.$threadId.tsx` | `<span>carregando…</span>` | Skeleton for header + message list |
| `apps/dashboard/src/routes/_authed/settings.tsx` | `<span>carregando…</span>` | Skeleton panels per section |
| `apps/dashboard/src/routes/_authed/index.tsx` (Home) | Inline `<span>carregando…</span>` in the Activity section; `activity.isError && ...` | Skeleton rows for stats + activity; `ErrorState` for activity fetch failure |
| `apps/dashboard/src/routes/_authed/logs.tsx` | Loading + error + empty are inline | Skeleton rows for initial load; `ErrorState` on historical failure; `EmptyState` when filtered list is empty |
| `apps/dashboard/src/lib/home-subtitle.ts` | Returns `'Carregando…'` when stats null | Returns `''` — the caller uses a Skeleton instead |

### Skeleton sizing conventions

To keep skeletons visually plausible:

- Row skeletons mirror the real row height. Cron/session/log row skeletons are 48px tall × full width, with an internal 3-column structure matching the real layout.
- Stat tile skeleton is 72px tall, matches `StatTile` dimensions.
- Title skeletons are `h-7 w-64`.
- Description skeletons are `h-4 w-40`.

A small helper module `apps/dashboard/src/components/skeletons/` (yes, feature-level, not in `@zeno/ui`) holds the *composed* skeletons for each page: `cron-list-skeleton.tsx`, `log-list-skeleton.tsx`, etc. The primitive `<Skeleton />` in `@zeno/ui` is generic; its compositions live with the feature code.

### AlertDialog — exact usage for cron delete

```tsx
// apps/dashboard/src/components/crons/cron-actions.tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="sm" disabled={deleteCron.isPending}>
      Delete
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>remover este cron?</AlertDialogTitle>
      <AlertDialogDescription>
        {`"${cron.name}" será removido. essa ação não pode ser desfeita.`}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel asChild>
        <Button variant="ghost">cancelar</Button>
      </AlertDialogCancel>
      <AlertDialogAction asChild>
        <Button
          variant="accent"
          onClick={() => deleteCron.mutate(cron.id, {
            onSuccess: () => void navigate({ to: '/crons' }),
          })}
        >
          remover
        </Button>
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

`asChild` pattern wraps the existing `<Button>` so the cron-delete button keeps its current variant system — we're not introducing a second button styling inside `AlertDialog`.

### Paper deliverables

Four new frames on the Primitives page of the "Hearty island" file:

- `AlertDialog` — full anatomy (overlay + container + header + description + footer with Cancel/Action), padding annotations.
- `Skeleton` — four size examples (text/row/tile/large block) shown with faint pulse indicator.
- `EmptyState` — one example (empty crons list) with title, description, action button.
- `ErrorState` — one example with title, description, retry button.

Four new rows in `packages/ui/DESIGN.md` under Primitives.

### Audit script (one-off)

`tmp/audit-porco-ux.sh` — grep script run once to confirm the replacement is exhaustive. Checks:

```bash
grep -rn 'window\.\(confirm\|alert\|prompt\)' apps/ packages/
grep -rn '>carregando' apps/dashboard/src/
grep -rnE '>erro( ao| inesperado)' apps/dashboard/src/
```

Expected output post-refactor: zero hits for #1, zero raw-text "carregando" lines outside toasts, error strings routed through `ErrorState`. Discarded after the spec ships.

## User Stories / Scenarios

1. **Operator deletes a cron.** Clicks Delete on the cron detail page. A dark-themed modal appears (not a browser `confirm` box), showing "remover este cron?" with the cron name. Clicks "remover" (coral). Toast "cron removido" appears; navigation to `/crons`. If they instead click "cancelar" or press Esc, modal closes with no mutation.
2. **Operator opens `/crons` during first boot.** Sees a list of skeleton rows (3–5) pulsing. When the query resolves and the list is non-empty, skeletons swap for real rows. When empty, an `EmptyState` appears: "nenhum cron ainda" + a "novo cron" button.
3. **Backend is down.** Operator opens `/crons/42` (detail page). Header renders skeleton briefly. Query fails → `ErrorState` with "algo deu errado" + "tentar de novo" button. Click refetches.
4. **Logs page live-tail empty filter.** Operator types a nonsense query in the Logs search. List narrows to zero rows. `EmptyState` with "sem resultados nos filtros atuais" appears.

## Success Criteria

1. `grep -rn 'window\.\(confirm\|alert\|prompt\)' apps/ packages/` returns zero hits.
2. `grep -rn '>carregando' apps/dashboard/src/` returns zero hits (toasts use `toast.success/error`, which contain 'carregando' as toast text only if we deliberately added — audit confirms no false positives).
3. `packages/ui/src/components/` contains four new files: `alert-dialog.tsx`, `skeleton.tsx`, `empty-state.tsx`, `error-state.tsx`.
4. `packages/ui/src/index.ts` re-exports the four new primitives.
5. `@radix-ui/react-alert-dialog` added to `packages/ui/package.json` dependencies.
6. `packages/ui/DESIGN.md` has four new rows under Primitives.
7. "Hearty island" Paper file has four new frames on the Primitives page matching the new primitives.
8. `pnpm run quality-gate` green: new tests for each primitive (smoke: render + basic interaction), plus updated cron-actions test covering AlertDialog open → action → mutate.
9. `pnpm run docker:build && docker:up` → dashboard renders with skeletons during load, AlertDialog opens on Delete, EmptyState/ErrorState render where expected.
10. Visual diff against spec 0008 palette and typography: the new primitives pass the "one accent moment per screen" rule and use only palette tokens.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Skeleton sizing mismatches** real row height, causing layout shift when data loads | Compose skeletons that mirror row layout (same heights, same column widths). Verified by eye during implementation on the three heaviest lists (crons, sessions, logs). |
| **AlertDialog and Dialog coexist** — two very similar components from the same Radix family cause confusion | Clear naming: `AlertDialog` is destructive-confirmation only (has `Action` with accent variant); `Dialog` is for content (forms, detail views). Document both in Paper with the distinction in the description. |
| **Operator finds it annoying** to have a modal for cron delete when they used to just JS-confirm | Keyboard UX stays: Esc cancels, Enter commits (Radix default). If the modal feels like extra friction, it's because the action *is* destructive and the friction is on purpose. |
| **New primitives drift** from shadcn conventions | Copy the shadcn/ui alert-dialog implementation file verbatim, adjust only class names to use Zeno tokens. Keeps the API surface predictable. See `[[learnings/shadcn-copy-not-library]]`. |
| **Tests for modals** are flaky if timing isn't right | Use `@testing-library/user-event` (already a transitive dep) with its async API. Use `findByRole` rather than `getByRole` to await portal mount. |
| **`home-subtitle.ts` returning `''`** breaks the home route layout | Adjust `index.tsx` to render a Skeleton in place of the subtitle when it's empty. One-line change. |
| **Empty list flashes** between load and populated state (because initial skeleton → data → real row) | Accept; the flash is brief (<100ms typical). TanStack Query's `placeholderData` could mask it; out of scope unless it bothers in practice. |
| **Retry button on `ErrorState` re-triggers a failing query forever** | No automatic retry; it calls `query.refetch()` which TanStack already handles with its retry policy. User clicks it deliberately; safe. |
| **Porco grep hits false positives** in learning notes or docs | The grep is scoped to `apps/` and `packages/` directories (code only), not `context/`. |

## Open Questions

None blocking. Implementation-time decisions (captured in the plan commit):

- Whether `AlertDialog`'s `Action` defaults to `variant="accent"` or variant is always caller-specified. Default to accent for destructive; caller overrides if needed.
- Whether to introduce a `DeleteConfirmButton` wrapper that bundles the AlertDialog + Button for cron delete and future deletes. Maybe — if 2+ call sites exist by end of implementation, extract; otherwise keep inline.
- Whether `EmptyState` and `ErrorState` become `panels/` (composed patterns) rather than primitives in Paper. They're simple enough to be primitives for now; promote to pattern only if variants proliferate.
