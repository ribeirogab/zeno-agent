---
feature: ui-package
spec: "[[spec-ui-package]]"
created: 2026-04-16
---
# Extract @zeno/ui Package — Plan

**For this spec:** `[[spec-ui-package]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (multi-workspace coordination across new package + dashboard + Tailwind content globs + Docker). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Create `packages/ui/` (`@zeno/ui`) as a source-only workspace package. Move the 4 shadcn primitives (`button`, `dialog`, `input`, `sonner`) plus the `cn` helper plus the design-token CSS into it. Remove the originals from `apps/dashboard/`. Update imports. Prove the dashboard build and runtime behavior are byte-equivalent.

**Architecture:** Pure TS/TSX source consumed via `moduleResolution: "Bundler"` in Vite. `packages/ui/package.json` `main`/`types` both point at `src/index.ts`. React is a peer dep to avoid duplicate React instances. The package ships a `tokens.css` with the Tailwind v4 `@theme` block **and** a `@source` directive that registers the package's own component files with Tailwind's content scan, so a consumer just imports one CSS file.

**Tech Stack:** pnpm workspaces, TypeScript, Tailwind v4 (`@source`, `@theme`), Vite bundler resolution, Vitest with happy-dom, React 19, Radix UI, Sonner, CVA, clsx, tailwind-merge.

## Approach

Six phases, commits aligned to logical atomic changes.

1. **Scaffold** — create `packages/ui/` skeleton (`package.json`, `tsconfig.json`, `src/index.ts`, empty `components/`, `utils.ts`, `styles/tokens.css`, `tests/`, `vitest.config.ts`). Confirm `pnpm install` hoists correctly and `pnpm --filter @zeno/ui run typecheck` passes with just the utility file.
2. **Move `cn`** — relocate `apps/dashboard/src/lib/utils.ts` into `packages/ui/src/utils.ts`; delete the original. Update all dashboard imports. This is the smallest atomic move and proves the package resolution works end-to-end before touching components.
3. **Move tokens CSS** — extract the `@theme` block from `apps/dashboard/src/styles/globals.css` into `packages/ui/src/styles/tokens.css`. Add `@source "../components/**/*.{ts,tsx}"` to the token CSS so Tailwind scans the package. Update the dashboard's `globals.css` to `@import "@zeno/ui/styles/tokens.css";`. Confirm dashboard styles are visually identical.
4. **Move the 4 primitives** — one at a time, in order: `button`, `input`, `sonner`, `dialog`. For each: copy file to `packages/ui/src/components/`, adjust `@/lib/utils` → `../utils`, add to `src/index.ts` barrel, update every dashboard import, delete the original. Keep each move in its own commit so bisecting is easy.
5. **Smoke test + cleanup** — add one `packages/ui/tests/smoke.test.tsx` that renders `<Button>` via `@testing-library/react`. Remove the now-unused runtime deps from `apps/dashboard/package.json` (Radix, CVA, clsx, tailwind-merge, sonner). Run `pnpm install`. Run quality-gate.
6. **Docker smoke + PR** — rebuild the image, boot, walk every dashboard route, confirm visual equivalence + no console errors. Push, open PR with `/open-pr`.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `packages/ui/package.json` | `@zeno/ui` manifest; React as peer; Radix + sonner + CVA + clsx + tailwind-merge as deps; no `build` script |
| `packages/ui/tsconfig.json` | Extends `tsconfig.base.json`; `jsx: react-jsx`, `module: ESNext`, `moduleResolution: Bundler`, `noEmit: true` |
| `packages/ui/vitest.config.ts` | happy-dom environment, react plugin |
| `packages/ui/biome.json` | (optional) — rely on root `biome.json` if discovery works; else mirror dashboard config |
| `packages/ui/README.md` | One-paragraph note: Bundler-only, source consumption, peer React |
| `packages/ui/src/index.ts` | Barrel — `export * from './components/button'` etc + `export { cn } from './utils'` |
| `packages/ui/src/utils.ts` | `cn` helper (moved from dashboard) |
| `packages/ui/src/styles/tokens.css` | `@theme { ... }` + `@source "../components/**/*.{ts,tsx}";` |
| `packages/ui/src/components/button.tsx` | Moved from `apps/dashboard/src/components/ui/button.tsx` |
| `packages/ui/src/components/input.tsx` | Moved |
| `packages/ui/src/components/dialog.tsx` | Moved |
| `packages/ui/src/components/sonner.tsx` | Moved |
| `packages/ui/tests/smoke.test.tsx` | Render a Button; assert text present |

### EDIT

| File | Change |
|---|---|
| `apps/dashboard/package.json` | Add `"@zeno/ui": "workspace:*"`; remove `@radix-ui/react-dialog`, `class-variance-authority`, `clsx`, `sonner`, `tailwind-merge` from dependencies |
| `apps/dashboard/src/styles/globals.css` | Replace inline `@theme` block with `@import "@zeno/ui/styles/tokens.css";` — keep `@import "tailwindcss";` on top, keep font + html/body rules below |
| `apps/dashboard/src/main.tsx` | No change (keeps `import '@/styles/globals.css'`) |
| `apps/dashboard/src/**/*.{ts,tsx}` | Rewrite every `@/components/ui/*` and `@/lib/utils` import to `@zeno/ui` |

### DELETE

| File | Reason |
|---|---|
| `apps/dashboard/src/components/ui/button.tsx` | Moved to `packages/ui` |
| `apps/dashboard/src/components/ui/input.tsx` | Moved |
| `apps/dashboard/src/components/ui/dialog.tsx` | Moved |
| `apps/dashboard/src/components/ui/sonner.tsx` | Moved |
| `apps/dashboard/src/components/ui/` (directory) | Empty after the four file deletes |
| `apps/dashboard/src/lib/utils.ts` | `cn` moved to `packages/ui` |

## Phase Ordering

Phases must run in order — each leaves the repo in a compilable, testable state. Inside Phase 4, components must be moved one at a time so each commit is self-contained and bisectable.

Dependencies: 2 → 3 → 4. Phase 1 is independent but should precede the others; Phase 5 depends on Phase 4; Phase 6 depends on Phase 5.

## Risks / Open Decisions

- **Peer-dep React hoist.** If pnpm ever installs two React copies (e.g. `packages/ui/node_modules/react` resolved against a different version than `apps/dashboard/node_modules/react`), hooks throw at runtime. Mitigation: declare React as `peerDependencies` + `devDependencies` in `@zeno/ui` with the same major as dashboard. Verify with `pnpm list react --filter @zeno/dashboard --depth 5` after install — exactly one React resolution should appear.
- **Tailwind `@source` relative path.** `@source "../components/**/*.{ts,tsx}"` is resolved relative to the CSS file that declares it. Declaring inside `packages/ui/src/styles/tokens.css` (package-self-contained) is correct. If Tailwind fails to pick up classes, run `cd apps/dashboard && pnpm build` and inspect the generated CSS; if a known utility (`bg-panel`) is missing, adjust the glob.
- **Sonner's `<Toaster>` in `apps/dashboard/src/routes/__root.tsx`** imports `@/components/ui/sonner`. After Phase 4, the import becomes `@zeno/ui`. Watch for it — it's the one route file (not feature component) that touches the ui barrel.
- **Turbo pipeline.** `turbo.json` declares `build` with `dependsOn: ["^build"]`. Since `@zeno/ui` has no `build` script, `turbo run build` for the dashboard will not block; Turbo treats a missing script as a no-op. If it treats it as an error, add `"build": "echo no-op"` to `@zeno/ui`'s `package.json`.
- **Biome discovery.** Root `biome.json` applies to the whole monorepo if `includes` globs cover `packages/`. Verify with `pnpm --filter @zeno/ui run lint`. If unlinted, add `packages/**/*` to the root `includes` or drop a minimal `biome.json` in the package.
- **`@zeno/ui/styles/tokens.css` import syntax.** Requires `"./styles/tokens.css"` entry under `exports`. Vite honors subpath exports; PostCSS `@import` also honors them. Confirmed supported — pnpm + Vite + Tailwind v4 handle it.
- **Vitest config.** Reuse happy-dom + `@vitejs/plugin-react` already set up in the dashboard. Keep `packages/ui/vitest.config.ts` minimal.
