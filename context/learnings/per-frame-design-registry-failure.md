---
tags:
  - learning
  - gotcha
  - design
related:
  - "[[../specs/0070-design-md-format/spec]]"
  - "[[../rules/design-md-canonical]]"
  - "[[../conventions/design-md-format]]"
created: 2026-04-30
---
# Per-frame Paper↔code registries don't survive Paper restructures

The pre-2026-04-30 `packages/ui/DESIGN.md` carried a per-component table of Paper frame URLs (e.g. `Button → .../1-0/171-0`). After the Paper file was reorganized into route-based containers, most of those URLs still resolved (artboard IDs are preserved by `move_nodes`), but the registry was already partially obsolete by the time it was deleted — the brand it described ("Hearty island", coral `#e66b3d`, light/dark) was years stale; the live brand is "Imperial Terminal", gold `#d9b362`, dark-only. The doc lied about reality on multiple axes.

## Context

Discovered while writing spec `[[../specs/0070-design-md-format/spec]]`. Reading `packages/ui/src/styles/tokens.css` showed gold accent and dark-only; reading `packages/ui/DESIGN.md` showed coral and dual-mode. The registry pattern compounded the staleness: every code change that added/removed a primitive needed a manual table edit in DESIGN.md, and every Paper restructure invalidated the URLs.

## How to Apply

- **Don't rebuild the per-frame registry.** Use the Paper sidebar's route containers (introduced 2026-04-30 in the `zeno-agent` Paper file) for navigation. One pointer to the file root in `/DESIGN.md`'s "Source of truth" section is enough.
- **Tokens are the durable contract.** Hex values, font families, radii, spacing scales — these survive Paper restructures because they're values, not pointers. Put them in DESIGN.md frontmatter (machine-readable) and code (`tokens.css`) and keep them aligned via [[../rules/design-md-canonical]].
- **Component archetypes, not variants.** `button-primary` is durable; `button-primary-disabled-with-icon-loading` is not. The Components section in DESIGN.md should stop at archetypes.
- **Brand changes are a code+doc commit.** When the brand shifts (Hearty island → Imperial Terminal), DESIGN.md is the first thing to update — not the last.
