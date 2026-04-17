---
name: UI lives in Paper
severity: important
tags: [design, ui, governance]
---

# UI lives in Paper

Every component rendered in `apps/dashboard/**` MUST have a corresponding frame
in the Paper file **Hearty island**, registered in `packages/ui/DESIGN.md`.
Paper is the visual source of truth; the dashboard is an implementation of it.

## When this rule applies

Any change that produces, moves, renames, or deletes a rendered `.tsx`:

- New component under `apps/dashboard/src/components/**`
- New route under `apps/dashboard/src/routes/**`
- Rename (kebab-case filename) or relocation of an existing component
- Removal of a component

Also applies to new primitives added to `packages/ui/src/components/**`.

## What the rule requires

Before opening the PR:

1. **Draw the frame in Paper.** Match the conventions of its section (04 for
   feature components, 05 for pages, etc.). The dark palette, tokens,
   lowercase pills, and Logo A brand mark are non-negotiable.
2. **Register it in `packages/ui/DESIGN.md`** with the frame URL (format:
   `https://app.paper.design/file/01KPA7BZ1AWQDRA79KQYGDA6V7/1-0/<FRAME_ID>`).
3. **If you rename/move code**, update the registry row accordingly.
4. **If you delete code**, remove the row AND delete or archive the frame in
   Paper (don't leave orphans).

The registry is enforced by PR review, not CI. A reviewer who sees rendered
`.tsx` changes with no corresponding DESIGN.md diff should request changes.

## Why it matters

Without this link, the dashboard and the design drift silently. Zeno is a
single-operator tool — the visual cost of drift is paid every day by the one
person using it. Paper is where design decisions get made deliberately; code
is where they get implemented. Skipping Paper means skipping the design
decision.

The rule is cheap to follow (drawing a feature-component row is a couple of
minutes in the existing 04 artboard) and expensive to skip (page-level
repaints later cost hours).

## Scope

- **In scope:** rendered React components and routes in the dashboard.
- **Out of scope:** internal hooks, data-fetch modules, utility functions,
  server code, shared types. These don't have a visual surface.
- **Out of scope:** ephemeral screenshots or one-off mocks. If it's going to
  ship, it needs a frame.
