---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-05-21-knowledge-graph-view/spec-knowledge-graph-view]]"
created: 2026-05-21
---
# `react-force-graph-2d` for the dashboard graph view

Chose `react-force-graph-2d` (canvas-based, ~80 KB gz incl. `d3-force`) over `cytoscape.js`, `sigma.js`, and a custom D3 implementation for the knowledge graph view in spec [[../specs/2026-05-21-knowledge-graph-view/spec-knowledge-graph-view|2026-05-21-knowledge-graph-view]].

## Context

Target: <500 nodes typical (operator's knowledge base). Obsidian-style UX: undirected, hover dim, click-opens-side-panel, filter/groups/display panels. Bundle budget for the lazy chunk ≤ 120 KB gz.

## Decision

`react-force-graph-2d`:
- Native React wrapper (`<ForceGraph2D nodes={…} links={…} />`), no glue code for the mount cycle.
- Canvas renderer keeps DOM light; pan/zoom/drag built in.
- Custom node painter via `nodeCanvasObject` covers all our visual needs (group color, hover dim, label fade by zoom).
- ~80 KB gz incl. transitive `d3-force` per docs; measured against our dashboard bundle in Task D2 of the implementation plan.
- Variant MUST be `-2d`, not the bare `react-force-graph` package, to avoid bundling `three.js` for the 3D variant. Post-install check: `pnpm --filter @zeno/dashboard why three` must be empty.

## Rejected

- `cytoscape.js`: heavier (~150 KB gz core + extras), React wrapper less idiomatic, more layout algos than we need.
- `sigma.js`: WebGL, scales to 10k+ nodes, but our target is 200. Overkill, no React wrapper.
- Custom D3: ~30 KB gz but reimplements canvas/zoom/drag/click — a week of glue we get for free.

## How to apply

- The library MUST be statically imported from exactly one module: `apps/dashboard/src/components/knowledge/graph/index.tsx`. That module is then `React.lazy()`-imported from `apps/dashboard/src/routes/_authed/knowledge.tsx`. This keeps the library inside a single chunk loaded only when `view=graph`.
- Verify post-install: `pnpm --filter @zeno/dashboard why three` must return empty.
- Bundle delta after `vite build`: the graph chunk gzipped ≤ 120 KB; main entry delta ≤ 5 KB gz.
- Tests mock the default export globally via `apps/dashboard/vitest.setup.ts` — happy-dom has no canvas, so a real render attempt explodes. The mock renders a `<div data-testid="force-graph-2d">` stub and forwards `onNodeClick`/`onNodeHover` through DOM events.
