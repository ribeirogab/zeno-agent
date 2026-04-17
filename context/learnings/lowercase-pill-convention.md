---
tags:
  - learning
  - design
  - ui
related:
  - "[[../specs/0017-paper-design-system/spec]]"
  - "[[../rules/ui-in-paper]]"
created: 2026-04-17
---
# Status pills use lowercase text; kickers and chips use uppercase

In Zeno's design system, **status pills** (active, paused, failed, following, chat, static) render in plain lowercase — no CSS `text-transform: uppercase`. **Section kickers** (`STATUS`, `SCHEDULED TASKS`, `OBSERVABILITY`) and **filter chips** (`ALL`, `INFO`, `WARN`, `ERROR`) stay uppercase. The split keeps status markers quiet and scannable, while section signposts still read as hierarchy.

## Context

During spec 0017 Phase 5 (page repaints), the Paper 03. Patterns artboard had all pills as lowercase but the code still rendered "Active" / "Paused" / "STATIC" / "CHAT". The visual mismatch made the dashboard look "louder" than the design. Standardized on the Paper convention: pills lowercase, kickers + chips uppercase.

## How to Apply

When adding a new status indicator or chip:

- **Is it a status pill?** (represents a runtime state: on/off, active/paused, success/fail)
  - Lowercase text. No `uppercase` / `tracking-wider` classes.
- **Is it a section kicker or column header?** (labels hierarchy)
  - Uppercase text. `uppercase tracking-wider text-text-tertiary`.
- **Is it a filter chip in a segmented control?**
  - Uppercase, same style as kickers.

When in doubt, check Paper's 03. Patterns artboard — if the motif exists there, match its casing exactly. `packages/ui/DESIGN.md` links to the frame.
