---
status: draft
feature: apps-web-landing
created: 2026-05-07
shipped: null
---
# `apps/web` Landing Page — Spec

**Status:** Draft
**Scope:** Add a new `apps/web` workspace to the monorepo containing a single-page, statically-built marketing landing page for the Zeno project. Ship a six-section single-scroll page with hero (Zeno crest + aura + radial gradient + ambient particles), an `EXPERIMENTAL` warning rule, a Quick Start install panel built around a styled terminal block, a `How it works` connector-model diagram, three bottom-CTA tiles (GitHub, Docs, Roadmap), and a minimal footer. No hosting, no real screenshots, no demo recording. Visual fidelity is locked against approved Paper artboards on page `1-0` of the `zeno-agent` document.

## Context

The repository was rewritten for outsider readability across the OSS-prep tracks (`.vault/specs/2026-05-04-oss-prep-readme-rewrite`, `…-community-files`, `…-governance`, `…-sanitization`, `…-roadmap`). The README was kept narrow on the explicit promise that `apps/web` would absorb sales-style content (pitch + visual identity) the README must not host.

Issue [#7](https://github.com/ribeirogab/zeno-agent/issues/7) is the public tracker. The roadmap lists `apps/web` under `Now (in flight)`.

`apps/dashboard` already establishes the frontend toolchain in the monorepo: Vite 8 + React 19.2 + Tailwind 4 + the `@zeno/ui` workspace package (Radix + cmdk + cva + tailwind-merge), backed by the Imperial Terminal design system documented in `DESIGN.md`. The landing reuses that stack for monorepo coherence (Rule of Diversity / Rule of Simplicity from the global instructions).

Brainstorming surfaced two iterations of the design before the structure landed:

1. **First exploration** — eight section artboards (hero, slack proof, demo, how-it-works, features matrix, dashboard, install, footer) with anchor nav and `<PlaceholderBox>` components for visuals not yet captured. Reviewed in Paper, judged too SaaS-y, too tall, and committing to social proof Zeno doesn't have. **Discarded.**
2. **Second exploration (kept)** — six sections, single continuous scroll, no anchor nav, no placeholder boxes for missing assets, OpenClaw-inspired density, atmospheric hero, gold-accented details throughout. Approved in Paper.

The shipped Paper artboard for the second exploration (single artboard `apps-web · landing`, 1440 × 1700–1800 px, page `1-0` of the `zeno-agent` document) is the visual contract for implementation. Token application across the artboard is Imperial Terminal — canvas `#08090F`, panel `#0f1119`, panel-2 `#151824`, sidebar `#05060F`, gold `#d9b362` (single-accent rule from `DESIGN.md`), text-primary `#e8eaf5`, text-secondary `#8a8fab`, status-paused `#d9b362`, info-blue `#7aa6e8`. Type stack is Fraunces (variable, weights 100–900) for display, Space Grotesk (300–700) for body and small UI, JetBrains Mono (100–800 with italic axis) for code, kickers, and labels.

## Problem Statement

There is no public-facing surface for the project beyond a markdown README on GitHub. The README intentionally does not host:

- Hero with brand wordmark, crest, and atmospheric treatment
- A primary install moment that reads as a deliberate first action (terminal block with `curl | sh`)
- A diagram explaining the connector model — the project's main differentiator
- Hierarchical exit paths (GitHub repo, Docs, Roadmap) presented as parallel tiles

Without `apps/web`, the README is forced to either bloat (re-introducing the noise the rewrite removed) or stay narrow (leaving outsiders without a polished first-impression surface). Issue #7 tracks this gap.

A second-order problem: `apps/web` is a precondition for several follow-up specs that the maintainer plans to ship — capturing real product screenshots, recording a demo loop, drawing the architecture diagram in a more refined form, wiring an animated particle canvas in place of the static dot field. Shipping the scaffolding now unblocks them.

## Non-Goals

- **Hosting, custom domain, or deploy pipeline.** The landing is local-only in this iteration. `vite build` produces a static `dist/`; serving it publicly is a separate decision tied to the project's broader public-launch posture and is explicitly out of scope.
- **Migration of the dashboard from port 3000.** This spec consumes port 3000 for `apps/web`'s dev server and documents the conflict with the dashboard's Docker mapping; it does not move the dashboard. A follow-up issue and spec will own that migration.
- **Real visual asset capture.** Screenshots of the Slack thread, the dashboard `/connectors` page, the architecture diagram, and a recorded demo loop are not in scope. The Paper-approved structure does not embed any of those — they are intentionally absent from the design.
- **Animated particle canvas.** The Paper artboard documents a static dot field as the visual representation of ambient particles. The implementation ships those dots as static absolutely-positioned elements as well; replacing them with an animated canvas (requestAnimationFrame, `<canvas>`, or a Framer Motion driver) is a follow-up spec.
- **`<AnchorNav>` / sticky top navigation / smooth scroll.** The landing is short enough that anchor navigation is unnecessary. The shipped design has no top nav.
- **`<PlaceholderBox>` / `<StatusPill>` components from the discarded first exploration.** They are not implemented.
- **`zeno web` or `zeno open --web` CLI integration.** The CLI is intentionally untouched. Dev workflow is `pnpm --filter @zeno/web dev` only.
- **Multi-page routing, SSR/SSG, MDX.** Single-page scroll. No router. No MDX. No server components. Content lives in JSX inside section components.
- **Internationalization.** EN-only. The vault is EN-only by rule; the landing follows.
- **SEO, analytics, tracking, social-share metadata beyond a basic `<title>` and `<meta description>`.** Out of scope until hosting decision lands.
- **Image / font self-hosting and optimization beyond Vite defaults.** Fonts loaded via Google Fonts `<link>`. Image optimization is irrelevant — there are no real images.
- **Storybook or visual regression infrastructure.** Smoke + structural tests via vitest cover the regression surface for this scaffolding phase.
- **Promoting components from `apps/web/src/components/` into `@zeno/ui`.** A clean-up spec can do that once the components prove their reuse value across `apps/web` and `apps/dashboard`.

## Constraints

- **Constitution stack lock.** TypeScript strict, Node 24, pnpm 10, biome, vitest. React 19 and Tailwind 4 inherited from `apps/dashboard`. No new toolchains.
- **Workspace conventions.** New workspace must register cleanly in `pnpm-workspace.yaml` (already covered by `apps/*` glob — no edit required) and inherit Turbo pipeline tasks (`build`, `test`, `typecheck`, `lint`) from the existing `turbo.json` (no edit required). `pnpm run quality-gate` must include `@zeno/web` automatically.
- **File naming.** Kebab-case for all source files (`hero-section.tsx`, `terminal-block.tsx`, …) per project convention. The exception is `main.tsx`, which keeps the conventional Vite entry filename to match `apps/dashboard`.
- **Design system reuse.** Tokens and primitives consumed via `@zeno/ui` (`workspace:*`). The landing must not re-declare colors, typography scales, spacing, or radii that already exist in `DESIGN.md` and `@zeno/ui/styles/tokens.css`.
- **Single-accent rule.** Per `DESIGN.md` (and the `@zeno/ui` tokens cover sheet on Paper), Zeno uses exactly ONE accent hue: imperial gold (`#d9b362`). The blue tint in the secondary radial glow on the hero is below 0.05 alpha and used as ambient haze only — it does not introduce a second brand color. Any deeper use of secondary hues requires a separate design decision captured in a learning.
- **Dev port.** `vite --port 3000`. Conflicts with the dashboard's Docker mapping when both run simultaneously locally; documented as a risk and resolved by running one at a time. Dashboard port migration is a non-goal.
- **Public repo, sanitization rule (`.vault/rules/sanitization.md`).** No real identifiers in copy or constants. The owner's GitHub handle (`ribeirogab`) is already public and may appear in repo URLs; the footer does **not** include a `@ribeirogab` byline.
- **EN-only content.** Vault is EN-only and the landing is public-facing — copy is EN-only.
- **No external runtime dependencies beyond what `apps/dashboard` already pulls in.** `@zeno/ui` re-exports Radix primitives, cmdk, cva, and tailwind-merge. The landing must not introduce parallel UI libraries.
- **Imperial Terminal type stack.** Display = Fraunces (use the variable axis at weight 500 for `Zeno`, with `WONK 0` and `opsz` set automatically by `font-optical-sizing: auto`); body = Space Grotesk; mono kickers and code = JetBrains Mono. Loaded from Google Fonts via the `<link>` in `index.html`.

## User Stories / Scenarios

1. **First-time stargazer reaches the local landing build.** They clone the repo, run `pnpm install`, run `pnpm --filter @zeno/web dev`, and open `http://localhost:3000`. They see, top-to-bottom: a centered Zeno crest with ambient gold radial glow and ~20 subtle particles, the wordmark `Zeno` rendered in a 48px Fraunces with a gold linear-gradient text fill, a one-sentence sub-pitch, an `EXPERIMENTAL` rule explaining single-user / no-SLA / breaking-changes, a styled terminal showing the install one-liner, a four-node `How it works` diagram with the `Agent · Claude` node visibly haloed in gold, three bottom-CTA tiles, and a minimal footer.

2. **Implementer of a follow-up asset-capture spec.** They open `apps/web/src/sections/how-it-works-section.tsx`. They find the four-node diagram rendered structurally (kicker + name + caption per node, gold halo on the highlighted node, mono-glyph arrows between nodes). When the architecture diagram is later ready as an SVG export from Paper, they swap the inline diagram for an `<img src="/architecture.svg" />` tag in the same section file and update the smoke test.

3. **Implementer of `apps/docs` (issue #6).** They ship `apps/docs`. They open `apps/web/src/lib/constants.ts` and change `DOCS_URL` from the README placeholder to the new docs URL. The `Docs — soon` tile in the bottom CTAs picks up the new URL from one edit. (The footer does not link to docs.)

4. **Future contributor running `pnpm run quality-gate`.** The command runs lint + typecheck + tests across all workspaces. `@zeno/web` is included automatically. The smoke + structural tests pass in under one second. No special configuration is required.

5. **Owner reviewing the implemented page against the Paper artboard.** Paper artboard `apps-web · landing` is approved. Implementation is run side-by-side against the artboard. Visual fidelity matches at the section level — token application, type scale, gold radial glow, the gold gradient on the `Zeno` wordmark, the gold-rule warning callout, the gold halo on the `Agent · Claude` node, the gold-tint top edge on each bottom CTA tile, the gold horizontal gradient rule above the footer.

## Architecture

### Workspace boundaries

`apps/web` depends only on:

- `@zeno/ui` (workspace package — design system primitives + tokens)
- `react`, `react-dom` (peer-aligned with `@zeno/ui`)

Build- and dev-time deps mirror `apps/dashboard` minus the TanStack Router toolchain:

- `vite`, `@vitejs/plugin-react`
- `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `autoprefixer`
- `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`
- `typescript`

There is no coupling with `apps/dashboard` source. The only failure surface is `@zeno/ui`, and it surfaces in CI through the existing Turbo build graph.

### Directory layout

```
apps/web/
  package.json
  vite.config.ts
  vitest.config.ts
  tsconfig.json
  postcss.config.js
  index.html
  README.md                    # workspace-local notes (port conflict, dev/build commands)
  src/
    main.tsx                   # bootstrap (StrictMode + createRoot)
    app.tsx                    # orchestrator: 6 sections in declared order
    sections/
      hero-section.tsx
      warning-section.tsx
      quick-start-section.tsx
      how-it-works-section.tsx
      cta-tiles-section.tsx
      footer-section.tsx
    components/
      zeno-crest.tsx           # the diamond-Z SVG, sizes via `size` prop
      hero-aura.tsx            # absolutely-positioned background layer (radial glows + particles)
      hero-particles.tsx       # ~20 absolutely-positioned dots, varied size/opacity (static)
      gold-rule.tsx            # left-rule wrapper used by warning-section
      terminal-block.tsx       # macOS-style chrome + tab + comment + command line
      diagram-flow.tsx         # row of <DiagramNode> + mono arrow glyphs between
      diagram-node.tsx         # kicker + name + caption, optional `highlighted` prop adds gold halo
      cta-tile.tsx             # icon-square + title + caption, optional gold top-edge
      footer-rule.tsx          # absolutely-positioned thin horizontal gold gradient line
    icons/
      crest.svg                # bundled SVG asset for the diamond-Z (used at any size; footer renders it at 28px)
    lib/
      constants.ts             # GITHUB_URL, ROADMAP_URL, LICENSE_URL, DOCS_URL, INSTALL_CMD
      tokens.ts                # named token aliases (`COLOR_GOLD`, `COLOR_CANVAS`, etc.) for type-safe consumption
    styles/
      index.css                # @import tailwindcss + @zeno/ui tokens + body baseline
  tests/
    setup.ts
    app.test.tsx
    sections/
      hero-section.test.tsx
      warning-section.test.tsx
      quick-start-section.test.tsx
      how-it-works-section.test.tsx
      cta-tiles-section.test.tsx
      footer-section.test.tsx
    components/
      terminal-block.test.tsx
      diagram-node.test.tsx
      cta-tile.test.tsx
```

### Section structure (single-page scroll, top to bottom)

| # | Component | Visual treatment |
|---|---|---|
| 1 | `<HeroSection />` | Centered, 720px tall, includes `<HeroAura />` (radial glow + particles) + `<ZenoCrest />` (96×96) + uppercase mono kicker + `Zeno` wordmark with gold-gradient text fill (48px Fraunces 500) + Space Grotesk sub-pitch |
| 2 | `<WarningSection />` | Full-width band with a 192px horizontal padding, contains a single `<GoldRule>` wrapping a mono caps `EXPERIMENTAL` label and an inline body explaining the experimental status |
| 3 | `<QuickStartSection />` | `› Quick Start` heading kicker, `<TerminalBlock>` with macOS chrome (3 dots) + gold `one-liner` tab + `# Clones to ~/zeno-agent and installs the …` comment + `$ curl …` command, followed by a Space Grotesk prerequisites footnote, with a subtle radial glow behind the section |
| 4 | `<HowItWorksSection />` | `› How it works` heading kicker + 1-line subhead, then `<DiagramFlow>` rendering four `<DiagramNode>` (Channel · Slack, Core · Channel adapter, Backend · Agent · Claude, Connectors · MCP servers) connected by mono `→` glyphs; the third node is `highlighted` and renders with a 1px gold border + soft 24px gold box-shadow |
| 5 | `<CTATilesSection />` | Three `<CTATile>` side by side (GitHub, Docs — soon, Roadmap), each with a gold-tinted top-edge inset shadow, an icon square, a title, and a one-line caption |
| 6 | `<FooterSection />` | Thin horizontal gold-gradient `<FooterRule>` overlay at the top, then a flex row with the small Zeno mark on the left and three text links on the right (GitHub, Roadmap, License). No `@ribeirogab` handle, no copyright line |

### Hero atmospheric layers (Imperial Terminal, restrained)

The hero combines four subtle layers into a single atmospheric background, rendered via CSS `background-image` on the hero `<section>` plus an absolutely-positioned `<HeroParticles>` child:

1. **Primary gold radial glow** — `radial-gradient(ellipse 800px 420px at 50% 35%, rgba(217, 179, 98, 0.13) 0%, rgba(217, 179, 98, 0.05) 35%, rgba(8, 9, 15, 0) 75%)`. Warm spot above the crest, fading to canvas.
2. **Asymmetric secondary glow (gold)** — `radial-gradient(circle 400px at 88% 20%, rgba(217, 179, 98, 0.06) 0%, rgba(8, 9, 15, 0) 100%)`. Top-right ambient.
3. **Asymmetric tertiary glow (cool blue ambient haze)** — `radial-gradient(circle 400px at 12% 80%, rgba(122, 166, 232, 0.035) 0%, rgba(8, 9, 15, 0) 100%)`. Bottom-left ambient haze, **below the single-accent threshold of 0.05 alpha** — does not violate the single-accent rule.
4. **Phosphor scan lines** — `repeating-linear-gradient(0deg, transparent 0 3px, rgba(217, 179, 98, 0.018) 3px 4px)`. CRT-feel horizontal scan lines, almost invisible by design.

The static particles are 20 absolutely-positioned `<div>` elements with `border-radius: 9999px`, sizes 1–3px, randomized but documented x/y positions across the hero box, opacities 0.30–0.85, and colors switching between `#d9b362` and `#f0cc7a`. The implementation matches the positions captured in the approved Paper artboard verbatim — a constants array drives the rendering.

### `Zeno` wordmark — gradient text

The hero `Zeno` heading uses CSS `background-clip: text` with a 135° linear-gradient (`#f0cc7a 0%`, `#d9b362 35%`, `#8a6d2e 100%`) and `color: transparent` plus `-webkit-background-clip: text` / `-webkit-text-fill-color: transparent`. Browser support is universal across modern browsers; the fallback (no clip support) is `color: var(--color-gold)` — a flat gold heading, still on-brand.

### `<TerminalBlock />` API

```tsx
type TerminalBlockProps = {
  tab: string;             // "one-liner"
  meta?: string;           // "macOS · Linux · WSL2"
  comment: string;         // "# Clones to ~/zeno-agent ..."
  command: string;         // "curl -fsSL ... | sh"
};
```

The component renders the macOS-style chrome row (three muted gray traffic-light dots), the gold tab, the meta string in muted mono, the gray comment line in body, and the command line with a gold `$` prompt followed by primary-text-color content.

### `<DiagramFlow />` and `<DiagramNode />` API

```tsx
type DiagramNodeProps = {
  kicker: string;          // "channel" / "core" / "backend" / "connectors"
  name: string;            // "Slack" / "Channel adapter" / "Agent · Claude" / "MCP servers"
  caption: string;
  highlighted?: boolean;   // adds the gold border + halo
};

type DiagramFlowProps = {
  nodes: DiagramNodeProps[];
};
```

Arrows between nodes are mono `→` glyphs, color `#4b4f66`, font-size 18px, vertical-centered, no SVG.

### `<CTATile />` API

```tsx
type CTATileProps = {
  href: string;
  icon: ReactNode;         // 16-px SVG, rendered inside the gold-tinted icon square
  title: string;           // "GitHub" / "Docs — soon" / "Roadmap"
  caption: string;
};
```

The tile is a flex column with the icon square on top, the title (Space Grotesk 15 600), and the caption (Space Grotesk 13 400 secondary). The container has a 1px subtle border, a panel background, and the gold-tinted top-edge inset shadow.

### Constants

`src/lib/constants.ts` is the single source of truth for the four external URLs and the install command:

```ts
export const GITHUB_URL = 'https://github.com/ribeirogab/zeno-agent';
export const ROADMAP_URL = `${GITHUB_URL}/blob/main/ROADMAP.md`;
export const LICENSE_URL = `${GITHUB_URL}/blob/main/LICENSE`;
export const DOCS_URL = `${GITHUB_URL}#readme`; // placeholder until apps/docs ships
export const INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/main/infra/install.sh | sh';
```

There is no `SECTIONS` array — the page does not have anchor navigation. Each section component is imported directly by `app.tsx`.

### Build, dev, and quality wiring

| Concern | Decision |
|---|---|
| Workspace registration | `pnpm-workspace.yaml`'s `apps/*` glob — no edit |
| Turbo pipeline | Inherited from existing tasks — no edit |
| Dev script | `"dev": "vite --port 3000"` in `apps/web/package.json` (invoked via `pnpm --filter @zeno/web dev`) |
| Preview script | `"preview": "vite preview --port 3000"` |
| Build output | `apps/web/dist/` |
| TypeScript | Extends `tsconfig.base.json`, mirrors `apps/dashboard/tsconfig.json` (DOM lib, `react-jsx`, `@/*` alias) |
| PostCSS | `@tailwindcss/postcss` + `autoprefixer` (matches dashboard) |
| Test runner | `vitest` with `happy-dom` environment, `@testing-library/jest-dom` setup |
| Lint | `biome` (root config) |

### Test surface

The shipped test suite is intentionally bounded:

- **`tests/app.test.tsx`** (3 tests): `<App />` renders without throwing; the rendered DOM contains exactly six top-level region landmarks (`<section aria-label>` or `<footer aria-label>` with the canonical labels `hero`, `experimental`, `quick-start`, `how-it-works`, `cta`, `footer` in that order); the hero contains an `<h1>` whose text is `Zeno`.
- **`tests/sections/hero-section.test.tsx`** (2 tests): the crest SVG (`aria-label="Zeno crest"`) and the `Zeno` `<h1>` and the kicker tagline are present; exactly 20 elements with `data-particle="true"` are rendered.
- **`tests/sections/warning-section.test.tsx`** (1 test): a node with text matching `/experimental/i` is present and the body contains "Single-user".
- **`tests/sections/quick-start-section.test.tsx`** (2 tests): a `<code>` whose `textContent` equals `INSTALL_CMD` from `lib/constants.ts` is present; the tab label `one-liner` is present.
- **`tests/sections/how-it-works-section.test.tsx`** (1 test): four `<DiagramNode>` instances are rendered and exactly one carries `data-highlighted="true"` and that one's name equals `Agent · Claude`.
- **`tests/sections/cta-tiles-section.test.tsx`** (1 test): three `<a>` whose `href` values resolve, in order, to `GITHUB_URL`, `DOCS_URL`, and `ROADMAP_URL`.
- **`tests/sections/footer-section.test.tsx`** (2 tests): three `<a>` whose `href` values resolve, in order, to `GITHUB_URL`, `ROADMAP_URL`, `LICENSE_URL`; the rendered output does not contain the substring `@ribeirogab`.
- **`tests/components/terminal-block.test.tsx`** (2 tests): renders with a configured tab and meta strings; the rendered command text inside `<code>` matches the `command` prop verbatim.
- **`tests/components/diagram-node.test.tsx`** (2 tests): renders kicker / name / caption; with `highlighted={true}` carries `data-highlighted="true"`.
- **`tests/components/cta-tile.test.tsx`** (1 test): renders an `<a>` with the configured `href` and contains the title and caption text.

Total bounded count: **17 tests across 10 files**. Storybook, full visual regression, and E2E are non-goals for this scaffolding phase.

## Acceptance Criteria

- [x] After `pnpm install` at the repo root, `pnpm ls -r --depth -1` lists `@zeno/web@0.0.1` (or the workspace-resolved equivalent).
- [x] `pnpm --filter @zeno/web dev` starts Vite on `http://localhost:3000` and prints no errors to the terminal during cold start.
- [x] `pnpm --filter @zeno/web build` exits with status 0 and produces `apps/web/dist/index.html` plus a hashed JS bundle and a hashed CSS bundle.
- [x] `pnpm --filter @zeno/web preview` serves the build at `http://localhost:3000` and the response status for `/` is 200.
- [x] `pnpm --filter @zeno/web typecheck` exits with status 0.
- [x] `pnpm --filter @zeno/web lint` exits with status 0.
- [x] `pnpm --filter @zeno/web test` reports 17 passing tests across 10 files.
- [x] `pnpm run quality-gate` (root) exits with status 0 and includes `@zeno/web` in its task graph.
- [x] The rendered `<App />` contains six `<section>` elements (or `<footer>` for the last) in this top-to-bottom order: hero, experimental warning, quick start, how it works, CTA tiles, footer.
- [x] The hero section renders the Zeno crest SVG and a heading element whose text content equals `Zeno`.
- [x] The hero `Zeno` heading has a CSS `background-image` whose value contains `linear-gradient` (the gold-gradient text fill).
- [x] The hero contains exactly 40 elements with `data-particle="true"` (the static dots).
- [x] The warning section contains a node whose text begins with the case-insensitive substring `experimental` and a body element containing the substring `Single-user`.
- [x] The quick start section contains a `<code>` element whose `textContent` equals the `INSTALL_CMD` constant from `lib/constants.ts`.
- [x] The quick start terminal block renders a tab element with text `one-liner` and a meta element with text matching `/macOS.+Linux.+WSL2/`.
- [x] The how it works section renders exactly four diagram-node elements; exactly one of them has `data-highlighted="true"` and that one's name equals `Agent · Claude`.
- [x] The how it works section renders exactly three `→` glyph elements between the four nodes.
- [x] The CTA tiles section renders three `<a>` elements; their `href` attributes resolve, respectively, to `GITHUB_URL`, `DOCS_URL`, and `ROADMAP_URL` as imported from `lib/constants.ts`.
- [x] The footer renders three `<a>` elements whose `href` values are `GITHUB_URL`, `ROADMAP_URL`, and `LICENSE_URL`.
- [x] The footer does **not** contain the text `@ribeirogab`.
- [x] In a real browser viewing the dev server, `getComputedStyle(document.body).backgroundColor` resolves to the `rgb()` form of `#08090F` (the `--color-canvas` Imperial Terminal token).
- [x] In a real browser viewing the dev server, the hero's `backgroundImage` computed value contains four `radial-gradient` layers and one `repeating-linear-gradient` layer (the four atmospheric layers plus the scan-line layer).
- [x] The implemented page matches the approved Paper artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document, verified by manual side-by-side review at the section-block level (token application, type scale, atmospheric treatment, gold halo on the highlighted diagram node, gold gradient rule above the footer).
- [x] `ROADMAP.md` is updated in the merge PR: issue `#7` moves from `Now (in flight)` to `Recently shipped`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Port 3000 conflicts with the dashboard's Docker mapping when both run locally. | Documented in `apps/web/README.md` and in this Risks section. Operator runs one at a time. The dashboard's port migration is an explicit non-goal here and gets its own follow-up issue. |
| Tailwind 4's `@theme` interaction with `@zeno/ui` token imports yields unexpected resolution (token names colliding, cascade order surprises). | Implementation Step 0 is a "tokens render correctly" smoke check before any section work — `<App />` minimal with one element using a token, verified in browser dev tools. Failure here triggers a learnings note. |
| `DOCS_URL` placeholder pointing at the README makes the CTA tile and footer link functionally inert until `apps/docs` ships. | Accepted. The CTAs still navigate to a real destination (the README). One-line edit in `lib/constants.ts` when `apps/docs` (#6) ships. |
| `@zeno/ui` evolves and breaks `apps/web`'s rendering contract. | The Turbo build graph runs `apps/dashboard` and `apps/web` together in CI; a breaking change in `@zeno/ui` surfaces on the same PR that introduces it. The fix lands with the change. |
| The static particle field looks frozen and hurts the impression of polish that motivated adding it. | Accepted as a known quality ceiling. Animating the field is an explicit non-goal of this spec — a separate spec adds an animated `<canvas>` particle layer that replaces the static dots. The Paper artboard is the authoritative static representation; the implementation matches it verbatim. |
| The cross-browser support of `background-clip: text` produces a flat color in older browsers, breaking the `Zeno` gradient effect. | Fallback declared in CSS: `color: var(--color-gold)` — a flat gold heading. Modern Chromium-, WebKit-, and Firefox-derived browsers support `background-clip: text` since 2018; the fallback is for the long tail. |
| The gold halo on the highlighted diagram node is rendered via `box-shadow` and may not match the artboard at every viewport. | The artboard is the contract; the implementation tunes the box-shadow offsets/spread until manual side-by-side review passes. If the halo cannot match at all viewports without breaking responsiveness, the spec is updated to remove the halo and Paper is updated to match — never silently drift. |
| Bundle size grows due to over-importing primitives that `apps/web` does not actually need. | Tree-shaking via Vite handles the common case. If the production bundle exceeds 220 KB gzipped at any point during implementation, it is treated as a defect and addressed before merge. |

## Open Questions

None. Brainstorming Q1–Q7 are resolved, the Paper-first iteration loop is closed, and the Paper artboard is owner-approved.

## Workflow contract

This spec follows the project's Paper-first workflow, summarized for traceability:

1. Spec approved by owner (this document, second iteration after Paper review reshaped the structure).
2. `writing-plans` skill produces `plan.md` and `tasks.md` in this same directory.
3. Plan and tasks approved by owner.
4. Paper artboard `apps-web · landing` on page `1-0` of the `zeno-agent` document — already drafted, owner-approved as of the second iteration that produced this spec. The artboard is the visual contract for implementation.
5. Implementation executes `tasks.md`. The implementation matches the approved Paper artboard 1:1 at the section-block level.
6. Acceptance criteria are verified, the PR is opened via `/open-pr`, and on merge `ROADMAP.md` is updated to move issue `#7` to `Recently shipped`.
7. After shipping, an explicit reflection step generates a learning note in `.vault/learnings/` if anything non-obvious surfaced during implementation; otherwise the reflection records "no new learnings."
