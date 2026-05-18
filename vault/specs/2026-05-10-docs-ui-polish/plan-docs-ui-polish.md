---
feature: docs-ui-polish
spec: "[[spec-docs-ui-polish]]"
created: 2026-05-10
---
# Docs UI Polish — Plan

**For this spec:** [[spec-docs-ui-polish]]

> **For agentic workers:** Use the `executing-plans` workflow (inline execution) — each task is small, surgical, and produces a self-contained commit. Steps use checkbox (`- [ ]`) syntax for tracking. The full task list lives in [[tasks-docs-ui-polish]].

## Approach

**Preview-first, topological order, single PR, multi-commit.** Build a dev-only sandbox surface (`app/preview/*` gated by `NODE_ENV !== 'development'`) before any visual item. Then layer changes from foundation outward: wiring → theming → page chrome → routes → plumbing → README correction. Each commit produces a green `pnpm run quality-gate`.

Alternatives considered and rejected:
- **Layered by surface** (group by area like "all theming together"): violates dependency order — Callout palette depends on `mdx-components` being wired first to render the preview reliably.
- **Risk-first** (start with shiki theme + R2): each item here is independent and well-understood; no large blocker risk to front-load.

Per [[../../learnings/fumadocs-version-triple-2026-05|fumadocs-version-triple-2026-05]], the Fumadocs package triple is locked; new deps (`fumadocs-twoslash`, `mermaid`) must respect that triple. Per [[../../learnings/fumadocs-gettext-raw-breaks-on-workers|fumadocs-gettext-raw-breaks-on-workers]], any new route reading MDX uses `getText('processed')`, never `'raw'`. Per [[../../learnings/fumadocs-css-override-needs-id-specificity|fumadocs-css-override-needs-id-specificity]], Callout palette overrides land at the same ID-scoped specificity Fumadocs uses internally.

## Architecture

**Three new surfaces, all inside `apps/docs/`:**

1. **MDX renderer config.** `src/mdx-components.tsx` merges Fumadocs's `defaultMdxComponents` with extras (Tabs, Files, TypeTable, ImageZoom, InlineTOC). `[[...slug]]/page.tsx` consumes it. This single change unlocks the code-block copy button and every other primitive Fumadocs ships.

2. **Dynamic image + branded 404.** `[[...slug]]/opengraph-image.tsx` reads frontmatter via `source.getPage(slug).data.{title,description}` and returns an `ImageResponse` (1200×630, Imperial Terminal palette). `not-found.tsx` renders Crest + headline + `SearchToggle` + back link, sharing the existing `RootProvider` context.

3. **Dev-only preview sandbox.** `app/preview/layout.tsx` gates with `if (process.env.NODE_ENV !== 'development') notFound()`. Subroutes (`/preview/og`, `/preview/not-found`, `/preview/callout`, `/preview/shiki`, `/preview/banner`) embed the same components used in production for visual review. Sitemap is unaffected (`sitemap.ts` iterates `source.generateParams()` only).

**Cross-cutting changes:**

- `app/layout.tsx` adds `<Banner>` prop on `<DocsLayout>` (non-dismissible, fixed copy).
- `app/[[...slug]]/page.tsx` adds `editOnGithub={editOnGithub(page.file.path)}` from a new helper (`lib/edit-on-github.ts`).
- `components/copy-markdown-url-button.tsx` adopts the exact class shape of Fumadocs's `MarkdownCopyButton` (only the icon differs).
- `styles/globals.css` binds `--color-fd-info/error/success` to Imperial status tokens.
- `source.config.ts` registers a custom shiki theme (forked `github-dark-default` → `lib/shiki-imperial-terminal.ts`), `remarkMermaid` plugin, and the `fumadocs-twoslash` shiki transformer.
- `open-next.config.ts` switches `defineCloudflareConfig()` → config with `incrementalCache: r2IncrementalCache`.
- `wrangler.jsonc` binds the pre-created R2 bucket (`zeno-docs-isr-cache`) and dedupes its duplicate `routes` key.
- `apps/docs/README.md` corrected: `Pagefind` → `Fumadocs Orama search`, `Next.js 15` → `Next.js 16`.

## File Structure

### Create (12 files)

| Path | Responsibility |
|---|---|
| `apps/docs/src/mdx-components.tsx` | Export `getMDXComponents()`: merge `defaultMdxComponents` + Tabs/Files/Folder/File/TypeTable/ImageZoom/InlineTOC |
| `apps/docs/src/lib/edit-on-github.ts` | Pure helper: `(filePath: string) => string` returning the GitHub edit URL for an MDX page |
| `apps/docs/src/lib/shiki-imperial-terminal.ts` | Exports a shiki theme object (forked from `github-dark-default`, Imperial Terminal accents) |
| `apps/docs/src/app/[[...slug]]/opengraph-image.tsx` | Next 16 OG route: `ImageResponse` 1200×630 with title/description from frontmatter |
| `apps/docs/src/app/not-found.tsx` | Custom 404 page — Crest, headline, subtitle, SearchToggle, back link |
| `apps/docs/src/app/preview/layout.tsx` | Dev-only gate (`process.env.NODE_ENV !== 'development' → notFound()`) |
| `apps/docs/src/app/preview/page.tsx` | Index page linking to each `/preview/*` subroute |
| `apps/docs/src/app/preview/og/page.tsx` | Grid of `<img src="/<slug>/opengraph-image">` for every doc slug + 1 synthetic test slug (no description) |
| `apps/docs/src/app/preview/not-found/page.tsx` | Renders the 404 component inline for visual review |
| `apps/docs/src/app/preview/callout/page.tsx` | Four Callout variants (info/warn/error/success) inline |
| `apps/docs/src/app/preview/shiki/page.tsx` | Five representative code blocks (TS, Bash, JSON, TSX, Markdown) for theme review |
| `apps/docs/src/app/preview/banner/page.tsx` | Renders the experimental Banner isolated for contrast review |

Plus one test file (helper is pure, testable):

| Path | Responsibility |
|---|---|
| `apps/docs/src/lib/edit-on-github.test.ts` | Vitest spec for `editOnGithub()` URL composition |

### Modify (8 files)

| Path | Change |
|---|---|
| `apps/docs/src/app/[[...slug]]/page.tsx` | `<MDX components={getMDXComponents()} />` + `editOnGithub={editOnGithub(page.file.path)}` |
| `apps/docs/src/app/layout.tsx` | Add `banner={<Banner>…</Banner>}` prop on `<DocsLayout>` |
| `apps/docs/src/components/copy-markdown-url-button.tsx` | Adopt MarkdownCopyButton class shape; only icon differs |
| `apps/docs/src/styles/globals.css` | Bind `--color-fd-info/error/success` to status tokens (warn untouched) |
| `apps/docs/source.config.ts` | Register shiki theme + remarkMermaid plugin + fumadocs-twoslash transformer |
| `apps/docs/open-next.config.ts` | Switch to `incrementalCache: r2IncrementalCache` |
| `apps/docs/wrangler.jsonc` | Add R2 binding, dedupe `routes` key |
| `apps/docs/package.json` | Deps: `fumadocs-twoslash`, `mermaid`. Verify peer alignment with Fumadocs triple |
| `apps/docs/README.md` | `Pagefind` → `Fumadocs Orama search`; `Next.js 15` → `Next.js 16` |

### Delete

None. Preview routes are permanent (gated), not tmp.

## Phase Ordering

Each phase is one commit. Phases listed in execution order:

| # | Commit | Depends on | Why this order |
|---|---|---|---|
| 1 | `chore(docs): scaffold dev-only preview routes` | — | Sandbox must exist before visual items can verify against it |
| 2 | `feat(docs): wire default mdx components + extra exports` | 1 | Foundation — unblocks copy-button + all primitives. Spec's primary bug fix |
| 3 | `feat(docs): mirror MarkdownCopyButton style on CopyMarkdownUrlButton` | 2 | Page-actions row uses primitives merged in 2 |
| 4 | `feat(docs): experimental banner in DocsLayout` | 2 | Banner uses Fumadocs `Banner` primitive |
| 5 | `feat(docs): edit-on-github + InlineTOC export` | 2 | Helper + export via mdx-components from 2 |
| 6 | `feat(docs): bind status tokens to fumadocs callout palette` | 1 | Callout preview uses route from 1 |
| 7 | `feat(docs): fork github-dark-default shiki theme (Imperial Terminal)` | 1, 2 | Shiki preview embeds code blocks rendered via merged MDX components |
| 8 | `feat(docs): dynamic OG image per slug + preview` | 1, 2 | OG preview iframes/imgs the production route |
| 9 | `feat(docs): custom 404 with crest + search + preview` | 1, 2 | 404 preview embeds the component |
| 10 | `chore(docs): wire mermaid via fumadocs-core mdx-plugins` | 2, 7 | Mermaid renders inside code blocks; needs shiki settled |
| 11 | `chore(docs): wire twoslash for ts hover` | 7 | Twoslash is a shiki transformer; depends on theme being stable |
| 12 | `chore(docs): cf worker R2 incremental cache + dedupe routes key` | — | Independent of UI work, can land any time. Last because lowest urgency |
| 13 | `docs(docs): readme correction (pagefind + next 15 → 16)` | — | Independent. Last because trivial |

## Risks / Open Decisions

Resolved in [[spec-docs-ui-polish]] §Risks. The implementer should re-read the Risks table before starting Tasks 8 (OG image font loading), 11 (Twoslash build-time errors), and 12 (R2 API drift + NODE_ENV guard behavior).

No open decisions. Implementation proceeds task-by-task per [[tasks-docs-ui-polish]].
