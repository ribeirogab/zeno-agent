---
status: design-only
feature: dashboard-design
created: 2026-04-16
shipped: null
---
# Dashboard Design — Spec (visual only, no implementation)

**Status:** Design-only
**Scope:** A visual design pass for Zeno's web dashboard. Single-tenant operator console: log in, see what Zeno is doing, manage crons, browse sessions, edit profile. **This spec materializes the design in Paper.design** — code lives in a future spec (likely 0009 or 0012). Implementation tech stack is fixed (Next.js 15 + shadcn/ui + Tailwind v4) but no code is produced here.

## Context

Zeno is currently a Slack-only surface. Useful for ad-hoc requests but bad at:
- **Visibility.** Did the morning cron actually fire? What did it output? When's the next run?
- **Bulk operations.** Listing/pausing crons via chat is awkward at >5 entries.
- **Session inspection.** Threads accumulate; no way to scan history without scrolling Slack.
- **Profile authoring.** Editing SOUL.md or USER.md from a phone is painful; a UI would help.

A small dashboard, served from the same container on a separate port, behind a simple password (env-stored), gives a console without the security blast radius of a multi-user system.

## Reference: Claude desktop app aesthetic

The user provided 5 screenshots of the Claude desktop app (Cowork variant) under `tmp/` (gitignored). Analysis:

| Element | Observed pattern | Adopted? |
|---|---|---|
| Color base | Warm very-dark gray (`#1A1816`-ish), not pure black or cool charcoal | Yes |
| Sidebar | Slightly darker than canvas, ~200px, capitalized small-cap section labels (Pinned, Recents, Scheduled) | Yes |
| Page hero | Large display headline (looks like Instrument Serif) + warm coral starburst as the only color moment | Yes |
| Cards | Rounded ~10px, subtle 1px border, generous padding, no heavy shadows | Yes |
| Status pills | Pill with dot + label, green for live, muted for paused | Yes |
| Accent | Single coral/orange (`#E66B3D`-ish) used sparingly — "less is more" approach | Yes |
| Table-like lists | Plain rows on canvas, no boxed cards, divider lines barely visible | Yes — info on surfaces, not in containers |
| Modals | Centered, dark, rounded ~12px, prominent CTA on right | Yes |
| Avatar / user chip | Bottom-left corner of sidebar, small mono initials + name | Yes |

**Zeno's personality differentiator:** the starburst is replaced by a small Z-glyph (Instrument Serif italic) in coral. That's our single-color moment.

## Problem Statement

Today the only way to inspect Zeno's behavior is `pnpm run docker:logs | grep cron`. That's fine for me; embarrassing if I want to show this to anyone. We need a clean, single-page-app feel that:
- Doesn't pretend to be a multi-user platform
- Looks intentional, not bootstrap-default
- Reads as warm/personal, matching Zeno's identity

## Non-Goals

1. **Multi-user.** One operator: me. No auth UI beyond a single password input.
2. **Mobile-first.** Designed at 1440×900. A responsive pass can come later if I actually use it on mobile.
3. **Light mode.** Dark only. Matches the Claude desktop app reference and Zeno's nighttime persona.
4. **Branded marketing.** No public landing page. Login is the front door.
5. **Code in this spec.** The design lives in Paper. Implementation is a separate spec — this one is an artifact, not a deliverable.

## Constraints

- **Single-page-app feel.** Sidebar persistent across all routes (Home, Crons, Sessions, Settings).
- **Same container, separate port.** Implementation will run a Next.js process alongside the Slack worker on port `3000`. Auth = `DASHBOARD_PASSWORD` env. (Out of scope for this spec, but informs design — there's no "sign up", no "forgot password".)
- **No tabs / no complex nav.** Five top-level destinations: Home, Crons, Sessions, Settings, plus the global avatar (sign out).
- **Dense but breathable.** Warm whitespace, not corporate-spacious. Dial reference: more "indie code editor", less "enterprise admin panel".
- **One accent color, used once per screen.** Coral. If a screen uses more than one coral element, scrutinize.

## Design system (locked-in)

### Palette

| Token | Hex | Role |
|---|---|---|
| canvas | `#1A1816` | Page background |
| panel | `#221F1C` | Cards, modals, raised surfaces |
| sidebar | `#16140F` | Sidebar background (slightly darker than canvas) |
| border-subtle | `#2C2823` | 1px borders, divider lines |
| text-primary | `#EBE5DA` | Body text, headings |
| text-secondary | `#8C8579` | Labels, muted descriptions |
| text-tertiary | `#5C574F` | Timestamps, metadata |
| accent-coral | `#E66B3D` | The single color moment per screen |
| status-active | `#4FA876` | Green dot for active/healthy |
| status-paused | `#C7A85C` | Amber dot for paused |
| status-failed | `#C75C5C` | Red dot for failed runs |

### Typography

| Role | Font | Size / weight |
|---|---|---|
| Display headline | Instrument Serif Regular | 36px / 1.1 |
| Display Z-glyph (coral) | Instrument Serif Italic | inline with headline |
| Page title | Inter SemiBold | 22px |
| Card title | Inter SemiBold | 15px |
| Body | Inter Regular | 14px / 20px line-height |
| Muted small | Inter Regular | 12px |
| Section label (sidebar) | Inter Medium uppercase | 11px, letter-spacing 0.08em |
| Mono / numbers | ui-monospace fallback chain | 13px |

### Spacing rhythm

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64`. Section padding 32px, card padding 20px, group gap 24px.

## Artboards (in Paper)

All 1440×900 desktop. Built incrementally per Paper guide.

1. **`Zeno · Login`** — full-canvas centered card. Instrument Serif "Welcome back" + Z-glyph coral. Password field. Sign-in button. No "remember me", no signup link.
2. **`Zeno · Home`** — sidebar + main. Display "Hello, Operator." headline. Stats row: active crons / sessions today / runs today. Recent activity timeline (last 5 cron runs + message bursts).
3. **`Zeno · Crons (list)`** — sidebar + table. Columns: name · schedule (cron expr in mono) · next run · status pill · source badge (static/chat). Top-right: "New cron" outlined pill (parity with Claude app's "New task").
4. **`Zeno · Cron detail`** — sidebar + content. Cron header (name as serif + schedule as mono pill + status). "Run now" coral button. Run history table: started · status · duration · output preview.
5. **`Zeno · Sessions (list)`** — sidebar + table. Columns: thread · channel · last user message preview · last activity · message count.
6. **`Zeno · Session detail`** — sidebar + thread reading view. Header: channel + thread title. Message list with subtle alternation between user and Zeno turns. No bubbles — just left-aligned blocks with author label, like a transcript.
7. **`Zeno · Settings`** — sidebar + sections: backend (claude-code/mock toggle), MCP servers status table (loaded / skipped / disabled), profile paths (paths + last-modified), shutdown control.
8. **`Zeno · Logs`** — sidebar + main. Filter bar: level chips (all/info/warn/error), event/correlationId search, time range picker, "Following" live-tail indicator. Log list: dot (level color) · timestamp (mono) · level pill (uppercase color-matched) · event name (mono) · message (sans). One row shown expanded with the full Pino JSON payload in a code block — proves the inspect-on-click pattern.

## Success Criteria

1. All 8 artboards exist in the user's Paper file, each at 1440×900 (Settings + Logs use `height: fit-content` because their content overflows).
2. Each artboard uses the locked palette and type scale exclusively (no off-palette colors, no off-system font sizes).
3. Sidebar component is consistent across all sidebar-bearing artboards (Home, Crons list, Cron detail, Sessions list, Session detail, Settings, Logs) — same nav items in the same order.
4. The Cron detail artboard's "Run now" coral button is the only coral element on that screen — proving the "one accent moment per screen" rule.
5. The user can review the design and either approve or annotate; implementation is gated on that review.

## Risks

| Risk | Mitigation |
|---|---|
| Design drifts toward "generic SaaS" — purple gradients, default shadcn slate | Locked palette + Instrument Serif headline + the "one accent moment" rule are the guardrails |
| User wants light mode after seeing dark | Dark is intentional, matching the Claude desktop reference. If the user pushes back, we add a light variant later — single source of truth lives in CSS variables for the implementation spec |
| Paper artboards drift over time as I tweak in the file | This spec is the snapshot of intent at design time — not the source of truth for the live artboards. The Paper file IS the source. The spec captures the *brief*, not the *artifact* |
| Implementation pressure to deviate from these design choices | The implementation spec (future) must reference this one and justify any deviation in writing |

## Open Questions

None blocking. Implementation spec will pick up:
- Auth flow specifics (cookie? signed token? plain session?)
- Whether the dashboard mounts inside the existing Node process or runs as a sibling Next.js process
- Whether crons list is server-rendered or fully client (likely server with islands)
