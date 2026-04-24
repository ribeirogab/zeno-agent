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
