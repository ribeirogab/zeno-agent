---
feature: apps-web-landing
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-07
---
# `apps/web` Landing Page — Tasks

**For this plan:** `[[plan]]`

> All commits in this branch follow Conventional Commits and use the `feat(web):`, `chore(web):`, `test(web):`, `docs:`, or `ci:` scope as appropriate. Branch name: `feat/apps-web-landing`. Open the PR via `/open-pr` per project rule.
>
> Per global rule 20: never run `git add`/`commit`/`push` without explicit user approval. Each "Commit" step assumes the operator has approved committing for that batch. If unsure, pause and ask.
>
> **The Paper artboard `apps-web · landing` (page `1-0` of the `zeno-agent` document) is owner-approved and is the visual contract for implementation.** If implementation cannot match the artboard at any point, update the spec, plan, and tasks before continuing — never silently drift.

## Phase 0 — Discovery

### Task 0.1: Verify Vite 8 + `@vitejs/plugin-react@^6` current API

- [ ] Step 1: query context7 for current Vite + plugin-react idioms.

  Run: query context7 with library ID `vitejs/vite` (and separately `vitejs/vite-plugin-react`) for topic `defineConfig server.port build.outDir alias plugins`.

  Capture: confirm `defineConfig` is the entry point, `server.port` and `preview.port` keys are unchanged, the `react()` plugin call signature is identical to what `apps/dashboard/vite.config.ts` already uses, and that `build.outDir: 'dist'` + `build.sourcemap: true` are still recognized. If anything has shifted, write a learning at `vault/learnings/vite8-config-2026-05.md` and update `plan.md` before proceeding.

- [ ] Step 2: pin Vite + plugin-react to the same versions used by `apps/dashboard`.

  Run: `cat apps/dashboard/package.json | grep -E '"(vite|@vitejs/plugin-react|@types/node|@testing-library/.+|happy-dom|vitest|tailwindcss|@tailwindcss/postcss|autoprefixer|postcss|typescript|@types/react.*)"'`

  Record the exact version specifiers. `apps/web/package.json` (Task 1.1) reuses these strings verbatim.

### Task 0.2: Verify `@zeno/ui` exports the tokens CSS path

- [ ] Step 1: confirm the export map.

  Run: `cat packages/ui/package.json | grep -A 5 '"exports"'`

  Expected: an entry `"./styles/tokens.css": "./src/styles/tokens.css"`. If absent, halt and add it as a pre-task — `apps/web/src/styles/index.css` depends on this import path.

- [ ] Step 2: confirm the file exists and contains the canvas token.

  Run: `grep -E -- '--color-canvas' packages/ui/src/styles/tokens.css | head -1`

  Expected: a line declaring `--color-canvas: #08090F;` (or equivalent under a `:root` block).

### Task 0.3: Verify Tailwind 4 + token-CSS layering pattern in `apps/dashboard`

- [ ] Step 1: read how `apps/dashboard` consumes the tokens.

  Run: `cat apps/dashboard/src/styles/*.css 2>/dev/null && cat apps/dashboard/postcss.config.js`

  Capture: whether dashboard imports `@zeno/ui/styles/tokens.css` directly, wraps it in `@theme`, or relies on `:root` custom properties consumed via `var(...)`. Mirror the same pattern in `apps/web`. If non-obvious, write a learning at `vault/learnings/zeno-ui-tokens-with-tailwind4.md`.

### Task 0.4: Verify Fraunces variable axis support via Google Fonts

- [ ] Step 1: confirm Fraunces variable URL works with weight axis 100..900.

  Run: `curl -fsS 'https://fonts.googleapis.com/css2?family=Fraunces:wght@100..900&display=swap' -A "Mozilla/5.0" | head -20`

  Expected: response contains `@font-face` blocks with `font-weight: 100 900`. Capture the exact URL string for the `<link>` in `index.html`.

### Task 0.5: Extract crest SVG and particle positions from Paper

- [ ] Step 1: extract the crest SVG via Paper MCP.

  Use the Paper MCP `get_jsx` tool against artboard node `G7-0` (the Zeno crest SVG inside the design-system artboard). The tool returns the SVG markup with all paths and gradients intact.

  Save the result to `apps/web/src/icons/crest.svg`. Verify the file is ≤ 8 KB and contains exactly the path/circle elements needed (no spurious `<g>` wrappers from Paper export).

- [ ] Step 2: extract the static particle positions from the Paper artboard.

  Use the Paper MCP `get_children` tool against the `Particles` frame inside the hero on the approved `apps-web · landing` artboard. For each child Rectangle, capture `top` (px), `left` (px), `width` (= height — the dot diameter), `opacity`, and `backgroundColor`.

  Build the resulting array in `apps/web/src/lib/particles.ts` (Task 3.3). The array must contain exactly 20 entries.

## Phase 1 — Workspace scaffolding

### Task 1.1: Add `apps/web/package.json`

**Files:**
- Create: `apps/web/package.json`

- [ ] Step 1: create the manifest.

  ```json
  {
    "name": "@zeno/web",
    "version": "0.0.1",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "vite --port 3000",
      "build": "vite build",
      "preview": "vite preview --port 3000",
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "lint": "biome check .",
      "clean": "rm -rf dist"
    },
    "dependencies": {
      "@zeno/ui": "workspace:*",
      "react": "^19.2.5",
      "react-dom": "^19.2.5"
    },
    "devDependencies": {
      "@tailwindcss/postcss": "^4.2.2",
      "@testing-library/jest-dom": "^6.9.1",
      "@testing-library/react": "^16.3.2",
      "@types/react": "^19.2.14",
      "@types/react-dom": "^19.2.3",
      "@vitejs/plugin-react": "^6.0.1",
      "autoprefixer": "^10.5.0",
      "happy-dom": "^20.9.0",
      "postcss": "^8.5.10",
      "tailwindcss": "^4.2.2",
      "typescript": "^6.0.2",
      "vite": "^8.0.8",
      "vitest": "^4.1.4"
    }
  }
  ```

  Substitute version specifiers from Task 0.1 if Phase 0 surfaced any divergence.

- [ ] Step 2: install at the workspace root.

  Run: `pnpm install`

  Expected: pnpm picks up `apps/web` and writes `apps/web/node_modules`; `pnpm-lock.yaml` updates.

### Task 1.2: Add `apps/web/tsconfig.json`

**Files:**
- Create: `apps/web/tsconfig.json`

- [ ] Step 1: create the file.

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "target": "ES2022",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "jsx": "react-jsx",
      "outDir": "./dist",
      "noEmit": true,
      "baseUrl": ".",
      "paths": {
        "@/*": ["./src/*"]
      },
      "ignoreDeprecations": "6.0"
    },
    "include": ["src/**/*", "tests/**/*"],
    "exclude": ["dist", "node_modules"]
  }
  ```

### Task 1.3: Add `apps/web/vite.config.ts`

**Files:**
- Create: `apps/web/vite.config.ts`

- [ ] Step 1: create the file.

  ```ts
  import { resolve } from 'node:path';
  import react from '@vitejs/plugin-react';
  import { defineConfig } from 'vite';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 3000,
    },
    preview: {
      port: 3000,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  });
  ```

### Task 1.4: Add `apps/web/postcss.config.js`

**Files:**
- Create: `apps/web/postcss.config.js`

- [ ] Step 1: create the file.

  ```js
  export default {
    plugins: {
      '@tailwindcss/postcss': {},
      autoprefixer: {},
    },
  };
  ```

### Task 1.5: Add `apps/web/index.html`

**Files:**
- Create: `apps/web/index.html`

- [ ] Step 1: create the file.

  ```html
  <!doctype html>
  <html lang="en" class="dark">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Zeno — Personal agent that gets the work done</title>
      <meta name="description" content="Self-hosted, single-user agent that operates across the apps you already use — Slack, GitHub, Linear — by composing the connectors you install." />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,100..900&display=swap" rel="stylesheet" />
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/main.tsx"></script>
    </body>
  </html>
  ```

### Task 1.6: Add initial `apps/web/src/styles/index.css`

**Files:**
- Create: `apps/web/src/styles/index.css`

- [ ] Step 1: create the file with only the Tailwind import for now (token import lands in Phase 2).

  ```css
  @import "tailwindcss";
  ```

### Task 1.7: Add `main.tsx` + placeholder `app.tsx`

**Files:**
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`

- [ ] Step 1: create `main.tsx`.

  ```tsx
  import { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import { App } from './app';
  import './styles/index.css';

  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  ```

- [ ] Step 2: create `app.tsx` as a placeholder shell.

  ```tsx
  export function App() {
    return (
      <main>
        <h1>Zeno — apps/web scaffold</h1>
        <p>Replaced in Phase 6 by the six landing sections.</p>
      </main>
    );
  }
  ```

### Task 1.8: Verify scaffold builds and serves

- [ ] Step 1: typecheck passes.

  Run: `pnpm --filter @zeno/web typecheck`

  Expected: exit 0.

- [ ] Step 2: build produces `dist/`.

  Run: `pnpm --filter @zeno/web build`

  Expected: `apps/web/dist/index.html` exists, plus a hashed JS bundle in `apps/web/dist/assets/`. Exit 0.

- [ ] Step 3: dev server boots on port 3000.

  Run: `pnpm --filter @zeno/web dev`

  Expected: terminal shows `Local: http://localhost:3000/`. Open the URL manually; the page reads "Zeno — apps/web scaffold". Stop the dev server with `Ctrl+C` after visual confirmation.

### Task 1.9: Commit Phase 1

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/postcss.config.js apps/web/index.html apps/web/src/styles/index.css apps/web/src/main.tsx apps/web/src/app.tsx pnpm-lock.yaml
  git commit -m "feat(web): scaffold apps/web workspace with Vite + React + Tailwind"
  ```

## Phase 2 — Design-system wiring

### Task 2.1: Add `vitest.config.ts` + test setup

**Files:**
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/tests/setup.ts`

- [ ] Step 1: create `vitest.config.ts`.

  ```ts
  import { resolve } from 'node:path';
  import react from '@vitejs/plugin-react';
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
    },
  });
  ```

- [ ] Step 2: create `tests/setup.ts`.

  ```ts
  import '@testing-library/jest-dom/vitest';
  ```

- [ ] Step 3: confirm vitest can run with no tests.

  Run: `pnpm --filter @zeno/web test`

  Expected: vitest reports `No test files found` and exits 0 (or non-zero — if non-zero, add `--passWithNoTests` to the script).

### Task 2.2: Wire `@zeno/ui` token import + body baseline

**Files:**
- Modify: `apps/web/src/styles/index.css`

- [ ] Step 1: replace the file content.

  ```css
  @import "tailwindcss";
  @import "@zeno/ui/styles/tokens.css";

  html, body {
    background-color: var(--color-canvas);
    color: var(--color-text-primary);
    font-family: 'Space Grotesk', sans-serif;
  }

  body {
    margin: 0;
    min-height: 100vh;
  }
  ```

  If Task 0.3's discovery showed dashboard wraps tokens in an `@theme` block, mirror that here.

### Task 2.3: Verify tokens resolve in the browser

- [ ] Step 1: rebuild and serve.

  Run: `pnpm --filter @zeno/web dev`

- [ ] Step 2: open `http://localhost:3000` and verify in DevTools.

  In the browser console, run `getComputedStyle(document.body).backgroundColor`.

  Expected: `rgb(8, 9, 15)`.

  If the result is `rgba(0, 0, 0, 0)` or any non-canvas value, the token import did not resolve. Halt, inspect the bundled CSS for the `--color-canvas` declaration, and either fix the `@import` path or add the `@theme` workaround. Capture the resolution as a learning at `vault/learnings/web-tailwind4-zeno-ui-tokens.md`.

- [ ] Step 3: stop the dev server.

### Task 2.4: Commit Phase 2

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/vitest.config.ts apps/web/tests/setup.ts apps/web/src/styles/index.css
  git commit -m "feat(web): wire @zeno/ui Imperial Terminal tokens + vitest setup"
  ```

  If a learning was created in Task 2.3, stage it in the same commit:

  ```sh
  git add vault/learnings/web-tailwind4-zeno-ui-tokens.md
  ```

## Phase 3 — Constants + assets + tokens

### Task 3.1: Add `lib/constants.ts`

**Files:**
- Create: `apps/web/src/lib/constants.ts`

- [ ] Step 1: create the file.

  ```ts
  export const GITHUB_URL = 'https://github.com/ribeirogab/zeno-agent';
  export const ROADMAP_URL = `${GITHUB_URL}/blob/main/ROADMAP.md`;
  export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
  export const DOCS_URL = `${GITHUB_URL}#readme`;
  export const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/infra/install.sh | sh';
  ```

### Task 3.2: Add `lib/tokens.ts`

**Files:**
- Create: `apps/web/src/lib/tokens.ts`

- [ ] Step 1: create the file.

  ```ts
  export const COLOR_CANVAS = 'var(--color-canvas)';
  export const COLOR_PANEL = 'var(--color-panel)';
  export const COLOR_PANEL_2 = 'var(--color-panel-2)';
  export const COLOR_SIDEBAR = 'var(--color-sidebar)';
  export const COLOR_BORDER_SUBTLE = 'var(--color-border-subtle)';
  export const COLOR_BORDER_STRONG = 'var(--color-border-strong)';
  export const COLOR_TEXT_PRIMARY = 'var(--color-text-primary)';
  export const COLOR_TEXT_SECONDARY = 'var(--color-text-secondary)';
  export const COLOR_TEXT_TERTIARY = 'var(--color-text-tertiary)';
  export const COLOR_TEXT_INK = 'var(--color-text-ink)';
  export const COLOR_GOLD = 'var(--color-gold)';
  export const COLOR_GOLD_BRIGHT = 'var(--color-gold-bright)';
  export const COLOR_GOLD_DEEP = 'var(--color-gold-deep)';

  export const FONT_DISPLAY = "'Fraunces', serif";
  export const FONT_BODY = "'Space Grotesk', sans-serif";
  export const FONT_MONO = "'JetBrains Mono', monospace";
  ```

### Task 3.3: Add `lib/particles.ts`

**Files:**
- Create: `apps/web/src/lib/particles.ts`

- [ ] Step 1: create the file. The 20 entries below are placeholders shaped like the array; the actual values are copied verbatim from Task 0.5 step 2 (the Paper artboard particle positions).

  ```ts
  export type Particle = {
    top: number;
    left: number;
    size: number;
    opacity: number;
    color: string;
  };

  export const PARTICLES: readonly Particle[] = [
    { top: 64, left: 173, size: 3, opacity: 0.55, color: '#d9b362' },
    { top: 96, left: 403, size: 2, opacity: 0.4, color: '#d9b362' },
    { top: 140, left: 1210, size: 2, opacity: 0.6, color: '#f0cc7a' },
    { top: 180, left: 86, size: 1, opacity: 0.7, color: '#d9b362' },
    { top: 220, left: 1325, size: 3, opacity: 0.35, color: '#d9b362' },
    { top: 80, left: 1037, size: 1, opacity: 0.8, color: '#f0cc7a' },
    { top: 280, left: 259, size: 2, opacity: 0.5, color: '#d9b362' },
    { top: 320, left: 1267, size: 1, opacity: 0.65, color: '#d9b362' },
    { top: 380, left: 115, size: 2, opacity: 0.45, color: '#f0cc7a' },
    { top: 420, left: 1094, size: 3, opacity: 0.3, color: '#d9b362' },
    { top: 460, left: 317, size: 1, opacity: 0.75, color: '#d9b362' },
    { top: 480, left: 922, size: 2, opacity: 0.4, color: '#d9b362' },
    { top: 40, left: 806, size: 1, opacity: 0.85, color: '#f0cc7a' },
    { top: 160, left: 547, size: 1, opacity: 0.7, color: '#d9b362' },
    { top: 240, left: 1152, size: 2, opacity: 0.45, color: '#d9b362' },
    { top: 360, left: 634, size: 1, opacity: 0.6, color: '#d9b362' },
    { top: 200, left: 230, size: 2, opacity: 0.5, color: '#f0cc7a' },
    { top: 300, left: 1008, size: 1, opacity: 0.75, color: '#d9b362' },
    { top: 400, left: 432, size: 1, opacity: 0.55, color: '#d9b362' },
    { top: 120, left: 58, size: 2, opacity: 0.35, color: '#d9b362' },
  ] as const;
  ```

  Verify the array length equals 20; if Paper extraction surfaced a different count, halt and update the spec/plan/tasks before continuing.

### Task 3.4: Drop the crest SVG asset

**Files:**
- Create: `apps/web/src/icons/crest.svg`

- [ ] Step 1: write the SVG extracted from Paper in Task 0.5 step 1 verbatim into `apps/web/src/icons/crest.svg`. Confirm the file is valid SVG (`xmllint --noout apps/web/src/icons/crest.svg`).

### Task 3.5: Commit Phase 3

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/src/lib apps/web/src/icons
  git commit -m "feat(web): add constants, tokens, particle table, crest asset"
  ```

## Phase 4 — Shared components (TDD)

### Task 4.1: `<ZenoCrest>` component

**Files:**
- Create: `apps/web/src/components/zeno-crest.tsx`

- [ ] Step 1: create the component.

  ```tsx
  import crest from '../icons/crest.svg?react';

  type ZenoCrestProps = {
    size?: number;
  };

  export function ZenoCrest({ size = 96 }: ZenoCrestProps) {
    const Crest = crest as unknown as React.FC<React.SVGProps<SVGSVGElement>>;
    return <Crest width={size} height={size} aria-label="Zeno crest" />;
  }
  ```

  If `vite` is not configured to import SVG-as-React-component, replace the import with a plain `<img src={crestUrl} … />`. The Vite default `?react` query requires `vite-plugin-svgr`; if that is not desired, use the static-asset import pattern:

  ```tsx
  import crestUrl from '../icons/crest.svg';

  type ZenoCrestProps = {
    size?: number;
  };

  export function ZenoCrest({ size = 96 }: ZenoCrestProps) {
    return <img src={crestUrl} width={size} height={size} alt="Zeno crest" />;
  }
  ```

  Choose one path. Document the choice in `apps/web/README.md`.

### Task 4.2: `<HeroAura>` component

**Files:**
- Create: `apps/web/src/components/hero-aura.tsx`

- [ ] Step 1: create the component.

  ```tsx
  export function HeroAura() {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: [
            'radial-gradient(ellipse 800px 420px at 50% 35%, rgba(217, 179, 98, 0.13) 0%, rgba(217, 179, 98, 0.05) 35%, rgba(8, 9, 15, 0) 75%)',
            'radial-gradient(circle 400px at 88% 20%, rgba(217, 179, 98, 0.06) 0%, rgba(8, 9, 15, 0) 100%)',
            'radial-gradient(circle 400px at 12% 80%, rgba(122, 166, 232, 0.035) 0%, rgba(8, 9, 15, 0) 100%)',
            'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(217, 179, 98, 0.018) 3px, rgba(217, 179, 98, 0.018) 4px)',
          ].join(', '),
        }}
      />
    );
  }
  ```

### Task 4.3: `<HeroParticles>` component

**Files:**
- Create: `apps/web/src/components/hero-particles.tsx`

- [ ] Step 1: create the component.

  ```tsx
  import { PARTICLES } from '../lib/particles';

  export function HeroParticles() {
    return (
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {PARTICLES.map((p, index) => (
          <div
            key={index}
            data-particle="true"
            style={{
              position: 'absolute',
              top: `${p.top}px`,
              left: `${p.left}px`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              borderRadius: '9999px',
              backgroundColor: p.color,
              opacity: p.opacity,
            }}
          />
        ))}
      </div>
    );
  }
  ```

### Task 4.4: `<GoldRule>` component

**Files:**
- Create: `apps/web/src/components/gold-rule.tsx`

- [ ] Step 1: create the component.

  ```tsx
  import type { ReactNode } from 'react';

  type GoldRuleProps = {
    children: ReactNode;
  };

  export function GoldRule({ children }: GoldRuleProps) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: '14px',
          padding: '14px 18px 14px 16px',
          borderLeft: '2px solid var(--color-gold)',
          alignItems: 'baseline',
        }}
      >
        {children}
      </div>
    );
  }
  ```

### Task 4.5: `<TerminalBlock>` (TDD)

**Files:**
- Create: `apps/web/src/components/terminal-block.tsx`
- Create: `apps/web/tests/components/terminal-block.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { TerminalBlock } from '../../src/components/terminal-block';

  describe('<TerminalBlock />', () => {
    it('renders the configured tab and meta strings', () => {
      render(<TerminalBlock tab="one-liner" meta="macOS · Linux · WSL2" comment="# c" command="echo ok" />);
      expect(screen.getByText('one-liner')).toBeInTheDocument();
      expect(screen.getByText('macOS · Linux · WSL2')).toBeInTheDocument();
    });

    it('renders the command verbatim inside a <code>', () => {
      const cmd = 'curl -fsSL https://example.com/install.sh | sh';
      const { container } = render(<TerminalBlock tab="x" comment="# x" command={cmd} />);
      const code = container.querySelector('code');
      expect(code?.textContent).toBe(cmd);
    });
  });
  ```

- [ ] Step 2: run the test, expect failure.

  Run: `pnpm --filter @zeno/web test terminal-block`

- [ ] Step 3: implement the component.

  ```tsx
  type TerminalBlockProps = {
    tab: string;
    meta?: string;
    comment: string;
    command: string;
  };

  export function TerminalBlock({ tab, meta, comment, command }: TerminalBlockProps) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '1040px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-panel)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: '0 0 0 1px rgba(217, 179, 98, 0.15), 0 18px 40px rgba(0, 0, 0, 0.4), 0 0 60px rgba(217, 179, 98, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-sidebar)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '9999px', backgroundColor: 'var(--color-border-strong)' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '9999px', backgroundColor: 'var(--color-border-strong)' }} />
            <span style={{ width: '12px', height: '12px', borderRadius: '9999px', backgroundColor: 'var(--color-border-strong)' }} />
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-gold)',
              color: 'var(--color-text-ink)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.04em',
            }}
          >
            {tab}
          </span>
          {meta ? (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{meta}</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '20px 24px' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{comment}</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '14px', color: 'var(--color-gold)', fontWeight: 600 }}>$</span>
            <code
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '14px',
                color: 'var(--color-text-primary)',
                lineHeight: '22px',
              }}
            >
              {command}
            </code>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] Step 4: run the test, expect 2 passes.

  Run: `pnpm --filter @zeno/web test terminal-block`

### Task 4.6: `<DiagramNode>` (TDD)

**Files:**
- Create: `apps/web/src/components/diagram-node.tsx`
- Create: `apps/web/tests/components/diagram-node.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { DiagramNode } from '../../src/components/diagram-node';

  describe('<DiagramNode />', () => {
    it('renders kicker, name, and caption', () => {
      render(<DiagramNode kicker="backend" name="Agent · Claude" caption="Reasons over the request" />);
      expect(screen.getByText('backend')).toBeInTheDocument();
      expect(screen.getByText('Agent · Claude')).toBeInTheDocument();
      expect(screen.getByText('Reasons over the request')).toBeInTheDocument();
    });

    it('marks highlighted nodes with data-highlighted="true"', () => {
      const { container } = render(
        <DiagramNode kicker="backend" name="Agent · Claude" caption="x" highlighted />,
      );
      expect(container.firstElementChild?.getAttribute('data-highlighted')).toBe('true');
    });
  });
  ```

- [ ] Step 2: run the test, expect failure.

- [ ] Step 3: implement the component.

  ```tsx
  type DiagramNodeProps = {
    kicker: string;
    name: string;
    caption: string;
    highlighted?: boolean;
  };

  export function DiagramNode({ kicker, name, caption, highlighted = false }: DiagramNodeProps) {
    return (
      <div
        data-highlighted={highlighted ? 'true' : undefined}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '18px',
          border: highlighted ? '1px solid var(--color-gold)' : '1px solid var(--color-border-strong)',
          backgroundColor: 'var(--color-panel-2)',
          borderRadius: '4px',
          boxShadow: highlighted
            ? '0 0 0 1px rgba(217, 179, 98, 0.5), 0 0 24px rgba(217, 179, 98, 0.18)'
            : 'inset 0 1px 0 rgba(217, 179, 98, 0.18)',
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--color-gold)' }}>{kicker}</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{name}</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', lineHeight: '18px', color: 'var(--color-text-secondary)' }}>{caption}</span>
      </div>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 4.7: `<DiagramFlow>` component

**Files:**
- Create: `apps/web/src/components/diagram-flow.tsx`

- [ ] Step 1: create the component.

  ```tsx
  import { DiagramNode } from './diagram-node';

  type Node = {
    kicker: string;
    name: string;
    caption: string;
    highlighted?: boolean;
  };

  type DiagramFlowProps = {
    nodes: readonly Node[];
  };

  export function DiagramFlow({ nodes }: DiagramFlowProps) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '12px',
          padding: '32px',
          border: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-panel)',
          borderRadius: '6px',
        }}
      >
        {nodes.map((node, index) => (
          <>
            <DiagramNode key={`node-${index}`} {...node} />
            {index < nodes.length - 1 ? (
              <span
                key={`arrow-${index}`}
                aria-hidden="true"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '18px',
                  color: 'var(--color-text-tertiary)',
                  padding: '0 4px',
                }}
              >
                →
              </span>
            ) : null}
          </>
        ))}
      </div>
    );
  }
  ```

  Note: the `<>` fragment with `key` props inside `.map` requires `<Fragment key=…>`. Adjust:

  ```tsx
  import { Fragment } from 'react';
  // …
  {nodes.map((node, index) => (
    <Fragment key={`pair-${index}`}>
      <DiagramNode {...node} />
      {index < nodes.length - 1 ? (
        <span aria-hidden="true" style={{ /* … */ }}>→</span>
      ) : null}
    </Fragment>
  ))}
  ```

### Task 4.8: `<CTATile>` (TDD)

**Files:**
- Create: `apps/web/src/components/cta-tile.tsx`
- Create: `apps/web/tests/components/cta-tile.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { CTATile } from '../../src/components/cta-tile';

  describe('<CTATile />', () => {
    it('renders an <a> with the configured href, title, and caption', () => {
      render(
        <CTATile
          href="https://example.com"
          icon={<svg data-testid="icon" />}
          title="Example"
          caption="A sample tile"
        />,
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(screen.getByText('Example')).toBeInTheDocument();
      expect(screen.getByText('A sample tile')).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import type { ReactNode } from 'react';

  type CTATileProps = {
    href: string;
    icon: ReactNode;
    title: string;
    caption: string;
  };

  export function CTATile({ href, icon, title, caption }: CTATileProps) {
    return (
      <a
        href={href}
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '24px',
          border: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-panel)',
          borderRadius: '6px',
          textDecoration: 'none',
          boxShadow: 'inset 0 1px 0 rgba(217, 179, 98, 0.22), 0 1px 0 rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            backgroundColor: 'var(--color-panel-2)',
            border: '1px solid var(--color-border-strong)',
          }}
        >
          {icon}
        </div>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: '4px' }}>{title}</span>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', lineHeight: '20px', color: 'var(--color-text-secondary)' }}>{caption}</span>
      </a>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 4.9: `<FooterRule>` component

**Files:**
- Create: `apps/web/src/components/footer-rule.tsx`

- [ ] Step 1: create the component.

  ```tsx
  export function FooterRule() {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '1px',
          backgroundImage: 'linear-gradient(90deg, rgba(217, 179, 98, 0) 0%, rgba(217, 179, 98, 0.4) 50%, rgba(217, 179, 98, 0) 100%)',
          pointerEvents: 'none',
        }}
      />
    );
  }
  ```

### Task 4.10: Commit Phase 4

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/src/components apps/web/tests/components
  git commit -m "feat(web): add shared components (ZenoCrest, HeroAura, HeroParticles, GoldRule, TerminalBlock, DiagramNode, DiagramFlow, CTATile, FooterRule)"
  ```

## Phase 5 — Section components (TDD)

### Task 5.1: `<HeroSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/hero-section.tsx`
- Create: `apps/web/tests/sections/hero-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { HeroSection } from '../../src/sections/hero-section';

  describe('<HeroSection />', () => {
    it('renders the Zeno crest, the Zeno wordmark, and the kicker tagline', () => {
      render(<HeroSection />);
      expect(screen.getByLabelText(/Zeno crest/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Zeno' })).toBeInTheDocument();
      expect(screen.getByText(/personal agent that gets the work done/i)).toBeInTheDocument();
    });

    it('renders 20 elements with data-particle="true"', () => {
      const { container } = render(<HeroSection />);
      expect(container.querySelectorAll('[data-particle="true"]')).toHaveLength(20);
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { HeroAura } from '../components/hero-aura';
  import { HeroParticles } from '../components/hero-particles';
  import { ZenoCrest } from '../components/zeno-crest';

  export function HeroSection() {
    return (
      <section
        aria-label="hero"
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: '120px 48px 80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          textAlign: 'center',
        }}
      >
        <HeroAura />
        <HeroParticles />
        <ZenoCrest size={96} />
        <span
          style={{
            position: 'relative',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--color-text-secondary)',
          }}
        >
          Personal agent that gets the work done
        </span>
        <h1
          style={{
            position: 'relative',
            fontFamily: "'Fraunces', serif",
            fontWeight: 500,
            fontSize: '48px',
            lineHeight: '52px',
            letterSpacing: '-0.03em',
            margin: 0,
            color: 'var(--color-gold)',
            backgroundImage: 'linear-gradient(135deg, #f0cc7a 0%, #d9b362 35%, #8a6d2e 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Zeno
        </h1>
        <p
          style={{
            position: 'relative',
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 400,
            fontSize: '18px',
            lineHeight: '28px',
            color: 'var(--color-text-secondary)',
            margin: 0,
            maxWidth: '56ch',
          }}
        >
          Self-hosted, single-user agent that operates across the apps you already use — Slack, GitHub, Linear — by composing the connectors you install.
        </p>
      </section>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.2: `<WarningSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/warning-section.tsx`
- Create: `apps/web/tests/sections/warning-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { WarningSection } from '../../src/sections/warning-section';

  describe('<WarningSection />', () => {
    it('renders the EXPERIMENTAL label and the body text', () => {
      render(<WarningSection />);
      expect(screen.getByText(/experimental/i)).toBeInTheDocument();
      expect(screen.getByText(/single-user/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { GoldRule } from '../components/gold-rule';

  export function WarningSection() {
    return (
      <section
        aria-label="experimental"
        style={{
          display: 'flex',
          padding: '32px 192px 0',
        }}
      >
        <GoldRule>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-gold)',
              flexShrink: 0,
            }}
          >
            Experimental
          </span>
          <p
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '13px',
              lineHeight: '22px',
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}
          >
            Single-user, no SLA, breaking changes between commits. Personal project run locally — no support, no migration path, no guarantees.
          </p>
        </GoldRule>
      </section>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.3: `<QuickStartSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/quick-start-section.tsx`
- Create: `apps/web/tests/sections/quick-start-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { QuickStartSection } from '../../src/sections/quick-start-section';
  import { INSTALL_CMD } from '../../src/lib/constants';

  describe('<QuickStartSection />', () => {
    it('renders the heading and the install command verbatim', () => {
      const { container } = render(<QuickStartSection />);
      expect(screen.getByText(/quick start/i)).toBeInTheDocument();
      const code = container.querySelector('code');
      expect(code?.textContent).toBe(INSTALL_CMD);
    });

    it('renders the one-liner tab', () => {
      render(<QuickStartSection />);
      expect(screen.getByText('one-liner')).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { TerminalBlock } from '../components/terminal-block';
  import { INSTALL_CMD } from '../lib/constants';

  export function QuickStartSection() {
    return (
      <section
        aria-label="quick-start"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          padding: '32px 192px 64px',
          backgroundImage:
            'radial-gradient(ellipse 700px 320px at 50% 60%, rgba(217, 179, 98, 0.06) 0%, rgba(217, 179, 98, 0.02) 40%, rgba(8, 9, 15, 0) 80%)',
        }}
      >
        <h2
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 500,
            fontSize: '22px',
            lineHeight: '28px',
            color: 'var(--color-text-primary)',
            margin: 0,
            alignSelf: 'flex-start',
          }}
        >
          <span style={{ color: 'var(--color-gold)' }}>›</span> Quick Start
        </h2>
        <TerminalBlock
          tab="one-liner"
          meta="macOS · Linux · WSL2"
          comment="# Clones to ~/zeno-agent and installs the `zeno` CLI to ~/.local/bin"
          command={INSTALL_CMD}
        />
        <p
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '13px',
            lineHeight: '20px',
            color: 'var(--color-text-secondary)',
            margin: 0,
            alignSelf: 'flex-start',
            maxWidth: '80ch',
          }}
        >
          Requires <code style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-primary)' }}>git</code>,{' '}
          <code style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--color-text-primary)' }}>docker</code>, Node 24 LTS, pnpm 10, a Slack workspace where you can install a custom app, and a Claude account on a Pro or Max plan.
        </p>
      </section>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.4: `<HowItWorksSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/how-it-works-section.tsx`
- Create: `apps/web/tests/sections/how-it-works-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { HowItWorksSection } from '../../src/sections/how-it-works-section';

  describe('<HowItWorksSection />', () => {
    it('renders four diagram nodes with exactly one highlighted', () => {
      const { container } = render(<HowItWorksSection />);
      const nodes = container.querySelectorAll('[data-highlighted], [data-highlighted="true"], [class*="diagram-node"], div');
      const highlighted = container.querySelectorAll('[data-highlighted="true"]');
      expect(highlighted).toHaveLength(1);

      const allHeadings = screen.getAllByText(/^(Slack|Channel adapter|Agent · Claude|MCP servers)$/);
      expect(allHeadings).toHaveLength(4);

      expect(screen.getByText('Agent · Claude').closest('[data-highlighted]')?.getAttribute('data-highlighted')).toBe('true');
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { DiagramFlow } from '../components/diagram-flow';

  const NODES = [
    { kicker: 'channel', name: 'Slack', caption: 'Inbound mention or DM via Socket Mode' },
    { kicker: 'core', name: 'Channel adapter', caption: 'Normalizes the message, attaches USER.md context' },
    { kicker: 'backend', name: 'Agent · Claude', caption: 'Reasons over the request, decides which tools to call', highlighted: true },
    { kicker: 'connectors', name: 'MCP servers', caption: 'GitHub · Linear · Klaviyo · whatever you install' },
  ] as const;

  export function HowItWorksSection() {
    return (
      <section
        aria-label="how-it-works"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          padding: '32px 192px 64px',
          backgroundImage:
            'radial-gradient(ellipse 600px 300px at 50% 60%, rgba(217, 179, 98, 0.05) 0%, rgba(217, 179, 98, 0.02) 40%, rgba(8, 9, 15, 0) 80%)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
              fontSize: '22px',
              lineHeight: '28px',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            <span style={{ color: 'var(--color-gold)' }}>›</span> How it works
          </h2>
          <p
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              lineHeight: '22px',
              color: 'var(--color-text-secondary)',
              margin: 0,
              maxWidth: '80ch',
            }}
          >
            A small core orchestrates pluggable parts. Adding a capability is always an installation, never a code change.
          </p>
        </div>
        <DiagramFlow nodes={NODES} />
      </section>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.5: `<CTATilesSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/cta-tiles-section.tsx`
- Create: `apps/web/tests/sections/cta-tiles-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { CTATilesSection } from '../../src/sections/cta-tiles-section';
  import { DOCS_URL, GITHUB_URL, ROADMAP_URL } from '../../src/lib/constants';

  describe('<CTATilesSection />', () => {
    it('renders three tile links targeting GitHub, Docs, and Roadmap in order', () => {
      const { container } = render(<CTATilesSection />);
      const links = Array.from(container.querySelectorAll('a'));
      expect(links).toHaveLength(3);
      expect(links[0]?.getAttribute('href')).toBe(GITHUB_URL);
      expect(links[1]?.getAttribute('href')).toBe(DOCS_URL);
      expect(links[2]?.getAttribute('href')).toBe(ROADMAP_URL);
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { CTATile } from '../components/cta-tile';
  import { DOCS_URL, GITHUB_URL, ROADMAP_URL } from '../lib/constants';

  const GitHubIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-gold)" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.27-.01-1-.02-1.97-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.95 10.95 0 015.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.8-.01 3.18 0 .31.21.68.8.56C20.21 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );

  const DocsIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );

  const RoadmapIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="14 7 21 7 21 14" />
    </svg>
  );

  export function CTATilesSection() {
    return (
      <section aria-label="cta" style={{ display: 'flex', gap: '16px', padding: '32px 192px 64px' }}>
        <CTATile href={GITHUB_URL} icon={GitHubIcon} title="GitHub" caption="Source code, issues, discussions." />
        <CTATile href={DOCS_URL} icon={DocsIcon} title="Docs — soon" caption="Concepts, connector authoring, skills. Lands with apps/docs." />
        <CTATile href={ROADMAP_URL} icon={RoadmapIcon} title="Roadmap" caption="Now / next / later. Curated, no commitments past next." />
      </section>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.6: `<FooterSection>` (TDD)

**Files:**
- Create: `apps/web/src/sections/footer-section.tsx`
- Create: `apps/web/tests/sections/footer-section.test.tsx`

- [ ] Step 1: write the failing test.

  ```tsx
  import { render, screen } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { FooterSection } from '../../src/sections/footer-section';
  import { GITHUB_URL, LICENSE_URL, ROADMAP_URL } from '../../src/lib/constants';

  describe('<FooterSection />', () => {
    it('renders three footer links targeting GitHub, Roadmap, License', () => {
      const { container } = render(<FooterSection />);
      const links = Array.from(container.querySelectorAll('a'));
      expect(links).toHaveLength(3);
      expect(links.map((l) => l.getAttribute('href'))).toEqual([GITHUB_URL, ROADMAP_URL, LICENSE_URL]);
    });

    it('does not render the @ribeirogab handle', () => {
      render(<FooterSection />);
      expect(screen.queryByText(/@ribeirogab/)).toBeNull();
    });
  });
  ```

- [ ] Step 2: run, expect failure.

- [ ] Step 3: implement.

  ```tsx
  import { FooterRule } from '../components/footer-rule';
  import { ZenoCrest } from '../components/zeno-crest';
  import { GITHUB_URL, LICENSE_URL, ROADMAP_URL } from '../lib/constants';

  const linkStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textDecoration: 'none',
  };

  export function FooterSection() {
    return (
      <footer
        aria-label="footer"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '32px 192px',
          backgroundColor: 'var(--color-sidebar)',
          gap: '24px',
        }}
      >
        <FooterRule />
        <ZenoCrest size={28} />
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <a href={GITHUB_URL} style={linkStyle}>GitHub</a>
          <a href={ROADMAP_URL} style={linkStyle}>Roadmap</a>
          <a href={LICENSE_URL} style={linkStyle}>License</a>
        </div>
      </footer>
    );
  }
  ```

- [ ] Step 4: run, expect pass.

### Task 5.7: Commit Phase 5

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/src/sections apps/web/tests/sections
  git commit -m "feat(web): add six section components (hero, warning, quick-start, how-it-works, cta-tiles, footer)"
  ```

## Phase 6 — App orchestration + structural test

### Task 6.1: Wire `<App />`

**Files:**
- Modify: `apps/web/src/app.tsx`

- [ ] Step 1: replace the placeholder `app.tsx` with the orchestrator.

  ```tsx
  import { CTATilesSection } from './sections/cta-tiles-section';
  import { FooterSection } from './sections/footer-section';
  import { HeroSection } from './sections/hero-section';
  import { HowItWorksSection } from './sections/how-it-works-section';
  import { QuickStartSection } from './sections/quick-start-section';
  import { WarningSection } from './sections/warning-section';

  export function App() {
    return (
      <>
        <HeroSection />
        <WarningSection />
        <QuickStartSection />
        <HowItWorksSection />
        <CTATilesSection />
        <FooterSection />
      </>
    );
  }
  ```

### Task 6.2: Add the structural test

**Files:**
- Create: `apps/web/tests/app.test.tsx`

- [ ] Step 1: write the test.

  ```tsx
  import { render } from '@testing-library/react';
  import { describe, expect, it } from 'vitest';
  import { App } from '../src/app';

  const EXPECTED_LABELS = ['hero', 'experimental', 'quick-start', 'how-it-works', 'cta', 'footer'] as const;

  describe('<App />', () => {
    it('renders without throwing', () => {
      expect(() => render(<App />)).not.toThrow();
    });

    it('renders six top-level region landmarks in declared order', () => {
      const { container } = render(<App />);
      const landmarks = Array.from(container.querySelectorAll('[aria-label]')).filter(
        (el) => el.tagName === 'SECTION' || el.tagName === 'FOOTER',
      );
      const labels = landmarks.map((el) => el.getAttribute('aria-label'));
      expect(labels).toEqual([...EXPECTED_LABELS]);
    });

    it('renders the Zeno wordmark in the hero', () => {
      const { container } = render(<App />);
      const heading = container.querySelector('h1');
      expect(heading?.textContent).toBe('Zeno');
    });
  });
  ```

- [ ] Step 2: run the full test suite.

  Run: `pnpm --filter @zeno/web test`

  Expected: 17 passing tests across 10 files.

### Task 6.3: Commit Phase 6

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/src/app.tsx apps/web/tests/app.test.tsx
  git commit -m "feat(web): wire App orchestrator and structural test"
  ```

## Phase 7 — Visual verification against Paper

### Task 7.1: Side-by-side review against Paper artboard

- [ ] Step 1: serve the dev build.

  Run: `pnpm --filter @zeno/web dev`

- [ ] Step 2: open `http://localhost:3000` and walk the page top-to-bottom.

  Verify each section against the approved Paper artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document. Acceptance is per-section visual match on:

  - Hero: aura layers visible (warm gold center glow, secondary glows in opposite corners, scan lines), 20 particles with colors matching `lib/particles.ts`, crest centered above tagline, gold-gradient `Zeno` heading, sub-pitch wrapping at ~56ch.
  - Warning: gold left-rule, mono caps `EXPERIMENTAL`, body inline.
  - Quick Start: subtle glow behind the section, terminal block with three muted dots, gold `one-liner` tab, mono `macOS · Linux · WSL2` meta, gray comment, `$` prompt in gold, command in primary text, gold halo around the terminal.
  - How it works: subtle glow, four diagram nodes with mono caps kicker, Space Grotesk name, secondary caption, three `→` glyphs between, the `Agent · Claude` node has a gold border + gold halo.
  - CTA tiles: three tiles each with gold-tinted top inset shadow, icon square, title, caption.
  - Footer: gold horizontal gradient rule above, small crest left, three text links right. No `@ribeirogab` text.

  If any section drifts from the artboard, fix the implementation inline. If a fix is impossible without compromising responsiveness or violating Imperial Terminal rules, halt and update spec/plan/tasks; never silently drift.

- [ ] Step 3: stop the dev server.

### Task 7.2: Verify computed styles in DevTools

- [ ] Step 1: re-run the dev server and open `http://localhost:3000`.

- [ ] Step 2: in DevTools console, verify the four atmospheric layers on the hero.

  Run: `getComputedStyle(document.querySelector('section[aria-label=hero]')).backgroundImage`

  Expected: a string containing four `radial-gradient(...)` substrings and one `repeating-linear-gradient(...)` substring.

- [ ] Step 3: verify the `Zeno` gradient text fill.

  Run: `getComputedStyle(document.querySelector('section[aria-label=hero] h1')).backgroundImage`

  Expected: a string containing `linear-gradient`.

- [ ] Step 4: verify the body canvas color.

  Run: `getComputedStyle(document.body).backgroundColor`

  Expected: `rgb(8, 9, 15)`.

### Task 7.3: Commit any drift fixes from Phase 7

- [ ] Step 1: if changes were made during visual verification, stage and commit.

  ```sh
  git add apps/web/src
  git commit -m "fix(web): tune visual treatments to match Paper artboard"
  ```

  If no changes, skip this task.

## Phase 8 — Workspace README

### Task 8.1: Create `apps/web/README.md`

**Files:**
- Create: `apps/web/README.md`

- [ ] Step 1: write the file.

  ```markdown
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

  See `vault/specs/2026-05-07-apps-web-landing/`. The visual contract is the Paper
  artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document.
  ```

### Task 8.2: Commit Phase 8

- [ ] Step 1: stage and commit.

  ```sh
  git add apps/web/README.md
  git commit -m "docs(web): add workspace README"
  ```

## Phase 9 — Quality gate

### Task 9.1: Run the full quality gate at repo root

- [ ] Step 1: run from the worktree root.

  Run: `pnpm run quality-gate`

  Expected: lint + typecheck + tests pass across all workspaces, including `@zeno/web`. Exit 0.

  Capture the tail of the output (last ~30 lines) for the PR description.

- [ ] Step 2: if any check fails, halt and fix the failure before proceeding.

### Task 9.2: Tick acceptance criteria in `spec.md`

- [ ] Step 1: walk the Acceptance Criteria list in `vault/specs/2026-05-07-apps-web-landing/spec.md` from top to bottom.

  Tick `[x]` next to every criterion that is verified.

- [ ] Step 2: commit the spec update.

  ```sh
  git add vault/specs/2026-05-07-apps-web-landing/spec.md
  git commit -m "chore(spec): tick acceptance criteria for apps/web landing"
  ```

## Phase 10 — Roadmap update + PR

### Task 10.1: Move `#7` in `ROADMAP.md`

**Files:**
- Modify: `ROADMAP.md`

- [ ] Step 1: open `ROADMAP.md` and remove the `#7` line from `## Now (in flight)`.

- [ ] Step 2: add the same item under `## Recently shipped` (PR number filled at PR-open time).

- [ ] Step 3: commit.

  ```sh
  git add ROADMAP.md
  git commit -m "chore(roadmap): mark #7 apps/web landing as shipped"
  ```

### Task 10.2: Comment on issue #7 with the spec path

- [ ] Step 1: comment on issue.

  ```sh
  gh issue comment 7 --body "Spec landed: \`vault/specs/2026-05-07-apps-web-landing/\`. PR opens via \`/open-pr\`."
  ```

### Task 10.3: Open the PR via `/open-pr`

- [ ] Step 1: invoke the `/open-pr` slash command.

  Confirm the title follows Conventional Commits (`feat(web): ...`) and the body lists the six sections plus the test count.

- [ ] Step 2: paste the tail of the `pnpm run quality-gate` output (Task 9.1) into the PR body under a `## Quality gate` heading.

- [ ] Step 3: link the PR to issue #7 with `Closes #7` in the body.

### Task 10.4: Post-merge reflection

- [ ] Step 1: after the PR is merged, run the post-spec reflection per `CLAUDE.md`.

  Ask: "What did I learn implementing this that wasn't obvious from the spec?" For every non-obvious item, create an atomic note in `vault/learnings/` using `vault/templates/learning.md` and link it back to this spec via wikilink. If nothing non-obvious surfaced, record explicitly: "No new learnings from spec `2026-05-07-apps-web-landing`."

- [ ] Step 2: update `vault/specs/2026-05-07-apps-web-landing/spec.md` frontmatter:

  ```yaml
  status: shipped
  shipped: 2026-05-07
  ```

  Substitute the actual merge date.

- [ ] Step 3: commit the frontmatter update on `main` (or in a tiny follow-up PR — match the project's convention for spec status updates).
