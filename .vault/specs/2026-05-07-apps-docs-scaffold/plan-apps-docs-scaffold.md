---
feature: apps-docs-scaffold
spec: "[[spec-apps-docs-scaffold]]"
created: 2026-05-07
---
# Apps/Docs Minimal Scaffold — Plan

**For this spec:** [[spec-apps-docs-scaffold]]

> **Project rule reminder:** This plan stages logical commit boundaries, but `git add` / `git commit` / `git push` require explicit user approval per `CLAUDE.md` rule 20. Treat every commit step as "stage + ask before committing." Never push to `main`/`master`.

## Approach

The scaffold is a single new pnpm workspace at `apps/docs/`. It runs Fumadocs (Next.js 16 + MDX) at `:4242` with three placeholder pages, Imperial Terminal CSS-variable theming, Pagefind local search, and AI-friendly endpoints (`/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>`, copy-as-markdown button per page). No content authoring decisions, no hosting, no full theming — that is all out of scope and lives in follow-up specs (see spec Non-Goals).

Two design choices drive the layering:

1. **Source of pages = `apps/docs/content/docs/*.mdx`.** Fumadocs reads these via the `loader` API exposed in `src/lib/source.ts`. All three AI endpoints (`/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>`) iterate the same `source` so the page set never drifts between human and agent surfaces.
2. **Theming is CSS variables only.** No Fumadocs UI component is overridden. The token mapping in `src/styles/globals.css` redefines the `--color-fd-*` variables Fumadocs already exposes, plus `--font-*` for the three self-hosted variable fonts. This keeps the diff small and lets a future "Imperial Terminal full theming" spec extend without conflict.

The plan is decomposed into **eight phases** (workspace skeleton → Next.js + Fumadocs → tokens → content → AI endpoints → copy-md component → cross-spec marker → quality gate). Each phase ends at a clean commit boundary so a reviewer can read the diff one phase at a time.

## Architecture

```
apps/docs/
├── package.json           # name "@zeno/docs", scripts dev/build/start/lint/typecheck/test
├── tsconfig.json          # extends ../../tsconfig.base.json, JSX react-jsx, paths @/*
├── biome.json             # inherits root via "extends"
├── turbo.json             # workspace override: build outputs [".next/**", "!.next/cache/**"]
├── next.config.mjs        # withMDX from fumadocs-mdx
├── source.config.ts       # Fumadocs MDX collection config
├── vitest.config.ts       # jsdom env, includes src/**/*.test.{ts,tsx}
├── README.md              # how to run locally
├── content/
│   └── docs/
│       ├── meta.json      # sidebar order
│       ├── index.mdx      # placeholder landing
│       ├── hello.mdx      # placeholder dummy
│       └── configuration.mdx  # placeholder dummy
├── public/
│   └── fonts/
│       ├── SpaceGrotesk-Variable.woff2
│       ├── JetBrainsMono-Variable.woff2
│       ├── Fraunces-Variable.woff2
│       └── LICENSES/
│           ├── SpaceGrotesk-OFL.txt
│           ├── JetBrainsMono-Apache-2.0.txt
│           └── Fraunces-OFL.txt
└── src/
    ├── styles/
    │   └── globals.css                        # Tailwind + Fumadocs preset + Imperial tokens + fonts
    ├── lib/
    │   ├── source.ts                          # Fumadocs source loader
    │   └── llm-text.ts                        # getLLMText(page) helper
    ├── components/
    │   ├── CopyMarkdownButton.tsx             # client component
    │   └── CopyMarkdownButton.test.tsx        # vitest + testing-library
    └── app/
        ├── layout.tsx                         # <html class="dark"> root
        ├── globals.css.ts (or import in layout)
        ├── (home)/page.tsx                    # redirect to /docs
        ├── docs/[[...slug]]/page.tsx          # Fumadocs DocsPage with CopyMarkdownButton in header
        ├── docs/layout.tsx                    # Fumadocs DocsLayout
        ├── llms.txt/route.ts                  # /llms.txt endpoint
        ├── llms-full.txt/route.ts             # /llms-full.txt endpoint
        └── llms.mdx/[[...slug]]/route.ts      # /llms.mdx/<slug> endpoint
```

**External:**
- Modify `.vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md` frontmatter: `status: superseded`, add `superseded_by: "[[../2026-05-07-apps-docs-scaffold/spec]]"`.

## File Structure

| File | Responsibility |
|---|---|
| `apps/docs/package.json` | Workspace manifest. `name: "@zeno/docs"`, `private: true`, scripts, deps. |
| `apps/docs/tsconfig.json` | Extends root base; `jsx: "preserve"`, `moduleResolution: "Bundler"`, `paths: { "@/*": ["./src/*"] }`, includes `next-env.d.ts` and `.next/types/**/*.ts`. |
| `apps/docs/biome.json` | **Not created.** Other apps in this monorepo rely on the root `biome.json`'s `apps/**` glob; `apps/docs` follows the same convention. |
| `apps/docs/turbo.json` | `build` outputs override → `[".next/**", "!.next/cache/**"]`. |
| `apps/docs/next.config.mjs` | Wraps config with `withMDX` from `fumadocs-mdx/next`; sets `output: "standalone"` deferred — leave default. |
| `apps/docs/source.config.ts` | `defineDocs({ dir: "content/docs" })` plus `defineConfig` for MDX. |
| `apps/docs/vitest.config.ts` | jsdom env, `setupFiles` for `@testing-library/jest-dom`. |
| `apps/docs/content/docs/meta.json` | `{ "title": "Docs", "pages": ["index", "hello", "configuration"] }`. |
| `apps/docs/content/docs/index.mdx` | Placeholder landing page with explicit "placeholder; real content lands in a future spec" line. |
| `apps/docs/content/docs/hello.mdx` | Placeholder with frontmatter `title` + `description`, plus several headings to exercise sidebar TOC. |
| `apps/docs/content/docs/configuration.mdx` | Placeholder with a unique term (`SUPERCALIFRAGILISTIC`) to verify Pagefind search. |
| `apps/docs/src/styles/globals.css` | Tailwind 4 import, Fumadocs UI preset import, Imperial Terminal tokens, font-face declarations. |
| `apps/docs/src/lib/source.ts` | Exports `source = loader({ baseUrl: "/docs", source: docs.toFumadocsSource() })`. |
| `apps/docs/src/lib/llm-text.ts` | Exports `getLLMText(page)` — strips MDX-only constructs and returns plain markdown. |
| `apps/docs/src/components/CopyMarkdownButton.tsx` | Client component: button → fetch `/llms.mdx/<slug>` → `navigator.clipboard.writeText` → toast/feedback. |
| `apps/docs/src/components/CopyMarkdownButton.test.tsx` | Vitest + RTL covering happy path (fetch → copy → state change) and fetch-failure path. |
| `apps/docs/src/app/layout.tsx` | Root layout with `<html lang="en" class="dark" suppressHydrationWarning>`, imports `globals.css` and `RootProvider` from `fumadocs-ui`. |
| `apps/docs/src/app/(home)/page.tsx` | Server component that `redirect("/docs")`. |
| `apps/docs/src/app/docs/layout.tsx` | `DocsLayout` from `fumadocs-ui/layouts/docs` with `tree={source.pageTree}`. |
| `apps/docs/src/app/docs/[[...slug]]/page.tsx` | `DocsPage` rendering MDX body + `<CopyMarkdownButton slug={...} />` in header slot. |
| `apps/docs/src/app/llms.txt/route.ts` | GET handler iterating `source.getPages()`, emits sitemap markdown. Excludes pages without `description`. |
| `apps/docs/src/app/llms-full.txt/route.ts` | GET handler emitting concatenated markdown of every page (regardless of `description`). |
| `apps/docs/src/app/llms.mdx/[[...slug]]/route.ts` | GET handler emitting `getLLMText(page)` or 404. |
| `apps/docs/public/fonts/*.woff2` | Self-hosted variable fonts (Space Grotesk, JetBrains Mono, Fraunces). |
| `apps/docs/public/fonts/LICENSES/*.txt` | License files for each font. |
| `apps/docs/README.md` | Three-section file: what it is, how to run dev, how to build. |
| `.vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md` | Frontmatter edit only: mark superseded. |

## Phase Ordering

| Phase | What | Depends on |
|---|---|---|
| 1 | Workspace skeleton (package.json, tsconfig, biome, turbo override, README) | — |
| 2 | Next.js + Fumadocs base (next.config, source.config, app/layout, lib/source, empty docs route) | 1 |
| 3 | Imperial Terminal theming (CSS tokens + self-hosted fonts) | 2 |
| 4 | Three placeholder MDX pages + meta.json | 2 |
| 5 | AI endpoints (`/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>`, lib/llm-text) | 4 |
| 6 | Copy-as-markdown button (component + unit test + integration into docs page header) | 5 |
| 7 | Cross-spec marker (frontmatter edit on 0027) | — (independent) |
| 8 | Quality gate verification (pnpm install, build, full quality-gate, manual smoke) | 1–7 |

## Risks / Open Decisions

- **Fumadocs API churn**: the route handlers below are written against the public Fumadocs API as of May 2026. If the installed version exposes a different helper (e.g. a built-in `getLLMText`), prefer the built-in — note the deviation in the PR description.
- **Pagefind index step**: Fumadocs runs Pagefind inside `next build`. If a fresh clone fails the build with "pagefind binary not found", add the necessary postinstall hook and call it out in the PR; do not silently work around it.
- **Tailwind 4 alpha quirks**: any token that fails to flow through `@theme inline` should be hardcoded in `globals.css` rather than blocking the phase.
- **CopyMarkdownButton fallback**: `navigator.clipboard.writeText` requires HTTPS or `localhost`. Local dev is `localhost:4242`, so this is fine. Document in the component that the fallback path (manual copy) is out of scope for the MVP.
- **Font sourcing**: variable woff2 must be downloaded from upstream (Google Fonts CDN, GitHub releases). The download itself is a one-shot during scaffolding; license files are required deliverables. Do not vendor static (non-variable) fallbacks unless variable woff2 is unavailable for a specific font.
