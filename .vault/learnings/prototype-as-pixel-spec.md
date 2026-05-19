---
tags:
  - learning
  - concept
related:
  - "[[shadcn-copy-not-library]]"
created: 2026-04-24
---
# Treating an HTML prototype as a pixel-perfect spec

When the owner produces a full HTML/CSS prototype (e.g., from Claude Design), it should be treated as the canonical design spec — not an approximation. Every spacing value, font size, color, and layout property must be ported exactly. The fastest workflow is: read the prototype CSS class-by-class and translate each property to Tailwind utilities.

## Context

The Imperial Terminal rebranding (spec 0026) used a prototype at `tmp/rebranding/zeno/` with `colors_and_type.css` (tokens) + `zeno.css` (all component styles) + per-screen JSX files. Initial implementation used Tailwind approximations ("close enough"), which produced screens that looked similar but had dozens of small differences — wrong padding, gaps, font sizes, tracking values. A second pixel-perfect pass was needed, comparing every `zen-*` CSS class against the Tailwind output property-by-property.

## How It Works

The effective workflow for porting a CSS prototype to Tailwind:

1. **Tokens first**: port all CSS custom properties from the prototype's token file into `@theme {}` in `tokens.css`
2. **Semantic CSS classes**: for complex components (sidebar, nav items, status panels), define the prototype's `zen-*` classes directly in `globals.css` using the Tailwind `var(--color-*)` variables — don't try to express 15-property components in inline Tailwind utilities
3. **Property-by-property audit**: for each prototype CSS class, open the prototype CSS and the implementation side-by-side, verify every property matches (padding, gap, font-size, font-weight, letter-spacing, line-height, color, border, background)
4. **Playwright comparison**: take screenshots of both prototype and real app at the same viewport, overlay them to spot differences
5. **Content matters**: text content, label casing, number formatting, relative time display — all must match the prototype too

## How to Apply

- When receiving an HTML prototype, treat the CSS as the source of truth — don't approximate
- For complex CSS (sidebar, nav, status panels), port the `zen-*` classes directly into `globals.css` rather than inlining 20 Tailwind utilities
- Always verify with side-by-side screenshots at the same viewport size
- The prototype's CSS properties (padding `18px 14px 14px`, not `p-4`) are the spec — use exact values via arbitrary values `px-[14px]` or equivalent utilities
