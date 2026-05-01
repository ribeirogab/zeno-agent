---
feature: ui-package
plan: "[[plan-ui-package]]"
spec: "[[spec-ui-package]]"
created: 2026-04-16
---
# Extract @zeno/ui Package — Tasks

**For this plan:** `[[plan-ui-package]]`

> **Conventions for every task:**
> - Absolute paths from project root.
> - Temp files under `tmp/` per `context/rules/generated-files-location.md`.
> - **Never use `any`. Never write `// biome-ignore`.** Refactor instead.
> - Each task ends with `git add <files> + git commit -m "..."`. English conventional commits, no AI attribution.
> - Tasks are independent; a fresh subagent can execute any one given only `tasks.md` + the spec + branch state.
> - **Prerequisite:** Spec 0015 (kebab-case rename) must be merged before starting this plan.

---

## Phase 1 — Scaffold the package

### Task 1.1: Create `packages/ui` skeleton

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/vitest.config.ts`
- Create: `packages/ui/README.md`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/utils.ts` (placeholder — real content lands in Task 2.1)
- Create: `packages/ui/src/styles/tokens.css` (placeholder — real content lands in Task 3.1)

- [ ] **Step 1: Create branch**

```bash
git checkout -b refactor/zeno-ui-package
```

- [ ] **Step 2: Write `packages/ui/package.json`**

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
    "test": "vitest run",
    "clean": "rm -rf dist"
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
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "happy-dom": "^20.9.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "typescript": "^6.0.2",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 3: Write `packages/ui/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "baseUrl": ".",
    "paths": {},
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests"]
}
```

- [ ] **Step 4: Write `packages/ui/vitest.config.ts`**

```typescript
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
```

- [ ] **Step 5: Write `packages/ui/README.md`**

```markdown
# @zeno/ui

Shared visual primitives for Zeno apps. Consumed as TypeScript source — no
build step. Designed for Vite (`moduleResolution: "Bundler"`) consumers.

## Usage

```typescript
import { Button, Dialog, Input, cn } from '@zeno/ui';
```

Import the design tokens stylesheet once from the consumer app entry:

```css
@import "@zeno/ui/styles/tokens.css";
```

The token CSS carries the Tailwind v4 `@theme` block and an `@source`
directive so consumers don't need to configure content globs for this
package.

React is a peer dependency — the consumer app must provide it.
```

- [ ] **Step 6: Write placeholder `packages/ui/src/utils.ts`**

```typescript
// Real content lands in Task 2.1.
export const __placeholder__ = true;
```

- [ ] **Step 7: Write placeholder `packages/ui/src/styles/tokens.css`**

```css
/* Real content lands in Task 3.1. */
```

- [ ] **Step 8: Write `packages/ui/src/index.ts`**

```typescript
// Real exports land in Tasks 2.1 and 4.x.
export const __placeholder__ = true;
```

- [ ] **Step 9: Install + hoist**

```bash
pnpm install
```

Expected: new workspace package resolves; no errors.

- [ ] **Step 10: Typecheck the new package**

```bash
pnpm --filter @zeno/ui run typecheck
```

Expected: clean (just the placeholder).

- [ ] **Step 11: Full quality-gate sanity**

```bash
pnpm run quality-gate
```

Expected: green — package exists but isn't consumed yet.

- [ ] **Step 12: Commit**

```bash
git add packages/ui/ pnpm-lock.yaml
git commit -m "feat(ui): scaffold @zeno/ui workspace package (empty)"
```

---

## Phase 2 — Move `cn`

### Task 2.1: Move utils + rewrite dashboard imports

**Files:**
- Replace content of: `packages/ui/src/utils.ts`
- Modify: `packages/ui/src/index.ts`
- Delete: `apps/dashboard/src/lib/utils.ts`
- Modify: every `apps/dashboard/src/**/*.{ts,tsx}` that imports `@/lib/utils`

- [ ] **Step 1: Write real `packages/ui/src/utils.ts`**

```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Update `packages/ui/src/index.ts`**

```typescript
export { cn } from './utils';
```

- [ ] **Step 3: Delete dashboard copy**

```bash
git rm apps/dashboard/src/lib/utils.ts
```

- [ ] **Step 4: Rewrite dashboard imports**

```bash
grep -rln "from '@/lib/utils'" apps/dashboard/src | while read -r f; do
  sed -i '' "s|from '@/lib/utils'|from '@zeno/ui'|g" "$f"
done
```

Verify no stragglers:

```bash
grep -rn "from '@/lib/utils'" apps/dashboard/src
```

Expected: empty.

- [ ] **Step 5: Typecheck**

```bash
cd apps/dashboard && pnpm typecheck
```

Expected: clean. (`@zeno/ui` is declared as a workspace dep from Phase 1; resolution works.)

- [ ] **Step 6: Lint**

```bash
cd apps/dashboard && pnpm lint --write
```

Expected: Biome may reorganize imports — commit the resulting diff.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/utils.ts packages/ui/src/index.ts apps/dashboard/src/
git commit -m "refactor(ui): move cn helper from dashboard to @zeno/ui"
```

---

## Phase 3 — Move tokens CSS

### Task 3.1: Extract tokens + update dashboard globals

**Files:**
- Replace content of: `packages/ui/src/styles/tokens.css`
- Modify: `apps/dashboard/src/styles/globals.css`

- [ ] **Step 1: Write `packages/ui/src/styles/tokens.css`**

```css
/*
 * Zeno design tokens.
 *
 * Tailwind v4 @theme block: maps CSS variables into Tailwind utilities
 * (bg-canvas, text-text-primary, etc.). The @source directive tells the
 * Tailwind content scanner to pick up classes used inside this package
 * so consumer apps don't need to configure globs for @zeno/ui.
 */

@source "../components/**/*.{ts,tsx}";

@theme {
  --color-canvas: #1a1816;
  --color-panel: #221f1c;
  --color-sidebar: #16140f;
  --color-border-subtle: #2c2823;
  --color-text-primary: #ebe5da;
  --color-text-secondary: #8c8579;
  --color-text-tertiary: #5c574f;
  --color-accent: #e66b3d;
  --color-status-active: #4fa876;
  --color-status-paused: #c7a85c;
  --color-status-failed: #c75c5c;
}
```

Note: font family declarations stay in the app (different apps can use different brand fonts even with shared tokens).

- [ ] **Step 2: Rewrite `apps/dashboard/src/styles/globals.css`**

Read the current file first (`cat apps/dashboard/src/styles/globals.css`) — the `@theme` block currently contains both color AND font tokens plus the html/body rules. Rewrite to:

```css
@import "tailwindcss";
@import "@zeno/ui/styles/tokens.css";

@theme {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-serif: 'Instrument Serif', serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}

html, body, #root {
  height: 100%;
  background-color: var(--color-canvas);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* any other dashboard-specific globals below this line — preserve them */
```

**Important:** if the current `globals.css` contains additional rules beyond what's shown above (typography resets, custom animations, etc.), **preserve them below the imports**. Do not overwrite blindly.

- [ ] **Step 3: Build dashboard — visual equivalence check**

```bash
cd apps/dashboard && pnpm build
```

Expected: clean build. Inspect `dist/assets/*.css` size — should be within ±1% of the pre-refactor size.

- [ ] **Step 4: Typecheck + quality-gate**

```bash
pnpm run quality-gate
```

Expected: green.

- [ ] **Step 5: Docker smoke**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
```

Use Playwright MCP to screenshot `http://localhost:3000/` (Home). Save to `tmp/.playwright-mcp/tokens-after.png`. Compare against `tokens-before.png` (capture one *before* this task if you haven't). Pixels should be identical for palette; layout untouched.

```bash
pnpm run docker:down
```

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/styles/tokens.css apps/dashboard/src/styles/globals.css
git commit -m "refactor(ui): move design tokens to @zeno/ui with @source directive"
```

---

## Phase 4 — Move primitives, one per commit

### Task 4.1: Move `Button`

**Files:**
- Create: `packages/ui/src/components/button.tsx`
- Modify: `packages/ui/src/index.ts`
- Delete: `apps/dashboard/src/components/ui/button.tsx`
- Modify: every dashboard file that imports `@/components/ui/button`

- [ ] **Step 1: Copy content — update the `cn` import**

Read current `apps/dashboard/src/components/ui/button.tsx` (after 0015 rename it's `button.tsx`). Create `packages/ui/src/components/button.tsx` with the same content but the `cn` import becomes a relative path:

```typescript
// at the top
import { cn } from '../utils';
```

Everything else (CVA variants, forwardRef, exports) identical.

- [ ] **Step 2: Update barrel**

`packages/ui/src/index.ts`:

```typescript
export * from './components/button';
export { cn } from './utils';
```

- [ ] **Step 3: Delete dashboard copy**

```bash
git rm apps/dashboard/src/components/ui/button.tsx
```

- [ ] **Step 4: Rewrite imports**

```bash
grep -rln "from '@/components/ui/button'" apps/dashboard/src | while read -r f; do
  sed -i '' "s|from '@/components/ui/button'|from '@zeno/ui'|g" "$f"
done
```

Verify:

```bash
grep -rn "from '@/components/ui/button'" apps/dashboard/src
```

Expected: empty.

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @zeno/dashboard run typecheck && pnpm --filter @zeno/ui run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/button.tsx packages/ui/src/index.ts apps/dashboard/src/
git commit -m "refactor(ui): move Button primitive to @zeno/ui"
```

---

### Task 4.2: Move `Input`

**Files:**
- Create: `packages/ui/src/components/input.tsx`
- Modify: `packages/ui/src/index.ts`
- Delete: `apps/dashboard/src/components/ui/input.tsx`
- Modify: every dashboard file that imports `@/components/ui/input`

- [ ] **Step 1: Copy + adjust import**

`packages/ui/src/components/input.tsx`:

```typescript
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md border border-border-subtle bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-secondary disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});
```

- [ ] **Step 2: Extend barrel**

```typescript
export * from './components/button';
export * from './components/input';
export { cn } from './utils';
```

- [ ] **Step 3: Delete + rewrite**

```bash
git rm apps/dashboard/src/components/ui/input.tsx
grep -rln "from '@/components/ui/input'" apps/dashboard/src | while read -r f; do
  sed -i '' "s|from '@/components/ui/input'|from '@zeno/ui'|g" "$f"
done
```

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard run typecheck
git add packages/ui/src/components/input.tsx packages/ui/src/index.ts apps/dashboard/src/
git commit -m "refactor(ui): move Input primitive to @zeno/ui"
```

---

### Task 4.3: Move `Sonner` (Toaster)

**Files:**
- Create: `packages/ui/src/components/sonner.tsx`
- Modify: `packages/ui/src/index.ts`
- Delete: `apps/dashboard/src/components/ui/sonner.tsx`
- Modify: `apps/dashboard/src/routes/__root.tsx`

- [ ] **Step 1: Copy**

`packages/ui/src/components/sonner.tsx`:

```typescript
import type { JSX } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

export function Toaster(): JSX.Element {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      toastOptions={{
        style: {
          background: 'var(--color-panel)',
          border: '1px solid var(--color-border-subtle)',
          color: 'var(--color-text-primary)',
        },
      }}
    />
  );
}
```

- [ ] **Step 2: Extend barrel**

```typescript
export * from './components/button';
export * from './components/input';
export * from './components/sonner';
export { cn } from './utils';
```

- [ ] **Step 3: Delete + rewrite**

```bash
git rm apps/dashboard/src/components/ui/sonner.tsx
sed -i '' "s|from '@/components/ui/sonner'|from '@zeno/ui'|g" apps/dashboard/src/routes/__root.tsx
grep -rn "from '@/components/ui/sonner'" apps/dashboard/src
```

Expected: empty after the rewrite.

**Note:** `sonner` itself (the library) is still imported elsewhere (e.g. `import { toast } from 'sonner'` in `mutations.ts` and `routes/login.tsx`). Those imports stay — they're using the library's `toast` function directly, not our `Toaster` wrapper. The library moved into `@zeno/ui`'s dependencies in Phase 1's `package.json`; consumers still get it transitively via pnpm hoist.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard run typecheck
git add packages/ui/src/components/sonner.tsx packages/ui/src/index.ts apps/dashboard/src/
git commit -m "refactor(ui): move Toaster wrapper to @zeno/ui"
```

---

### Task 4.4: Move `Dialog`

**Files:**
- Create: `packages/ui/src/components/dialog.tsx`
- Modify: `packages/ui/src/index.ts`
- Delete: `apps/dashboard/src/components/ui/dialog.tsx`
- Modify: every dashboard file that imports `@/components/ui/dialog`

- [ ] **Step 1: Copy — adjust `cn` import**

Read current `apps/dashboard/src/components/ui/dialog.tsx`. Copy to `packages/ui/src/components/dialog.tsx`. Change:

```typescript
import { cn } from '@/lib/utils';
```

to:

```typescript
import { cn } from '../utils';
```

Everything else identical (`DialogRoot`, `DialogTrigger`, `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`, `DialogPortal`).

- [ ] **Step 2: Extend barrel**

```typescript
export * from './components/button';
export * from './components/dialog';
export * from './components/input';
export * from './components/sonner';
export { cn } from './utils';
```

- [ ] **Step 3: Delete + rewrite**

```bash
git rm apps/dashboard/src/components/ui/dialog.tsx
grep -rln "from '@/components/ui/dialog'" apps/dashboard/src | while read -r f; do
  sed -i '' "s|from '@/components/ui/dialog'|from '@zeno/ui'|g" "$f"
done
```

- [ ] **Step 4: Remove now-empty `ui/` directory**

```bash
rmdir apps/dashboard/src/components/ui 2>/dev/null || true
```

Expected: directory is empty after the four moves → removed. If it fails ("not empty"), something wasn't moved — list the remaining files and investigate before proceeding.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm --filter @zeno/dashboard run typecheck
git add packages/ui/src/components/dialog.tsx packages/ui/src/index.ts apps/dashboard/src/
git commit -m "refactor(ui): move Dialog primitive to @zeno/ui"
```

---

## Phase 5 — Smoke + cleanup

### Task 5.1: Smoke test + prune dashboard deps

**Files:**
- Create: `packages/ui/tests/smoke.test.tsx`
- Modify: `apps/dashboard/package.json`

- [ ] **Step 1: Write the smoke test**

`packages/ui/tests/smoke.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, cn } from '../src/index.js';

describe('@zeno/ui smoke', () => {
  it('exports cn and composes class strings', () => {
    expect(cn('a', 'b', 'c')).toContain('a');
    expect(cn('a', false && 'b', 'c')).not.toContain('b');
  });

  it('renders Button with its label', () => {
    render(<Button>howdy</Button>);
    expect(screen.getByRole('button', { name: 'howdy' })).toBeDefined();
  });

  it('applies variant classes', () => {
    render(<Button variant="accent">go</Button>);
    const btn = screen.getByRole('button', { name: 'go' });
    expect(btn.className).toContain('bg-accent');
  });
});
```

- [ ] **Step 2: Run**

```bash
pnpm --filter @zeno/ui run test
```

Expected: 3 tests passing.

- [ ] **Step 3: Prune dashboard `package.json`**

Open `apps/dashboard/package.json`. Under `dependencies`:

- **Add:** `"@zeno/ui": "workspace:*"`
- **Remove:** `@radix-ui/react-dialog`, `class-variance-authority`, `clsx`, `sonner`, `tailwind-merge`

Expected `dependencies` block after edit:

```json
"dependencies": {
  "@tanstack/react-query": "^5.99.0",
  "@tanstack/react-router": "^1.168.22",
  "@zeno/ui": "workspace:*",
  "react": "^19.2.5",
  "react-dom": "^19.2.5"
}
```

(Order: alphabetize; pnpm doesn't care but Biome/JSON stays tidy.)

- [ ] **Step 4: Reinstall**

```bash
pnpm install
```

Expected: no missing-dependency errors (deps are still available via `@zeno/ui`'s hoist). If anything resolves wrong, run `pnpm list <lib> --filter @zeno/dashboard --depth 5` to trace the resolution.

- [ ] **Step 5: Verify React is single**

```bash
pnpm list react --filter @zeno/dashboard --depth 5 | grep -c 'react '
```

Expected: one match (the dashboard's own `react` + peer link in `@zeno/ui`, but resolving to the same version).

- [ ] **Step 6: Quality gate**

```bash
pnpm run quality-gate
```

Expected: green across the monorepo.

- [ ] **Step 7: Verify leftover imports**

```bash
grep -rn "@/components/ui" apps/dashboard/src
grep -rn "@/lib/utils" apps/dashboard/src
```

Both expected: empty.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/tests/ apps/dashboard/package.json pnpm-lock.yaml
git commit -m "chore(ui): add smoke test + prune dashboard deps that moved"
```

---

## Phase 6 — Docker smoke + PR

### Task 6.1: Full boot + route walk + PR

**Files:** (none — verification + PR)

- [ ] **Step 1: Rebuild + boot**

```bash
pnpm run docker:build
pnpm run docker:up
sleep 8
pnpm run docker:logs 2>&1 | grep -E 'zeno_online|api_listening|commands_poller_started|logs_retention_scheduled'
```

Expected: all four startup lines present.

- [ ] **Step 2: Route walk with Playwright MCP**

For each dashboard route, navigate + screenshot to `tmp/.playwright-mcp/ui-pkg-<route>.png`:

- `/login`
- `/`
- `/crons`
- `/crons/new`
- `/crons/<any-id>`
- `/sessions`
- `/sessions/<thread-id>`
- `/logs`
- `/settings`

For each screenshot: visually verify palette (dark canvas, panel contrast), fonts (Instrument Serif hero on Home), interactive primitives (buttons, inputs) render identically to pre-refactor. Any drift = stop + investigate.

Run `browser_console_messages` after each page load; zero errors/warnings expected.

- [ ] **Step 3: Interaction sanity**

- On `/crons`, click "New cron" → form renders, inputs respond.
- On `/crons/<id>`, click a button → toast appears (Toaster from `@zeno/ui` works).
- Open a dialog (e.g. Restart in Settings) → Dialog opens with overlay + focus trap.

- [ ] **Step 4: Stop**

```bash
pnpm run docker:down
```

- [ ] **Step 5: Push**

```bash
git push -u origin refactor/zeno-ui-package
```

- [ ] **Step 6: Open PR via `/open-pr`**

Title: `refactor: extract @zeno/ui package from dashboard`

Description covers:
- New `packages/ui/` workspace package with 4 primitives + `cn` + tokens CSS
- `moduleResolution: "Bundler"` source consumption, no build step
- Dashboard deps pruned; React kept as peer
- Quality-gate green, Docker smoke walked all 9 routes

Do NOT merge — user reviews first.

---

## Done

`@zeno/ui` lives. Primitives + tokens are ready to be consumed by any future app. Spec C (0017 — Paper design system) and Spec D (0018 — UX cleanup) can now start; both depend on this package existing.
