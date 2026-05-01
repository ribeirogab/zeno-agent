---
tags:
  - learning
  - dashboard
  - tanstack-router
related:
  - "[[../specs/2026-04-16-dashboard-crud/spec-dashboard-crud|spec 0013]]"
created: 2026-04-16
---
# TanStack Router flat-file naming needs `.index` for nested paths

In TanStack Router's file-based router with the `@tanstack/router-plugin` (flat naming), a file named `foo.tsx` registered to route id `/foo` becomes a **layout route** when sibling files `foo.bar.tsx` or `foo.$id.tsx` exist. The layout route is expected to render `<Outlet />` for its children. Navigating to `/foo/bar` matches successfully, but the rendered DOM shows `foo.tsx`'s component JSX **without** the Outlet — so the child's content never appears.

The fix is to name the "list" page `foo.index.tsx` with route id `/foo/` (trailing slash in the `createFileRoute(...)` string). That makes it the default leaf under the `foo` group, and `foo.bar.tsx` / `foo.$id.tsx` become peer leaves with no shared layout.

## Context

Spec 0013 Phase 10 smoke test in `feat/dashboard` branch. `/crons/new` navigated cleanly in URL, but the modal never rendered — the Crons list was shown instead. Same issue affected `/crons/$id` until the rename. Cost: ~15 min to diagnose.

## How to Apply

- For any TanStack Router file-based route group with a list-page + one or more detail-pages:
  - **List page**: `<group>.index.tsx`, route id `/<group>/` (with trailing slash).
  - **Detail / sub-routes**: `<group>.$param.tsx`, `<group>.new.tsx`, etc — unchanged.
- Alternatively, keep `foo.tsx` as an actual layout component (header/nav/shared UI) that renders `<Outlet />`. This is the right call when sub-routes share chrome. Not the right call when each sub-route has its own page shell.
- Symptom to recognize: URL changes but content doesn't. First thing to check: did you accidentally create a layout route?
