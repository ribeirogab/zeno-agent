---
name: UI lives in Paper
severity: important
tags: [design, ui, governance]
related:
  - "[[../conventions/design-md-format]]"
  - "[[../learnings/per-frame-design-registry-failure]]"
  - "[[design-md-canonical]]"
---

# UI lives in Paper

Every component rendered in `apps/dashboard/**` MUST have a corresponding artboard in the Paper file `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`), nested inside the appropriate route container in the sidebar. Paper is the visual source of truth; the dashboard is an implementation of it.

> **No per-frame URL registry.** A previous version of this rule required registering each component's frame URL in `packages/ui/DESIGN.md`. That registry pattern failed (see [[../learnings/per-frame-design-registry-failure]]) and has been removed. Find frames by navigating the route container in the Paper sidebar.

## When this rule applies

Any change that produces, moves, renames, or deletes a rendered `.tsx`:

- New component under `apps/dashboard/src/components/**`
- New route under `apps/dashboard/src/routes/**`
- Rename (kebab-case filename) or relocation of an existing component
- Removal of a component

Also applies to new primitives added to `packages/ui/src/components/**`.

## What the rule requires

Before opening the PR:

1. **Draw the artboard in Paper**, inside the route container that matches the component's surface (`design system`, `crons`, `sessions`, `connectors`, etc.). Match the conventions of that container — dark "Imperial Terminal" palette (canvas, panel, gold accent), tokens defined in `/DESIGN.md`, lowercase pills, the gold-italic Z brand mark.
2. **If you rename or move code**, rename or move the artboard in Paper to match.
3. **If you delete code**, delete or archive the artboard in the same session (don't leave orphans).

Enforcement is by PR review, not CI. A reviewer who sees rendered `.tsx` changes with no corresponding Paper change should request changes.

## Why it matters

Without this link, the dashboard and the design drift silently. Zeno is a single-operator tool — the visual cost of drift is paid every day by the one person using it. Paper is where design decisions get made deliberately; code is where they get implemented. Skipping Paper means skipping the design decision.

The rule is cheap to follow (drawing an artboard inside the right container is a few minutes) and expensive to skip (page-level repaints later cost hours).

## Scope

- **In scope:** rendered React components and routes in the dashboard.
- **Out of scope:** internal hooks, data-fetch modules, utility functions, server code, shared types. These don't have a visual surface.
- **Out of scope:** ephemeral screenshots or one-off mocks. If it's going to ship, it needs an artboard.

## Related

- [[../conventions/design-md-format]] — the DESIGN.md format that captures the brand tokens visible in Paper.
- [[design-md-canonical]] — DESIGN.md is the canonical source for tokens; this rule covers the visual / artboard side.
- [[../learnings/per-frame-design-registry-failure]] — context for why the per-frame URL registry was removed.
