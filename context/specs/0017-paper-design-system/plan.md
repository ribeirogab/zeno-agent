---
feature: paper-design-system
spec: "[[spec]]"
created: 2026-04-16
---
# Paper Design System — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (mostly design authoring + a small code footprint — DESIGN.md registry + rule file). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reorganize the "Hearty island" Paper file into a five-section catalog (Foundations · Primitives · Patterns · Feature components · Pages), create `packages/ui/DESIGN.md` as the code→Paper registry, and add a governance rule (`context/rules/ui-in-paper.md`) declaring that every rendered `.tsx` must have a Paper entry.

**Architecture:** The Paper file is the visual source of truth; the Markdown registry is the code-side link. No new code runtime behavior. The rule file enforces the link via review. The spec relies on the Paper MCP for frame creation; most steps are "use the MCP to draw X" rather than "write code".

**Tech Stack:** Paper MCP tools (`mcp__plugin_paper-desktop_paper__*`), Markdown, `context/rules/` structure.

## Approach

Five phases. The first is a one-shot load of the Paper guide (required before touching Paper); the next four build the catalog section by section, each ending with a registry update and commit.

1. **Prep** — load the Paper MCP guide, read the existing artboards, inventory what's already in the file. Capture the Paper `FILE_ID` once — all registry URLs derive from it.
2. **Foundations** — Palette, Typography, Spacing & radius, Iconography. Four frames. Commit partial registry.
3. **Primitives** — Button (variant grid), Input (states), Dialog (anatomy), Toaster (4 levels). Four frames. Commit.
4. **Patterns** — 10+ reusable motifs (sidebar nav item, status pill, row, stat tile, empty state, form field group, filter chips, search input, time range, following toggle, transcript block). Commit.
5. **Feature components + Pages + rule** — 24 feature-component frames covering every dashboard component file; 8 page frames (reuse existing from spec 0008, renaming to match registry); write the governance rule; link it from `context/_index/rules.md`. Final commit + PR.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `packages/ui/DESIGN.md` | Registry — markdown tables mapping every component/page to a Paper frame URL |
| `context/rules/ui-in-paper.md` | Governance rule (severity: important) — every rendered `.tsx` must have a Paper entry |

### EDIT

| File | Change |
|---|---|
| `context/_index/rules.md` | Add link to `ui-in-paper.md` under `severity: important` |

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

Phases must run in order because the registry file is built incrementally (`DESIGN.md` gains a section per phase). Nothing blocks starting Phase 1 other than the `@zeno/ui` package existing (delivered by spec 0016) — the Primitives section links to files at `packages/ui/src/components/`.

## Risks / Open Decisions

- **Paper URL structure.** The `FILE_ID` is captured once from `get_basic_info` and reused. Frame URLs have the form `https://app.paper.design/file/<FILE_ID>/<PAGE_OR_FRAME_ID>`. If Paper changes URL structure, re-derive from a freshly-opened frame.
- **Paper "pages" vs grouped frames on a single canvas.** The MCP may or may not expose native page creation. If not, organize via clearly-labeled anchor frames ("01. Foundations", "02. Primitives", …) aligned vertically on the canvas. Registry rows link to section-anchor frames when finer IDs aren't available.
- **Frame drawing consistency.** Build a single "Primitive frame template" once (1440 wide, title top-left, content in a centered container, consistent margins) and duplicate it per frame. Avoids drift in padding/label placement.
- **Typography frame requires font loading.** Call `get_font_family_info` before placing Instrument Serif / Inter text, per the Paper MCP instructions.
- **Feature components (24) take time.** Expect ~5 min per frame, ~2h total for this section. Consider spreading across multiple sittings; each frame commit keeps registry diffs small.
- **Drift risk post-ship.** The governance rule + PR review is the only enforcement. If drift becomes routine, follow up with a CI script that greps rendered `.tsx` files and diffs against `DESIGN.md` rows — backlog, not this spec.
- **Registry is one file.** If it grows past 80–100 rows, consider splitting by section into separate files under `packages/ui/design/`. Not needed today.
