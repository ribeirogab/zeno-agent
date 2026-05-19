---
feature: apps-web-landing
spec: "[[spec-apps-web-landing]]"
created: 2026-05-07
---
# `apps/web` Landing Page — Plan

**For this spec:** `[[spec-apps-web-landing]]`

## Approach

Add a new `apps/web` workspace whose toolchain mirrors `apps/dashboard` (Vite 8 + React 19.2 + Tailwind 4 + the `@zeno/ui` workspace package), minus the TanStack Router plugin. The deliverable is a single-page scroll landing rendering six sections in a fixed order, each one a kebab-case file under `src/sections/`. The visual contract is the owner-approved Paper artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document — implementation matches it at the section-block level.

Implementation order is bottom-up TDD: discovery (verify Vite 8, Tailwind 4, `@zeno/ui` token export, Fraunces variable axis behavior) → workspace scaffolding (manifest, configs, hello-world page that renders on port 3000) → design-system wiring (tokens resolve in browser, baseline body styling matches `--color-canvas`) → constants + asset bundling (the crest SVG) → shared components (`<ZenoCrest>`, `<HeroAura>`, `<HeroParticles>`, `<GoldRule>`, `<TerminalBlock>`, `<DiagramNode>`, `<DiagramFlow>`, `<CTATile>`, `<FooterRule>`) with unit tests → six section components in declared order with smoke tests → app orchestration with the structural test → workspace README + `ROADMAP.md` move → final quality-gate pass.

The Paper artboard is the source of truth for every magic number — exact dot positions for the particle field, exact opacity stops on the radial glows, exact box-shadow offsets on the highlighted diagram node, exact px paddings on each section. Implementation reads these values from the artboard via the Paper `get_jsx` / `get_computed_styles` MCP tools rather than re-deriving them from screenshots.

## Architecture

```
                          Visitor (local browser)
                                  │
                                  ▼
                        http://localhost:3000
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
          (dev) vite dev server          (build) apps/web/dist/index.html
                  │                               │
                  └───────────────┬───────────────┘
                                  ▼
                                <App />
                                  │
                ┌─────────────┬───┴────────────┬────────────────┐
                ▼             ▼                ▼                ▼
       <HeroSection>  <WarningSection>  <QuickStartSection>  <HowItWorksSection>
            │              │                  │                  │
            │              │                  │                  │
            ▼              ▼                  ▼                  ▼
    <HeroAura>           <GoldRule>       <TerminalBlock>      <DiagramFlow>
    <ZenoCrest>                                                  │
    <HeroParticles>                                              ▼
    Fraunces "Zeno"                                          <DiagramNode> × 4
                                                            (one highlighted)

       <CTATilesSection>                <FooterSection>
            │                                │
            ▼                                ▼
       <CTATile> × 3                   <FooterRule>
                                       <a> × 3 + small crest

       Tokens flow:
         packages/ui (@zeno/ui)
           src/styles/tokens.css   ─→  imported by apps/web/src/styles/index.css
                                      via @import "@zeno/ui/styles/tokens.css";
```

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `apps/web/package.json` | Workspace manifest. `name: "@zeno/web"`, `type: "module"`, scripts (`dev`/`build`/`preview`/`test`/`typecheck`/`lint`/`clean`), runtime deps `@zeno/ui` (`workspace:*`) + `react@^19.2.5` + `react-dom@^19.2.5`, dev deps mirroring `apps/dashboard` minus TanStack Router. |
| `apps/web/tsconfig.json` | Extends `tsconfig.base.json`. `target: ES2022`, DOM libs, `module: ESNext`, `moduleResolution: Bundler`, `jsx: react-jsx`, `paths: { "@/*": ["./src/*"] }`, includes `src/**/*` + `tests/**/*`. |
| `apps/web/vite.config.ts` | `defineConfig` with `react()` plugin, `@/*` alias, `server.port: 3000`, `preview.port: 3000`, `build.outDir: 'dist'`, `build.sourcemap: true`. No router plugin. |
| `apps/web/vitest.config.ts` | `defineConfig` with `react()`, `environment: 'happy-dom'`, `globals: true`, `setupFiles: ['./tests/setup.ts']`, `@/*` alias matching tsconfig. |
| `apps/web/postcss.config.js` | `@tailwindcss/postcss` + `autoprefixer`. Identical to `apps/dashboard/postcss.config.js`. |
| `apps/web/index.html` | Vite entry HTML. `lang="en"`, `class="dark"`, `<title>` + `<meta description>`, Google Fonts preconnect + load (Space Grotesk 400/500/600, JetBrains Mono 400/500/600/700, Fraunces variable + italic), `<div id="root">`, `<script type="module" src="/src/main.tsx">`. |
| `apps/web/README.md` | Workspace-local notes: stack, dev/build commands, port-3000 conflict warning, link to spec, link to Paper artboard. |
| `apps/web/src/main.tsx` | Bootstrap. `createRoot(document.getElementById('root'))`. `<StrictMode><App /></StrictMode>`. Imports `./styles/index.css`. |
| `apps/web/src/app.tsx` | Orchestrator. Renders `<HeroSection />` → `<WarningSection />` → `<QuickStartSection />` → `<HowItWorksSection />` → `<CTATilesSection />` → `<FooterSection />`. Pure composition; no state. |
| `apps/web/src/styles/index.css` | `@import "tailwindcss"; @import "@zeno/ui/styles/tokens.css";` plus a body baseline (`background-color: var(--color-canvas); color: var(--color-text-primary); font-family: 'Space Grotesk', sans-serif; margin: 0; min-height: 100vh;`). |
| `apps/web/src/lib/constants.ts` | Single source of truth. Exports `GITHUB_URL`, `ROADMAP_URL`, `LICENSE_URL`, `DOCS_URL`, `INSTALL_CMD`. |
| `apps/web/src/lib/tokens.ts` | Re-exports named token aliases as TypeScript constants for safer consumption (`COLOR_GOLD = 'var(--color-gold)'`, etc.). |
| `apps/web/src/lib/particles.ts` | Static particle position table — array of `{ top, left, size, opacity, color }` with the 20 entries copied verbatim from the approved Paper artboard. |
| `apps/web/src/icons/crest.svg` | The diamond-Z crest, copied via Paper `get_jsx` from artboard node `G7-0`. Rendered as inline JSX inside `<ZenoCrest />`. The footer reuses `<ZenoCrest size={28} />` — no separate small mark asset is shipped. |
| `apps/web/src/components/zeno-crest.tsx` | `<ZenoCrest size={number} />` — renders the crest SVG inline. Default size 96. |
| `apps/web/src/components/hero-aura.tsx` | `<HeroAura />` — absolutely-positioned background layer carrying the four atmospheric `background-image` layers via inline style. Renders behind hero content. |
| `apps/web/src/components/hero-particles.tsx` | `<HeroParticles />` — maps `lib/particles.ts` to absolutely-positioned `<div data-particle="true">` elements. |
| `apps/web/src/components/gold-rule.tsx` | `<GoldRule>{children}</GoldRule>` — left-rule wrapper used by `<WarningSection>`. |
| `apps/web/src/components/terminal-block.tsx` | `<TerminalBlock tab meta comment command />` — macOS chrome + tab + comment + command line. |
| `apps/web/src/components/diagram-node.tsx` | `<DiagramNode kicker name caption highlighted? />` — single node card; sets `data-highlighted="true"` and applies gold border + halo when highlighted. |
| `apps/web/src/components/diagram-flow.tsx` | `<DiagramFlow nodes={…} />` — renders nodes with mono `→` glyphs between. |
| `apps/web/src/components/cta-tile.tsx` | `<CTATile href icon title caption />` — gold-tinted top-edge tile with icon square. |
| `apps/web/src/components/footer-rule.tsx` | `<FooterRule />` — absolutely-positioned thin horizontal gold-gradient line. |
| `apps/web/src/sections/hero-section.tsx` | `<section aria-label="hero">`. Composes `<HeroAura />` + `<HeroParticles />` + `<ZenoCrest size={96} />` + uppercase mono kicker + Fraunces 48px `Zeno` with gradient text fill + Space Grotesk sub-pitch. |
| `apps/web/src/sections/warning-section.tsx` | `<section aria-label="experimental">`. Composes `<GoldRule>` wrapping mono caps `EXPERIMENTAL` label and inline body. |
| `apps/web/src/sections/quick-start-section.tsx` | `<section aria-label="quick-start">`. Heading kicker + `<TerminalBlock />` + prereqs footnote. |
| `apps/web/src/sections/how-it-works-section.tsx` | `<section aria-label="how-it-works">`. Heading kicker + 1-line subhead + `<DiagramFlow nodes={…} />` with the four configured nodes. |
| `apps/web/src/sections/cta-tiles-section.tsx` | `<section aria-label="cta">`. Three `<CTATile />` side by side. |
| `apps/web/src/sections/footer-section.tsx` | `<footer aria-label="footer">`. `<FooterRule />` + small crest + three `<a>` links. |
| `apps/web/tests/setup.ts` | One line: `import '@testing-library/jest-dom/vitest';`. |
| `apps/web/tests/app.test.tsx` | Three tests: renders without throwing, contains six top-level region landmarks in order, hero contains "Zeno". |
| `apps/web/tests/sections/hero-section.test.tsx` | Smoke: crest SVG present, "Zeno" heading present, mono caps tagline present. |
| `apps/web/tests/sections/warning-section.test.tsx` | Smoke: text matches `/experimental/i`, body contains "Single-user". |
| `apps/web/tests/sections/quick-start-section.test.tsx` | Smoke: `<code>` text equals `INSTALL_CMD`, tab equals "one-liner". |
| `apps/web/tests/sections/how-it-works-section.test.tsx` | Smoke: 4 diagram-node elements, exactly one has `data-highlighted="true"`, that one is "Agent · Claude". |
| `apps/web/tests/sections/cta-tiles-section.test.tsx` | Smoke: 3 `<a>` with hrefs matching `GITHUB_URL`, `DOCS_URL`, `ROADMAP_URL`. |
| `apps/web/tests/sections/footer-section.test.tsx` | Smoke: 3 `<a>` with hrefs `GITHUB_URL`, `ROADMAP_URL`, `LICENSE_URL`. No `@ribeirogab` text. |
| `apps/web/tests/components/terminal-block.test.tsx` | 2 tests: renders configured tab + command verbatim. |
| `apps/web/tests/components/diagram-node.test.tsx` | 2 tests: renders kicker/name/caption; `highlighted={true}` carries `data-highlighted="true"`. |
| `apps/web/tests/components/cta-tile.test.tsx` | 1 test: renders `<a>` with configured `href`, title, and caption. |

### Modified

| Path | Change |
|---|---|
| `ROADMAP.md` | In the merge commit/PR: move issue `#7` from `Now (in flight)` to `Recently shipped`. No other ROADMAP edits in this spec. |

### NOT modified (explicit non-changes)

- `pnpm-workspace.yaml` — `apps/*` glob already covers the new workspace.
- `turbo.json` — task graph already includes generic `build`/`test`/`typecheck`/`lint`.
- `tsconfig.base.json` — extended, not changed.
- `biome.json` — root config applies automatically.
- `apps/dashboard/**` — untouched.
- `apps/api/**`, `apps/cli/**`, `apps/worker/**` — untouched.
- `packages/**` — `@zeno/ui` consumed read-only via `workspace:*`. No edits to `@zeno/ui` source.
- `infra/**` — no docker compose service for `apps/web` in this spec.
- `agent/**`, `profiles/**` — out of scope.
- `README.md` — no edit. The README's "Quickstart" already describes installing the agent itself; the landing page is local-only and the README does not yet need to link to a hosted URL.
- `.github/workflows/**` — untouched.

## Phase Ordering

**Phase 0 — Discovery.** Verify Vite 8 + Tailwind 4 + `@zeno/ui` exports current state via context7 and direct codebase inspection. Confirm Fraunces is loadable as a variable font with the weight axis covering 100–900. Pin runtime deps. Resolve any divergence from `apps/dashboard` baseline before scaffolding. Extract the crest SVG and the static particle positions from the approved Paper artboard via Paper MCP `get_jsx` / `get_computed_styles`.

**Phase 1 — Workspace scaffolding.** Create `apps/web/package.json`, configs (`tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `postcss.config.js`), `index.html`, an empty-shell `app.tsx` ("Hello, Zeno"), `main.tsx`, and `styles/index.css`. End state: `pnpm --filter @zeno/web dev` serves on `http://localhost:3000` with the placeholder shell rendered, `pnpm --filter @zeno/web build` produces `dist/`.

**Phase 2 — Design-system wiring.** Add the `@zeno/ui` token import to `styles/index.css`, set the body baseline, and verify in a real browser that `getComputedStyle(document.body).backgroundColor` resolves to the canvas token (`rgb(8, 9, 15)`). Capture a learning at `.vault/learnings/web-tailwind4-zeno-ui-tokens.md` if any non-obvious step is required.

**Phase 3 — Constants + assets + tokens.** Implement `lib/constants.ts`, `lib/tokens.ts`, `lib/particles.ts` (positions table copied from Paper). Drop `icons/crest.svg` and `icons/logo-mark-small.svg` extracted from Paper.

**Phase 4 — Shared components (TDD).** Implement primitives in order with tests: `<ZenoCrest>`, `<HeroAura>`, `<HeroParticles>`, `<GoldRule>`, `<TerminalBlock>`, `<DiagramNode>`, `<DiagramFlow>`, `<CTATile>`, `<FooterRule>`. Each primitive lands with its own unit test where the spec calls for one (TerminalBlock, DiagramNode, CTATile).

**Phase 5 — Section components (TDD).** Implement six sections in declared order (hero, warning, quick-start, how-it-works, cta-tiles, footer). Each section is one task: write the smoke test, run it failing, implement the section, run it passing, commit.

**Phase 6 — App orchestration + structural test.** Wire `<App />` to render the six sections in order. Add `tests/app.test.tsx` with three assertions. Run all tests, expect 17 green across 10 files.

**Phase 7 — Visual verification against Paper.** Boot dev server, side-by-side compare every section against the approved Paper artboard, fix drift inline. Confirm the four atmospheric layers, the gradient `Zeno`, the gold halo on the highlighted node, and the gold gradient rule above the footer all render as designed.

**Phase 8 — Workspace README.** Write `apps/web/README.md` documenting stack, scripts, the port-3000 conflict, and a pointer to the spec + Paper artboard.

**Phase 9 — Quality gate verification.** Run `pnpm run quality-gate` at the repo root. Confirm `@zeno/web` is included in the task graph and exits 0. Capture the run log in the PR description.

**Phase 10 — Roadmap + PR.** Move issue `#7` from `Now (in flight)` to `Recently shipped` in `ROADMAP.md`. Open the PR via `/open-pr`. After merge, the post-spec reflection step (per `CLAUDE.md`) generates a learning if anything non-obvious surfaced.

## Risks / Open Decisions

- **Tailwind 4 + token-CSS layering.** If the `@zeno/ui` token CSS exports raw `:root` custom properties without a Tailwind `@theme` block, Tailwind 4 utility classes that consume token names (e.g. `bg-canvas`) may not resolve. Phase 2's smoke check catches this. Resolution path if it fails: either (a) wrap the imported token names in an `@theme` block in `apps/web/src/styles/index.css`, or (b) consume tokens via `var(--color-...)` directly in JSX `className`/`style` rather than relying on Tailwind utility classes. The Paper artboard already favors (b) — implementation defaults to (b) and only adopts (a) if the dashboard already uses `@theme`.
- **Google Fonts CDN dependency.** `index.html` loads three font families from `fonts.googleapis.com`. The landing renders fine without them (system fallbacks), but Imperial Terminal typography depends on the load. If the owner prefers self-hosted fonts at any point, that is a separate, simple follow-up (drop a font folder under `public/`, change the `<link>` to a local stylesheet). Not handled here.
- **`background-clip: text` browser support.** Modern browsers support it universally since 2018. The CSS declares a `color: var(--color-gold)` fallback so a non-supporting browser renders a flat gold heading.
- **Static particle field looks frozen.** Paper artboard is the static contract; the implementation matches it exactly. Replacing the static dots with an animated `<canvas>` layer is a follow-up spec.
- **Footer placeholder docs URL.** Once `apps/docs` (#6) ships, `DOCS_URL` updates to a real URL. Until then, all docs-targeting links resolve to the README. One-line edit.
- **Gold halo on the highlighted diagram node may render slightly differently from the artboard at non-1× zoom.** Manual side-by-side review in Phase 7 is the gate. If perfect parity is impossible without breaking responsiveness, the spec is updated to remove the halo and Paper is updated to match — the implementation never silently drifts.
