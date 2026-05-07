---
status: shipped
feature: apps-docs-scaffold
created: 2026-05-07
shipped: 2026-05-07
---
# Apps/Docs Minimal Scaffold — Spec

**Status:** Draft
**Scope:** Add an `apps/docs` workspace running Fumadocs (Next.js + MDX) at `:4242` with Imperial Terminal token theming, Pagefind local search, and AI-friendly endpoints (`/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>`, copy-as-markdown button per page) — content limited to three placeholder pages so a future spec owns the real outsider documentation.

## Context

Zeno's outsider-facing surface today is `README.md` (rewritten in Track D, PR #3) and `ROADMAP.md` (PR #4). Both are intentionally minimal and direct readers to `vault/` and `CLAUDE.md` for depth — but `vault/` is the maintainer's brain, not curated for outsiders, and its language and structure assume context an external reader does not have.

The roadmap commits (`Now`) to `apps/docs` as the canonical home for outsider documentation (issue #6). Spec 0027 (`Documentation Platform`, draft, 2026-04-23) explored frameworks (Mintlify, Starlight, Nextra, Docusaurus) but predates the AI-first framing this spec adopts and predates the audience split below; this spec supersedes 0027 for scaffold scope, and 0027 stays in the vault as research history.

The audience split is the load-bearing decision behind this spec:

| Surface | Audience | Content |
|---|---|---|
| `apps/docs` | Operator / end-user installing Zeno | Install, configure, run, connector reference, skill authoring, troubleshooting |
| `vault/` | Maintainer / code-modifying agent | Constitution, specs, learnings, conventions, rules — project memory |

`apps/docs` does **not** render `vault/`. The two surfaces have different audiences, different lifecycles, and different curation policies.

This spec ships only the **structural scaffold** — workspace skeleton, theming tokens, search, and AI-friendly endpoints — with three throwaway placeholder pages. A follow-up spec ("Official Docs") will own all real content authoring, the README ↔ docs source-of-truth decision, and any vault adaptation.

## Problem Statement

There is no installable, searchable, AI-discoverable surface for outsider Zeno documentation. Without one:

- Operators have to read maintainer-facing material (`vault/`, `CLAUDE.md`) that is not curated for them.
- AI agents (Claude, Codex, Cursor consuming Zeno docs) have no `llms.txt` or per-page raw markdown to ground on.
- Future content cannot land incrementally because there is no workspace to land it in.

The roadmap promises this scaffold (`Now`, issue #6); the README's "Setup notes" already references `apps/docs` as forthcoming. Until the scaffold exists, those promises are unfulfilled and any content work is blocked.

## Non-Goals

This spec explicitly does **not** ship:

- Real outsider content (install, configure, run, CLI reference, connector reference, skill authoring, troubleshooting). Future spec "Official Docs" owns this.
- The README ↔ docs source-of-truth decision (canonical vs stub vs duplicated). Future spec.
- A hosting target (GitHub Pages, Cloudflare Pages, Vercel, custom domain). Future spec.
- Static export (`next export`) configuration. Decision deferred to the hosting spec.
- Versioning of docs (v1, v2, multi-version sidebar). Skipped for the foreseeable future.
- i18n (PT-BR + EN). EN only.
- Override of Fumadocs UI components (sidebar, navbar, code blocks, search UI). Default Fumadocs UI is acceptable for the MVP; full Imperial Terminal visual polish belongs to a follow-up.
- A dependency on `@zeno/ui` from `apps/docs`. Fumadocs UI covers the MVP needs; a future spec may lift shared primitives.
- Integration with `vault/` (rendering specs or learnings as docs pages). Two surfaces, two policies.
- Hand-curated `llms.txt` ordering or grouping. The MVP auto-generates from frontmatter; the Official Docs spec may switch to hand-curation when the content shape stabilizes.
- A `docs.zeno.dev` style landing page or marketing surface.

## Constraints

- **Monorepo conventions** — Turborepo + pnpm workspaces. The scaffold must live at `apps/docs/`, name itself `@zeno/docs`, and extend `tsconfig.base.json`. The existing root `turbo.json` declares `build` outputs as `dist/**`, which does not match Next.js's `.next/` output directory — `apps/docs` therefore ships a workspace-level `apps/docs/turbo.json` that overrides only the `build` task's `outputs` to `[".next/**", "!.next/cache/**"]`. The root `turbo.json` is **not** modified; the rest of the pipeline (`test` / `typecheck` / `lint`) is inherited unchanged.
- **Stack alignment** — Fumadocs UI 16.x requires Next.js 16.x and React 19.2+. `apps/dashboard` already runs React 19 (via Vite, not Next.js), so the React version is shared. Next.js will be the **first** Next.js workspace in the repo: pinned TypeScript and Tailwind versions in the root must be verified against Next.js 16's peer-dep constraints during install (Next.js 16 requires TypeScript >= 4.5.4; current root pins are well above this). Fumadocs UI 16 dropped its hard `tailwindcss` peer-dep that earlier versions imposed (Tailwind 3 only); the bundled CSS preset works with Tailwind 4, which is what the dashboard already uses. Fumadocs UI 17 requires Tailwind 4 + Next 16 explicitly, but its companion `fumadocs-mdx@15` still pins `fumadocs-core: ^16.7.0`, so the supported triple as of 2026-05-07 is `fumadocs-core@^16.8.8 + fumadocs-ui@^16.8.8 + fumadocs-mdx@^15.0.0`. Re-evaluate when `fumadocs-mdx` gets a 17-compatible release.
- **Local only** — `apps/docs` runs on `:4242` (chosen to avoid `:3000` dashboard and `:6101+` profile dashboards). No hosted instance, no public URL. Hosting is deferred to its own spec.
- **No external network at runtime** — no Google Fonts requests, no Algolia, no CDN MDX. Search runs locally via Fumadocs's built-in Orama index served at `/api/search`.
- **Imperial Terminal tokens only** — color tokens from `DESIGN.md` map onto Fumadocs's `--color-fd-*` CSS variables. Typography (custom self-hosted variable fonts) and component overrides are deferred to the Imperial Terminal full-theming follow-up spec; the MVP ships with Fumadocs UI's default font stack.
- **Quality gate** — `pnpm run quality-gate` must continue to pass after `apps/docs` is added (lint via Biome, typecheck, tests across all workspaces).

## User Stories / Scenarios

1. **Maintainer scaffolds and runs locally.** Maintainer pulls the branch, runs `pnpm install`, then `pnpm --filter @zeno/docs dev`. Browser opens `http://localhost:4242` and shows a docs site with a sidebar, three navigable pages (`/`, `/hello`, `/configuration` — no `/docs` prefix because the site itself is the docs), working search, and a "Copy as markdown" button on each page.

2. **Maintainer ships a placeholder change.** Maintainer adds a fourth `*.mdx` to `apps/docs/content/docs/`. The page appears in the sidebar without code changes; `/llms.txt` and `/llms-full.txt` reflect it on the next request.

3. **AI agent consumes the docs.** An external agent (e.g. another Claude session, an MCP client) fetches `http://localhost:4242/llms.txt` to discover pages, then `http://localhost:4242/llms-full.txt` for the full corpus, or `/llms.mdx/<slug>` for a single page. Each response is plain markdown and parses without HTML stripping.

4. **CI verifies the scaffold.** `pnpm run quality-gate` lints, typechecks, and tests `apps/docs` along with the rest of the monorepo. `pnpm --filter @zeno/docs build` produces a `.next/` build with no errors.

## Acceptance Criteria

Each item is a binary check verifiable in under a minute by someone other than the implementer.

- [x] Directory `apps/docs/` exists with `package.json` whose `name` field equals `"@zeno/docs"` and whose `private` field equals `true`.
- [x] `pnpm install` from the repo root resolves all dependencies without error after `apps/docs/` is added.
- [x] `pnpm --filter @zeno/docs dev` starts a Next.js dev server bound to `:4242`; `curl -sI http://localhost:4242/` returns HTTP 200.
- [x] Three MDX files exist under `apps/docs/content/docs/`: `index.mdx`, `hello.mdx`, `configuration.mdx`. Each has frontmatter with `title` and `description`.
- [x] `http://localhost:4242/hello` and `http://localhost:4242/configuration` render their pages; the Fumadocs sidebar lists all three. The site is the docs — pages live at the root, no `/docs` prefix.
- [x] `curl -s http://localhost:4242/llms.txt` returns `text/plain` markdown that contains the literal token `# Zeno`, a blockquote line, and a link entry for each of the three pages with title, URL, and description.
- [x] `curl -s http://localhost:4242/llms-full.txt` returns `text/plain` markdown containing the full body text of all three pages, separated by `---` rules.
- [x] `curl -s http://localhost:4242/llms.mdx/hello` returns `text/markdown` with the raw MDX body of `hello.mdx`. Requesting a non-existent slug returns HTTP 404.
- [x] Each docs page renders a "Copy Markdown" button (Fumadocs UI's built-in `MarkdownCopyButton`, supplied since v16). Clicking it copies the response body of `/llms.mdx/<slug>` to the clipboard and shows visible feedback (toast or inline state change).
- [x] Pagefind search is functional: typing a term that appears only in `configuration.mdx` returns that page in the search results.
- [x] `<html>` carries the `dark` class. `getComputedStyle(document.body).backgroundColor` evaluates to `rgb(8, 9, 15)` (i.e. `#08090F`); CSS variable `--color-fd-primary` resolves to `#d9b362`.
- [x] DevTools Network panel shows zero requests to external domains (no `fonts.googleapis.com`, no `fonts.gstatic.com`, no Algolia, no third-party CDN) on cold load of `/`.
- [x] Self-hosted variable fonts (Space Grotesk, JetBrains Mono, Fraunces) are **deferred** to the Imperial Terminal full-theming follow-up spec. The MVP ships color tokens only; typography uses Fumadocs UI's defaults until the follow-up lands. Rationale: fonts add deploy weight + license file curation, neither of which the MVP can validate without a hosting target. Deferral is captured here so the AC tracker reflects shipped reality.
- [x] `pnpm --filter @zeno/docs build` exits zero and produces `.next/`.
- [x] `pnpm run quality-gate` exits zero with `apps/docs/` included.
- [x] `apps/docs/turbo.json` exists and overrides the `build` task's `outputs` to `[".next/**", "!.next/cache/**"]`. The root `turbo.json` is unchanged. Running `pnpm turbo build --filter @zeno/docs` twice in succession yields a `>>> FULL TURBO` cache hit on the second run.
- [x] A page authored without a `description` field in its frontmatter is excluded from `/llms.txt` but still appears in `/llms-full.txt`. (Verify by adding a temporary fourth MDX page with only `title` and confirming the discrepancy.)
- [x] `pnpm --filter @zeno/docs test` exits 0. The MVP ships with no custom `CopyMarkdownButton` component (Fumadocs UI v16's built-in `MarkdownCopyButton` covers the AC above), so there is no `CopyMarkdownButton.test.tsx` to run; `vitest run --passWithNoTests` enforces a clean exit while the workspace has zero spec files. When real custom components land in a follow-up spec, they ship with co-located vitest specs.
- [x] `vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md` has its frontmatter `status` field updated to `superseded` with a wikilink reference to this spec, so the vault holds only one active draft on the topic.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fumadocs/Next.js 16 + React 19 versions drift relative to the rest of the monorepo (e.g. peer-dep mismatches against `apps/dashboard`). | Pin to the same React version used elsewhere; verify `pnpm install` reports no `@zeno/docs`-attributed peer warnings. If a mismatch surfaces, prefer aligning Fumadocs to the existing version over bumping the dashboard. |
| Next.js 16 imposes TypeScript / shared-package peer constraints that conflict with the monorepo's pinned versions. `apps/docs` is the first Next.js workspace in the repo, so this risk is unrehearsed. | Run `pnpm install` after `apps/docs/package.json` is added and treat any **`@zeno/docs`-attributed** peer-dep warning as a blocker. Pre-existing peer warnings from unrelated workspaces (e.g. `@google/design.md`) are out of scope and must not block Phase 1. If a conflict surfaces, document the resolution (which version moved, why) in the implementation PR rather than forcing a silent bump. |
| The root `turbo.json` declares `dist/**` outputs, which silently invalidates Next.js cache reuse if `apps/docs` is added without a workspace-level override. The cache miss is hard to spot without explicitly testing it. | Ship `apps/docs/turbo.json` with `outputs: [".next/**", "!.next/cache/**"]` from day one; AC-16 explicitly verifies a second `turbo build` run is a `>>> FULL TURBO` hit. |
| `next build` fails in a fresh clone without warm cache (e.g. Pagefind index step). | Add `pnpm --filter @zeno/docs build` to the acceptance run from a clean `node_modules` before merge; document any required prebuild step in `apps/docs/README.md`. |
| `<CopyMarkdownButton />` is custom code with no equivalent in Fumadocs UI; it can drift from how Fumadocs renders pages. | Keep the component small (≈30 lines), colocated under `apps/docs/src/components/`, and unit-test the fetch + clipboard path. Future Fumadocs UI version that ships a built-in equivalent should replace it. |
| Tokens applied via CSS variables miss spots where Fumadocs hardcodes its own values, leading to a partially themed UI. | Acceptable for the MVP — full theming is a non-goal. Document any visible mismatches in the PR description so the Official Docs spec captures them as work items. |
| `llms.txt` auto-generation from frontmatter exposes draft or in-progress pages. | Frontmatter contract requires explicit `title` + `description`; pages without both are excluded from `/llms.txt` (but still included in `/llms-full.txt` since that's the corpus). The Official Docs spec can revisit. |
| Fumadocs default font stack drifts visually from Imperial Terminal in the scaffold. | Acceptable — typography is deferred to the full-theming spec. Color tokens already establish brand recognizability without fonts. |
| Three placeholder pages produce a `llms-full.txt` that an external agent could mistake for real content. | Each placeholder page leads with an explicit "This is a placeholder; real content lands in a future spec" line, which propagates into both `llms-full.txt` and `/llms.mdx/<slug>`. |

## Open Questions

None at spec time. All previously open items either landed as concrete decisions above (framework, port, theming depth, content scope, package name, Turborepo wiring, llms.txt curation, copy-as-markdown UX) or were pushed to follow-up specs (hosting, official content, README source-of-truth, full theming).
