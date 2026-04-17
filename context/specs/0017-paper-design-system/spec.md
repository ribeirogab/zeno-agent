---
status: draft
feature: paper-design-system
created: 2026-04-16
shipped: null
---
# Paper Design System — Spec

**Status:** Draft
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

## Non-Goals

1. **Writing a public design system site** (Storybook, Docusaurus). Paper *is* the design surface; `DESIGN.md` is the registry. If the system outgrows this, Storybook is a future spec.
2. **Marketing / brand / logo work.** Zeno is single-user; no brand guidelines needed.
3. **Light mode variants.** Dark-only matches spec 0008. Revisit only if the user adopts the dashboard publicly.
4. **Mobile / responsive variants.** Desktop 1440 only.
5. **Inventing new components.** This spec catalogs existing UI; new primitives (alert-dialog, etc.) are added in spec 0018 and must be designed in Paper before landing in code.
6. **Updating the eight existing page artboards to reference primitives by instance.** Paper's component-instancing workflow is manual; treat the page artboards as illustrations, not linked instances, for this first iteration.
7. **Motion / animation specs.** Transitions implied by shadcn primitives are acceptable; not formally documented in Paper.
8. **Producing design tokens as export artifacts** (JSON, figma-style tokens). Tokens live in code (`packages/ui/src/styles/tokens.css`) as the source of truth; Paper mirrors them visually.

## Constraints

- **Paper is the source of truth for visuals.** Code aligns to Paper, not the other way around. If code drifts, the drift is a bug — fix the code.
- **Tokens are defined once** in `packages/ui/src/styles/tokens.css`. The Paper design system documents the *same* values in its Foundations page; when tokens change, both sides update in the same PR.
- **Registry is a plain Markdown file** (`packages/ui/DESIGN.md`) in the code repo. Each row: component name → Paper frame URL → brief description. Cheap to maintain, easy to review in PR diffs.
- **Governance rule is project-level**, not per-PR enforcement. Added as a new entry in `context/rules/` with `severity: important`. Review catches violations.
- **Paper file naming is stable.** The file is called "Hearty island" (established in spec 0008). This spec organizes inside it; does not create a new file.
- **Every primitive** in `@zeno/ui` must have a Paper frame after this spec ships. Gap = spec not done.
- **Every feature component** rendered by the dashboard (all 24 from spec 0015) must also have a Paper frame. They're not primitives but they're rendered; the registry tracks them.

## Design

### Paper file organization

New top-level structure in the "Hearty island" Paper file, using distinct named pages:

```
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

1. **Palette** — color chips for every token in `tokens.css`. Each chip labeled with token name (`canvas`, `panel`, `sidebar`, `border-subtle`, `text-primary`, `text-secondary`, `text-tertiary`, `accent`, `status-active`, `status-paused`, `status-failed`) and hex value.
2. **Typography** — one row per type role from spec 0008: Display headline (Instrument Serif 36/1.1), Page title (Inter SemiBold 22), Card title (Inter SemiBold 15), Body (Inter Regular 14/20), Muted small (Inter Regular 12), Section label (Inter Medium uppercase 11/0.08em), Mono (ui-monospace 13).
3. **Spacing & radius** — stacked rectangles showing 4/8/12/16/24/32/48/64 spacing; 4/6/8/10/12 radii with labels.
4. **Iconography** — the subset of `lucide-react` icons used (or planned to be used) with labels. Max 20.

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
2. Foundations page has 4 frames: Palette, Typography, Spacing & radius, Iconography.
3. Primitives page has 4 variant-grid frames: Button, Input, Dialog, Toaster.
4. Patterns page has ≥10 frames covering the motifs used across dashboard pages.
5. Feature components page has **one frame per component** rendered in the dashboard (24 frames post-0015; could grow if 0018 adds more, which this spec accepts — the registry grows with 0018).
6. Pages page contains the 8 existing artboards from spec 0008 with names matching registry rows.
7. `packages/ui/DESIGN.md` exists at the package root, contains all five sections above, every row has a Paper frame URL.
8. `context/rules/ui-in-paper.md` exists; `context/_index/rules.md` has a link to it.
9. A spot-check on 3 random components (e.g. `LogRow`, `CronStatusPill`, `StatTile`): clicking the Paper URL in `DESIGN.md` opens the frame; the frame visually matches the rendered component in a running dashboard within reasonable tolerance (palette exact, typography exact, spacing ~4px tolerance).
10. `pnpm run quality-gate` green — this spec is documentation-heavy, no code change beyond the new `DESIGN.md` and `rules/ui-in-paper.md`. Tests/lint are trivially unaffected.

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

## Open Questions

None blocking. Implementation-time decisions (captured in the plan commit):

- Whether the Paper page hierarchy uses Paper's native "Pages" feature or is just labeled frame groups on a single canvas. Use native Pages if available; otherwise group-and-label. Both work for URL stability.
- Whether to include 0018's new primitives (alert-dialog, etc.) in this spec's catalog or defer to 0018. Defer — 0018 adds its own frames and registry rows. This spec catalogs *existing* UI.
- How to handle the Z-glyph (Instrument Serif italic coral). Treat as a Foundation element under Typography. Single frame showing the glyph at common sizes.
