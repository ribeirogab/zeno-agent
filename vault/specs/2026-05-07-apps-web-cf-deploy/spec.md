---
status: draft
feature: apps-web-cf-deploy
created: 2026-05-07
shipped: null
shipped_url: null
---
# Apps/Web — Cloudflare Workers Deploy — Spec

**Status:** Draft
**Scope:** Wire `apps/web` (the Vite static landing shipped in PR #25) to deploy to Cloudflare Workers via Workers Static Assets, bound to the custom domain `zeno-agent.dev` (apex + `www`). First production URL is `https://zeno-agent.dev/`. A GitHub Action publishes on push to `main` whenever `apps/web/**` changes.

## Context

PR #25 shipped the `apps/web` Vite + React 19 + Tailwind 4 landing (spec [[../2026-05-07-apps-web-landing/spec]]) with the SEO meta tags hardcoded to `https://zeno-agent.dev`. The site is local-only today (`pnpm --filter @zeno/web dev` on port 3000). This spec puts the same `dist/` bundle on the public internet.

The project already shipped a Cloudflare Workers deploy for `apps/docs` (spec [[../2026-05-07-apps-docs-cf-deploy/spec]], workflow `.github/workflows/deploy-docs.yml`, live at `https://zeno-docs.57vjct26wg.workers.dev`). This spec mirrors that pattern at the workflow / config level but **does not use OpenNext**: `apps/web` is a fully static Vite build with no Next.js runtime, no SSR, no API routes. Cloudflare Workers Static Assets serves the `dist/` directory directly via the asset binding — no `worker.js` main entry needed, no edge runtime, no incremental cache.

The Cloudflare account, the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are already wired into the repo (per the docs cf-deploy spec). This spec reuses them.

## Problem Statement

`apps/web` builds (`pnpm --filter @zeno/web build`) but has no deploy target. The README and the SEO meta declare a public-facing project but every visitor today has to clone the repo and run the dev server — defeating the entire reason `apps/web` exists. Without a hosted target, the OG card scraper Twitter / Slack / Discord uses won't be able to fetch the OG image; canonical/og:url point at `zeno-agent.dev` and that domain currently serves nothing.

## Non-Goals

- **Apex-only canonical / www → apex 301 redirect.** Both `zeno-agent.dev` and `www.zeno-agent.dev` are bound to the same Worker as custom domains, so both serve the landing directly. The `<link rel="canonical" href="https://zeno-agent.dev/" />` in `apps/web/index.html` tells crawlers which one is canonical; an explicit `www → apex` 301 (via Cloudflare Bulk Redirect or a small redirect Worker) is a follow-up if SEO ever cares.
- **Per-PR preview deployments.** Workers supports `--preview` uploads but the workflow ships only a `main → production` flow today.
- **Server-side runtime / Workers Functions.** `apps/web` is static. If a route handler is ever needed (form submission, OAuth callback, etc.) the spec is amended; not now.
- **Pages-based deploy.** Workers Static Assets is the modern recommendation; `apps/docs` already uses Workers, so `apps/web` matches.
- **OpenNext / `@opennextjs/cloudflare`.** Vite is not Next.js. Static Assets binding is sufficient.
- **R2 / KV bindings.** No backend, no caching layer needed.
- **Multi-environment (staging / production).** One environment, one deploy target.

## Constraints

- **Wrangler pinned to `^4.86.0`** — same version `apps/docs` uses; safe matrix.
- **Workers compatibility flags.** No `nodejs_compat` (no Node runtime needed for static), but the Worker still needs a `compatibility_date` for the auto-injected static-asset Worker. Pin to `2025-03-01` (same as docs).
- **Account ID committed** in `wrangler.jsonc`. Cloudflare account IDs are public; same rationale as the docs spec.
- **API token in repo secret.** `CLOUDFLARE_API_TOKEN` reused from the docs deploy. Already set.
- **Quality gate stays green.** New devDep (`wrangler`) does not affect `pnpm run quality-gate` outcomes.
- **Node 24 LTS in CI** — matches root engine pin.
- **Concurrency lock on the workflow.** Only one deploy runs at a time for `apps/web` (group `deploy-web`, `cancel-in-progress: false`).
- **SPA fallback.** The landing is single-page; unmatched paths return `index.html` (`assets.not_found_handling: "single-page-application"`).

## User Stories / Scenarios

1. **Outsider visits the landing.** Anyone hits `https://zeno-web.<account>.workers.dev/` and lands on the Zeno hero (crest + Fraunces wordmark + atmospheric particles). Quick Start, How it works, CTA tiles, and footer all render as they do locally.
2. **OG scraper fetches the card.** Slack / Twitter / LinkedIn previews of the URL show the gold-on-dark OG image via `og:image` (1200×630 PNG) and the page title.
3. **Maintainer ships a copy or visual change.** Maintainer edits a section component in `apps/web/src/sections/`, opens a PR, merges. The deploy workflow runs `pnpm --filter @zeno/web build` + `wrangler deploy` and the change is live within ~2 minutes of merge.
4. **Quality gate ignores hosting changes.** Pure quality-gate edits don't trigger the web deploy because the path filter is `apps/web/**` + the lockfile + the workflow file.

## Acceptance Criteria

Each item is a binary check verifiable in under a minute by someone other than the implementer.

- [ ] `apps/web/wrangler.jsonc` exists with `name: "zeno-web"`, the maintainer's account ID, `compatibility_date: "2025-03-01"`, an `assets` block pointing at `dist` with `not_found_handling: "single-page-application"`, and a `routes` array binding both `zeno-agent.dev` and `www.zeno-agent.dev` as `custom_domain: true`.
- [ ] `apps/web/.gitignore` excludes `.wrangler/` and `.dev.vars`.
- [ ] `apps/web/package.json` declares `wrangler@^4.86.0` as a devDependency and adds `preview:cf` and `deploy` scripts that run `pnpm run build` then a `wrangler` command.
- [ ] `pnpm install` from a clean repo resolves with no new peer warnings attributable to `@zeno/web`.
- [ ] `pnpm --filter @zeno/web build` exits 0 and produces `apps/web/dist/index.html` plus hashed JS/CSS bundles plus the static assets in `apps/web/public/` (favicon, og-image, robots.txt, sitemap.xml).
- [ ] `pnpm --filter @zeno/web exec wrangler deploy --dry-run` exits 0 against the local `dist/` (smoke-validates the wrangler config without uploading).
- [ ] `.github/workflows/deploy-web.yml` exists with: trigger on push to `main` filtered to `apps/web/**` plus lockfile + workflow file; `workflow_dispatch` for manual runs; concurrency group `deploy-web` with `cancel-in-progress: false`; build + deploy step using `wrangler deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` env vars sourced from repo secrets.
- [ ] `gh secret list` shows `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (already set; no new secret added).
- [ ] After merge, the deploy workflow finishes successfully (green check on `main`).
- [ ] `curl -sI https://zeno-agent.dev/` returns `HTTP/2 200` with a valid TLS cert (no `--insecure` flag needed).
- [ ] `curl -sI https://www.zeno-agent.dev/` returns `HTTP/2 200`.
- [ ] `curl -s https://zeno-agent.dev/` returns HTML containing the substring `Zeno — Personal agent that gets the work done`.
- [ ] `curl -sI https://zeno-agent.dev/og-image.png` returns HTTP 200 and `Content-Type: image/png`.
- [ ] `curl -sI https://zeno-agent.dev/favicon.svg` returns HTTP 200 and `Content-Type: image/svg+xml`.
- [ ] The Cloudflare dashboard shows both `zeno-agent.dev` and `www.zeno-agent.dev` as **Active** custom domains on the `zeno-web` Worker, with TLS cert provisioned.
- [ ] No real identifiers (maintainer email, real names, etc.) appear in `wrangler.jsonc`, the workflow, or any committed file. Account ID is the only Cloudflare identifier shipped.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `wrangler deploy --dry-run` succeeds locally but the real deploy fails because of a permission scoping difference between the local CLI session and the CI token. | The repo's existing `CLOUDFLARE_API_TOKEN` already deploys `apps/docs` successfully — same scope works for `apps/web` since both target the same account. Verified empirically by re-running the docs deploy. |
| Workers free tier exhausts under unexpected traffic on the landing. | 100k req/day free cap; the landing is single-page static — even a viral spike serves the same cached `dist/` quickly. Cloudflare's edge cache absorbs most repeat hits. Upgrade is $5/mo if it ever binds. |
| Account ID committed in `wrangler.jsonc` is mistaken for a secret. | Inline comment matching the one in `apps/docs/wrangler.jsonc`. |
| GitHub Action runs on every push to `main`, slowing unrelated PRs. | `paths` filter limits triggers to `apps/web/**`, `pnpm-lock.yaml`, and the workflow file itself. |
| Two deploys collide. | `concurrency.group: deploy-web` + `cancel-in-progress: false`. |
| SPA fallback masks legitimate 404s for assets. | `not_found_handling: "single-page-application"` falls back to `index.html` only when no asset matches; static asset paths (`/og-image.png`, `/favicon.svg`, etc.) resolve normally. Verified by AC. |
| Repo-level `CLOUDFLARE_API_TOKEN` leaks. | Already in scope from the docs spec; recommendation to rotate after first verified web deploy if not already rotated post-docs. |
| `apps/web/dist/` was added to `.gitignore` by Phase 1 of the landing spec. CI must build before deploy, not rely on a committed `dist/`. | The deploy workflow runs `pnpm install` then `pnpm run deploy` (which itself runs `pnpm run build` first). The `dist/` is generated in CI on every deploy. |
| First custom-domain bind takes a few minutes (Cloudflare provisions DNS + TLS). The first deploy may show `525 SSL handshake failed` or `522 Connection timed out` for ~3–10 minutes after the initial publish before the cert is live. | Expected one-time delay. The AC is verified once both domains report **Active** in the Cloudflare dashboard and `curl -sI` returns 200 cleanly without TLS errors. Subsequent deploys reuse the existing bind. |
| The Worker is bound to `zeno-agent.dev` and `www.zeno-agent.dev`, but the apex DNS may already have legacy records from the registrar's parking page. | The zone is freshly purchased and lives in the same Cloudflare account — `wrangler deploy` with `custom_domain: true` will overwrite the parked `A`/`CNAME` records to point at the Worker. If a legacy record blocks the bind, `wrangler` returns an error explicitly; resolve by deleting the conflicting record from the Cloudflare DNS UI and re-running deploy. |

## Open Questions

None at spec time. Domain decision is made (no domain registered yet → default `*.workers.dev`); preview deployments deferred; cache strategy not applicable for static.

## Workflow contract

This spec follows the project's lightweight deploy-spec pattern (mirroring `apps-docs-cf-deploy`):

1. Spec approved (this document).
2. Implementation lands in one PR with: `wrangler.jsonc`, `.gitignore` update, `package.json` script + devDep, `deploy-web.yml` workflow.
3. Local verification: `pnpm install`, `pnpm --filter @zeno/web build`, `pnpm --filter @zeno/web exec wrangler deploy --dry-run`. All zero-exit.
4. PR opens; on merge, the workflow runs and produces the production URL.
5. The shipped URL is recorded in the spec frontmatter (`shipped_url`) and the post-spec reflection step generates a learning if anything non-obvious surfaced.
