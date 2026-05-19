---
tags:
  - learning
  - reference
  - gotcha
related:
  - "[[../specs/2026-05-07-apps-docs-scaffold/spec]]"
created: 2026-05-07
---
# Fumadocs version triple (as of 2026-05-07)

`apps/docs` ships against three Fumadocs packages whose peer-deps are tangled. The supported combination is **`fumadocs-core@^16.8.8` + `fumadocs-ui@^16.8.8` + `fumadocs-mdx@^15.0.0`** running on **Next.js 16.x** and **React 19.2+**. Bumping any single one out of step breaks `pnpm install`.

## Context

While scaffolding `apps/docs` (PR #19 / spec [[../specs/2026-05-07-apps-docs-scaffold/spec]]), the first install picked `fumadocs-ui@14` (Tailwind 3 peer) which collides with the dashboard's Tailwind 4. Bumping to UI 17 fixes Tailwind but pulls a `fumadocs-core@17` peer, which `fumadocs-mdx@15` (the latest companion) refuses with `unmet peer fumadocs-core: ^16.7.0`. Net: there is exactly one supported tuple at any given time, and it lags behind the latest `fumadocs-ui` major.

## How It Works

Peer matrix at the time of this note (`pnpm view <pkg> peerDependencies`):

- `fumadocs-mdx@15.0.0` peers: `fumadocs-core: ^16.7.0`, `next: ^15.3.0 || ^16.0.0`, `react: ^19.2.0`, `vite: 7.x.x || 8.x.x`.
- `fumadocs-core@16.8.8` peers: `next: 16.x.x`, `react: ^19.2.0`.
- `fumadocs-ui@16.8.8` peers: `next: 16.x.x`, `react: ^19.2.0`. **No `tailwindcss` peer** (UI 14 had one pinned to v3 — UI 16 dropped it; the bundled `fumadocs-ui/css/preset.css` works with Tailwind 4).
- `fumadocs-ui@17.0.0` peers: `next: 16.x.x`, `tailwindcss: ^4.0.0`, `fumadocs-core: 17.0.0`. **Cannot be used today** because `fumadocs-mdx` has no 17-compatible release.

The triple is captured in spec Constraints. When `fumadocs-mdx@16` (or 17) ships, re-evaluate and bump in lockstep.

## How to Apply

- When bumping any Fumadocs package in `apps/docs`, pin all three to the same major and verify `pnpm install` reports zero peer warnings attributed to `@zeno/docs` before merging.
- If a peer warning surfaces, treat it as a blocker; document the resolution in the PR rather than forcing a silent bump.
- Pre-existing peer warnings from unrelated workspaces (e.g. `@google/design.md` requesting zod 4 / ink 6) are **not** blockers for `apps/docs` work — log them but skip them.
- The triple is dated. Re-check `pnpm view fumadocs-mdx peerDependencies` before any future Fumadocs upgrade.
