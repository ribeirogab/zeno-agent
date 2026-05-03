---
tags:
  - learning
  - gotcha
related:
  - "[[tailwind-v4-source-directive-cross-package]]"
created: 2026-04-24
---
# tailwind-merge silently resolves position class conflicts

When `cn()` (clsx + tailwind-merge) encounters both `fixed` and `relative` in the same class string, it keeps the **last one** and drops the first. This is by design — `tw-merge` treats position utilities as a conflict group — but it's invisible and causes hard-to-debug rendering bugs.

## Context

During the Imperial Terminal rebranding, the Dialog and AlertDialog components had `'fixed left-1/2 top-1/2 ... relative animate-[...]'` in a single class string. The `relative` at the end silently overrode `fixed`, causing modals to render in-flow (invisible) instead of centered on screen. The DOM showed the dialog existed with all content, but `getComputedStyle` revealed `position: relative` instead of `fixed`.

## How It Works

`tailwind-merge` groups utilities by their CSS property. When two classes in the same group appear, it keeps the last one:

```
cn('fixed left-1/2 top-1/2 relative')
// → 'relative left-1/2 top-1/2'  (fixed is dropped!)
```

The `relative` was added for `CornerBrackets` positioning (absolute children need a positioned parent), but it conflicted with the `fixed` needed for dialog centering. Since the dialog portal already creates a new stacking context, `relative` was unnecessary.

## How to Apply

- Never put two position utilities (`fixed`, `relative`, `absolute`, `sticky`, `static`) in the same `cn()` argument string
- If a component needs `relative` for child positioning AND `fixed` for viewport centering, the `fixed` container is already a positioned ancestor — `relative` is redundant
- When a Radix dialog/overlay is visually present in the DOM but invisible on screen, check `getComputedStyle(el).position` first — it's almost always a `tw-merge` conflict

## Affected components in `@zeno/ui`

These components ship a default `position: fixed` and accept a user `className` that gets merged via `cn()`. **Passing `relative`, `absolute`, `sticky`, or `static` here will drop `fixed` and break the modal/overlay positioning:**

- `<DialogOverlay>` and `<DialogContent>` (`packages/ui/src/components/dialog.tsx`)
- `<AlertDialogOverlay>` and `<AlertDialogContent>` (`packages/ui/src/components/alert-dialog.tsx`)
- `<CommandPalette>` (overlay/content via `cmdk` Dialog — `packages/ui/src/components/command.tsx`)

Custom corner brackets, gradient bars, and anything `position: absolute` rendered as a child of one of these does **not** need a `relative` wrapper — the `fixed` container is already a positioned ancestor.

## Recurrences

This trap has bitten the codebase twice so far:

- **2026-04-24** — Imperial Terminal rebrand: `Dialog` / `AlertDialogContent` had `relative` appended in the default class string (caught and fixed in the same session, motivated this learning).
- **2026-04-26** — Spec 0031 dashboard rebuild: `<DeleteCronModal>` and `<RestartWorkerModal>` overrode `className="w-[520px] relative"` to position absolutely-placed corner brackets. Same silent break — modals rendered off-screen until the user reported them missing. Fix in commit `699158e` simply dropped the `relative`.

If this happens a third time, consider: (a) wrapping `cn()` in a project-local `cnSafePosition()` that warns when two position groups collide, or (b) adding a Biome / eslint rule that flags `relative` in className overrides for the @zeno/ui modal primitives.
