---
version: alpha
name: Imperial Terminal
description: Zeno's dashboard design system. Ink-blue surfaces, imperial-gold accent, mono-first typography. Dark only.
colors:
  primary: "#d9b362"
  canvas: "#08090F"
  panel: "#0f1119"
  panel-2: "#151824"
  sidebar: "#05060F"
  border-subtle: "#1e2131"
  border-strong: "#2a2e44"
  text-primary: "#e8eaf5"
  text-secondary: "#8a8fab"
  text-tertiary: "#4b4f66"
  text-ink: "#0a0b12"
  gold: "#d9b362"
  gold-bright: "#f0cc7a"
  gold-deep: "#8a6d2e"
  status-active: "#6bd3a3"
  status-paused: "#d9b362"
  status-failed: "#e8617a"
  status-info: "#7aa6e8"
typography:
  body:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  serif-display:
    fontFamily: Fraunces
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: -0.01em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1
    letterSpacing: 0.08em
rounded:
  none: 0px
  sm: 2px
  md: 4px
  lg: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.text-ink}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.gold-bright}"
  button-ghost:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 12px
  pill:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px
  dialog-surface:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 8px
  sidebar-surface:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.text-secondary}"
    padding: 16px
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: 16px
---

# Imperial Terminal

Zeno's dashboard design system. Ink-blue surfaces, imperial-gold accent, mono-first typography. Dark only.

## Overview

The dashboard is a personal control room for an agent that operates across the apps you use. The mood is **vehicle dashboard** — instrument black surfaces with a single amber-LED accent, mono-first labels for precision, and serif moments reserved for the rare display heading. Everything else is restrained: small type, narrow rhythm, no decoration that doesn't carry information.

Light mode does not exist. Dark is the canonical mode and the only mode. This is a deliberate constraint, not an oversight: the dashboard is used for ambient monitoring and quick action, and the gold accent reads cleanly only against deep ink-blue surfaces.

## Colors

The palette is rooted in deep ink-blue neutrals (`canvas`, `panel`, `panel-2`, `sidebar`) with one driving accent — **imperial gold** (`gold`, `gold-bright`, `gold-deep`).

- **Surfaces.** `canvas` (`#08090F`) is the page ground. `panel` (`#0f1119`) is the default raised surface (cards, popovers, dialogs). `panel-2` (`#151824`) is for nested or pressed states. `sidebar` (`#05060F`) is the deepest surface, reserved for the left chrome.
- **Borders.** `border-subtle` for default rules; `border-strong` when separation needs to be felt without color.
- **Text.** `text-primary` is the default body color. `text-secondary` is for metadata, captions, and helpers. `text-tertiary` is for muted state (disabled, decorative). `text-ink` is the inverse, used only on gold surfaces.
- **Imperial gold.** `gold` is THE accent — the single brand color and the driver of every primary action. `gold-bright` is the hover lift. `gold-deep` is the pressed / dim state. Reserved exclusively for primary affirmative actions and the brand mark. The `primary` token is an alias of `gold` (same hex) included for Google Labs format convention.
- **Status.** `status-active` (jade), `status-paused` (gold reused), `status-failed` (carmine), `status-info` (cobalt). Used for pills, indicators, and inline state — never as a background fill.

## Typography

Three families, each with a precise role.

- **Space Grotesk** — body. Open neutral grotesque; the everyday voice of the UI. Used for paragraphs, button labels, and any reading surface.
- **JetBrains Mono** — labels, kickers, status pills, code, IDs, timestamps, anything that should read as a data point rather than prose. Mono is the dominant register on this dashboard.
- **Fraunces** — serif display. Used sparingly for hero page titles (the `Z` brand mark and a small number of marquee numerals). Italic cuts only.

Body is `14px / 1.5`. Mono is `13px / 1.4`. Labels (caps) are `11px` with generous tracking (`0.08em`). Display serif is `28px / 1.2` with slightly tighter tracking.

## Layout

Single-density layout. The dashboard is meant to be skimmed at a glance, not browsed.

- **Sidebar.** Fixed-width left chrome on `sidebar` surface, contains brand, primary nav, and runtime status. Sticky, full-height.
- **Main column.** No max-width clamp — the dashboard is operator-only and rarely viewed below 1280px. Content uses a 24-32px outer gutter.
- **Spacing scale.** `xs 4 / sm 8 / md 12 / lg 16 / xl 24 / 2xl 32`. Pick the smaller value when in doubt; cramped beats roomy here.

## Elevation & Depth

Tonal, not shadowed. Hierarchy is conveyed by surface tone: `canvas → panel → panel-2`. Floating elements (dialogs, popovers) add a soft shadow plus a 1px gold-line border at low opacity.

Three named shadows in code (`tokens.css`):

- `--shadow-panel` — barely-there inner highlight + 1px black drop; used on cards.
- `--shadow-float` — pronounced soft drop for dialogs.
- `--shadow-gold-glow` — gold ring + halo, used on focus and hover affordances.

## Shapes

Sharp by default. Radii are tiny (`sm 2 / md 4 / lg 8`); `none` and `full` are the only common deviations. Cards use `md` (4px); dialogs and panels use `lg` (8px); pills and circular indicators use `full`.

Sharpness reinforces the instrument-panel mood. Avoid mixing `lg` and `none` in the same view.

## Components

Component archetypes (intent only — full variant inventory belongs in Paper).

- **`button-primary`.** The single affirmative per surface. Gold background, ink text, mono caps label. Reserved for the action that progresses the surface (Run now, Save, Create, Install).
- **`button-primary-hover`.** Gold-bright lift on hover.
- **`button-ghost`.** Default-density action; panel background, primary text. For navigation and secondary actions.
- **`pill`.** Lowercase short-form status (`active`, `paused`, `failed`, `info`). Mono caps. No background tint by default — the color is communicated by the leading dot indicator.
- **`dialog-surface`.** Floating panel for confirmations and forms. `panel` background, `lg` rounded, `--shadow-float`.
- **`input`.** Canvas-deep field on raised surfaces (looks recessed), `md` rounded, mono text for code/IDs and body text for prose.
- **`sidebar-surface`.** The deepest tone in the system; left chrome only. Holds brand mark, primary nav, and runtime status.
- **`card`.** Default raised container for grouped content (cron rows, log entries, settings sections). Panel background, sharp `md` rounding.

> **Tokens not represented in archetypes** (`text-tertiary`, `gold-deep`, `status-active`/`paused`/`failed`/`info`) exist for code use cases beyond archetype scope: muted/disabled state, pressed gold, semantic indicator dots. Archetypes deliberately stop at structural primitives; per-status variants belong in Paper, not in this spec.

## Do's and Don'ts

- **Do** reserve `gold` for the single primary affirmative per surface. Never two.
- **Don't** use `gold` for borders, backgrounds, or secondary chrome. The accent loses force the moment it spreads.
- **Do** keep status pill labels lowercase (`active`, not `ACTIVE`). Kickers and filter chips stay UPPERCASE.
- **Don't** mix sharp (`none`) and rounded (`lg`) corners in the same view. Pick one mood and hold it.
- **Do** lead labels in JetBrains Mono caps with positive tracking. Mono is the default register for non-prose.
- **Don't** introduce light-mode tokens. Dark is the only mode. Light-mode hex values do not exist in this design system.
- **Do** maintain WCAG AA contrast on text (≥ 4.5:1). Gold-on-canvas and primary-text-on-canvas both clear it; verify before adding new pairings.
- **Don't** add a font family. The three families above carry every role; adding a fourth dilutes the system.
- **Don't** create per-component variant tokens (e.g. `button-primary-disabled-hover`). Stop at archetypes; Paper carries the variants.

## Source of truth

- **Visual:** Paper file `zeno-agent` ([`01KPYCJ6QXK8Z1PEVQME9262RP`](https://app.paper.design/file/01KPYCJ6QXK8Z1PEVQME9262RP/1-0)). Page `1-0`. Routes are organized into top-level container artboards in the sidebar (design system, login, home, crons, sessions, logs, settings, connectors, channels, skills). Navigate the container to find a component's artboard.
- **Tokens (code):** `packages/ui/src/styles/tokens.css` — must match the YAML frontmatter above exactly. See [`context/rules/design-md-canonical.md`](context/rules/design-md-canonical.md).
- **Format spec:** see [`context/conventions/design-md-format.md`](context/conventions/design-md-format.md) (vendored from `google-labs-code/design.md`).
