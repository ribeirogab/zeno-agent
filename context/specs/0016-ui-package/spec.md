---
status: draft
feature: ui-package
created: 2026-04-16
shipped: null
---
# Extract @zeno/ui Package — Spec

**Status:** Draft
**Scope:** Extract the shadcn-style primitives from `apps/dashboard/src/components/ui/` into a new workspace package `@zeno/ui` at `packages/ui/`. Consume source directly (no build step) via `moduleResolution: "Bundler"` in the dashboard. Set up Tailwind content globs and TypeScript path aliases so the dashboard resolves imports transparently. Feature-level components (crons/, logs/, sessions/, etc.) stay in the dashboard.

## Context

Spec 0015 normalized filenames. The next structural issue is reuse: the UI primitives (`button`, `dialog`, `input`, `sonner`) live under the dashboard app and cannot be consumed by future apps without either a copy-paste or a refactor like this one. Since Zeno's roadmap anticipates additional Node-based apps sharing the same dark visual language (potential admin consoles, mobile companion views, etc.), paying the extraction cost now — while there are only 4 primitives — is cheaper than later.

The existing workspace pattern (`@zeno/logger`, `@zeno/storage`) is the reference: pnpm workspace package, `package.json` with `main`/`exports`, own `tsconfig.json` extending `tsconfig.base.json`. The twist: UI packages in a Vite-consumer world can skip the build step. The dashboard's Vite config (`moduleResolution: "Bundler"` in `tsconfig.json`) already resolves source files from workspace deps. Shipping `@zeno/ui` as source-only is lighter than adding a `tsup`/`vite build` step per package.

## Problem Statement

1. **Primitives are trapped** under `apps/dashboard/`. A second app cannot import `<Button>` without duplicating the file, drifting styles and bugs over time.
2. **`cn` utility** (the `clsx` + `tailwind-merge` helper) lives in `apps/dashboard/src/lib/utils.ts` and is imported by every primitive. When primitives move, `cn` must travel with them — otherwise the package has a cross-workspace import back into the dashboard (reverse dependency, invalid).
3. **Tailwind tokens** (`bg-panel`, `text-text-primary`, `text-accent`, etc.) are defined in the dashboard's CSS and Tailwind v4 config. `@zeno/ui` components use these tokens, so the design tokens layer also needs to be either (a) owned by `@zeno/ui` and imported by apps, or (b) owned by the app and assumed to be present. This spec picks (a) — tokens ship with the package, apps import a CSS file.
4. **Radix, sonner, class-variance-authority, clsx, tailwind-merge** — the runtime deps of the primitives — are currently direct deps of `@zeno/dashboard`. They should move to `@zeno/ui` (or become peer deps) so a future consumer inherits the correct versions transitively.

## Non-Goals

1. **Moving feature components** (`crons/`, `logs/`, `sessions/`, `settings/`, `home/`, `layout/`). Those are app-specific; they stay in `apps/dashboard/`.
2. **Publishing to npm.** Internal workspace package only. Private.
3. **Bundling/building the package.** Source-consumed; apps' bundlers handle TS/TSX/JSX transforms. If a future non-Vite consumer needs a `dist/`, add `tsup` at that point — YAGNI today.
4. **Adding new primitives.** This spec moves what exists. Spec D (0018) will add `alert-dialog` and any other primitives uncovered by the UX audit. Spec C (0017) will produce the Paper catalog.
5. **Refactoring component internals.** Any component that worked before the move must work after it, byte-for-byte equivalent where possible.
6. **Storybook or component docs site.** Out of scope; revisited if the UI library grows past ~20 components.
7. **Theming abstraction.** Dark-only, matching spec 0008 design. Light mode / theme switch is backlog.

## Constraints

- **Source-only consumption.** `@zeno/ui` has no `build` script beyond `typecheck`. `package.json` `main`/`types` point at `./src/index.ts` and `./src/index.ts` respectively. Apps' `tsconfig` uses `moduleResolution: "Bundler"` to resolve `.ts`/`.tsx` without compilation.
- **Tailwind v4 content globs.** The dashboard's `@source` directive (or Tailwind config) must be updated to include `../../packages/ui/src/**/*.{ts,tsx}` so utility classes inside `@zeno/ui` are scanned.
- **CSS tokens travel with the package.** `@zeno/ui` ships a `src/styles/tokens.css` defining CSS variables for the palette and the `@theme` block for Tailwind v4. Apps import it once from their entrypoint (`main.tsx` or equivalent).
- **No `@/` alias leakage.** Primitives inside `@zeno/ui` cannot reference `@/` (dashboard alias). They use relative paths inside the package (`./utils`) or package-internal aliases if added (not added in this spec — relative paths are fine for 4-5 files).
- **No `@zeno/ui` → `@zeno/dashboard` imports.** One-way dependency only.
- **Workspace boundary honored for types.** `@zeno/ui` re-exports only primitives. No exports of app-specific types.
- **No `any`, no `// biome-ignore`.**
- **React + types as peer deps.** `@zeno/ui` declares `react` and `react-dom` as `peerDependencies` + `devDependencies` (with fixed versions for local dev). Apps provide the real React at runtime. Prevents the classic "two React instances" hook-invalid error.

## Design

### Package layout

```
packages/ui/
├── package.json
├── tsconfig.json
├── biome.json (extends root, same rules)
├── src/
│   ├── index.ts          # re-exports all primitives
│   ├── utils.ts          # cn() — moved from apps/dashboard/src/lib/utils.ts
│   ├── styles/
│   │   ├── tokens.css    # CSS variables for palette (moved from dashboard globals)
│   │   └── index.ts      # re-export path helper if apps need it
│   └── components/
│       ├── button.tsx
│       ├── dialog.tsx
│       ├── input.tsx
│       └── sonner.tsx
└── tests/
    └── button.test.tsx   # smoke test proving the package is importable
```

### `packages/ui/package.json`

```json
{
  "name": "@zeno/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles/tokens.css": "./src/styles/tokens.css"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "test": "vitest run"
  },
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "1.1.15",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "sonner": "2.0.7",
    "tailwind-merge": "3.5.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "typescript": "^6.0.2",
    "vitest": "^4.1.4"
  }
}
```

Rationale: no `build` script. `main`/`types` and `exports` all point at source. Runtime deps (Radix, sonner, CVA, clsx, tailwind-merge) are regular `dependencies` so they hoist predictably. React is peer to avoid duplicates.

### `packages/ui/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {}
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

Rationale: **Bundler resolution** (same as dashboard). `noEmit` — no output. This is a deliberate split from `@zeno/logger` / `@zeno/storage` which use NodeNext + emit. See `[[learnings/moduleresolution-split-worker-vs-dashboard]]` — UI package joins the "Bundler" half.

### `src/index.ts`

```typescript
export * from './components/button';
export * from './components/dialog';
export * from './components/input';
export * from './components/sonner';
export { cn } from './utils';
```

### Moving `cn`

`apps/dashboard/src/lib/utils.ts` currently only exports `cn`. The whole file moves to `packages/ui/src/utils.ts`. The dashboard either (a) deletes `lib/utils.ts` and imports `cn` from `@zeno/ui`, or (b) keeps a re-export shim (`export { cn } from '@zeno/ui'`) for backward compat. Choose **(a)** — fewer files, clearer boundary. Dashboard code that does `import { cn } from '@/lib/utils'` changes to `import { cn } from '@zeno/ui'`. Small search-and-replace (current count: ~4-6 imports across feature components).

### Tokens CSS

Current dashboard CSS (in `apps/dashboard/src/styles/`) declares the palette via Tailwind v4 `@theme` inside a global stylesheet. The color-token half of that file moves to `packages/ui/src/styles/tokens.css`. The dashboard's main stylesheet imports the tokens:

```css
/* apps/dashboard/src/styles/index.css */
@import '@zeno/ui/styles/tokens.css';
@import 'tailwindcss';
/* dashboard-specific globals below */
```

Token file owns: `--canvas`, `--panel`, `--sidebar`, `--border-subtle`, `--text-primary/-secondary/-tertiary`, `--accent`, `--status-active/paused/failed`, plus the `@theme` mapping of those CSS vars into Tailwind utilities (`bg-canvas`, `text-text-primary`, etc.). Font families stay in the app (fonts are app-policy; different apps can use different brand fonts even if tokens are shared).

### Tailwind content globs

`apps/dashboard` uses Tailwind v4 with `@source` directives inside the CSS (default v4 pattern). Dashboard's root CSS needs:

```css
@source "../../../packages/ui/src/**/*.{ts,tsx}";
```

Alternative: define `@source` inside `packages/ui/src/styles/tokens.css` itself, so any app importing the tokens CSS automatically gets the content glob registered. Pick this — self-contained, less per-app configuration.

### `pnpm-workspace.yaml` and `apps/dashboard/package.json`

Workspace already globs `packages/*`, so `@zeno/ui` is discovered automatically. Dashboard adds the dependency:

```json
"dependencies": {
  "@zeno/ui": "workspace:*",
  // runtime deps that MOVED to @zeno/ui are removed:
  // @radix-ui/react-dialog, class-variance-authority, clsx, sonner, tailwind-merge
}
```

Removing the moved deps from the dashboard is important — pnpm hoists them via `@zeno/ui` anyway; keeping them duplicated makes it ambiguous which version the app uses when we bump `@zeno/ui`.

### Turbo pipeline

`turbo.json` (or equivalent) already wires up `typecheck`/`lint`/`test`/`build`. `@zeno/ui` inherits those tasks via its scripts. No pipeline change needed unless a `build` task exists that globs packages — if so, exclude `@zeno/ui` from `build` (it has no build).

### Import migration

In `apps/dashboard/src/**`:

| Before | After |
|---|---|
| `import { Button } from '@/components/ui/button'` | `import { Button } from '@zeno/ui'` |
| `import { Dialog, DialogContent, ... } from '@/components/ui/dialog'` | `import { Dialog, DialogContent, ... } from '@zeno/ui'` |
| `import { Toaster } from '@/components/ui/sonner'` | `import { Toaster } from '@zeno/ui'` |
| `import { Input } from '@/components/ui/input'` | `import { Input } from '@zeno/ui'` |
| `import { cn } from '@/lib/utils'` | `import { cn } from '@zeno/ui'` |

Script (`tmp/migrate-ui-imports.sh`) handles the sed. Biome reorganizes on the follow-up lint.

### Vitest

`packages/ui/vitest.config.ts` uses happy-dom (same as dashboard). One smoke test: render `<Button>hi</Button>` via `@testing-library/react`, assert text is in the DOM. Proves the package builds, exports work, and React-JSX resolution is correct.

## User Stories / Scenarios

1. **Dashboard build.** `pnpm --filter @zeno/dashboard run typecheck` passes; `pnpm --filter @zeno/dashboard run build` produces the same bundle output as before (primitives now imported from `@zeno/ui`, but Vite inlines them identically).
2. **New app `apps/admin`** (hypothetical future work). Adds `@zeno/ui` + `@zeno/ui/styles/tokens.css` and gets the same dark primitives with zero copy-paste.
3. **Hot reload.** Editing `packages/ui/src/components/button.tsx` triggers a Vite HMR reload in the running dashboard.
4. **Typecheck isolation.** `pnpm --filter @zeno/ui run typecheck` passes standalone (no dashboard types leak into the package).

## Success Criteria

1. `packages/ui/` exists with the structure above; `pnpm install` hoists deps correctly.
2. `apps/dashboard/src/components/ui/` is **deleted** — no primitives live in the app anymore.
3. `apps/dashboard/src/lib/utils.ts` is **deleted**; `cn` imports come from `@zeno/ui`.
4. `pnpm run quality-gate` green: lint + typecheck + tests across all workspaces, including the new smoke test.
5. `pnpm run docker:build && pnpm run docker:up` boots; all 9 dashboard routes render; cron create/delete, session list, logs stream all work visually.
6. Bundle diff (vite `dist/`) is effectively zero — same chunks, same sizes ±small hash changes.
7. `grep -r "@/components/ui" apps/dashboard/src` returns zero hits.
8. `grep -r "@/lib/utils" apps/dashboard/src` returns zero hits.
9. No duplicate React in `pnpm list react --filter @zeno/dashboard` — single version resolved through peer.
10. `@zeno/ui`'s `package.json` declares zero cross-workspace deps (no `@zeno/*`).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Two React instances** break hooks at runtime | `react`/`react-dom` as peer deps in `@zeno/ui`; dashboard owns the real version. Verified by inspecting `node_modules/.pnpm/` hoist graph and the Hook check passing in the smoke test. |
| **Tailwind classes missing at runtime** because the v4 scanner doesn't see `packages/ui/src/**` | Tokens CSS includes the `@source` directive pointing at `packages/ui/src/**/*.{ts,tsx}`. Verified by rendering a primitive in the dashboard and inspecting the built CSS for the class. |
| **Bundler resolution of TSX source via `main: "./src/index.ts"`** may confuse non-Vite consumers | No non-Vite consumer exists today. Documented in `packages/ui/README.md` (added) that this package is Bundler-only. Adding `tsup` is a trivial future step if needed. |
| **Circular dep risk** if a primitive imports from `@/` inside the dashboard | Grep-check during implementation; no `@/` inside `packages/ui/`. Lint rule could enforce later; YAGNI for now. |
| **Dashboard-specific styles leak** into the moved primitives | Inspected each primitive before moving — current 4 use only tokens (`bg-panel`, `text-text-primary`, `text-accent`) which are part of the tokens CSS. No layout-specific overrides. |
| **Version drift** of Radix/sonner across workspaces | Moving deps to `@zeno/ui` centralizes them. Dashboard loses its local copies of those deps in `package.json` to avoid the illusion of choice. |
| **Workspace package resolution issues in Docker** | `pnpm-workspace.yaml` already globs `packages/*`; `@zeno/ui` is picked up automatically. See `[[learnings/workspace-node-modules-in-docker]]` for the Docker copy pattern; the runtime stage already copies all `packages/*/node_modules`. |
| **Tailwind `@source` relative path brittleness** | Self-contained: `@source` lives in `packages/ui/src/styles/tokens.css`, pointing at its own sibling `../components/**`. Apps that import this CSS inherit the glob without hard-coding paths. |

## Open Questions

None blocking. Implementation-time decisions (captured in the plan commit):

- Whether to keep `packages/ui/tests/` colocated with source (`src/components/*.test.tsx`) or separated. Follow existing convention in `@zeno/storage` / `@zeno/logger` — `tests/` separate folder.
- Whether to emit `dist/` for the package as insurance. Keep source-only until a real consumer needs built output.
- Whether `biome.json` per-package is needed. Probably not — root `biome.json` applies via monorepo scan. If `@zeno/ui` needs tsx-specific rules, add later.
