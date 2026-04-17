---
feature: paper-design-system
spec: "[[spec]]"
created: 2026-04-16
---
# Paper Design System — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (mostly design authoring + a small code footprint — DESIGN.md registry + rule file). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reorganize the "Hearty island" Paper file into a five-section catalog (Foundations · Primitives · Patterns · Feature components · Pages) **visually aligned with the Claude desktop app screenshots in `tmp/claude/dark/`**, create `packages/ui/DESIGN.md` as the code→Paper registry, add a governance rule (`context/rules/ui-in-paper.md`), ship **light-mode tokens** in `packages/ui/src/styles/tokens.css`, and make every page **responsive** (mobile hamburger drawer + Tailwind breakpoints).

**Architecture:** The Paper file is the dark-mode visual source of truth; the Markdown registry is the code-side link. Light-mode tokens and responsive behavior live only in code (not in Paper). The rule file enforces the design↔code link via review.

**Tech Stack:** Paper MCP tools (`mcp__plugin_paper-desktop_paper__*`), Markdown, Tailwind v4 (`@theme` + `[data-theme="light"]` + responsive utilities), React (hamburger drawer via existing `@zeno/ui` Dialog), Playwright for dual-theme + mobile smoke.

## Reference material (MUST open before drawing)

Every agent working on Paper frames or repainting pages MUST read the Claude app screenshots first:

- `tmp/claude/dark/*.png` — 8 shots (Home, Scheduled tasks list, Task detail, Create task dialog, user menu popover, etc.)
- `tmp/claude/light/*.png` — same 8 surfaces in light mode (used only for light-token hex derivation; not for Paper frames)

Open them via the `Read` tool (absolute paths). They are the canonical reference for sidebar chrome, hero headline style, card layouts, and dialog patterns.

## Approach

Seven phases. Paper work (phases 1–5) + code work (phases 6–7). Paper commits happen as docs-only; code commits stand on their own.

1. **Prep** — load Paper MCP guide, **read all `tmp/claude/dark/*.png` screenshots**, inventory existing artboards, capture `FILE_ID`.
2. **Foundations** — Palette (split dark/light chips), Typography (coral starburst hero), Spacing & radius, Iconography. Four frames. Commit partial registry.
3. **Primitives** — Button (variant grid), Input (states), Dialog (anatomy — repaint to match Create-scheduled-task dialog from Claude app), Toaster (4 levels). Four frames. Commit.
4. **Patterns** — 10+ motifs (sidebar nav item matching Cowork sidebar, status pill matching Scheduled card, row, stat tile, empty state, form field group, filter chips, search input, time range, following toggle, transcript block, user-menu popover — NEW). Commit.
5. **Feature components + Pages (repainted)** — 24 feature frames + 8 page frames **repainted to match Claude screenshots** (see spec Design section). Commit partial registry.
6. **Light-mode tokens** — add `[data-theme="light"] / .light` block to `packages/ui/src/styles/tokens.css` with hexes derived from `tmp/claude/light/*.png`. Manual Playwright toggle test at both themes. Commit.
7. **Responsive layout + governance rule** — hamburger drawer in `layout.tsx`, Tailwind breakpoint passes over every route per the spec's breakpoint table, Playwright smoke at 390×844 and 1440×900. Write `context/rules/ui-in-paper.md`, update `_index/rules.md`. Commit. PR.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `packages/ui/DESIGN.md` | Registry — markdown tables mapping every component/page to a Paper frame URL |
| `context/rules/ui-in-paper.md` | Governance rule (severity: important) — every rendered `.tsx` must have a Paper entry |
| `apps/dashboard/src/components/layout/mobile-drawer.tsx` | Hamburger drawer wrapper around `Dialog` for sidebar on mobile |

### EDIT

| File | Change |
|---|---|
| `context/_index/rules.md` | Add link to `ui-in-paper.md` under `severity: important` |
| `packages/ui/src/styles/tokens.css` | Add `[data-theme="light"] / .light` palette block |
| `apps/dashboard/src/components/layout/layout.tsx` | Wire hamburger toggle + responsive sidebar hide/show |
| `apps/dashboard/src/components/layout/sidebar.tsx` | Accept `onNavigate` callback to close the mobile drawer on nav click |
| Every route under `apps/dashboard/src/routes/_authed/**` | Tailwind responsive classes per the breakpoint table in the spec |
| Every component under `apps/dashboard/src/components/**` | Same — responsive class pass (row layouts, card grids, form stacking) |

### Paper file ("Hearty island")

Organized into 5 named pages/sections. Content per section:

| Section | Frames |
|---|---|
| Foundations | Palette, Typography, Spacing & radius, Iconography |
| Primitives | Button, Input, Dialog, Toaster |
| Patterns | Sidebar nav item, Status pill, Row, Stat tile, Empty state, Form field group, Filter chips, Search input with hint, Time range select, Following toggle, Transcript message block |
| Feature components | 24 frames — one per `.tsx` component under `apps/dashboard/src/components/**` (post-0015 kebab-case filenames, PascalCase frame names) |
| Pages | Login, Home, Crons list, Cron detail, Sessions list, Session detail, Settings, Logs |

## Phase Ordering

Phases must run in order because the registry file is built incrementally (`DESIGN.md` gains a section per phase). Phases 6 and 7 (code work) can technically start in parallel with Paper phases — but ship them after phase 5 to avoid an inconsistent intermediate state where the repainted Paper pages don't yet match the running app.

Nothing blocks starting Phase 1 other than the `@zeno/ui` package existing (delivered by spec 0016) — the Primitives section links to files at `packages/ui/src/components/`.

## Risks / Open Decisions

- **Paper URL structure.** The `FILE_ID` is captured once from `get_basic_info` and reused. Frame URLs have the form `https://app.paper.design/file/<FILE_ID>/<PAGE_OR_FRAME_ID>`. If Paper changes URL structure, re-derive from a freshly-opened frame.
- **Paper "pages" vs grouped frames on a single canvas.** The MCP may or may not expose native page creation. If not, organize via clearly-labeled anchor frames ("01. Foundations", "02. Primitives", …) aligned vertically on the canvas. Registry rows link to section-anchor frames when finer IDs aren't available.
- **Frame drawing consistency.** Build a single "Primitive frame template" once (1440 wide, title top-left, content in a centered container, consistent margins) and duplicate it per frame. Avoids drift in padding/label placement.
- **Typography frame requires font loading.** Call `get_font_family_info` before placing Instrument Serif / Inter text, per the Paper MCP instructions.
- **Feature components (24) take time.** Expect ~5 min per frame, ~2h total for this section. Consider spreading across multiple sittings; each frame commit keeps registry diffs small.
- **Drift risk post-ship.** The governance rule + PR review is the only enforcement. If drift becomes routine, follow up with a CI script that greps rendered `.tsx` files and diffs against `DESIGN.md` rows — backlog, not this spec.
- **Registry is one file.** If it grows past 80–100 rows, consider splitting by section into separate files under `packages/ui/design/`. Not needed today.
- **Light-mode hex derivation.** Eyeball from `tmp/claude/light/*.png`. Any color-picker extension is fine. Lock final values in the Foundations Palette frame once implementation settles.
- **`html[data-theme]` vs `.light` class.** The spec documents both selectors for future flexibility. Implementation can use whichever is simpler; Tailwind v4 supports both via `@variant` or plain CSS. Default: `.light` class since it's trivially toggled via devtools for validation.
- **Hamburger drawer** — uses `@zeno/ui` `Dialog` primitive as the drawer host. Slide-in animation is out of scope (default Radix fade is acceptable). If the user wants native-feeling slide-in later, swap to `@radix-ui/react-dialog` with a custom content class — no API surface change.
- **Responsive tables.** `/logs` and `/crons` have table-like layouts. On mobile: wrap the table in `overflow-x-auto`, keep row layout, let it scroll. Stacking rows into cards is a bigger redesign and YAGNI for Zeno (single operator).
