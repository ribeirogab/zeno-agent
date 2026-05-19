# @zeno/web

Public-facing landing page for the Zeno project. Single-page scroll, six sections, statically built.

## Stack

- Vite 8 + React 19.2 + Tailwind 4
- `@zeno/ui` workspace package (Imperial Terminal design system)
- `vitest` + `happy-dom` + `@testing-library/react`

## Scripts

| Command | What it does |
|---|---|
| `pnpm --filter @zeno/web dev` | Dev server on `http://localhost:3000`. |
| `pnpm --filter @zeno/web build` | Static build to `apps/web/dist/`. |
| `pnpm --filter @zeno/web preview` | Serve the build at `http://localhost:3000`. |
| `pnpm --filter @zeno/web test` | Run smoke + structural tests. |
| `pnpm --filter @zeno/web typecheck` | TypeScript check. |
| `pnpm --filter @zeno/web lint` | Biome lint. |

## Port conflict

Port 3000 is also used by the `apps/dashboard` Docker mapping. Run **one at a time**
locally. The dashboard's port migration is tracked separately.

## Adding a section

1. Create `src/sections/<name>-section.tsx` with `aria-label="<id>"`.
2. Render it from `src/app.tsx` in the desired scroll position.
3. Add a smoke test at `tests/sections/<name>-section.test.tsx`.
4. Update `EXPECTED_LABELS` in `tests/app.test.tsx`.

## Spec

See `.vault/specs/2026-05-07-apps-web-landing/`. The visual contract is the Paper
artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document.
