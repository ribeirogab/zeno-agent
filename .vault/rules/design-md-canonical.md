---
tags:
  - rule
  - workflow
  - design
severity: important
applies-to:
  - DESIGN.md
  - packages/ui/src/styles/tokens.css
  - apps/dashboard/src/styles/globals.css
created: 2026-04-30
related:
  - "[[../learnings/per-frame-design-registry-failure]]"
---
# DESIGN.md is the canonical source for design tokens

When changing any design token (colors, typography, spacing, radius, shadows, component archetype properties), update `/DESIGN.md` first; `packages/ui/src/styles/tokens.css` and any other code follows in the **same commit**. The two artifacts must match exactly. Drift is forbidden.

## Why

Two artifacts (Paper visuals + code variables) already create cognitive load. Without a normative third anchor that combines machine-readable tokens and prose intent, agents and humans pick whichever is closer at hand and drift compounds. DESIGN.md is structured prose: tokens are parseable; rationale survives in plain text. It is also tool-friendly (`pnpm run design:lint`, `design:diff`, `design:export-tailwind`).

Two specific failure modes this rule prevents:

- **Silent token drift.** Changing `tokens.css` without updating DESIGN.md leaves the doc lying about reality.
- **Reverse drift.** Changing DESIGN.md without `tokens.css` ships a feature where the doc promises a behavior the code doesn't deliver.

## How to Apply

- **On any token change:** edit `DESIGN.md` first. Update the YAML frontmatter and the relevant `##` section prose. Then update `packages/ui/src/styles/tokens.css` (and any consumer in `apps/dashboard/src/styles/globals.css`) in the **same commit**.
- **On a new component archetype:** add an entry to the `components:` block in DESIGN.md frontmatter (archetypes only — see Components section policy).
- **Reviewers:** any PR that modifies `tokens.css` without a matching DESIGN.md diff should be requested-changes.
- **`pnpm run design:lint`** is opt-in (not in `quality-gate`). Run it before opening a PR that touches design tokens. Triage warnings.

## Fallback if `@google/design.md` breaks

The npm dep is `version: alpha`. If a future release breaks the format incompatibly:

1. Drop `@google/design.md` from `package.json` devDeps.
2. Drop the `design:*` scripts.
3. Keep `DESIGN.md` itself unchanged — it remains a useful plain-markdown spec.
4. Update `.vault/conventions/design-md-format.md` to note the vendored format is now authoritative.

## Out of scope

- Auto-generating `tokens.css` from DESIGN.md (separate spec if drift becomes a real problem).
- Light-mode tokens (Zeno is dark-only by design).
- Per-frame Paper↔code registry (failed approach — see [[../learnings/per-frame-design-registry-failure]]).
