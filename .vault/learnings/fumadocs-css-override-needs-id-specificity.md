---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-07-apps-docs-scaffold/spec]]"
created: 2026-05-07
---
# Overriding Fumadocs theme tokens needs ID-level specificity

Fumadocs ships a `neutral.css` (and other named themes) that re-defines `--color-fd-*` tokens **inside `.dark #nd-sidebar`** — a selector with one ID + one class. Project-level overrides written as `:root, .dark { ... }` never win this cascade. To re-tint sidebar/TOC tokens, the override must be scoped under the same `#nd-sidebar` (and `#nd-sidebar-mobile`) id selectors, or use an inline `slots` prop on the layout.

## Context

Discovered while applying Imperial Terminal tokens to `apps/docs` (PR #19 / spec [[../specs/2026-05-07-apps-docs-scaffold/spec]]). The body background and primary token took on the brand colors immediately, but the sidebar's inactive items still rendered at Fumadocs's default `hsl(0,0%,72%)` (#b8b8b8) instead of the Imperial lavender `#8a8fab`. The active item was painted gold (`text-fd-primary`) by Fumadocs's `data-[active=true]:` variant, which the maintainer wanted reserved for affirmative actions only — not navigation state.

## How It Works

`fumadocs-ui/css/neutral.css` contains:

```css
.dark #nd-sidebar {
  --color-fd-muted: hsl(0, 0%, 16%);
  --color-fd-secondary: hsl(0, 0%, 18%);
  --color-fd-muted-foreground: hsl(0, 0%, 72%);
}
```

Specificity: 1 ID (`#nd-sidebar`) + 1 class (`.dark`) = (0,1,1). A project override at `.dark` alone is (0,1,0) — loses.

For active state, Fumadocs's link templates ship Tailwind variant classes:

```
data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary
```

These compile to `.<escaped>[data-active="true"]` rules with specificity (0,2,0). To override deterministically, scope under the sidebar/TOC id and add the data attribute selector — that gives (1,1,1), which wins.

The surviving override block in `apps/docs/src/styles/globals.css`:

```css
/* Re-pin muted-foreground to Imperial lavender for both desktop and mobile sidebars */
.dark #nd-sidebar,
.dark #nd-sidebar-mobile {
  --color-fd-muted-foreground: #8a8fab;
}

/* Active sidebar item: neutral accent, not gold tint */
#nd-sidebar a[data-active='true'],
#nd-sidebar-mobile a[data-active='true'] {
  background-color: var(--color-fd-accent);
  color: var(--color-fd-foreground);
}

/* Active TOC item ("On this page"): same treatment */
#nd-toc a[data-active='true'] {
  color: var(--color-fd-foreground);
  border-color: var(--color-fd-foreground);
}
```

Both desktop (`#nd-sidebar`) and mobile (`#nd-sidebar-mobile`) instances must be listed — Fumadocs renders them as separate elements at different breakpoints and only one is in the DOM at a time.

## How to Apply

- When adopting a Fumadocs theme preset (`neutral.css`, `aspen.css`, etc.) and customizing tokens, always check whether the preset re-defines the same token under `.dark #nd-sidebar` or similar id-scoped selectors.
- Override at the same specificity by reusing the `#nd-sidebar`, `#nd-sidebar-mobile`, and `#nd-toc` ids — not at `:root` or `.dark` alone.
- For active item color/background, override `[data-active='true']` under those ids; do not try to outrun the Tailwind variant with `!important`.
- Verify with `getComputedStyle(...)` and a forced `data-active="true"`, then visually with a screenshot — Tailwind variant + Fumadocs cascade are easy to misdiagnose.
