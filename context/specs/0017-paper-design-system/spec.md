---
status: shipped
feature: paper-design-system
created: 2026-04-16
shipped: 2026-04-17
---
# Paper Design System — Spec

**Status:** Shipped
**Scope:** Build a complete design system inside Paper (paper.design) that catalogs every visual component and every screen rendered by the Zeno dashboard. Establish a `packages/ui/DESIGN.md` registry mapping each code-level component to its Paper frame. Codify the governance rule: **no UI on screen without a Paper entry**. The design system builds on top of spec 0008 (palette, type, spacing) and the primitives extracted in spec 0016.

## Context

Spec 0008 defined the palette, typography, and spacing; it also produced artboards for the eight dashboard pages. What it did **not** produce is a component-level catalog: there's no single Paper frame that shows "here is our Button in all variants", "here is our Dialog anatomy", "here is our status pill in its three states". Every artboard reinvents these pieces locally.

The cost of that: (a) visual drift between pages that should share a primitive, (b) no canonical reference for a new screen, (c) no honest test that code matches design — only ad-hoc "looks close enough" by eye.

Specs 0015 (rename) and 0016 (extract `@zeno/ui`) normalize the code side. This spec normalizes the design side. After both ship, a third cut — 0018 — can add new primitives (alert-dialog, toast variants) grounded in the catalog rather than one-off code.

## Problem Statement

1. **No canonical component reference.** A developer writing a new screen has to either (a) read the eight artboards and infer what a "Button" or "Row" looks like, or (b) read code. Both drift from each other.
2. **No design-level test for new UI.** Paper artboards exist, but nothing enforces that a new screen uses existing components; each artboard is hand-painted. The constitution-style rule — "only use components in the design system" — has no artifact to point at.
3. **Paper file is unorganized.** Spec 0008 built eight frames in Paper. They coexist without hierarchy: foundations, primitives, patterns, and pages mingle on one canvas.
4. **No design → code traceability.** Given a component in the codebase, there's no pointer to "which Paper frame is this?". Given a Paper frame, no pointer to "which file is this?". Breakage is silent in both directions.

## Reference material (Claude desktop app)

The user provided fresh Claude desktop-app screenshots under `tmp/claude/`:

- `tmp/claude/dark/*.png` — 8 screenshots of Claude in **dark mode** (Cowork surface): Home, Scheduled tasks, Create task dialog, Task detail, user menu popover.
- `tmp/claude/light/*.png` — 8 screenshots of the same surfaces in **light mode**.

**Every agent drawing frames in Paper must open these screenshots first** (via the Read tool, as the path is absolute) and reference them as the canonical visual language. The goal is "as close to Claude app as possible, while still being the Zeno dashboard". Specific elements to mirror:

- Sidebar chrome: capitalized small-cap section labels, the Cowork-style sub-items (Scheduled / Dispatch / Pinned / Recents with colored dots), bottom-left user chip with avatar initials.
- Page hero: Instrument Serif display headline with a coral starburst glyph adjacent to the copy (not the Z-glyph used in spec 0008 — replace the Z with the starburst mark to match the app).
- Cards for `Scheduled tasks` list: 3-column grid, each card ~240×100, with title / description / status pill at the bottom. Paused = neutral pill; active = green clock + human-readable frequency.
- Dialog pattern: "Create scheduled task" in the screenshots is the reference for our form Dialog — labeled fields with `*`, compact inline controls at the bottom, Cancel (ghost) + Save (filled) right-aligned.
- User menu popover: bottom-left, above the user chip, with email header + Settings / Language / Get help / Log out items.

Any deviation from these references must be justified in the frame's description (e.g., "Zeno has no Projects nav because it's single-surface"). Pure invention where the app has a pattern is a bug.

## Non-Goals

1. **Writing a public design system site** (Storybook, Docusaurus). Paper *is* the design surface; `DESIGN.md` is the registry. If the system outgrows this, Storybook is a future spec.
2. **Marketing / brand / logo work.** Zeno is single-user; no brand guidelines needed.
3. **Light-mode frames in Paper.** Code must support light mode; Paper only needs dark-mode frames. Tokens ship both palettes (`:root` dark by default, `.light` override) so switching is a runtime class toggle.
4. **Mobile-dedicated Paper frames.** Paper frames stay at 1440 desktop width. The code must be responsive (see Constraints) but designers work from the desktop reference.
5. **Inventing new components.** This spec catalogs existing UI; new primitives (alert-dialog, etc.) are added in spec 0018 and must be designed in Paper before landing in code.
6. **Updating the eight existing page artboards to reference primitives by instance.** Paper's component-instancing workflow is manual; treat the page artboards as illustrations, not linked instances, for this first iteration.
7. **Motion / animation specs.** Transitions implied by shadcn primitives are acceptable; not formally documented in Paper.
8. **Producing design tokens as export artifacts** (JSON, figma-style tokens). Tokens live in code (`packages/ui/src/styles/tokens.css`) as the source of truth; Paper mirrors them visually.
9. **Theme toggle UI.** Light/dark toggle switch in the dashboard is out of scope; this spec makes the code *capable* of both, not user-selectable. Adding the toggle is a small follow-up (backlog).

## Constraints

- **Paper is the source of truth for visuals** (dark palette). Code aligns to Paper, not the other way around. If code drifts, the drift is a bug — fix the code.
- **Tokens are defined once** in `packages/ui/src/styles/tokens.css`. The Paper design system documents the dark values in its Foundations page. Light-mode tokens live in the same CSS file under a `.light` selector; Paper does not illustrate the light scheme, but the palette row in Foundations records both hex values per token.
- **Both themes must work in code.** The dashboard reads `html[data-theme="light"]` (or falls back to `.light` class on `<html>`/`<body>`) and swaps the palette via CSS variables. Every primitive must be visually correct under both modes. No theme-toggle UI in this spec — themes switch via CSS class that a future toggle will flip.
- **Responsive in code (640 / 768 / 1280+ breakpoints).** Layouts collapse gracefully from desktop to mobile. Sidebar becomes a hamburger drawer below 768px. Tables degrade into stacked cards or horizontal scroll. No separate mobile Paper frames — desktop is the design reference, but code implements the responsive behavior using Tailwind's default breakpoints (`sm`, `md`, `lg`). Mobile behavior is validated by Playwright at 390×844 (iPhone-like) as part of the smoke.
- **Registry is a plain Markdown file** (`packages/ui/DESIGN.md`) in the code repo. Each row: component name → Paper frame URL → brief description. Cheap to maintain, easy to review in PR diffs.
- **Governance rule is project-level**, not per-PR enforcement. Added as a new entry in `context/rules/` with `severity: important`. Review catches violations.
- **Paper file naming is stable.** The file is called "Hearty island" (established in spec 0008). This spec organizes inside it; does not create a new file.
- **Every primitive** in `@zeno/ui` must have a Paper frame after this spec ships. Gap = spec not done.
- **Every feature component** rendered by the dashboard (all 24 from spec 0015) must also have a Paper frame. They're not primitives but they're rendered; the registry tracks them.

## Design

### Paper file organization

New top-level structure in the "Hearty island" Paper file, using distinct named pages:

```
00. Logo explorations (scratchpad — 6–8 brand-mark variants for user to pick one)

01. Foundations
    ├── Palette
    ├── Typography
    ├── Spacing & radius
    ├── Iconography (lucide subset)
    └── Elevation & borders

02. Primitives (from @zeno/ui)
    ├── Button — variants × sizes × states grid
    ├── Input — default / focus / disabled / error
    ├── Dialog — anatomy + spacing annotations
    └── Sonner toast — success / error / info / warning

03. Patterns (composed primitives used across pages)
    ├── Sidebar nav item — default / active / disabled
    ├── Status pill — active / paused / failed / info
    ├── Row (table line) — default / hover / expanded
    ├── Stat tile
    ├── Empty state
    ├── Form field group (label + input + helper)
    ├── Filter chips (single-select segmented)
    ├── Search input with hint
    ├── Time range selector
    ├── Following toggle
    └── Transcript message block (user / Zeno turn)

04. Feature components (dashboard-specific)
    ├── Cron row / Cron form / Cron actions / Cron status pill / Cron run history row
    ├── Activity row / Stat tile (home variant)
    ├── Sidebar / Layout shell
    ├── Session row / Message block
    ├── Log row / Level chips / Log search input / Time range select /
        Following toggle / Log JSON block
    └── Settings — Profile file row / MCP server row / Service status / Restart dialog

05. Pages (existing spec 0008 artboards — kept as-is, unchanged)
    ├── Zeno · Login
    ├── Zeno · Home
    ├── Zeno · Crons (list)
    ├── Zeno · Cron detail
    ├── Zeno · Sessions (list)
    ├── Zeno · Session detail
    ├── Zeno · Settings
    └── Zeno · Logs
```

Each page groups related frames. Within a page, frames carry the component's exact export name (PascalCase) — e.g. `Button`, `CronRow`, `LogJsonBlock` — so registry lookup is unambiguous.

### Foundations page content

Four frames:

1. **Palette** — color chips for every token in `tokens.css`. Each chip labeled with token name (`canvas`, `panel`, `sidebar`, `border-subtle`, `text-primary`, `text-secondary`, `text-tertiary`, `accent`, `status-active`, `status-paused`, `status-failed`) and **two hex values** side by side: dark (default) and light. Layout: each chip is a split rectangle — top half dark, bottom half light — so the designer + developer can eyeball both schemes in one glance. Values must match `packages/ui/src/styles/tokens.css` exactly.
2. **Typography** — one row per type role: Display headline (Instrument Serif 36/1.1 — paired with the coral starburst glyph as seen in the Claude app screenshots, NOT the legacy Z-glyph), Page title (Inter SemiBold 22), Card title (Inter SemiBold 15), Body (Inter Regular 14/20), Muted small (Inter Regular 12), Section label (Inter Medium uppercase 11/0.08em), Mono (ui-monospace 13).
3. **Spacing & radius** — stacked rectangles showing 4/8/12/16/24/32/48/64 spacing; 4/6/8/10/12 radii with labels.
4. **Iconography** — the subset of `lucide-react` icons used (or planned to be used) with labels. Max 20. Match the stroke weight and size used in the Claude screenshots (1.5px stroke, 16–18px glyph).

### Primitives grid pattern

For each primitive: **one frame showing all variants × sizes × states on a grid**. Example for Button:

```
         primary     outline    ghost       accent
sm       [btn]       [btn]      [btn]       [btn]
md       [btn]       [btn]      [btn]       [btn]
lg       [btn]       [btn]      [btn]       [btn]
(hover)  [btn]       [btn]      [btn]       [btn]
(disabled) [btn]     [btn]      [btn]       [btn]
```

Input: default / focus / filled / disabled / with-error-text.
Dialog: one large frame with labeled anatomy — overlay, container, header (title + description), body, footer (CTAs). Arrow annotations calling out padding (32), radius (12), max-width (512), gap (20).
Sonner: four toasts (success / error / info / warning) stacked — colors pulled from status tokens.

### Patterns

Patterns are composed primitives used in multiple places. Each gets a frame showing the three most common states (default / hover-or-active / empty-or-error). They don't have a 1:1 code counterpart; they're the reusable *motifs* that shape pages. The feature components in section 04 are instances of these patterns at the code level.

### Feature components

For every PascalCase component in `apps/dashboard/src/components/**` (post-0015 rename: all kebab-case filenames, PascalCase exports), one frame. Frames show the primary state only — variant explosion lives at the primitive level, not the feature level. Purpose: pure traceability. "What does `LogJsonBlock` look like?" → open frame, see it.

### Pages

Copied from existing spec 0008 artboards. Only change: ensure page name matches the label in `05. Pages` for registry lookup. Page artboards remain hand-drawn references; not enforced to be instances of primitives/patterns (that's a future upgrade if Paper's component linking matures).

**Post-0008 visual realignment.** The existing eight artboards predate the Claude-app screenshot refresh in `tmp/claude/`. This spec repaints them to match the new reference:

- **Home** (`Zeno · Home`) — replace the legacy Z-glyph hero with the coral starburst + Instrument Serif "Good evening, Operator." exact pattern from `tmp/claude/dark/Screenshot 2026-04-16 at 23.24.59.png`. Keep Zeno-specific content below (stats row, activity).
- **Crons list** (`Zeno · Crons (list)`) — adopt the 3-column card grid from `Screenshot 2026-04-16 at 23.25.32.png` (Scheduled tasks). Each card shows title / description / status pill (Paused neutral / Active green-clock-with-frequency).
- **Cron detail** — task-detail layout from `Screenshot 2026-04-16 at 23.25.46.png`: main column for metadata + instructions, right sidebar with run history stacked as timestamp cards, coral "Run now" button top-right.
- **Cron create** (`crons.new`) — centered modal dialog matching `Screenshot 2026-04-16 at 23.25.37.png` (Create scheduled task): labeled fields with `*`, compact project + model selectors at the bottom, Cancel (ghost) + Save (filled neutral) right-aligned.
- **User menu** — bottom-left popover above the user chip (see `Screenshot 2026-04-16 at 23.26.15.png`). New pattern to capture: popover with email header, menu items with leading icons, Log out at the bottom. Triggered from the avatar chip in every sidebar-bearing page.

Redrawn artboards replace the existing ones (Paper frame name stays, content changes).

### Code-only deliverables (no Paper frames)

Two pieces of work in this spec exist only in code because they're not visual-authoring tasks:

**Light-mode tokens.** Extend `packages/ui/src/styles/tokens.css`:

```css
:root {
  /* existing dark tokens — unchanged */
}

[data-theme="light"],
.light {
  --color-canvas: #FAF7F2;        /* warm off-white */
  --color-panel: #F2EEE6;         /* card surface */
  --color-sidebar: #EFEAE0;       /* slightly darker than canvas */
  --color-border-subtle: #E0D9CC;
  --color-text-primary: #1E1B18;  /* warm near-black */
  --color-text-secondary: #6F685E;
  --color-text-tertiary: #A69F92;
  --color-accent: #E66B3D;        /* same coral across modes */
  --color-status-active: #3E8B5E;
  --color-status-paused: #A6813F;
  --color-status-failed: #B74A4A;
}
```

(Exact hexes validated against the Claude light-mode screenshots — subject to small adjustment during implementation; the palette frame in Paper records the final values.) The `[data-theme="light"]` selector matches a future toggle; the `.light` class provides a CSS-only opt-in for now.

**Responsive code.** Every rendered `.tsx` must respond to Tailwind breakpoints. Concrete requirements by route:

| Route | Below 768px | 768–1280px | 1280+ |
|---|---|---|---|
| All | Sidebar collapses into a top `<header>` with hamburger toggle; on toggle, drawer slides in from the left | Sidebar always visible, 200px wide | Same as md |
| `/` Home | Stats row stacks (1 column) | 3 columns | 3 columns |
| `/crons` | Cards stack 1-col | 2 columns | 3 columns (match Claude app) |
| `/crons/$id` | Metadata above run history (1 col) | Side-by-side 2-col | Same as md |
| `/sessions` | Rows collapse to 2-line cards | Full row layout | Same as md |
| `/sessions/$threadId` | Transcript full-width with reduced padding | Normal padding | Normal padding |
| `/logs` | Filter bar wraps; rows truncate event column | Filter bar inline; full row | Same as md |
| `/settings` | Sections stack; tables scroll horizontally | Normal layout | Same as md |

Implementation uses Tailwind utilities (`md:`, `lg:`, `hidden md:flex`, etc.). No JS-driven responsive logic except the hamburger drawer (stateful). Mobile testing via Playwright at 390×844.

### `packages/ui/DESIGN.md` registry

Lives inside the `@zeno/ui` package (delivered by spec 0016 before this spec starts). Markdown table; one row per Paper frame.

```markdown
# Zeno UI — Design registry

Every UI element rendered by Zeno has a frame in the "Hearty island" Paper file.
When a component changes visually, update both the code and the Paper frame in
the same PR. Drift is a bug.

**Paper file:** https://app.paper.design/file/<FILE_ID>

## Foundations

| Frame | Paper link | Notes |
|---|---|---|
| Palette | https://app.paper.design/file/<ID>/<FRAME_ID> | Source of truth = `src/styles/tokens.css` |
| Typography | https://app.paper.design/file/<ID>/<FRAME_ID> | |
| Spacing & radius | ... | |
| Iconography | ... | |

## Primitives

| Component | Package path | Paper frame |
|---|---|---|
| Button | `packages/ui/src/components/button.tsx` | https://... |
| Input | `packages/ui/src/components/input.tsx` | https://... |
| Dialog | `packages/ui/src/components/dialog.tsx` | https://... |
| Toaster (sonner) | `packages/ui/src/components/sonner.tsx` | https://... |

## Patterns

| Pattern | Used by | Paper frame |
|---|---|---|
| Sidebar nav item | `apps/dashboard/src/components/layout/sidebar.tsx` | https://... |
| Status pill | `cron-status-pill.tsx`, `service-status.tsx` | https://... |
| Row (table line) | `cron-row.tsx`, `session-row.tsx`, `log-row.tsx`, `activity-row.tsx` | https://... |
| ... | | |

## Feature components

| Component | File | Paper frame |
|---|---|---|
| CronActions | `apps/dashboard/src/components/crons/cron-actions.tsx` | https://... |
| CronForm | `apps/dashboard/src/components/crons/cron-form.tsx` | https://... |
| ... (all 24) | | |

## Pages

| Page | Route | Paper frame |
|---|---|---|
| Zeno · Login | `/login` | https://... |
| Zeno · Home | `/` | https://... |
| ... | | |
```

The registry is the *single* link between code and Paper. No inline comments in component files. The rule (added in `context/rules/`) says: "Every `*.tsx` rendered in the product must appear in `packages/ui/DESIGN.md`. PRs that add a new rendered component without an entry fail review."

### Governance rule

New file `context/rules/ui-in-paper.md` with frontmatter `severity: important`. Body:

> **Rule:** Any `.tsx` file that produces pixels in the Zeno dashboard must have a row in `packages/ui/DESIGN.md` pointing at a Paper frame. This applies to primitives (`packages/ui/src/components/`), patterns, and feature components (`apps/*/src/components/`).
>
> **Why:** Code and design drift silently. A registry makes the link explicit and reviewable. PRs that add rendered components without a Paper entry are incomplete.
>
> **How to apply:**
>
> 1. Design the component in Paper first (add a frame in the right section).
> 2. Grab the frame URL.
> 3. Add the row to `DESIGN.md` in the same PR that adds the code.
> 4. Reviewer rejects PRs missing either side.
>
> **Exceptions:** generated files (`route-tree.gen.ts`), root layout wrappers that render no visual content of their own (`__root.tsx`).

### MOC update

`context/_index/rules.md` gets a new entry under `severity: important`: `[[../rules/ui-in-paper|Every UI element must exist in Paper]]`.

## User Stories / Scenarios

1. **Developer builds a new screen.** Opens Paper → Primitives page → sees Button variants. Uses `<Button variant="accent">`. Opens Patterns → Row → copies the layout idea into a new feature component. Adds the new feature component to `DESIGN.md` with a freshly-drawn Paper frame.
2. **Designer tweaks the accent coral hex.** Updates `tokens.css` in the same PR as updating the Palette frame in Paper. Registry entry unchanged; visual cascade automatic.
3. **Reviewer checks a PR adding `LogToolbar.tsx`.** Looks at `DESIGN.md` diff; sees the new row with a Paper link; clicks through to see the frame matches the implementation. Approves.
4. **Reviewer checks a PR adding `QuickActionMenu.tsx` with NO registry entry.** Requests changes. "Add the Paper frame and a row in `DESIGN.md`."

## Success Criteria

1. "Hearty island" Paper file is reorganized into the five named pages above.
2. Foundations page has 4 frames: Palette (split dark/light chips), Typography (with coral starburst headline), Spacing & radius, Iconography.
3. Primitives page has 4 variant-grid frames: Button, Input, Dialog, Toaster.
4. Patterns page has ≥10 frames covering the motifs used across dashboard pages, visually aligned with Claude-app screenshots in `tmp/claude/dark/`.
5. Feature components page has **one frame per component** rendered in the dashboard (24 frames post-0015; could grow if 0018 adds more, which this spec accepts — the registry grows with 0018).
6. Pages page: 8 artboards from spec 0008 **repainted** to match the Claude-app reference (Home hero = coral starburst + Instrument Serif; Crons list = 3-col card grid with status pills; Cron detail = main + right-sidebar layout; Cron create = centered dialog; user menu popover added).
7. `packages/ui/DESIGN.md` exists at the package root, contains all five sections above, every row has a Paper frame URL.
8. `context/rules/ui-in-paper.md` exists; `context/_index/rules.md` has a link to it.
9. **Light mode works in code.** `packages/ui/src/styles/tokens.css` ships `[data-theme="light"] / .light` palette. Toggling `<html class="light">` via devtools swaps every primitive and every page visually; no hardcoded hex values remain in components. Validated via Playwright screenshots at both themes.
10. **Responsive in code.** Playwright smoke at 390×844 shows: hamburger toggle in header; sidebar drawer opens/closes; Crons cards stack 1-col; Logs rows truncate cleanly; no horizontal scroll except on tables where explicitly allowed.
11. A spot-check on 3 random components (e.g. `LogRow`, `CronStatusPill`, `StatTile`): clicking the Paper URL in `DESIGN.md` opens the frame; the frame visually matches the rendered component in a running dashboard within reasonable tolerance (palette exact, typography exact, spacing ~4px tolerance).
12. `pnpm run quality-gate` green — code changes for this spec are limited to (a) `tokens.css` light palette, (b) responsive Tailwind classes on existing components, (c) hamburger-drawer component in the Layout. All new/edited code respects `no any` / `no biome-ignore`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Paper frame URLs rot** when frames are moved/renamed | Keep `DESIGN.md` updated in the same PR as any Paper reorganization. Paper's URLs are frame-id stable unless a frame is deleted; moving within the file keeps the ID. If a URL rots, the fix is trivial (re-grab the link). |
| **Registry drifts** out of sync with code — new component lands without an entry | Governance rule + review enforcement. If drift persists, add a CI check later that parses `*.tsx` rendered by routes and diffs against `DESIGN.md`; YAGNI until it actually happens. |
| **Paper file becomes slow** with ~50+ frames | Paper handles thousands of nodes; five-page split mitigates per-page render cost. If slow, split into multiple files per section — defer until painful. |
| **Drawing 24 feature components is a lot of one-time work** | Acceptable — it's a one-time catalog build. Each frame is ~5 minutes of composition using existing primitives; total ~2h of design work. The value (having a reference) dwarfs the cost. |
| **Foundations page duplicates spec 0008 content** | Yes, intentionally. Spec 0008 is a historical snapshot; the Paper Foundations page is the live reference. The duplication is by design, and the tokens file in code is the ultimate source of truth. |
| **"One accent moment per screen" rule from spec 0008** may not survive re-composition | Re-check the eight page artboards during this spec; if any screen now shows >1 coral element, fix the artboard. |
| **User draws frames inconsistently** (different padding, different label placement) | Before drawing, establish a master template frame (e.g. "Primitive frame template" — 1440 wide, title at top-left, content in a centered container). Copy-paste it per frame. |
| **Code-to-Paper slug mismatch** (registry row calls it `Button` but Paper frame is `Buttons`) | Registry entry copies the *frame name* exactly. If Paper frame is renamed, registry is updated in the same PR. |
| **Light-mode hexes eyeballed from screenshots may drift from Anthropic's actual palette** | Acceptable — Zeno is not a Claude clone, just aesthetically aligned. The light palette in `tokens.css` is Zeno's, matching "Claude-esque warmth" by eye. Exact values locked in the Foundations Palette frame once implementation settles. |
| **Responsive hamburger-drawer adds stateful UI where there was none** | Drawer uses `<Dialog>` primitive from `@zeno/ui` (already ships with focus-trap + overlay from Radix). Only new state is `isMenuOpen: boolean` in the Layout component. Low surface. |
| **Responsive tests ignore intermediate widths** | Playwright smoke covers 390 (mobile), 800 (tablet), 1440 (desktop). Between breakpoints, Tailwind's defaults are trusted; no pixel-perfect per-width validation. |
| **Claude-app screenshots eventually become stale** | Screenshots live under `tmp/claude/` which is gitignored. A comment in `DESIGN.md` Foundations section points at the current reference. When Anthropic ships a visual refresh, the user drops new screenshots and opens a follow-up spec; this spec doesn't attempt to be future-proof against Claude's evolution. |

## Open Questions

None blocking. Implementation-time decisions (captured in the plan commit):

- Whether the Paper page hierarchy uses Paper's native "Pages" feature or is just labeled frame groups on a single canvas. Use native Pages if available; otherwise group-and-label. Both work for URL stability.
- Whether to include 0018's new primitives (alert-dialog, etc.) in this spec's catalog or defer to 0018. Defer — 0018 adds its own frames and registry rows. This spec catalogs *existing* UI.
- How to handle the Z-glyph (Instrument Serif italic coral). Treat as a Foundation element under Typography. Single frame showing the glyph at common sizes.
