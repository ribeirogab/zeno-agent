---
id: "0026"
title: Imperial Terminal Rebranding
status: approved
created: 2026-04-23
source: tmp/rebranding/zeno/
---

# 0026 — Imperial Terminal Rebranding

## Problem

The dashboard has no visual identity — it uses generic colors (coral accent, warm earth tones), stock fonts (Inter, Instrument Serif), and looks like any Claude Code clone. Before open-sourcing, Zeno needs an original identity that communicates what it is: a personal agent console with a terminal-meets-throne-room aesthetic.

## Solution

Full visual rebuild of the dashboard based on the "Imperial Terminal" prototype at `tmp/rebranding/zeno/`. The prototype is the canonical design spec — every color, font, layout, text, and interaction defined there is carried into the production codebase pixel-for-pixel.

**Design concept:** Ink-blue surfaces, imperial gold as the single accent color, mono-first typography, crest-like geometry. Dark is the only mode.

## Reference

The prototype is a self-contained HTML+JSX app:

| File | Content |
|---|---|
| `colors_and_type.css` | Design tokens: palette, typography, spacing, radii, shadows, easing |
| `zeno.css` | All component styles: layout, sidebar, buttons, pills, tables, forms, modals, toasts, etc. |
| `primitives.jsx` | Reusable components: ZBtn, ZPill, ZChip, ZDot, ZCrest, ZSpark, ZLosango |
| `icons.jsx` | Lucide-style SVG icons (1.5px stroke) |
| `sidebar.jsx` | Navigation, runtime panel, user footer |
| `login.jsx` | Login ceremony: aura, crest, terminal strip, submit animation |
| `home.jsx` | Hero greeting, stat tiles with sparklines, activity feed, "what's next" panel |
| `crons.jsx` | Cron table with inline actions |
| `cron-detail.jsx` | Breadcrumb, prompt block, mini stats, expandable run history |
| `sessions.jsx` | Session table + session detail transcript with tool calls |
| `logs.jsx` | Log viewer with filters, live tail, expandable JSON, syntax highlighting |
| `settings.jsx` | Backend, MCP servers, profile files, about |
| `modals.jsx` | New cron modal, confirm restart modal |
| `assets/zeno-crest.svg` | Crest SVG (losango + Z glyph) |

The `tweaks-panel.jsx` is a Claude Design exploration tool and is excluded from production.

## Scope

### In scope

- Replace all design tokens (colors, fonts, spacing, radii, shadows, easing)
- Replace font families: Inter/Instrument Serif → Space Grotesk/Fraunces/JetBrains Mono (Google CDN)
- Kill light mode entirely (remove CSS, hook, toggle, index.html script)
- Adapt existing `@zeno/ui` primitives (Button, Input, Dialog, AlertDialog, Skeleton, EmptyState, Toaster)
- Add new primitives (Crest, Dot, Pill, OutlinePill, Chip, Spark, Losango, Kicker, CornerBrackets)
- Rewrite all 8 dashboard routes to match the prototype
- Rewrite sidebar and layout components
- Add 2 API endpoints (sparkline, next crons) with storage methods and dashboard hooks
- Remove mobile drawer (responsive is out of scope)

### Out of scope

- Responsive / mobile layout (separate spec when needed)
- Theme picker / accent variants (design exploration only)
- New pages or features not in the prototype
- Paper design file updates (the prototype supersedes Paper)

## Architecture

### Phase 1 — Tokens, Fonts, Kill Light Mode

**`packages/ui/src/styles/tokens.css`** — replace the `@theme` block:

```
Palette:
  canvas:         #0A0A10
  panel:          #0f1119
  panel-2:        #151824
  sidebar:        #050610
  border-subtle:  #1e2131
  border-strong:  #2a2e44
  text-primary:   #e8eaf5
  text-secondary: #8a8fab
  text-tertiary:  #4b4f66
  text-ink:       #0a0b12
  gold:           #d9b362
  gold-bright:    #f0cc7a
  gold-deep:      #8a6d2e
  gold-soft:      rgba(217,179,98,0.10)
  gold-ring:      rgba(217,179,98,0.28)
  gold-line:      rgba(217,179,98,0.18)
  hairline:       rgba(255, 230, 170, 0.06)
  overlay:        rgba(5, 6, 16, 0.80)
  status-active:  #6bd3a3
  status-paused:  #d9b362
  status-failed:  #e8617a
  status-info:    #7aa6e8

Type scale:
  t-display: 56px, t-h1: 36px, t-h2: 24px, t-h3: 18px
  t-body: 14px, t-body-sm: 13px
  t-kicker: 11px, t-mono: 13px, t-mono-sm: 11px

Spacing (4-based): 4, 8, 12, 16, 24, 32, 48, 64px

Radii: sm 2px, md 4px, lg 8px, pill 999px

Shadows:
  panel:     0 1px 0 rgba(255,255,255,0.02) inset, 0 1px 2px rgba(0,0,0,0.4)
  float:     0 24px 48px -16px rgba(0,0,0,0.8), 0 4px 12px rgba(0,0,0,0.5)
  gold-glow: 0 0 0 1px var(--gold-line), 0 0 24px -6px rgba(217,179,98,0.3)

Easing:
  ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)
  ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)
  dur-fast: 120ms, dur-med: 220ms
```

**`apps/dashboard/src/styles/globals.css`** — update font stacks:
- `--font-sans`: Space Grotesk
- `--font-serif`: Fraunces
- `--font-mono`: JetBrains Mono

Add global rules:
- `::selection` — gold bg, text-ink color
- `:focus-visible` — gold-ring box-shadow
- Scrollbar styling — gold-deep thumb, canvas track
- Body background — radial gradients (gold 4% top-right, azure 2.5% bottom-left) over canvas

**`apps/dashboard/index.html`** — replace Google Fonts link with Space Grotesk + Fraunces + JetBrains Mono. Remove theme detection script.

**Kill light mode:**
- Remove `:root[data-theme="light"]` block from `tokens.css`
- Delete `apps/dashboard/src/lib/use-theme.ts`
- Remove theme toggle references from components

### Phase 2 — Primitives (`@zeno/ui`)

**Adapt existing:**

| Component | Changes |
|---|---|
| Button | Rewrite CVA: variants default/primary/ghost/outline/danger. Font mono, uppercase, letter-spacing 0.06em. Sizes sm/md only |
| Input | bg panel-2, border subtle, font mono 13px. Focus: border gold + gold-ring shadow |
| Dialog | Add CornerBrackets. Title: Fraunces 22px. Subtitle: mono 10px gold uppercase. Footer: bg sidebar |
| AlertDialog | Same as Dialog, width 480px, danger subtitle variant (carmine) |
| Skeleton | Adjust colors to panel-2 |
| EmptyState | Add Crest SVG at 25% opacity. Title: Fraunces 22px |
| Toaster | bg panel, border-left 2px gold, font mono, shadow-float. Losango icon. Default duration 2.4s — set via Sonner's `duration` prop at each `toast()` call site, not in the Toaster component |

**Add new:**

| Component | File | Props | Description |
|---|---|---|---|
| Crest | `crest.tsx` | `size=28`, `ornate=false` | SVG: double losango + Z glyph bars. Ornate adds third inner losango |
| Dot | `dot.tsx` | `tone`, `pulse=false` | 6px circle. Tones: active/paused/failed/info/idle. Pulse keyframes per tone |
| Pill | `pill.tsx` | `tone` | Dot + label. Mono 10px uppercase. Border + bg tinted by tone |
| OutlinePill | `pill.tsx` | — | Border subtle, text tertiary. For "static", "chat" labels |
| Chip | `chip.tsx` | `active`, `onClick` | Filter button. Mono 10px uppercase. Active: gold border + gold-soft bg |
| Spark | `spark.tsx` | `data: number[]`, `width=60`, `height=18`, `color` | SVG polyline sparkline |
| Losango | `losango.tsx` | `size=5`, `color` | Decorative diamond bullet SVG |
| Kicker | `kicker.tsx` | `mute=false` | Mono 11px, uppercase, 0.18em spacing. Gold or tertiary |
| CornerBrackets | `corner-brackets.tsx` | — | 4 absolute spans with partial gold borders on corners |

**Remove:**
- Drawer (`drawer.tsx`) — not used in the prototype. Delete the file entirely. Its only consumer is `mobile-drawer.tsx`, which is deleted in Phase 3. Audit for any other `Drawer` imports before removing (run `grep -r 'Drawer' apps/dashboard/src/`).

### Phase 3 — Dashboard Screens

Every route is rewritten to match the prototype. The structure below maps prototype JSX files to dashboard routes/components.

**Layout & Navigation:**

| Current | Prototype ref | Key changes |
|---|---|---|
| `components/layout/layout.tsx` | `zeno.css (.zen-app)` | Grid 252px sidebar + 1fr main. Grid overlay pseudo-element (gold 2.2% lines, 64px, masked radial) |
| `components/layout/sidebar.tsx` | `sidebar.jsx` | Full rewrite. Brand (Crest + "zeno" + version), nav group "console" with 5 items (home/crons/sessions/logs/settings), keyboard hints, active gold bar, runtime panel, user footer |
| `components/layout/mobile-drawer.tsx` | — | Delete |

**Routes:**

| Route | Prototype ref | Key changes |
|---|---|---|
| `routes/login.tsx` | `login.jsx` | Full rewrite. Aura losango, card with corner brackets, Crest 56px ornate, "Identify yourself." Fraunces 34px, password input, "enter throne room" button, terminal strip with cursor animation, submit sequence animation |
| `routes/_authed/index.tsx` | `home.jsx` | Full rewrite. Hero with greeting (Fraunces 56px, word-rise animation), hero ornament, stats grid 4-col with Spark, split layout (activity feed + "what's next" panel with countdown) |
| `routes/_authed/crons.index.tsx` | `crons.jsx` | Rewrite table layout. Thead bg sidebar, rows with hover gold bar, inline actions on hover, status Pills, schedule in gold mono |
| `routes/_authed/crons.new.tsx` | `modals.jsx (NewCronModal)` | Convert to Dialog with corner brackets, schedule presets as Chips |
| `routes/_authed/crons.$id.tsx` | `cron-detail.jsx` | Breadcrumb, prompt block with floating "PROMPT" label, mini stats grid, expandable run history with JSON syntax highlighting |
| `routes/_authed/sessions.index.tsx` | `sessions.jsx` | Rewrite table. Search bar, thread+session id column, msg count in gold, backend with Dot |
| `routes/_authed/sessions.$threadId.tsx` | `sessions.jsx (SessionDetailScreen)` | Transcript with role gutters (user=azure, zeno=gold), tool call blocks with Losango + command/output, live indicator with pulse Dot |
| `routes/_authed/logs.tsx` | `logs.jsx` | Rewrite filters (Chips + search + time range). Log rows with level coloring, event gold, correlation id. Expandable JSON with syntax highlighting (keys gold, strings azure, numbers violet, booleans jade). Following toggle with pulse dot. New log animation (gold-soft fade + translateX) |
| `routes/_authed/settings.tsx` | `settings.jsx` | Backend row with gold bar left + "ACTIVE" pill. MCP server list. Profile files list with gold paths. About key-value list. Restart button danger |

**Feature components rewritten:**

| Folder | Components | Prototype ref |
|---|---|---|
| `components/home/` | `stat-tile.tsx`, `activity-row.tsx` + new `next-cron-item.tsx` | `home.jsx` |
| `components/crons/` | `cron-row.tsx`, `cron-actions.tsx`, `cron-form.tsx`, `cron-status-pill.tsx`, `cron-run-history-row.tsx`, `schedule-picker.tsx` | `crons.jsx`, `cron-detail.jsx` |
| `components/sessions/` | `session-row.tsx`, `message-block.tsx` + new `tool-call-block.tsx` | `sessions.jsx` |
| `components/logs/` | `log-row.tsx`, `log-json-block.tsx`, `log-search-input.tsx`, `level-chips.tsx`, `time-range-select.tsx`, `following-toggle.tsx` | `logs.jsx` |
| `components/settings/` | `service-status.tsx`, `profile-file-row.tsx`, `mcp-server-row.tsx`, `restart-dialog.tsx` | `settings.jsx` |
| `components/skeletons/` | All skeleton files — adjust to new colors | — |

**Icons:**

Replace current icons with the custom SVG definitions from `icons.jsx`. Create `components/icons.tsx` that re-implements the prototype's inline SVGs (1.5px stroke, 24x24 viewBox) — do NOT pull in the Lucide React library. Exports: Home, Cron, Sessions, Logs, Settings, Search, Plus, Play, Pause, Trash, X, ChevR, ChevD, Dot, Term, Bolt, Refresh, Alert.

### Phase 4 — API Gaps

**Endpoint 1: Sparkline**

```
GET /api/stats/sparkline?metric=runs|sessions|failures&hours=24
Response: { buckets: Array<{ hour: string; count: number }> }
```

Storage: `CronRunRepo.sparkline(metric, hours)` — SQL GROUP BY `strftime('%H', started_at)`, fills empty hours with 0.

For sessions metric, `COUNT(*) FROM sessions WHERE last_used_at >= ?` grouped by `strftime('%H', last_used_at)` — counting how many distinct sessions were active in each hour bucket. For failures, same query on `cron_runs` adding `AND status='failed'`.

Dashboard: `useSparkline(metric)` hook, refetch 60s.

**Endpoint 2: Next Scheduled Crons**

```
GET /api/crons/next?limit=3
Response: Array<{ id, name, schedule, nextRunAt, notifyConversationId? }>
```

Storage: `CronRepo.next(limit)` — `WHERE enabled=1 AND next_run_at IS NOT NULL ORDER BY next_run_at ASC LIMIT ?`.

Dashboard: `useNextCrons(limit)` hook, refetch 30s. Countdown computed client-side, updated every 60s via `setInterval`.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Light mode | Killed | Dark-only is identity, not laziness. Prototype declares it explicitly |
| Fonts | Google CDN | Zeno is always online (Docker + Slack). Self-host adds complexity for no gain |
| Canvas color | `#0A0A10` | Adjusted from prototype's `#08090F` per owner preference |
| Responsive / mobile | Out of scope | Desktop-first. Mobile layout is a separate spec |
| Paper design file | Historical | Prototype supersedes Paper. No updates to "Hearty island" |
| Tweaks panel | Excluded | Claude Design exploration tool, not production feature |
| Drawer component | Removed from exports | No mobile nav in this scope |

## Risks

| Risk | Mitigation |
|---|---|
| Large diff touches every component | Phase by layer (tokens → primitives → screens → API). Each phase is independently deployable |
| Tailwind class names referencing old token names (e.g. `bg-accent`) | Search-and-replace across dashboard. Token rename is mechanical |
| Sparkline SQL performance on large cron_runs table | Query is bounded by 24h window + indexed on `started_at`. Not a concern at personal-use scale |
| Google Fonts latency on first load | `display=swap` prevents FOIT. Fonts cache after first visit |
