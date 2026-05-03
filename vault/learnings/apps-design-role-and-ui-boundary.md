---
tags:
  - learning
  - concept
related:
  - "[[shadcn-copy-not-library]]"
  - "[[tailwind-v4-source-directive-cross-package]]"
  - "[[prototype-as-pixel-spec]]"
created: 2026-04-26
---
# `apps/design`'s role and the `@zeno/ui` boundary

The repo has two React apps and one shared UI package. Their roles are deliberately asymmetric: `@zeno/ui` is a generic primitive library (reusable in any project, no domain knowledge), `apps/design` is the visual catalog (faithful Paper reproduction with mock fixtures, used as a smoke test for the design system), and `apps/dashboard` is the production app (real data via TanStack Query). They share **only** through `@zeno/ui` — never cross-app imports. Composites that reveal "Zeno" domain (sidebars with runtime status, cron modals, log skeletons) live in their consuming app, not in the shared lib.

## Context

Spec 0030 (UI primitive lift, shipped 2026-04-26) ratified this boundary after a brainstorming round. The natural impulse — when `apps/design` had built a beautiful sidebar / 8 modals / table skeletons / catalog grid in pure HTML — was to lift everything into `@zeno/ui` and have both apps consume from there. That impulse was wrong because:

- `@zeno/ui` is meant to be reusable by other internal Zeno tools (future agents, internal tools). A `NewCronModal` or `DashboardSidebar` baked in pollutes the lib with project-specific code.
- The two apps have different data shapes (mock fixtures vs `useCrons()` from storage). A composite that takes "the Cron type" can't satisfy both without an awkward adapter at every call site.
- Composites evolve fast as the design changes; the lib should stay stable.

Spec 0030 lifted **only the genuinely-generic toast subsystem** (provider, hook, visual bar) and reconciled the design tokens. Composites stayed where they live — `apps/design` keeps its hand-rolled versions; `apps/dashboard` will eventually grow its own from scratch in a future spec.

## How It Works

Layers, top to bottom:

```
apps/design         apps/dashboard
   ↓                    ↓
   └────  @zeno/ui  ────┘
```

**`@zeno/ui` (`packages/ui`)** — primitives only:
- Atomic components: `Button`, `Pill`, `Dot`, `Skeleton`, `Crest`, `Losango`, `Spark`, `Input`, `EmptyState`, `ErrorState`, `CornerBrackets`, `Chip`, `Kicker`
- Radix wrappers: `Dialog`, `AlertDialog`
- Toast subsystem: `ToastProvider`, `Toaster`, `useToast`, `ToastTone` (under `components/toast/`)
- `styles/tokens.css` — Imperial Terminal palette (single source of truth, reconciled with Paper)
- Peer deps: `react`, `react-dom`. No `@tanstack/react-router`, no fixtures, no domain types.

**`apps/design` (`@zeno/design`)** — the visual catalog:
- 17 routes faithfully reproducing every Paper artboard
- JSON fixtures + `useFakeLoader` hook (~500–1000ms randomized) + `useEmptyMode` (`?empty=1` query)
- Hand-rolled composites: `DashboardSidebar`, `DashboardTopstrip`, 8 modals on a local `ModalProvider` switchboard, table skeletons, catalog grid
- Imports `@zeno/ui` for primitives only
- Mutations are local `useState` against fixtures (deterministic for screenshots — reload resets)

**`apps/dashboard` (`@zeno/dashboard`)** — production:
- TanStack Query hooks against the real API
- Imports `@zeno/ui` for primitives, has its own composites (currently visually distinct from `apps/design`; Phase 2 will rebuild them to match)
- Rule: when the dashboard composites are rebuilt, they live in `apps/dashboard/src/components/` and use `<Dialog>` Radix from `@zeno/ui`, not the design's `ModalShell`. Modal state is local controlled (`open` + `onOpenChange`), no global provider.

## How to Apply

When you're tempted to "just lift this into `@zeno/ui` so both apps can use it":

1. **Is it project-agnostic?** Would a hypothetical "Zeno admin tool" or unrelated internal app want it? If no — keep it in the consuming app.
2. **Does it know domain types** (`Cron`, `Session`, `LogEntry`)? If yes — keep it in the app; row-types live with their composite (`CronTableRow` next to `<CronTable>`), not in a central `data/types.ts`.
3. **Does it use `@tanstack/react-router`'s typed `Link`?** If yes — make the `Link` a prop and pass it from the consuming app. `@zeno/ui` never imports the router.

When you're tempted to import from `apps/dashboard` inside `apps/design` (or vice versa):

- **Don't.** No path aliases, no workspace cross-refs. They share only through `@zeno/ui`. If duplication hurts, that's the signal to extract a true primitive into `@zeno/ui`, not to wire the apps together.

When you're tempted to delete `apps/design` because it duplicates work:

- **Don't.** It's the smoke test for `@zeno/ui` and the visual reference Paper artboards live in. If a token in `tokens.css` regresses, design renders differently — that's how you catch it. Dashboard alone doesn't cover the surface.

When working on a new shared visual concept, the right path is: build it in `apps/design` first (against fixtures), prove it visually, then if it's truly primitive, lift it. If it's a composite, leave it in design until `apps/dashboard` needs the same shape — at which point a future spec rebuilds it independently in dashboard (visual reference: design).
