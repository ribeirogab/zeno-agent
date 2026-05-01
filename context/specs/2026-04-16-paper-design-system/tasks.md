---
feature: paper-design-system
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-16
---
# Paper Design System — Tasks

**For this plan:** `[[plan]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - Temp files under `tmp/` per `context/rules/generated-files-location.md`.
> - **Never use `any`. Never write `// biome-ignore`.** Refactor instead.
> - Each task ends with `git add <files> + git commit -m "..."`. English conventional commits, no AI attribution.
> - Tasks are independent; a fresh subagent can execute any one given only `tasks.md` + the spec + branch state.
> - **Prerequisite:** Spec 0016 (extract `@zeno/ui`) must be merged before starting — primitives live under `packages/ui/src/components/` by then.

> **Paper MCP etiquette:**
> - Always call `get_guide({ topic: "paper-mcp-instructions" })` at the start of a session that will author frames. Once per session.
> - Before any typography, call `get_font_family_info` once to confirm Instrument Serif + Inter are present.
> - Never include raw node IDs in user-facing output. Use frame names.
> - After meaningful changes, `get_screenshot` to verify. If content clips, use `update_styles` to set the dimension to `fit-content`.
> - Close any batch of work with `finish_working_on_nodes`.
>
> **Claude-app reference (MANDATORY before any frame work):**
> Open these screenshots via `Read` before starting any phase that touches Paper frames. They are the canonical visual language for this catalog:
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.24.59.png` — Home hero (coral starburst + Instrument Serif)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.25.05.png` — Cowork home with task list + project switcher
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.25.32.png` — Scheduled tasks (3-col card grid reference)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.25.37.png` — Create scheduled task dialog (form dialog reference)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.25.46.png` — Task detail (main + right sidebar with run history)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.25.58.png` — Scheduled tasks (alternate state)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.26.15.png` — User menu popover (bottom-left above user chip)
> - `tmp/claude/dark/Screenshot 2026-04-16 at 23.26.23.png` — Additional reference
> - `tmp/claude/light/*.png` — same 8 surfaces in light mode, used for light-token derivation in Phase 6
>
> **Rule of thumb:** if the Claude app has a pattern for something you're about to draw, match it. Deviation requires justification in the frame's description.

---

## Phase 1 — Prep

### Task 1.1: Load guide + capture file id

**Files:** (none — state capture)

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/paper-design-system
```

- [ ] **Step 2: Load the Paper guide**

Call `mcp__plugin_paper-desktop_paper__get_guide({ topic: "paper-mcp-instructions" })` and read it once.

- [ ] **Step 2b: Read every Claude-app screenshot**

Use the `Read` tool to open every file under `tmp/claude/dark/` (8 screenshots) and skim `tmp/claude/light/` (8 screenshots — only needed for Phase 6 hex derivation, but priming context here is cheap). Note mental flags for: sidebar chrome, hero style, card dimensions, dialog pattern, popover pattern, pill styling.

If any screenshot is missing or unreadable, stop and ask the user to re-drop the reference.

- [ ] **Step 3: Capture basic info**

Call `mcp__plugin_paper-desktop_paper__get_basic_info`. Note:

- The file's `FILE_ID` (UUID-like string).
- The list of existing artboards from spec 0008. Expect: Login, Home, Crons list, Cron detail, Sessions list, Session detail, Settings, Logs.
- Available font families.

Write these to `tmp/paper-file-state.md` (gitignored) for reuse during later tasks:

```markdown
# Paper file state — captured YYYY-MM-DD

FILE_ID: <copy here>

Existing artboards (spec 0008):
- Zeno · Login
- Zeno · Home
- ...

Fonts present: Instrument Serif, Inter, ...
```

- [ ] **Step 4: Confirm fonts**

Call `mcp__plugin_paper-desktop_paper__get_font_family_info`. Expected families: Instrument Serif, Inter, ui-monospace chain. If any missing, note and proceed — the Typography frame will highlight any missing family.

- [ ] **Step 5: No commit — state capture only**

(`tmp/` is gitignored.)

---

## Phase 2 — Foundations

### Task 2.1: Create Foundations section + 4 frames

**Files:**
- Create: `packages/ui/DESIGN.md` (initial version with Foundations section only)
- Paper: 4 new frames under a "01. Foundations" anchor

- [ ] **Step 1: Create a page-anchor frame "01. Foundations"**

Call `mcp__plugin_paper-desktop_paper__create_artboard` (or equivalent) to establish a section header at the top-left of a new canvas area. Name: `01. Foundations`.

- [ ] **Step 2: Draw the Palette frame**

Name: `Palette`. Size: 1200 × 600. Content: 11 color chips in a 4-column grid. Each chip:
- 120 × 120 filled rectangle with the token color
- label below: token name (mono 13px) + hex (mono 11px, text-tertiary)

Tokens (from `packages/ui/src/styles/tokens.css`): `canvas`, `panel`, `sidebar`, `border-subtle`, `text-primary`, `text-secondary`, `text-tertiary`, `accent`, `status-active`, `status-paused`, `status-failed`.

Use `write_html` for the grid layout. After creation, `get_screenshot` to verify the chips render with correct colors.

- [ ] **Step 3: Draw the Typography frame**

Name: `Typography`. Size: 1200 × 800. One row per type role from spec 0008:

| Role | Sample text | Font | Size/weight |
|---|---|---|---|
| Display headline | "Welcome back" | Instrument Serif | 36px / 1.1 |
| Display Z-glyph | "Z" | Instrument Serif Italic | accent color, inline |
| Page title | "Logs" | Inter SemiBold | 22px |
| Card title | "Active crons" | Inter SemiBold | 15px |
| Body | "Pino JSON logs do worker + api." | Inter Regular | 14 / 20 |
| Muted small | "Last run 3m ago" | Inter Regular | 12px, text-secondary |
| Section label | "OBSERVABILITY" | Inter Medium | 11px, uppercase, 0.08em |
| Mono | "cron_run_success" | ui-monospace | 13px |

Each row: label (left, text-tertiary) + sample (center). 32px vertical gap between rows.

- [ ] **Step 4: Draw Spacing & radius frame**

Name: `Spacing & radius`. Size: 1200 × 500. Two columns:

- **Spacing:** stacked rectangles at heights 4/8/12/16/24/32/48/64px, each labeled with the number.
- **Radius:** 5 squares (80 × 80) with radii 4/6/8/10/12px, each labeled.

- [ ] **Step 5: Draw Iconography frame**

Name: `Iconography`. Size: 1200 × 400. Grid of lucide icons used across the dashboard (approx 12–16 icons: chevron-right, search, filter, play, pause, trash, check, x, plus, settings, logs-ish, activity, user, clock, circle-dot, copy). Each icon 24 × 24 in `text-text-secondary`, labeled underneath with its lucide name.

If the dashboard has no fixed icon set adopted yet, draw a canonical set based on current usage (grep `lucide` under `apps/dashboard/src/` to see what's imported).

- [ ] **Step 6: Grab frame URLs**

For each frame, right-click → "Copy link" in Paper UI (or pull via MCP if available). URLs have the form `https://app.paper.design/file/<FILE_ID>/<FRAME_ID>`. Record them.

- [ ] **Step 7: Write initial `packages/ui/DESIGN.md`**

```markdown
# Zeno UI — Design registry

Every UI element rendered by Zeno has a frame in the "Hearty island" Paper file.
When a component changes visually, update both code and Paper frame in the same PR.
Drift is a bug. See `context/rules/ui-in-paper.md`.

**Paper file:** https://app.paper.design/file/<FILE_ID>

## Foundations

| Frame | Paper link | Source of truth |
|---|---|---|
| Palette | https://app.paper.design/file/<FILE_ID>/<PALETTE_FRAME_ID> | `packages/ui/src/styles/tokens.css` |
| Typography | https://app.paper.design/file/<FILE_ID>/<TYPO_FRAME_ID> | `apps/dashboard/src/styles/globals.css` (@theme font vars) |
| Spacing & radius | https://app.paper.design/file/<FILE_ID>/<SPACING_FRAME_ID> | Tailwind defaults + convention |
| Iconography | https://app.paper.design/file/<FILE_ID>/<ICONS_FRAME_ID> | lucide-react |

_more sections to come..._
```

Replace `<FILE_ID>` and `<*_FRAME_ID>` placeholders with real values.

- [ ] **Step 8: Call `finish_working_on_nodes`**

Close the working session on the Foundations frames.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper Foundations section + DESIGN.md registry (palette, type, spacing, icons)"
```

---

## Phase 3 — Primitives

### Task 3.1: Draw 4 primitive frames + extend registry

**Files:**
- Modify: `packages/ui/DESIGN.md`
- Paper: 4 new frames under a "02. Primitives" anchor

- [ ] **Step 1: Create "02. Primitives" anchor frame**

Positioned below the Foundations section on the canvas.

- [ ] **Step 2: Draw `Button` frame**

Variant × size × state grid (4 variants × 3 sizes × 2 states). Layout:

```
         primary     outline    ghost      accent
sm       [btn]       [btn]      [btn]      [btn]
md       [btn]       [btn]      [btn]      [btn]
lg       [btn]       [btn]      [btn]      [btn]
(hover)  [btn]       [btn]      [btn]      [btn]
(disabled) [btn]     [btn]      [btn]      [btn]
```

Each `[btn]` renders the Button with label "Action". Use `write_html` with the exact classNames from `packages/ui/src/components/button.tsx` (pull them via `cat` before drawing).

Also include a 1–2 line description in the frame: "destructive use variant=accent" and "ghost is low-emphasis".

- [ ] **Step 3: Draw `Input` frame**

5 states stacked vertically, each 320 × 44: default (empty), focus (ring visible), filled ("operator@…"), disabled, with-error-helper-text ("senha inválida" below in `status-failed`).

- [ ] **Step 4: Draw `Dialog` frame**

Anatomy view — one full Dialog rendered at typical size (max-w-lg, ~512 × 280) with callout annotations:

- Overlay (outside the card) — label "overlay / bg-black/60 backdrop-blur-sm"
- Container — label "bg-panel / radius 12 / p-8 / max-w-lg"
- Header — label "gap-1.5 inside"
- Title (`DialogTitle`) — label "Instrument Serif 2xl"
- Description (`DialogDescription`) — label "text-sm text-text-secondary"
- Footer — label "flex justify-end gap-3"

Callouts use 1px `border-subtle` lines from the element to a 11px mono label.

- [ ] **Step 5: Draw `Toaster` frame**

Four stacked sonner-style toasts (width 360):

- Success — green dot, "cron criado" (status-active)
- Error — red dot, "erro ao criar cron" (status-failed)
- Info — accent dot, "reiniciando worker…"
- Warning — amber dot, "action requires confirmation" (status-paused)

Each toast: `bg-panel`, 1px `border-subtle`, radius 8, padding 12 × 16.

- [ ] **Step 6: Extend `DESIGN.md`**

Add after the Foundations table:

```markdown

## Primitives

| Component | Package path | Paper frame |
|---|---|---|
| Button | `packages/ui/src/components/button.tsx` | https://.../<BUTTON_FRAME_ID> |
| Input | `packages/ui/src/components/input.tsx` | https://.../<INPUT_FRAME_ID> |
| Dialog | `packages/ui/src/components/dialog.tsx` | https://.../<DIALOG_FRAME_ID> |
| Toaster (sonner) | `packages/ui/src/components/sonner.tsx` | https://.../<TOASTER_FRAME_ID> |
```

- [ ] **Step 7: `finish_working_on_nodes` + commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper Primitives frames (Button, Input, Dialog, Toaster) + registry"
```

---

## Phase 4 — Patterns

### Task 4.1: Draw 11 pattern frames + extend registry

**Files:**
- Modify: `packages/ui/DESIGN.md`
- Paper: 11 new frames under "03. Patterns"

- [ ] **Step 1: Create "03. Patterns" anchor**

- [ ] **Step 2: Draw each pattern frame**

For each pattern below, draw a single frame showing the primary state plus (where it has them) 2–3 alternative states side by side. Use the primitive definitions from Phase 3 as visual building blocks.

| Pattern | Frame content | Used in code by |
|---|---|---|
| Sidebar nav item | three states: default / active / disabled; 200 × 32 each | `apps/dashboard/src/components/layout/sidebar.tsx` |
| Status pill | four states: active (green) / paused (amber) / failed (red) / info (accent); each "●  Label", 80 × 24 | `cron-status-pill.tsx`, `service-status.tsx` |
| Row (table line) | three states: default / hover / expanded (with payload below) — 48 px tall | `cron-row.tsx`, `session-row.tsx`, `log-row.tsx`, `activity-row.tsx` |
| Stat tile | 280 × 96 — label (uppercase, text-tertiary) + big number (Instrument Serif, 36) | `stat-tile.tsx` |
| Empty state | 400 × 200 — title + description + optional CTA button, centered | (new — consumed by 0018) |
| Form field group | label (text-tertiary uppercase 11) + Input + helper line below | `cron-form.tsx` |
| Filter chips | segmented control with 4 options in a `bg-panel` pill row | `level-chips.tsx` |
| Search input with hint | Input with a mono placeholder showing example query syntax | `log-search-input.tsx` |
| Time range select | native `<select>` styled in `bg-panel` with 3 presets | `time-range-select.tsx` |
| Following toggle | pill with leading dot; two states (on/off) | `following-toggle.tsx` |
| Transcript message block | user vs Zeno turn — both as transparent blocks with author label (text-tertiary) above; no bubbles | `message-block.tsx` |

- [ ] **Step 3: Extend `DESIGN.md`**

```markdown

## Patterns

| Pattern | Used by | Paper frame |
|---|---|---|
| Sidebar nav item | `layout/sidebar.tsx` | https://.../... |
| Status pill | `crons/cron-status-pill.tsx`, `settings/service-status.tsx` | https://.../... |
| Row (table line) | `crons/cron-row.tsx`, `sessions/session-row.tsx`, `logs/log-row.tsx`, `home/activity-row.tsx` | https://.../... |
| Stat tile | `home/stat-tile.tsx` | https://.../... |
| Empty state | (new — consumed by spec 0018) | https://.../... |
| Form field group | `crons/cron-form.tsx` | https://.../... |
| Filter chips | `logs/level-chips.tsx` | https://.../... |
| Search input with hint | `logs/log-search-input.tsx` | https://.../... |
| Time range select | `logs/time-range-select.tsx` | https://.../... |
| Following toggle | `logs/following-toggle.tsx` | https://.../... |
| Transcript message block | `sessions/message-block.tsx` | https://.../... |
```

- [ ] **Step 4: `finish_working_on_nodes` + commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper Patterns frames (11 motifs) + registry"
```

---

## Phase 5 — Feature components, Pages, and the rule

### Task 5.1: Draw all 24 feature component frames

**Files:**
- Modify: `packages/ui/DESIGN.md`
- Paper: 24 new frames under "04. Feature components"

- [ ] **Step 1: Create "04. Feature components" anchor**

- [ ] **Step 2: Draw one frame per component**

Name each frame after the PascalCase export of the component (e.g. `CronActions`, `LogRow`, `ServiceStatus`). Size to fit content (400–600 wide typical; row components at full width).

For each file under `apps/dashboard/src/components/**`, draw its primary rendered state. Use patterns from Phase 4 as the building blocks — do not re-invent. 24 frames:

crons/: `CronActions`, `CronForm`, `CronRow`, `CronRunHistoryRow`, `CronStatusPill`
home/: `ActivityRow`, `StatTile`
layout/: `Layout` (full shell), `Sidebar`
logs/: `FollowingToggle`, `LevelChips`, `LogJsonBlock`, `LogRow`, `LogSearchInput`, `TimeRangeSelect`
sessions/: `MessageBlock`, `SessionRow`
settings/: `McpServerRow`, `ProfileFileRow`, `RestartDialog`, `ServiceStatus`

Pro-tip: read each component's `.tsx` before drawing to copy the actual class strings (labels, colors, layout). Use `write_html` per frame with those exact classes. This keeps the design authoritative and catches any silent drift between components.

- [ ] **Step 3: Extend `DESIGN.md`**

```markdown

## Feature components

| Component | File | Paper frame |
|---|---|---|
| CronActions | `apps/dashboard/src/components/crons/cron-actions.tsx` | https://.../... |
| CronForm | `apps/dashboard/src/components/crons/cron-form.tsx` | https://.../... |
| CronRow | `apps/dashboard/src/components/crons/cron-row.tsx` | https://.../... |
| CronRunHistoryRow | `apps/dashboard/src/components/crons/cron-run-history-row.tsx` | https://.../... |
| CronStatusPill | `apps/dashboard/src/components/crons/cron-status-pill.tsx` | https://.../... |
| ActivityRow | `apps/dashboard/src/components/home/activity-row.tsx` | https://.../... |
| StatTile | `apps/dashboard/src/components/home/stat-tile.tsx` | https://.../... |
| Layout | `apps/dashboard/src/components/layout/layout.tsx` | https://.../... |
| Sidebar | `apps/dashboard/src/components/layout/sidebar.tsx` | https://.../... |
| FollowingToggle | `apps/dashboard/src/components/logs/following-toggle.tsx` | https://.../... |
| LevelChips | `apps/dashboard/src/components/logs/level-chips.tsx` | https://.../... |
| LogJsonBlock | `apps/dashboard/src/components/logs/log-json-block.tsx` | https://.../... |
| LogRow | `apps/dashboard/src/components/logs/log-row.tsx` | https://.../... |
| LogSearchInput | `apps/dashboard/src/components/logs/log-search-input.tsx` | https://.../... |
| TimeRangeSelect | `apps/dashboard/src/components/logs/time-range-select.tsx` | https://.../... |
| MessageBlock | `apps/dashboard/src/components/sessions/message-block.tsx` | https://.../... |
| SessionRow | `apps/dashboard/src/components/sessions/session-row.tsx` | https://.../... |
| McpServerRow | `apps/dashboard/src/components/settings/mcp-server-row.tsx` | https://.../... |
| ProfileFileRow | `apps/dashboard/src/components/settings/profile-file-row.tsx` | https://.../... |
| RestartDialog | `apps/dashboard/src/components/settings/restart-dialog.tsx` | https://.../... |
| ServiceStatus | `apps/dashboard/src/components/settings/service-status.tsx` | https://.../... |
```

- [ ] **Step 4: `finish_working_on_nodes` + commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper Feature components (24 frames) + registry"
```

---

### Task 5.2: Organize Pages section + extend registry

**Files:**
- Modify: `packages/ui/DESIGN.md`
- Paper: 8 existing artboards from spec 0008 grouped under "05. Pages"

- [ ] **Step 1: Create "05. Pages" anchor**

- [ ] **Step 2: Visually group existing 8 artboards**

The eight artboards from spec 0008 already exist. Move them (spatially on the canvas) to sit under the "05. Pages" anchor. Do not re-draw. Verify their names match:

- `Zeno · Login`
- `Zeno · Home`
- `Zeno · Crons (list)`
- `Zeno · Cron detail`
- `Zeno · Sessions (list)`
- `Zeno · Session detail`
- `Zeno · Settings`
- `Zeno · Logs`

If any name doesn't match exactly (e.g. typos, extra spaces), `rename_nodes` to match.

- [ ] **Step 3: Extend `DESIGN.md`**

```markdown

## Pages

| Page | Route | Paper frame |
|---|---|---|
| Zeno · Login | `/login` | https://.../... |
| Zeno · Home | `/` | https://.../... |
| Zeno · Crons (list) | `/crons` | https://.../... |
| Zeno · Cron detail | `/crons/$id` | https://.../... |
| Zeno · Sessions (list) | `/sessions` | https://.../... |
| Zeno · Session detail | `/sessions/$threadId` | https://.../... |
| Zeno · Settings | `/settings` | https://.../... |
| Zeno · Logs | `/logs` | https://.../... |
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/DESIGN.md
git commit -m "docs(ui): Paper Pages section + complete registry"
```

---

### Task 5.3: Write the governance rule

**Files:**
- Create: `context/rules/ui-in-paper.md`
- Modify: `context/_index/rules.md`

- [ ] **Step 1: Write `context/rules/ui-in-paper.md`**

```markdown
---
tags:
  - rule
  - workflow
severity: important
applies-to:
  - apps/*/src/**/*.tsx
  - packages/ui/src/**/*.tsx
created: 2026-04-16
---
# Every UI element must exist in Paper

Any `.tsx` file that produces pixels in a Zeno app must appear in
`packages/ui/DESIGN.md` with a link to a frame in the "Hearty island"
Paper file. This applies to primitives, patterns, and feature components.

## Why

Code and design drift silently when they have no explicit link. A registry
that maps every rendered component to a Paper frame (a) makes the link
reviewable, (b) forces a designer to consider the visual before adding
a component, and (c) gives reviewers a one-click path from a code change to
the design it should match.

## How to Apply

1. **Design the component in Paper first.** Add a frame in the right section
   (Primitives / Patterns / Feature components) of the "Hearty island" file.
2. **Grab the frame URL.** In Paper, right-click → Copy link.
3. **Add a row in `packages/ui/DESIGN.md`** in the same PR that introduces the
   code.
4. **Reviewer rejects** PRs that add a rendered `.tsx` without a matching row
   in `DESIGN.md`. "Ship it and add design later" is not a path — the frame
   is cheap (5 min) and the drift never gets paid back.

## Exceptions

- Generated files: `route-tree.gen.ts`.
- Root layout wrappers that render no visual content of their own:
  `__root.tsx`, `_authed.tsx`.
- Tests: `*.test.tsx`.
- Skeletons or loading placeholders that re-use an existing primitive (they
  inherit their entry from the primitive's row).
```

- [ ] **Step 2: Link from `context/_index/rules.md`**

Under `## \`severity: important\``, add:

```markdown
- [[../rules/ui-in-paper|Every UI element must exist in Paper]] — `packages/ui/DESIGN.md` is the canonical code → Paper registry; new rendered components require an entry.
```

Keep the existing `generated-files-location` entry.

- [ ] **Step 3: Commit**

```bash
git add context/rules/ui-in-paper.md context/_index/rules.md
git commit -m "docs(rules): governance rule — every UI element must exist in Paper"
```

---

---

## Phase 6 — Light-mode tokens (code)

### Task 6.1: Extend `tokens.css` with light palette

**Files:**
- Modify: `packages/ui/src/styles/tokens.css`

- [ ] **Step 1: Read Claude light-mode screenshots**

Use `Read` on every file in `tmp/claude/light/`. Note the approximate hex values for:
- Canvas (page background — warm off-white)
- Panel (card surface — slightly greyer)
- Sidebar (sidebar bg — slightly darker than canvas)
- Border subtle (dividers)
- Text primary / secondary / tertiary (warm near-blacks with decreasing contrast)
- Status colors (green active, amber paused, red failed — usually darker in light mode)

Accent coral stays identical across modes — single brand moment.

- [ ] **Step 2: Append light palette block**

Open `packages/ui/src/styles/tokens.css`. After the existing `@theme { … }` block that defines dark tokens, add:

```css
/* Light mode — swap palette via `<html class="light">` or `[data-theme="light"]`.
 * Accent coral stays identical to dark — it's the brand moment. */
:root[data-theme="light"],
.light {
  --color-canvas: #FAF7F2;
  --color-panel: #F2EEE6;
  --color-sidebar: #EFEAE0;
  --color-border-subtle: #E0D9CC;
  --color-text-primary: #1E1B18;
  --color-text-secondary: #6F685E;
  --color-text-tertiary: #A69F92;
  --color-accent: #E66B3D;
  --color-status-active: #3E8B5E;
  --color-status-paused: #A6813F;
  --color-status-failed: #B74A4A;
}
```

Adjust hexes during implementation to match the light screenshots by eye. Lock final values in the Paper Palette frame (which is split dark/light per Phase 2).

- [ ] **Step 3: Build + verify**

```bash
pnpm --filter @zeno/dashboard run build
```

Expected: clean. Then boot + toggle via devtools:

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
```

Playwright MCP:
1. Navigate to `http://localhost:3000/` (home, dark default).
2. Screenshot `tmp/.playwright-mcp/theme-dark-home.png`.
3. Run `browser_evaluate` with JS: `document.documentElement.classList.add('light')`.
4. Screenshot `tmp/.playwright-mcp/theme-light-home.png`.
5. Visual compare: dark has warm near-black canvas, light has warm off-white. Coral stays identical.
6. Repeat on `/crons`, `/logs`, `/settings` — any primitive that still looks dark under the `.light` class is a bug (likely a hardcoded hex sneaking through).

- [ ] **Step 4: Grep for hardcoded hexes**

```bash
grep -rnE '#[0-9a-fA-F]{3,6}\b' apps/dashboard/src packages/ui/src | grep -v tokens.css
```

Expected: empty. Any hit is a violation — replace with a token reference.

- [ ] **Step 5: Shutdown + commit**

```bash
pnpm run docker:down
git add packages/ui/src/styles/tokens.css
git commit -m "feat(ui): light-mode palette in tokens.css — swap via .light class"
```

---

## Phase 7 — Responsive + governance rule

### Task 7.1: Mobile drawer wrapper

**Files:**
- Create: `apps/dashboard/src/components/layout/mobile-drawer.tsx`

- [ ] **Step 1: Write the drawer**

```typescript
import type { JSX, ReactNode } from 'react';
import { Dialog, DialogContent, DialogPortal } from '@zeno/ui';

export interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function MobileDrawer({ open, onOpenChange, children }: MobileDrawerProps): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogContent
          className="fixed left-0 top-0 h-full w-[260px] max-w-[80vw] -translate-x-0 translate-y-0 rounded-none border-r border-border-subtle bg-sidebar p-0"
        >
          {children}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
```

The wrapper overrides Radix's default centered positioning to slide from the left. Focus-trap + Esc-to-close + backdrop click are inherited from Radix.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @zeno/dashboard typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/components/layout/mobile-drawer.tsx
git commit -m "feat(dashboard): MobileDrawer wrapper around @zeno/ui Dialog"
```

---

### Task 7.2: Wire the drawer into Layout

**Files:**
- Modify: `apps/dashboard/src/components/layout/layout.tsx`
- Modify: `apps/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Read current `layout.tsx`**

```bash
cat apps/dashboard/src/components/layout/layout.tsx
```

- [ ] **Step 2: Add state + header + drawer**

Shape the edits to match the current file. The goal:

- Import `useState`, the `MobileDrawer`, and a hamburger icon (`Menu` from `lucide-react`).
- At the top of the component: `const [menuOpen, setMenuOpen] = useState(false);`
- Wrap the root in a responsive layout:
  - Desktop (`md:flex`): sidebar + main side-by-side (current behavior).
  - Mobile (`md:hidden` for sidebar column, `flex` for header): sticky top header with app title + hamburger button, main below.
- When hamburger is clicked: `setMenuOpen(true)`.
- Render `<MobileDrawer open={menuOpen} onOpenChange={setMenuOpen}><Sidebar onNavigate={() => setMenuOpen(false)} /></MobileDrawer>`.

Rough skeleton:

```typescript
import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet } from '@tanstack/react-router';
import { MobileDrawer } from '@/components/layout/mobile-drawer';
import { Sidebar } from '@/components/layout/sidebar';

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-[200px] shrink-0 md:block">
        <Sidebar />
      </aside>
      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border-subtle bg-sidebar px-4 py-3 md:hidden">
        <span className="font-serif text-lg text-text-primary">zeno</span>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
          className="text-text-secondary hover:text-text-primary"
        >
          <Menu size={20} />
        </button>
      </header>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-10">
        <Outlet />
      </main>
      <MobileDrawer open={menuOpen} onOpenChange={setMenuOpen}>
        <Sidebar onNavigate={() => setMenuOpen(false)} />
      </MobileDrawer>
    </div>
  );
}
```

Preserve whatever `Outlet` / children pattern the current file uses.

- [ ] **Step 3: Update `sidebar.tsx` to accept `onNavigate`**

Add optional `onNavigate?: () => void` prop. Wire each `<Link>`'s `onClick` to call it so the drawer closes on mobile nav.

```typescript
export function Sidebar({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  // ... existing code ...
  // On each <Link> inside the nav:
  //   onClick={onNavigate}
}
```

- [ ] **Step 4: Quality-gate**

```bash
pnpm run quality-gate
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/layout/layout.tsx apps/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat(dashboard): responsive layout with hamburger drawer below 768px"
```

---

### Task 7.3: Responsive class pass per route

**Files:** (multiple — see breakpoint table in spec)

For each route listed in the spec's breakpoint table, inspect its JSX and add Tailwind responsive utilities so it degrades gracefully at 390px. Prefer `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` patterns; use `flex-col md:flex-row`; wrap heavy tables in `overflow-x-auto`.

- [ ] **Step 1: `/` Home — stats row + activity**

`apps/dashboard/src/routes/_authed/index.tsx`: stats grid becomes `grid-cols-1 sm:grid-cols-3`; activity rows use `flex-col sm:flex-row` where applicable.

- [ ] **Step 2: `/crons` list**

`apps/dashboard/src/routes/_authed/crons.index.tsx`: if the current layout is a list, leave as-is but ensure row columns truncate. If already a grid, `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` matching the Claude card grid.

- [ ] **Step 3: `/crons/$id` detail**

`apps/dashboard/src/routes/_authed/crons.$id.tsx`: main + sidebar becomes stacked 1-col on mobile via `flex-col md:flex-row`. Right sidebar's run history goes below on mobile.

- [ ] **Step 4: `/sessions` + `/sessions/$threadId`**

Row layouts degrade: reduce horizontal padding on mobile (`px-4 md:px-8`); secondary columns hide below 640 (`hidden sm:flex`).

- [ ] **Step 5: `/logs`**

`apps/dashboard/src/routes/_authed/logs.tsx`: filter bar becomes `flex-wrap gap-3`. Log rows: event column truncates at mobile width (`truncate max-w-[120px] sm:max-w-none`).

- [ ] **Step 6: `/settings`**

Sections stack (already the default). Tables inside sections: wrap in `<div className="overflow-x-auto">`.

- [ ] **Step 7: Quality-gate**

```bash
pnpm run quality-gate
```

- [ ] **Step 8: Commit**

```bash
git add apps/dashboard/src/
git commit -m "feat(dashboard): responsive class pass across routes (Tailwind breakpoints)"
```

---

### Task 7.4: Mobile Playwright smoke

**Files:** (none — verification)

- [ ] **Step 1: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
```

- [ ] **Step 2: Mobile viewport screenshots**

Use Playwright MCP's `browser_resize` to 390×844 before each navigation:

1. Resize to 390×844.
2. Navigate to `http://localhost:3000/`.
3. Screenshot `tmp/.playwright-mcp/mobile-home.png`. Expected: hamburger icon in header, no desktop sidebar.
4. Click hamburger (snapshot first to get the ref). Screenshot `tmp/.playwright-mcp/mobile-drawer.png`. Expected: sidebar slides in as a left drawer.
5. Click a nav item (e.g. Crons). Expected: drawer closes, navigation succeeds. Screenshot `tmp/.playwright-mcp/mobile-crons.png`. Expected: cards stack 1-col.
6. Navigate to `/logs`. Screenshot `tmp/.playwright-mcp/mobile-logs.png`. Expected: filter bar wraps, rows truncate gracefully, no horizontal overflow.
7. Resize to 1440×900. Navigate `/`. Screenshot `tmp/.playwright-mcp/desktop-home.png`. Expected: sidebar visible, no header hamburger.

- [ ] **Step 3: Light-mode re-verify under mobile**

Resize to 390×844 again. Run `browser_evaluate`: `document.documentElement.classList.add('light')`. Screenshot `tmp/.playwright-mcp/mobile-light-home.png`. Expected: palette swaps, layout unchanged.

- [ ] **Step 4: Console check**

`browser_console_messages({ level: 'error' })` — expected: zero errors across all captured routes.

- [ ] **Step 5: Shutdown**

```bash
pnpm run docker:down
```

- [ ] **Step 6: Commit screenshots are not versioned** — `tmp/` is gitignored. No commit needed from this task beyond any fixes made during the walk.

---

### Task 7.5: Governance rule + MOC + PR

**Files:**
- (Task 5.3 already wrote `context/rules/ui-in-paper.md` and updated `context/_index/rules.md` — verify.)

- [ ] **Step 1: Verify rule file exists**

```bash
test -f context/rules/ui-in-paper.md && grep -c ui-in-paper context/_index/rules.md
```

Expected: file exists; grep returns 1.

If rule was skipped or needs updating (e.g. to mention light-mode + responsive), edit it now; otherwise proceed.

- [ ] **Step 2: Final sanity**

- Open `packages/ui/DESIGN.md` and walk every link — each URL should resolve to a frame in Paper.
- Run `pnpm run quality-gate` one more time.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Update umbrella PR description**

Since this work lands on the existing `refactor/dashboard-ui-overhaul` branch (PR #4), update the PR body via `gh pr edit` to add a Spec 0017 section: Paper file reorganized, `DESIGN.md` shipped, light-mode palette in tokens, responsive layout + hamburger drawer, mobile Playwright smoke clean.

Do NOT merge — user reviews.

---

## Done

Visual source of truth (Paper file) and code-side registry (`DESIGN.md`) are aligned. Spec D (0018 — UX cleanup) now operates under the rule: any new primitive it adds lands in Paper first, then in `DESIGN.md`, then in code.
