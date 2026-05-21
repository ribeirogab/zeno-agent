---
status: draft
feature: knowledge-graph-view
created: 2026-05-21
shipped: null
issue: 92
---
# Knowledge Graph View — Spec

**Status:** Draft
**Scope:** Add an Obsidian-style interactive force-directed graph view as a second mode of the `/knowledge` dashboard page shipped in spec [[../2026-05-20-knowledge-browser-page/spec-knowledge-browser-page|2026-05-20-knowledge-browser-page]]. Operator toggles between Tree mode (existing) and Graph mode in the main pane. Nodes are markdown files, edges are wikilinks between them. Read-only. No edit, no graph layout persistence, no 3D mode.

## Context

Spec 2026-05-20-knowledge-browser-page shipped the `/knowledge` route with a tree sidebar + markdown viewer driven by `GET /api/knowledge/files` and `GET /api/knowledge/file?path=…`. Wikilink resolution lives in `@zeno/knowledge` (`extractWikilinks` + `resolveWikilinks`) and is consumed server-side by the API; the dashboard receives `wikilinks: Record<slug, resolvedPath | null>` per file.

A flat tree view answers "what notes does the agent see" but not "how are they connected". For operators with 10+ interconnected files (a common shape once the knowledge base is in regular use), structural problems — orphan notes, missing connections between clusters that should reference each other, unbalanced clusters — are invisible in a tree. Obsidian's graph view is the proven UX shape for surfacing this; replicating it is the goal. The user has stated they want the experience "identical to Obsidian" — undirected edges, hover-highlights-neighbors, ghost nodes for unresolved wikilinks, panels for filters / groups / display.

This spec adds a Graph mode to the existing `/knowledge` page. Tree mode remains the default and is unchanged.

## Problem Statement

Operators cannot see the structural shape of their knowledge base from the dashboard. Specifically:

- Orphan notes (no incoming or outgoing wikilinks) are invisible in a tree — they look like every other file.
- Clusters that should reference each other but don't are invisible in a tree.
- Hub notes (referenced by many others) are not distinguishable from leaf notes.
- Broken wikilinks (`[[old-name]]` after a rename) are surfaced individually in the rendered viewer but not aggregated — operator can't see "I have 7 stale wikilinks across these 4 files".
- The Obsidian users in our target audience have a learned mental model that the tree view does not satisfy.

Add a Graph mode to `/knowledge` that visualizes files as nodes, wikilinks as undirected edges, and ghost nodes for unresolved links — matching Obsidian's UX shape so the mental model transfers.

## Non-Goals

- **Editing from the dashboard.** Graph is read-only. Adding/removing notes, renaming, editing wikilinks all happen in the operator's editor.
- **Replacing Tree mode.** Tree remains the default and the primary navigation surface. Graph is opt-in via toggle.
- **3D graph mode.** Tracked in issue #92 explicitly as out of scope. `three.js` bundle cost not justified for v1.
- **Custom group editor.** Obsidian lets operators define groups via queries (`tag:#x`, `path:processes`). v1 derives groups automatically from top-level folder. No UI to create custom groups.
- **Force-tuning sliders panel.** Obsidian has a "Forces" panel (4 sliders: center, repel, link force, link distance). v1 ships with tuned defaults only. YAGNI — can add later if operators complain.
- **Layout persistence.** Force simulation re-runs each load. No "freeze and save this layout" feature.
- **Time-based playback.** Replaying note-creation order in graph form. Out of scope.
- **Auto-clustering / community detection.** Out of scope.
- **Mobile / responsive layout.** Dashboard is desktop-only; this page follows that constraint.
- **Custom node icons.** Single-shape (circle) nodes only. Color encodes group.
- **Search across content.** Search filter matches node label only (title / filename), not file contents.
- **Backlinks panel.** Obsidian has a side panel listing "linked mentions" and "unlinked mentions". Out of scope — graph already visualizes linked mentions; unlinked mentions would require full-text search.

## Constraints

- **Read-only API.** New endpoint is `GET` only. No `POST`/`PUT`/`DELETE`.
- **Same container as worker.** `apps/api` reads `/app/knowledge` — the read-only bind mount established by spec 2026-05-20-knowledge-folder-per-profile. No new mount.
- **Reuses `@zeno/knowledge` server-only.** `extractWikilinks` + `resolveWikilinks` already exist from spec 2026-05-20-knowledge-browser-page. Server side. No new helper in that package.
- **Reuses `KnowledgeViewer` from spec 2026-05-20-knowledge-browser-page.** Side preview panel inside Graph mode embeds the same markdown viewer component, including wikilink resolution and broken-link rendering. No fork.
- **Stack already chosen.** Hono for API; TanStack Router + react-query in dashboard; biome lint; vitest tests. Adding `react-force-graph-2d` requires a learning note per `[[../../constitution|constitution]]`.
- **Bundle budget — lazy chunk.** `react-force-graph-2d` (~80 KB gz) + `d3-force` (~25 KB gz) + glue MUST live in a chunk loaded only when `view=graph`. Chunk total ≤ **120 KB gzipped**. Main bundle delta over the post-#91 baseline ≤ **5 KB gz** (view toggle + Suspense fallback only).
- **No external network.** Graph renderer offline — no remote CDN. `react-force-graph-2d` is pure local canvas + d3-force.
- **No XSS surface.** Node labels are file titles / filenames — never rendered as HTML, only as canvas text. The side preview re-uses `KnowledgeViewer` from #91 which already enforces no-raw-HTML.
- **Path traversal hardening.** The graph endpoint takes no client input — N/A. The side preview path goes through `GET /api/knowledge/file?path=` which already enforces the guard (per spec 2026-05-20-knowledge-browser-page).
- **Backwards-compatible URL contract.** `/knowledge` (no params) and `/knowledge?file=foo.md` MUST behave identically to #91 (Tree mode). Adding `?view=graph` is additive.
- **Paper artboards deferred.** `[[../../rules/ui-in-paper|ui-in-paper]]` (severity: important) requires every rendered `.tsx` to have an artboard in the `zeno-agent` Paper file. v1 ships without Paper artboards for the 7 new components (canvas, controls, filters-panel, groups-panel, display-panel, side-preview, view-toggle), consistent with the prior-art precedent of spec 2026-05-20-knowledge-browser-page which shipped its `KnowledgeTree` / `KnowledgeViewer` / `EmptyState` without artboards. Backfilling artboards is tracked as a follow-up once the Imperial Terminal design system reaches Paper parity for the `/knowledge` route container.

## User Stories / Scenarios

1. **Spot orphan notes.** Operator opens `/knowledge`, clicks "Graph" toggle. Canvas renders. Operator toggles "show orphans" off in the Filters panel — most of the graph stays put; a few nodes vanish. The vanished ones were the orphans. Operator turns the toggle back on, hovers each isolated node, and identifies which notes should be linked to existing notes but aren't.
2. **Audit stale wikilinks across the base.** Operator opens Graph mode. Several gray outline ghost nodes are visible. Hover on each shows the unresolved slug. Operator counts five ghost nodes — five stale references to fix. Operator clicks one of the source files (a regular node connected to a ghost), the side panel slides in with the file rendered, operator finds the broken `[[old-name]]` in context, switches to their editor to fix.
3. **Follow a cluster.** Operator hovers on a hub node (visually larger because of high degree). Neighbors are highlighted; everything else dims. Operator sees a tight cluster of five notes all linking to the hub. Operator clicks one, side panel slides in, operator reads the rendered markdown without leaving Graph mode.
4. **Deep-link to a graph view focused on a file.** Operator pastes `http://127.0.0.1:6101/knowledge?view=graph&file=playbooks/security.md` into a chat. Recipient (with dashboard access) opens the URL and lands in Graph mode with that file's side panel open. Canvas is positioned with that node visible (zoom-to-fit on selected node — best-effort if the simulation has settled).
5. **Toggle Tree↔Graph preserves selection.** Operator is in Tree mode with `playbooks/security.md` open. Clicks "Graph" toggle. URL becomes `?view=graph&file=playbooks/security.md`. Canvas renders, side panel is already open with the same file. Operator clicks "Tree" again, returns to Tree mode with the same file selected.
6. **Filter by tag.** Operator's knowledge base has 50 notes spanning multiple topics. Operator wants to see only notes tagged `#security`. Opens Filters panel, clicks `#security` chip. Graph re-renders showing only the matching subset. Toggle persists in localStorage; next session resumes filtered.
7. **Empty knowledge base.** Operator on a fresh profile with no notes opens `/knowledge?view=graph`. Canvas area shows centered copy: "No notes to graph. Add files under `~/.zeno/profiles/<name>/knowledge/`." No empty force simulation runs.
8. **Slow load on large base.** Operator with 200 notes toggles to Graph. Suspense fallback "Loading graph…" shows for ~300ms (chunk download + API). Canvas renders, force simulation runs to settle (~2s on cooldownTicks: 50). Operator can pan/zoom during settle.

## Acceptance Criteria

API:

- [ ] `GET /api/knowledge/graph` on a `/app/knowledge` containing `a.md` (body `[[b]]`), `b.md` (body `[[a]]`), `c.md` (no links), `d.md` (body `[[ghost]]`) returns 200 with body shape `{ nodes: [...4 reais + 1 ghost...], links: [{source: "a.md", target: "b.md"}, {source: "d.md", target: "?ghost:ghost"}], groups: [...] }`. The `a↔b` mutual link MUST emit a single undirected `links` entry, not two.
- [ ] `GET /api/knowledge/graph` on an empty `/app/knowledge` returns 200 with body `{ nodes: [], links: [], groups: [] }`.
- [ ] `GET /api/knowledge/graph` on a knowledge dir where one file has malformed YAML frontmatter (unbalanced quotes) returns 200 — the offending node has `tags: []`, no 500.
- [ ] Ghost nodes in the response have `id` prefixed with `?ghost:`, `exists: false`, `group: "?ghost"`, `tags: []`, `size: <degree>` where ghost `size` is in-degree only (count of distinct real files that reference the unresolved slug; ghosts emit no outgoing links).
- [ ] Real nodes have `id` set to the relative path, `exists: true`, `group` derived from `path.split('/')[0]` or `""` for root, `size` = exact degree count (incoming + outgoing undirected). `size` can be 0 for orphan files.
- [ ] Self-links (`a.md` containing `[[a]]`) MUST NOT emit a link entry. Counted in `size` zero times.
- [ ] Response includes a `groups` array mapping each distinct group string to a stable color drawn from the Imperial Terminal token set in `packages/ui/src/styles/tokens.css`. The 4-color rotation is, in alphabetical group order: `--color-gold` (#d9b362), `--color-status-active` (#6bd3a3), `--color-status-failed` (#e8617a), `--color-status-info` (#7aa6e8). The 5th and later folders, plus the `"?ghost"` group, all map to `--color-text-tertiary` (#4b4f66). Color is emitted as a hex string in the response.
- [ ] Endpoint takes no query parameters. Sending `?path=...` is ignored.

Dashboard — routing + toggle:

- [ ] Navigating to `/knowledge` (no `?view=`) renders Tree mode exactly as shipped in spec 2026-05-20-knowledge-browser-page. No regression in tree rendering, viewer rendering, wikilink resolution, or show-meta toggle.
- [ ] Navigating to `/knowledge?view=graph` renders the Graph canvas in the main pane and triggers a single dynamic `import()` of the `graph` chunk. Verified by checking the Network tab: a chunk named matching `knowledge-graph-*.js` is requested only when first switching to `view=graph`, not on `/knowledge` without the param.
- [ ] The Tree sidebar (with show-meta toggle and recursive tree) renders in both Tree mode and Graph mode unchanged.
- [ ] A `ViewToggle` pill at the top of the main pane (above the canvas/viewer) shows two buttons: "Tree" and "Graph". The current mode is visually distinct (background fill). Clicking the inactive mode updates the URL `?view=` and swaps the main pane without a full page reload.
- [ ] Toggling Tree → Graph preserves the `?file=` query param. Toggling Graph → Tree preserves `?file=` too.

Dashboard — graph canvas:

- [ ] In Graph mode with a non-empty response, a canvas element from `react-force-graph-2d` renders. Force simulation runs and settles within 5 seconds on a 100-node fixture.
- [ ] Hovering over a node sets that node and its direct neighbors to opacity 1; all other nodes dim to opacity ≤ 0.3; non-incident edges dim to opacity ≤ 0.2. Verified by inspecting the canvas with `react-force-graph-2d`'s `nodeCanvasObject` / `linkCanvasObject` callbacks receiving the hover state.
- [ ] Clicking a real node updates the URL to `?view=graph&file=<id>` and opens the side preview panel from the right with `width: 480px` (verified via computed style) containing the `KnowledgeViewer` (from #91) showing that file's rendered markdown.
- [ ] Clicking a ghost node (`id.startsWith('?ghost:')`) is a no-op — URL unchanged, no side panel opens.
- [ ] The side preview panel has a close button ("X") that clears the `?file=` query param and slides the panel out.
- [ ] With the side preview open, calling `react-force-graph-2d`'s `zoom()` ref method changes the rendered viewport scale, and a mouse-drag on an empty region of the canvas fires the library's background pan handler with a non-zero delta. Verified by reading the canvas transform via the library's ref after each interaction.

Dashboard — filters panel:

- [ ] Filters panel is collapsible. Default collapsed. Toggle button labeled with a gear or filter icon.
- [ ] Filters panel contains: search input (text), tag multi-select (chips from frontmatter tags across all nodes), folder multi-select (top-level folders only), checkbox "show meta files" (reuses `zeno.knowledge.showMeta` from #91 — same key, same semantics), checkbox "existing files only" (default unchecked: ghosts visible), checkbox "show orphans" (default checked).
- [ ] With "existing files only" checked, ghost nodes (`exists: false`) are removed from the canvas.
- [ ] With "show orphans" unchecked, nodes whose API `size` field equals 0 are removed from the canvas.
- [ ] Visual node radius in the canvas is `Math.max(0.5, size * displayNodeSize)` (where `displayNodeSize` is the multiplier from the Display panel slider, default 1.0) — so orphans render as a small but visible dot rather than invisible.
- [ ] Search input filters nodes whose label (case-insensitive `String.prototype.includes`) does not match the query. Empty input = no filter. Debounced 200ms.
- [ ] Tag chips: clicking a chip toggles its membership in the active tag set. A node is included only if its `tags` intersect the active set. Empty set = no tag filter. Visually shows which chips are active.
- [ ] Folder filter: dropdown with checkbox per top-level folder. A node is included only if its `group` is in the active folder set. Empty set = no folder filter.
- [ ] Filter state persists to `localStorage.zeno.knowledge.graph.filters` on every change. Reloading the page restores the state. Malformed JSON in localStorage falls back to defaults without throwing.

Dashboard — groups panel:

- [ ] Groups panel is collapsible. Default collapsed.
- [ ] Groups panel renders a read-only legend: one row per group with `<color swatch> <folder name>`. Derived from the `groups` array in the API response.
- [ ] Group `"?ghost"` (if present) is labeled "unresolved" in the legend.
- [ ] No editor controls in this panel for v1.

Dashboard — display panel:

- [ ] Display panel is collapsible. Default collapsed.
- [ ] Display panel contains three sliders: "node size" (range 0.5–2.0, step 0.1, default 1.0), "link thickness" (range 0.5–3.0, step 0.1, default 1.0), "label fade zoom" (range 0.5–4.0, step 0.1, default 1.5).
- [ ] Slider changes reflect in the canvas within 100ms (one render frame). The graph uses a custom `nodeCanvasObject` (not the library's default `nodeRelSize`-driven painter), so: node-size slider drives the `displayNodeSize` multiplier inside the radius formula `Math.max(0.5, size * displayNodeSize)`; link-thickness slider is passed as `ctx.lineWidth` inside the custom `linkCanvasObject`; label-fade slider hides node labels (drawn inside the same `nodeCanvasObject`) when the current zoom level is below the threshold.
- [ ] Slider state persists to `localStorage.zeno.knowledge.graph.display` on every change. Reload restores. Malformed JSON falls back to defaults.

Sidebar nav:

- [ ] No changes to the dashboard sidebar from #91. The "knowledge" entry routes to `/knowledge` with no query parameters, which renders Tree mode. There is no persisted "last mode" state — operators who want Graph as their starting view bookmark `/knowledge?view=graph` themselves. URL is the only source of truth for current mode.

Quality + bundle:

- [ ] `pnpm run quality-gate` is green: biome, typecheck, all vitest tests across workspaces.
- [ ] After `vite build`, the production bundle has a separate chunk for the graph code. The chunk name matches `knowledge-graph-*.js` (or equivalent — vite hashes). Size of that chunk gzipped ≤ **120 KB**.
- [ ] Main bundle delta over the post-spec-2026-05-20-knowledge-browser-page baseline ≤ **5 KB gzipped**. Measured by running `vite build` against the spec-2026-05-20-knowledge-browser-page tip and this feature tip and diffing the main entry chunk size.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `react-force-graph-2d` ships unexpected transitive deps (e.g. `three.js` for the 3D variant). | Use the `-2d` variant explicitly. Verify `pnpm why three` returns nothing post-install. Document in the deps learning. |
| Graph component imported in the wrong place causes the chunk to merge with the main bundle. | All imports of `react-force-graph-2d` MUST go through the single `graph/index.tsx` file that is itself dynamically imported via `React.lazy()`. No top-level static imports of the library outside that chunk. Build-time check: verify chunk size after each build. |
| Force simulation is unstable on small graphs (1–3 nodes). | Render the empty state when `nodes.length === 0`. For 1–3 nodes, accept the look — they will settle into a stable triangle/dyad/single. Acceptable for v1. |
| Force simulation is slow / janky on large graphs (500+ nodes). | Out of scope for v1 — documented as known limit. Operators with large bases use the filters (tag / folder) to scope. `cooldownTicks: 50` keeps the simulation bounded. |
| Server graph endpoint reads + parses N files on every request. | At our scale (< 500 notes typical) this is sub-50ms. react-query client-side cache (staleTime 30s) prevents re-fetch on every render. If profiling shows >500ms in production, add a server-side cache keyed by directory mtime — out of scope v1. |
| Wikilink resolution ambiguity (multiple files match bare slug). | Mirrors #91 behavior: `resolveWikilinks` returns `null` for ambiguous slugs. Those become ghost nodes in the graph. Consistent with viewer rendering them as broken. |
| `localStorage.setItem` throws QuotaExceededError. | Wrap in `try/catch`. On failure, state remains in React memory for that session only. No UI crash. |
| Lazy chunk fails to load (network error). | Wrap the `Suspense` in an `ErrorBoundary` that catches the rejected import. Render "Failed to load graph view. [Reload]" with a button that triggers `window.location.reload()`. |
| react-force-graph-2d SSR-incompatible. | N/A — dashboard is a pure Vite SPA with no SSR. |
| Theme conflict (canvas background must match Imperial Terminal dark). | Canvas background reads the CSS custom property `--color-canvas` (#08090F) via `getComputedStyle` on the root element. Nodes/edges use the palette tokens enumerated in the API-response palette AC (`--color-gold`, `--color-status-active`, `--color-status-failed`, `--color-status-info`, `--color-text-tertiary`), resolved client-side via `getComputedStyle` at mount. All tokens verified present in `packages/ui/src/styles/tokens.css`. |
| Toggle URL state collides with `?file=`. | `validateSearch` accepts both keys; `view` defaults to `'tree'` when absent. Tree mode ignores `view`, Graph mode reads it. No collision. |
| Ghost node IDs collide with real paths (e.g. a file literally named `?ghost:foo.md`). | The `?` character is invalid on Windows and rare on Unix; nonetheless guard by prefixing with the full sentinel `?ghost:` and requiring `exists` flag. If a real file is named exactly that, it would still parse as a real node (path passes through); the ghost mapping uses slugs, not paths. Collision is theoretical only. |
| Adding `view?:` to `KnowledgeSearch` re-triggers TS4023 + `exactOptionalPropertyTypes` from spec 2026-05-20-knowledge-browser-page. | Follow `[[../../learnings/tanstack-validatesearch-needs-exported-interface|tanstack-validatesearch-needs-exported-interface]]` — keep `export interface KnowledgeSearch`, type new key as `view?: 'tree' \| 'graph' \| undefined` (explicit `\| undefined`, not bare optional), and run `pnpm --filter @zeno/dashboard exec tsr generate` before typecheck per `[[../../learnings/tanstack-router-pretypecheck-regen|tanstack-router-pretypecheck-regen]]`. |

## Open Questions

None.
