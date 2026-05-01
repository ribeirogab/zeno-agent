---
tags:
  - learning
  - tailwind
  - monorepo
related:
  - "[[../specs/2026-04-16-ui-package/spec]]"
created: 2026-04-17
---
# Tailwind v4 `@source` directive lets packages own their own content globs

Tailwind v4 replaced the JS config file with CSS-first `@theme` + `@source` directives. When a workspace package (like `@zeno/ui`) ships components used by a consumer app (dashboard), the package's `tokens.css` can declare `@source "../components/**/*.{ts,tsx}"` to self-register its components with the Tailwind content scanner. The consumer doesn't need to configure extra globs.

## Context

Spec 0016 extracted shadcn primitives from the dashboard into `packages/ui/`. Without `@source`, the dashboard's Vite build stripped `bg-accent`, `text-text-primary`, etc. from the package's components because the scanner only knew about the app's own `src/**`. Adding `@source "../components/**/*.{ts,tsx}"` at the top of `packages/ui/src/styles/tokens.css` made the package self-contained.

## How to Apply

When creating a new workspace package that ships React components with Tailwind classes:

```css
/* packages/<name>/src/styles/tokens.css */
@source "../components/**/*.{ts,tsx}";

@theme { /* tokens */ }
```

The consumer app only needs to `@import` the CSS file once — the scanner picks up the classes used anywhere the `@source` glob matches, across package boundaries.

Works with Vite 6+ and the `@tailwindcss/vite` plugin. Don't mix with a legacy `content: [...]` JS config — v4 treats that as a migration signal.
