---
tags:
  - learning
  - dashboard
  - ui
related:
  - "[[../specs/0012-dashboard-foundation/spec|spec 0012]]"
created: 2026-04-16
---
# shadcn primitives are code you own, not a dep

shadcn/ui isn't installed as a library — its components are **copied** into your repo. This is load-bearing: it means you can (and should) audit every pasted component against your project rules, refactor as needed, and accept that future "shadcn updates" are a pull-and-merge, not an `npm update`.

## Context

In Phase A we set up shadcn-style primitives: `Button`, `Input`, `Sonner`, later `Dialog` for Phase B. We didn't use the shadcn CLI — hand-wrote them in the shadcn style. Same aesthetic, same API surface (Radix under the hood where relevant), but zero CLI-produced code.

## Why hand-written instead of `pnpm dlx shadcn add`

- **No-`any` rule**: shadcn CLI output sometimes includes `any` in generated files. Hand-writing from the shadcn pattern lets us enforce the rule from the start rather than cleaning up afterwards.
- **Taste alignment**: we use CSS variables tied to our Paper palette (`--color-accent`, `--color-canvas`, etc.) in `globals.css`. shadcn's default generator expects its own color tokens (`--primary`, `--background`, etc.). Bridging those is a rewrite anyway.
- **Tailwind v4 vs v3**: shadcn's published components target v3 idioms; Tailwind v4 with `@theme` directive works differently. Hand-writing adapts.
- **Zero CLI state**: no `components.json` state drift risk, no CLI version pinning.

## Pattern

Each primitive lives in `apps/dashboard/src/components/ui/<name>.tsx`. File structure:
1. Import types + cn util.
2. Define variants via `class-variance-authority` (`cva`) when applicable — Button yes, Input no.
3. Export a `forwardRef`-wrapped component.
4. Consumer-facing surface matches the shadcn convention (same prop names as their docs), so copy-paste from shadcn docs mostly works without modification.

Example reference files already in-repo:
- `apps/dashboard/src/components/ui/button.tsx` — CVA variants
- `apps/dashboard/src/components/ui/input.tsx` — plain forwardRef
- `apps/dashboard/src/components/ui/dialog.tsx` — Radix primitive wrap
- `apps/dashboard/src/components/ui/sonner.tsx` — toast provider

## How to Apply

- **New primitive**: copy the shape from shadcn docs (button, dialog, tabs, etc.), but write the TSX from scratch using our palette + no-`any` rule. Keep the component file ≤ ~80 lines.
- **New Radix primitive wrap**: install just the Radix package (`@radix-ui/react-<name>`), write the wrapper. The Dialog primitive from Phase B is the reference.
- **Don't run `pnpm dlx shadcn add`** in this repo. Not because it's wrong — because the output needs audit/rewrite and we'd rather spend that time writing the clean version.
- **When shadcn publishes a new design or fix you want to pick up**: read their updated source, cherry-pick the useful diff, apply by hand. Treat shadcn as prior art, not as a dependency.
