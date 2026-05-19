---
status: draft
feature: docs-ui-polish
created: 2026-05-10
shipped: null
---
# Docs UI Polish — Spec

**Status:** Draft
**Scope:** Wire Fumadocs default MDX components into `apps/docs`, mirror the page-actions buttons, add an experimental banner, Edit-on-GitHub link, dynamic OG images, a branded 404, custom Imperial Terminal shiki theme, Callout palette bindings, and plumbing for Mermaid / Twoslash / R2 incremental cache — all in a single branch and PR. No MDX content changes.

## Context

`apps/docs` shipped as a scaffold in spec [[../2026-05-07-apps-docs-scaffold/spec]] (PR #19) with only color tokens bound and no component overrides. Spec 0049 ([[../2026-05-07-apps-docs-cf-deploy/spec]]) added Cloudflare Workers deployment. The site renders, search works, AI endpoints work — but the page wiring still passes `<MDX components={{}} />` to the Fumadocs renderer, so the default code-block copy button never reaches the DOM. Several other small surfaces (page chrome, OG, 404) sit at Fumadocs defaults or Next.js defaults instead of Imperial Terminal.

This spec captures the polish pass that gets the docs site to feature-parity with comparable docs (Fumadocs's own site, `nuqs.dev`, `mdxjs.com`) without authoring any new content.

The brainstorming flow (this session, 2026-05-10) resolved every conceptual decision before this spec was written. Q1–Q10 summary lives in the implementation plan; see [[plan-docs-ui-polish]].

## Problem Statement

Today the docs site:

1. **Lacks the standard docs-site affordances.** Code blocks have no copy button (the most-asked-about issue the owner surfaced). No Edit-on-GitHub link in the page footer. No OG image per page — every share card uses the same static PNG. No branded 404.
2. **Looks generic where it should look Imperial.** Shiki defaults to `github-dark`. Fumadocs `Callout` uses its default amber/red/blue/green which clashes with the Imperial Terminal status palette. The visual signal that "this is Zeno" disappears the moment you're past the navbar.
3. **Is missing plumbing for future content.** The "Official Docs" follow-up spec will need Mermaid diagrams (architecture pages) and Twoslash hovers (CLI/SDK reference). Wiring them now means content authors don't have to file a separate infra ticket later. Worker observability + R2 incremental cache are similarly cheap to add once and expensive to retrofit when latency starts hurting.
4. **Has a stale README.** `apps/docs/README.md` references Pagefind for search, but the actual implementation is Fumadocs's built-in Orama search at `/api/search` (confirmed via `apps/docs/src/app/api/search/route.ts`).

The owner explicitly opted to bundle every item above into a single branch + PR (`feat/docs-ui-polish`) and skip Paper artboards for this work — visual exploration runs in `apps/docs` itself via dev-only preview routes, not in a separate design tool.

## Non-Goals

This spec explicitly does **not** ship:

- **New MDX content.** Every existing page (`index`, `install`, `profile`, `daily-ops`, `profiles`, `channels`, `connectors`, `skills`, `crons`, `cli`) stays unchanged in body and frontmatter. The "Official Docs" spec owns content.
- **Section icons in `meta.json`.** Owner cut this from scope.
- **Sticky page-actions bar.** Owner cut this from scope.
- **Light theme.** Dark-only by design ([[../2026-05-07-apps-docs-scaffold/spec]] AC).
- **Paper artboards.** Owner opted out of Paper-first for docs work — visual review happens in dev-only preview routes inside `apps/docs`.
- **New tokens in `DESIGN.md`.** Callout `warn` stays at Fumadocs default; we do not introduce an amber/warn token to `packages/ui/src/styles/tokens.css` or `DESIGN.md`.
- **Multi-version docs / i18n / hosted variants.** Out of scope per scaffold spec.
- **Replacing Fumadocs primitives.** We bind tokens, we don't reimplement `Banner`, `Callout`, `MarkdownCopyButton`, etc.
- **GitHub Action wiring for any of this.** The existing `pnpm run quality-gate` is the only CI we need to pass.

## Constraints

- **Fumadocs version triple is locked.** Per [[../../learnings/fumadocs-version-triple-2026-05|fumadocs-version-triple-2026-05]], the supported combination is `fumadocs-core@^16.8.8 + fumadocs-ui@^16.8.8 + fumadocs-mdx@^15.0.0` on Next.js 16 + React 19.2+. New deps added by this spec (`fumadocs-twoslash`, `mermaid`) must respect this triple. No bumps of `fumadocs-*` packages.
- **No `getText('raw')` in any new route.** Per [[../../learnings/fumadocs-gettext-raw-breaks-on-workers|fumadocs-gettext-raw-breaks-on-workers]], the production runtime is Cloudflare Workers and has no filesystem. Any new route handler must use `page.data.getText('processed')` or `page.data._markdown`. The OG route does not need markdown body — only `title` + `description` from frontmatter.
- **CSS override specificity for Fumadocs primitives.** Per [[../../learnings/fumadocs-css-override-needs-id-specificity|fumadocs-css-override-needs-id-specificity]], Fumadocs's `neutral.css` defines tokens inside `.dark #nd-sidebar` / `#nd-toc` / `#nd-banner` selectors. Callout palette overrides must be scoped at matching specificity or they will lose the cascade. Verification: `getComputedStyle()` on each Callout type returns the bound token color, not the default.
- **Dev-only preview routes.** All routes under `apps/docs/src/app/preview/**` must guard with `if (process.env.NODE_ENV !== 'development') notFound()` so the production Cloudflare Worker returns 404 for every preview path. Verify by hitting `https://docs.zeno-agent.dev/preview/og` post-deploy and confirming HTTP 404.
- **R2 incremental cache requires a pre-provisioned bucket.** The R2 bucket must exist in the same Cloudflare account (`9890bc74ec17df307df583147a6ea97f`) before the wrangler config can bind it. The implementation must include the wrangler invocation that creates the bucket (`wrangler r2 bucket create zeno-docs-isr-cache` or equivalent) — not just the config that references it.
- **Imperial Terminal token boundary.** Shiki theme JSON and Callout palette bindings must consume `var(--color-*)` from `packages/ui/src/styles/tokens.css` (via the relative-path import already present in `apps/docs/src/styles/globals.css`). Hard-coded hex values inside the shiki theme JSON are acceptable only when shiki's theme schema does not support CSS variables — document any such case inline.
- **Do not import `@zeno/ui` React components.** `apps/docs/package.json` already declares `"@zeno/ui": "workspace:*"` (added in the scaffold spec for the relative-path tokens import chain in `globals.css`), so the dependency exists. The constraint is on consumption: this spec must not introduce `import { Foo } from '@zeno/ui'` anywhere — all new components remain inlined in `apps/docs/src/components/`. The existing `Crest` precedent stands.
- **Quality gate must keep passing.** `pnpm run quality-gate` (lint + typecheck + test across all workspaces) is the merge gate. The new dependencies' peer constraints must not generate `@zeno/docs`-attributed warnings.

## User Stories / Scenarios

1. **Operator reads a code block and copies it.** Operator opens `https://docs.zeno-agent.dev/install`, hovers a `\`\`\`bash` block, sees the Fumadocs copy button in the corner. Click copies the body to clipboard with visible feedback. Today this button is absent because `<MDX components={{}} />` overrides Fumadocs's default `pre`/`code` map.

2. **Operator shares a page link in Slack.** Operator pastes `https://docs.zeno-agent.dev/cli` into Slack. The unfurl preview shows a 1200×630 OG card with the page's title (`CLI`), description (from frontmatter), and Imperial Terminal brand bar — not the same generic OG image every other page renders.

3. **Operator hits a stale link.** Operator follows an old link to `/install-mac` (renamed to `/install`). The site renders a branded 404 with Crest, "Page not found" headline, brief subtitle, and a Fumadocs `SearchToggle` they can use immediately. A link back to `/` is present.

4. **Operator wants to suggest a fix.** Reading any page, the operator sees an "Edit on GitHub" link at the bottom. Click opens the GitHub editor for that exact MDX file on `main`. No per-page frontmatter required — the URL derives from `page.file.path`.

5. **Operator skims an experimental project.** Every page renders a non-dismissible banner: `"Zeno is experimental. Personal project, no SLA, breaking changes expected."` Sets expectations before they read anything else.

6. **Operator copies the markdown URL.** Page-actions row shows `[Copy Markdown] [Copy Markdown URL] [Open ▾]`. All three buttons share identical visual treatment — border, padding, hover, "Copied" feedback. The middle button has a `Link2` icon; the other two have their Fumadocs defaults.

7. **Maintainer iterates on Imperial paleta.** Maintainer runs `pnpm --filter @zeno/docs dev`, hits `http://localhost:4242/preview/callout` and `/preview/shiki`, sees all variants on one screen, tweaks `globals.css` or the shiki JSON, reloads — without touching real MDX content or shipping mock pages to production.

8. **Maintainer reviews OG cards.** Maintainer hits `http://localhost:4242/preview/og`, sees an `<img>` for each MDX slug's OG endpoint in one grid view. Visual regression for the OG template is a single page reload, not 12 separate browser tabs.

9. **Future content author writes a Mermaid diagram.** Author drops a `\`\`\`mermaid` fence in any MDX file. It renders without further configuration. Same flow for `\`\`\`ts twoslash` blocks — hovers show inferred types.

## Acceptance Criteria

Each item is a binary check verifiable in under a minute by someone other than the implementer.

### Wiring

- [ ] `apps/docs/src/mdx-components.tsx` exists and exports `getMDXComponents(components?: MDXComponents): MDXComponents` that merges `defaultMdxComponents` from `fumadocs-ui/mdx` with the additional exports (`Tabs`, `Tab`, `Files`, `Folder`, `File`, `TypeTable`, `ImageZoom`, `InlineTOC`).
- [ ] `apps/docs/src/app/[[...slug]]/page.tsx` invokes `<MDX components={getMDXComponents()} />`.
- [ ] On `http://localhost:4242/install`, hovering any code block reveals a copy button in the top-right corner. Clicking it copies the block body to the clipboard and toggles to a "Copied" indicator. (Direct repro of the bug the owner surfaced.)
- [ ] `\`\`\`ts title="foo.ts"` syntax in a temporary MDX page produces a code block with the title "foo.ts" rendered above (verifies title meta wiring through `defaultMdxComponents`).

### Banner

- [ ] `app/layout.tsx`'s `<DocsLayout>` receives a `banner` prop whose `<Banner>` content reads exactly `"Zeno is experimental. Personal project, no SLA, breaking changes expected."`.
- [ ] The banner renders on every page (`/`, `/install`, `/cli`, etc.).
- [ ] The banner has no dismiss control (no `id` prop passed, so no localStorage persistence).
- [ ] Banner background does not paint Imperial gold — gold stays reserved per [[../../conventions/design-md-format|design-md-format]] and the comment at `apps/docs/src/styles/globals.css:37`.

### CopyMarkdownUrlButton parity

- [ ] `apps/docs/src/components/copy-markdown-url-button.tsx` renders with identical visual treatment to Fumadocs's `MarkdownCopyButton` — same border color, border radius, padding (`h-8` / `px-3`), hover background, text size, icon size, and `copied`/`failed` state transition timing (2s).
- [ ] The only visible difference is the icon: `Link2` (not the clipboard glyph) in `idle` state, `Check` in `copied`, `X` in `failed`.
- [ ] The text labels are unchanged: `"Copy Markdown URL"` / `"Copied"` / `"Failed"`.
- [ ] Side-by-side screenshot of the three-button row (`[Copy Markdown] [Copy Markdown URL] [Open ▾]`) shows uniform button heights and indistinguishable hover/active states except for icon.

### Edit-on-GitHub + InlineTOC

- [ ] `app/[[...slug]]/page.tsx` passes an `editOnGithub` prop to `<DocsPage>` containing `{owner: 'ribeirogab', repo: 'zeno-agent', sha: 'main', path: 'apps/docs/content/docs/<file>'}` for the current page's source file.
- [ ] The "Edit on GitHub" link renders in the page footer area provided by Fumadocs `DocsPage`. Its `href` resolves to `https://github.com/ribeirogab/zeno-agent/blob/main/apps/docs/content/docs/<file>` (Fumadocs hardcodes `/blob/` — clicking opens the GitHub blob view with the edit pencil one click away, the standard OSS docs flow).
- [ ] `InlineTOC` is exported from `mdx-components.tsx`. No automatic insertion. A test page that imports and uses `<InlineTOC />` renders an inline table of contents.

### OG dynamic

- [ ] `apps/docs/src/app/[[...slug]]/opengraph-image.tsx` exists and returns an `ImageResponse` of size `1200×630`.
- [ ] The image content includes the page's `title` (from frontmatter) and `description` (from frontmatter) using brand fonts (Space Grotesk / Fraunces / JetBrains Mono — already self-hosted via `next/font/google` in `app/layout.tsx`).
- [ ] The image includes a Crest mark and a brand-bar element using Imperial Terminal palette (canvas `#08090F` background, gold `#d9b362` accent).
- [ ] `curl -sI http://localhost:4242/install/opengraph-image` returns `HTTP 200`, `Content-Type: image/png`.
- [ ] The `<head>` of `http://localhost:4242/install` references this per-slug OG endpoint via `og:image` and `twitter:image` (Next.js's per-route OG convention auto-wires this).
- [ ] A slug with no frontmatter `description` still produces a valid PNG — the template handles the missing field gracefully (renders only the title + brand chrome, no broken element). **Verification:** the dev-only preview route `/preview/og` includes a test page whose MDX has only a `title` field; the rendered OG response for that slug is 200 with `Content-Type: image/png`. No mutations to real content under `content/docs/`.

### Custom 404

- [ ] `apps/docs/src/app/not-found.tsx` exists and is rendered for any unknown route.
- [ ] The page contains: a `Crest` mark, the headline `"Page not found"`, a one-line factual subtitle (e.g., `"The page you requested does not exist or has been moved."`), a Fumadocs `SearchToggle` (or `SearchDialog` trigger) using the same provider context as the docs layout, and a single link back to `/` labeled `"Back to docs"`.
- [ ] No hard-coded shortcut links to `/install`, `/cli`, etc. (deliberately, to avoid rot).
- [ ] No `"oops!"` / `"😢"` / `"404"` numerals in the headline — Imperial Terminal voice is factual.
- [ ] `curl -sI http://localhost:4242/nonexistent` returns `HTTP 404`. The response body contains the literal string `"Page not found"`.

### Callout palette

- [ ] `apps/docs/src/styles/globals.css` binds three Fumadocs callout tokens: `--color-fd-success` ← `var(--color-status-active)`, `--color-fd-info` ← `var(--color-status-info)`, `--color-fd-error` ← `var(--color-status-failed)`.
- [ ] `--color-fd-warning` is NOT bound — Fumadocs's default amber/yellow stands. (See Constraints: gold is reserved.)
- [ ] In the dev preview at `http://localhost:4242/preview/callout`, four `<Callout>` instances (`info`, `warn`, `error`, `success`) render with the bound colors for `info` / `error` / `success` and the default for `warn`. Verified via `getComputedStyle(el).borderLeftColor` (or equivalent paint) matching the expected hex.
- [ ] The bindings respect Fumadocs's ID-scoped specificity rules per [[../../learnings/fumadocs-css-override-needs-id-specificity|fumadocs-css-override-needs-id-specificity]] — if any Fumadocs theme override re-defines `--color-fd-*` under `#nd-callout` or similar, the project override is scoped accordingly.

### Shiki theme

- [ ] `apps/docs/src/lib/shiki-imperial-terminal.ts` (or `.json`) exists. The shape is a valid VS Code TextMate theme that shiki can consume.
- [ ] `source.config.ts` configures `mdxOptions.rehypeCodeOptions.themes` (or equivalent shiki theme prop) to use this theme.
- [ ] The theme sets `colors.editor.background` to `#08090F` (canvas), uses `#e8eaf5` for plain text, accents keywords with `#d9b362` (gold) sparingly (e.g. `keyword.control`, `storage.type`), and renders strings in a desaturated tone that does not clash with gold.
- [ ] In the dev preview at `http://localhost:4242/preview/shiki`, five representative code blocks (TypeScript, Bash, JSON, TSX, Markdown) render with the new theme. Side-by-side screenshot against the current default theme shows the canvas color flips to `#08090F` and gold appears on at least one keyword token.
- [ ] No regression on Twoslash interaction (see below): hovering a `\`\`\`ts twoslash` line in dev mode produces a popover with type information, styled compatibly with the new theme.

### Plumbing — Mermaid, Twoslash, R2

- [ ] `source.config.ts` registers `remarkMermaid` (or equivalent) from `fumadocs-core/mdx-plugins`. A `\`\`\`mermaid graph TD; A-->B;` fence in a temporary MDX renders an SVG.
- [ ] `fumadocs-twoslash` is in `apps/docs/package.json` dependencies, and `source.config.ts` registers the twoslash shiki transformer. `\`\`\`ts twoslash` blocks in a temporary MDX render hover popovers.
- [ ] `apps/docs/open-next.config.ts` replaces `defineCloudflareConfig()` with a config that wires `incrementalCache: r2IncrementalCache` (or equivalent OpenNext-Cloudflare R2 backend).
- [ ] `apps/docs/wrangler.jsonc` declares an R2 bucket binding named `NEXT_INC_CACHE_R2_BUCKET` pointing at a created bucket (e.g. `zeno-docs-isr-cache`).
- [ ] `apps/docs/wrangler.jsonc` has exactly one `routes` key. (The file currently has a duplicate `routes` declaration at the top level — dedupe while editing for R2.)
- [ ] The R2 bucket has been created via `wrangler r2 bucket create zeno-docs-isr-cache` and the command is documented in the implementation PR description (or in a comment near the wrangler config).
- [ ] `apps/docs/wrangler.jsonc` keeps `observability.enabled: true` (already present); no removal during R2 work.
- [ ] `pnpm --filter @zeno/docs build` succeeds with the new plumbing.
- [ ] `pnpm --filter @zeno/docs deploy` succeeds end-to-end against a non-production environment, demonstrating the R2 binding resolves at runtime. (May be performed by the owner; the PR documents the test.)

### Preview routes

- [ ] `apps/docs/src/app/preview/layout.tsx` exists and gates all child routes with `if (process.env.NODE_ENV !== 'development') notFound()`.
- [ ] `app/preview/page.tsx` lists the available preview sub-routes (links to `/preview/og`, `/preview/not-found`, `/preview/callout`, `/preview/shiki`, `/preview/banner`).
- [ ] All preview sub-routes (`/preview/og`, `/preview/not-found`, `/preview/callout`, `/preview/shiki`, `/preview/banner`) render in dev mode and respond `HTTP 200`.
- [ ] In production (`pnpm --filter @zeno/docs build && pnpm --filter @zeno/docs start`), every preview route responds `HTTP 404`. Verify locally before deploy.
- [ ] After deploy to `docs.zeno-agent.dev`, `curl -sI https://docs.zeno-agent.dev/preview/og` returns `HTTP 404`. (Verified by owner post-merge.)
- [ ] Preview pages do not appear in `/sitemap.xml` or `/llms.txt`. (Verify by curl after build.)

### README correction

- [ ] `apps/docs/README.md`'s "AI-friendly endpoints" or "Setup" section no longer references Pagefind. The corrected text names Fumadocs's built-in Orama search (or equivalent factual description matching `src/app/api/search/route.ts`).
- [ ] `apps/docs/README.md`'s framework version reference matches the actual pin: `Next.js 16` (the current README says `Next.js 15`). Fix as part of the same correction commit.

### Quality gate

- [ ] `pnpm run quality-gate` exits zero with all changes in place. Specifically: `pnpm --filter @zeno/docs lint` (biome), `pnpm --filter @zeno/docs typecheck` (tsc), and `pnpm --filter @zeno/docs test` (vitest, `--passWithNoTests` is still acceptable if no new test files land).
- [ ] `pnpm install` reports no peer-dep warnings attributed to `@zeno/docs` after the new dependencies (`fumadocs-twoslash`, `mermaid`) land.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `defaultMdxComponents` from `fumadocs-ui/mdx` may not include InlineTOC or our extra exports — wiring naively could double-render some components. | Inspect `fumadocs-ui/mdx`'s actual export shape during implementation (Read the package's typings). Merge order: `{ ...defaultMdxComponents, InlineTOC, Tabs, Tab, Files, Folder, File, TypeTable, ImageZoom, ...componentsArg }`. If a default already exposes one of these by a different key, override deliberately and document the choice in the PR description. |
| Twoslash adds compile-time TypeScript checks to every `ts twoslash` block. A broken example will fail the build, not just render badly. | None of the existing MDX uses `twoslash` syntax — wiring twoslash is plumbing only. No regression risk until content authors opt in. Document the build-time error mode in the implementation PR. |
| The R2 incremental cache backend requires a pre-existing R2 bucket. Adding the wrangler binding before the bucket exists fails the next deploy with a confusing error. | Create the bucket via `wrangler r2 bucket create` as a step in the implementation tasks. Document the exact command in the PR description so an outsider can reproduce. |
| Shiki theme JSON has dozens of TextMate scopes. Forking `github-dark-default` and only changing a few colors may leave inconsistencies that show up only on specific languages (e.g. CSS pseudo-classes, JSX expressions). | Use the dev preview route (`/preview/shiki`) with five representative languages (TS, Bash, JSON, TSX, Markdown) before merging. Snapshot the screenshots in the PR description. Compare against the original `github-dark-default` for any scope where the change is unintentional. |
| Fumadocs `Banner` component may have changed its API between versions. The Banner prop on `DocsLayout` differs from the pre-v16 standalone `<Banner>` component. | Verify against the installed `fumadocs-ui@^16.8.8` typings before wiring. If the API is `banner={<Banner>...</Banner>}` (as a `ReactNode` prop on `DocsLayout`), use that. If it's `<Banner>` as a child, use that. Either way, the AC binds the rendered output (text + non-dismissible behavior), not the API shape. |
| Edit-on-GitHub URL construction depends on `page.path` returning a path relative to the MDX collection root, not the OS-absolute path. Wrong base will produce 404s on GitHub. | Helper prepends `apps/docs/content/docs/` and returns the `EditOnGitHubOptions` object Fumadocs expects. Unit-tested in `src/lib/edit-on-github.test.ts`. Fumadocs builds `https://github.com/<owner>/<repo>/blob/<sha>/<path>` from the object. Confirm on `/install` before merging. |
| Preview routes might be discovered by crawlers or appear in `sitemap.xml` despite the production gate. | The preview layout's `notFound()` short-circuits before any page renders. `sitemap.ts` already only iterates over the docs source (`source.generateParams()`), which does not include preview routes. AC explicitly verifies the absence. |
| OpenNext-Cloudflare's R2 backend API may diverge from the snippet expected here. The package's API has evolved across minor versions in 2025/2026. | Verify against the installed `@opennextjs/cloudflare@^1.19.8` (or whatever lands at install time) docs during implementation. If the integration shape differs, capture the actual config in an atomic note in `.vault/learnings/` and link the spec. |
| `process.env.NODE_ENV` semantics on Cloudflare Workers may differ from Node.js. Workers typically materialize `NODE_ENV` as `production` at build time and runtime; OpenNext-Cloudflare's behavior around this var is not formally documented. The preview-route gate relies on this distinction holding. | Verify locally by running `pnpm --filter @zeno/docs build && pnpm --filter @zeno/docs start` and confirming every `/preview/*` route returns 404 before deploying. Verify post-deploy with `curl -sI https://docs.zeno-agent.dev/preview/og`. If the gate ever fails, switch the guard to an explicit env var (e.g. `process.env.ZENO_DOCS_PREVIEW === '1'`) injected only in dev. |
| OG image generation at edge can hit `ImageResponse` font-loading quirks on Workers (no FS, no remote font fetch at runtime unless explicitly allowed). | Use the same `next/font/google` fonts that `layout.tsx` already imports — they're build-time inlined and `ImageResponse` can read them via the Next.js convention. If the runtime can't resolve them, fall back to system fonts and document the deviation. |
| `getComputedStyle` checks on Callout token colors may pass in tests but fail visually if Fumadocs renders the callout via a CSS pseudo-element or background-image gradient that does not respect the `--color-fd-*` variable. | The preview route is the primary verification surface. Visual diff (screenshot in PR) is acceptance, not just a computed-style check. |

## Open Questions

None at spec time. Q1–Q10 resolved every decision the owner needed to make; remaining items are implementation details documented in [[plan-docs-ui-polish]].
