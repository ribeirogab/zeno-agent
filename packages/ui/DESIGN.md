# @zeno/ui — Design registry

The Paper file **Hearty island** is the visual source of truth for Zeno's UI.
This file is the code↔design bridge: every shipped component and route has a
row here pointing at its Paper frame. If the render drifts from the frame, one
of the two is wrong — fix before merging.

- Paper file: `01KPA7BZ1AWQDRA79KQYGDA6V7`
- Page: `1-0` (Page 1)
- Frame URL format: `https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/<FRAME_ID>`

Dark is the visual source of truth in Paper. Light mode is code-only and lives
in `src/styles/tokens.css` (`[data-theme="light"]` / `.light`).

## 00 · Brand

| Frame | Notes |
|---|---|
| [Logo explorations](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/YO-0) | 8 variants explored. **Chosen: A · Editorial Italic** (Instrument Serif italic coral `#e66b3d`). Used in `apps/dashboard/src/components/layout/{layout,sidebar}.tsx`. |

## 01 · Foundations

| Frame | Code |
|---|---|
| [Palette](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/YP-0) | `src/styles/tokens.css` |
| [Typography](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/11I-0) | Inter · Instrument Serif · ui-monospace (no code — resolved via `font-family` utilities) |
| [Spacing & radius](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/12M-0) | Tailwind defaults (4px scale) |
| [Iconography](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/149-0) | Lucide-style, 1.6px stroke, 16-22px inline |

## 02 · Primitives (@zeno/ui)

| Frame | Code |
|---|---|
| [Button](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/171-0) | `src/components/button.tsx` |
| [Input](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/18X-0) | `src/components/input.tsx` |
| [Dialog](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1A9-0) | `src/components/dialog.tsx` |
| [Toaster](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1B4-0) | `src/components/sonner.tsx` |
| Drawer | Extends Dialog anatomy (side-slide). Covered in Dialog frame. Code: `src/components/drawer.tsx` |
| [AlertDialog](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1US-0) | `src/components/alert-dialog.tsx` |
| [Skeleton](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1UT-0) | `src/components/skeleton.tsx` |
| [EmptyState](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1UU-0) | `src/components/empty-state.tsx` |
| [ErrorState](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1UV-0) | `src/components/error-state.tsx` |

## 03 · Patterns

Motifs composed from primitives + tokens. Single frame hosts all:

- [Patterns artboard](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1E4-0) — sidebar nav item · status pill · row · stat tile · empty state · form field group · filter chips · search + time range · following toggle · transcript block · user menu popover.

Patterns don't ship as components; they're consumed inline by feature
components below.

## 04 · Feature components

Every `.tsx` under `apps/dashboard/src/components/**` lives as a labeled row
in [04. Feature components](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1K1-0). One frame, 22 rows, grouped by folder. Link points to the whole artboard —
scroll to the subsection (Crons · Home · Layout · Logs · Sessions · Settings).

| Folder | Components |
|---|---|
| `components/crons/` | `cron-status-pill` · `cron-row` · `cron-actions` · `cron-form` · `cron-run-history-row` · [schedule-picker](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/209-0) |
| `components/home/` | `activity-row` · `stat-tile` |
| `components/layout/` | `layout` · `sidebar` · `mobile-drawer` |
| `components/logs/` | `level-chips` · `log-search-input` · `time-range-select` · `following-toggle` · `log-row` · `log-json-block` |
| `components/sessions/` | `session-row` · `message-block` |
| `components/settings/` | `service-status` · `profile-file-row` · `mcp-server-row` · `restart-dialog` |

## 05 · Pages

| Route | Frame | Component |
|---|---|---|
| `/login` | [Zeno · Login](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/E-0) | `apps/dashboard/src/routes/login.tsx` |
| `/` | [Zeno · Home](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/V-0) | `apps/dashboard/src/routes/_authed/index.tsx` |
| `/crons` | [Zeno · Crons (list)](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/3H-0) | `apps/dashboard/src/routes/_authed/crons/index.tsx` |
| `/crons/$id` | [Zeno · Cron detail](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/8D-0) | `apps/dashboard/src/routes/_authed/crons/$id.tsx` |
| `/sessions` | [Zeno · Sessions (list)](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/DJ-0) | `apps/dashboard/src/routes/_authed/sessions/index.tsx` |
| `/sessions/$threadId` | [Zeno · Session detail](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/H1-0) | `apps/dashboard/src/routes/_authed/sessions/$threadId.tsx` |
| `/settings` | [Zeno · Settings](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/LP-0) | `apps/dashboard/src/routes/_authed/settings.tsx` |
| `/logs` | [Zeno · Logs](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/R9-0) | `apps/dashboard/src/routes/_authed/logs.tsx` |
| _(states)_ | [Page states](https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/1X1-0) | Loading / empty / error variants for Crons, Sessions, Logs. Skeleton compositions under `apps/dashboard/src/components/skeletons/`. |

## Conventions

- **Pills use lowercase text.** `active`, `paused`, `failed`, `following`, `chat`, `static` — no CSS uppercase transform. Kickers and filter chips stay uppercase (see Patterns).
- **Serif moments.** Page titles, stat-tile numerals, dialog titles use Instrument Serif. Everything else Inter.
- **Accent coral (`#e66b3d`)** is reserved for the single primary affirmative per surface (Run now, Restart, Create cron, the brand Z). Never for borders, backgrounds, or secondary chrome.
- **Dark is canonical in Paper.** Light palette lives only in `tokens.css` — pick any dark frame, apply `[data-theme="light"]` / `.light` in devtools to preview.
