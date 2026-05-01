---
tags:
  - learning
  - css
  - tailwind
related:
  - "[[apps-design-role-and-ui-boundary]]"
created: 2026-04-25
---
# Unlayered CSS in Tailwind v4 silently beats utilities — wrap base resets in `@layer base`

In Tailwind v4, all framework utilities live in cascade layers (`@layer utilities`). Custom CSS rules written **outside** any `@layer` (i.e. unlayered) win against any layered rule, regardless of selector specificity. This means a one-line reset like `button { font-family: inherit }` in `globals.css` will silently override the `font-mono` utility on every button in the app.

## Context

While building `apps/design`'s P3.2 Crons Detail page, the `RUN NOW` button rendered with Space Grotesk despite having `font-mono` in its className. `getComputedStyle` returned `Space Grotesk`. The class was present, the token was correct, the build was clean — but `globals.css` had:

```css
button { font-family: inherit; cursor: pointer; }
a { color: inherit; text-decoration: none; }
```

These rules are unlayered. Tailwind's `.font-mono { font-family: var(--font-mono) }` is in `@layer utilities`. Cascade-layer precedence beats specificity: unlayered > layered. So every `font-mono` (and `text-*` color on `<a>`, by extension) was being silently overridden.

The fix in `apps/design/src/styles/globals.css` was to wrap the entire reset block in `@layer base` so it cascades correctly with utilities.

## How to Apply

When using Tailwind v4 with custom global CSS:

1. **Always wrap base resets in `@layer base`** — `html`, `body`, element resets like `button`, `a`, scrollbar styles, `::selection`, etc.
2. **Never leave element selectors unlayered** if utilities might want to override them. Element-level resets (`button`, `a`, `input`, `h1-h6`) are the most dangerous because utility classes commonly target them.
3. If you see `font-*` / `text-*` / `bg-*` utilities visibly not applying despite being present in the className, suspect an unlayered rule before suspecting class-name typos or build issues. Verify by inspecting `getComputedStyle()` and checking `globals.css` for unlayered element selectors.
4. The default Tailwind v4 starter wraps custom CSS in layers correctly — this trap appears when porting CSS from a Tailwind v3 / hand-rolled setup, where unlayered worked fine.
