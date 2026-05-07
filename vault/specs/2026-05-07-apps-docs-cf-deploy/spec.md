---
status: draft
feature: apps-docs-cf-deploy
created: 2026-05-07
shipped: null
---
# Apps/Docs — Cloudflare Workers Deploy — Spec

**Status:** Draft
**Scope:** Wire `apps/docs` to deploy to Cloudflare Workers via `@opennextjs/cloudflare`, with a GitHub Action that publishes on push to `main` whenever `apps/docs/**` changes. First deploy lands at `zeno-docs.<account>.workers.dev`; custom domain (`docs.zeno.dev` or similar) is deferred until the maintainer registers the domain.

## Context

PR #19 shipped the `apps/docs` Fumadocs scaffold (spec [[../2026-05-07-apps-docs-scaffold/spec]]) but the spec deliberately deferred hosting. The maintainer now wants the docs reachable from the public internet so outsiders can hit `/`, `/hello`, `/configuration`, `/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>`, and the in-page search. The site has dynamic route handlers (`/api/search`, `/llms.mdx/[[...slug]]`) and a Next.js 16 server runtime, so a static-only host (GitHub Pages) is disqualified.

Cloudflare Workers + `@opennextjs/cloudflare` is the recommended path:

- Free tier is generous (100k req/day, no commercial-use cap, unlimited bandwidth) and matches Zeno's self-hosted ethos better than Vercel's hobby plan.
- OpenNext is the actively maintained adapter (`@cloudflare/next-on-pages` is deprecated).
- Workers + Static Assets handles SSR, route handlers, and `/api/*` natively.
- Edge global by default — outsiders far from `us-east-1` get a fast docs site.

## Problem Statement

`apps/docs` builds locally (verified by PR #19) but has no deploy target. Without a hosting recipe checked into the repo, every contributor would have to re-derive the OpenNext + Wrangler config; the docs would stay invisible to the audience they were built for.

## Non-Goals

- **Custom domain.** The maintainer hasn't registered `zeno.dev` (or any docs domain) yet. First deploy stays at `zeno-docs.<account-subdomain>.workers.dev`. Custom domain wiring is a one-paragraph follow-up once a domain exists.
- **Per-PR preview deployments.** Workers supports `--preview` uploads but the GitHub Action ships only a `main → production` flow today. Add preview later if review velocity demands it.
- **R2-backed incremental cache.** OpenNext supports R2 + KV for on-demand cache; the MVP uses the default in-memory cache. Re-evaluate when first cold-start latency becomes annoying.
- **Custom OpenNext middleware / image optimization tuning.** Default config covers the placeholder content; revisit when real content lands.
- **Pages-based deploy.** `apps/docs` ships only the Workers path. Cloudflare's docs explicitly flag Workers as the modern recommendation for new Next.js apps.
- **Multi-environment (staging/production).** One environment, one deploy target. Branch-based environments add ops weight without payoff for a single-operator project.

## Constraints

- **Adapter pinned to `@opennextjs/cloudflare@^1.19.8`** — first version to support `next@16.2.5+`. Wrangler peer is `^4.86.0`; install both as devDependencies on `apps/docs`.
- **Workers compatibility flags** — `nodejs_compat` is required by OpenNext's runtime. `compatibility_date` pinned to a recent date (2025-03-01 or later) to enable modern Workers APIs.
- **Account ID committed in `wrangler.jsonc`.** Account IDs are not secret (visible to anyone with the URL); committing avoids needing to rebuild local config from secrets.
- **API token in repo secret.** `CLOUDFLARE_API_TOKEN` is set via `gh secret set` and consumed by the GitHub Action only. Never echoed in logs.
- **Quality gate stays green.** New devDeps don't break `pnpm run quality-gate`; the deploy workflow runs in CI but doesn't gate `pnpm run quality-gate` (still local + manual).
- **Node 24 LTS in CI** — matches the engine pin in root `package.json`.
- **Concurrency lock on the workflow.** Only one deploy runs at a time for `apps/docs`.

## User Stories / Scenarios

1. **Outsider visits the docs.** Anyone hits `https://zeno-docs.<account>.workers.dev/` and lands on the Welcome page. Sidebar, search, page actions, and `/llms.txt` all work as they do locally.
2. **Maintainer ships a content change.** Maintainer edits `apps/docs/content/docs/welcome.mdx`, opens a PR, merges it. The GitHub Action runs OpenNext build + `wrangler deploy` and the change is live within ~3 minutes of merge.
3. **AI agent fetches the corpus.** External agent fetches `https://zeno-docs.<account>.workers.dev/llms-full.txt` and gets the full markdown corpus.
4. **Quality gate ignores hosting changes.** Pure quality-gate-only changes (like `pnpm run quality-gate` local edits) don't trigger deploy because the path filter is `apps/docs/**` + workflow file + lockfile.

## Acceptance Criteria

Each item is a binary check verifiable in under a minute by someone other than the implementer.

- [ ] `apps/docs/wrangler.jsonc` exists with `name: "zeno-docs"`, `main: ".open-next/worker.js"`, `compatibility_flags` containing `"nodejs_compat"`, and the maintainer's account ID.
- [ ] `apps/docs/open-next.config.ts` exists and exports `defineCloudflareConfig()` (default config, no custom incremental cache).
- [ ] `apps/docs/.gitignore` excludes `.open-next/` (build artifact) and `.dev.vars` (local secrets).
- [ ] `apps/docs/package.json` declares `@opennextjs/cloudflare` and `wrangler` as devDependencies pinned to versions compatible with `next@16.2.6` and adds `deploy` + `preview` scripts that delegate to `opennextjs-cloudflare`.
- [ ] `pnpm install` from a clean repo resolves without `@zeno/docs`-attributed peer warnings.
- [ ] `pnpm --filter @zeno/docs exec opennextjs-cloudflare build` exits zero locally and produces `.open-next/worker.js` + `.open-next/assets/`.
- [ ] `.github/workflows/deploy-docs.yml` exists with: trigger on push to `main` filtered to `apps/docs/**` plus lockfile + workflow file; `workflow_dispatch` for manual runs; concurrency group `deploy-docs` with `cancel-in-progress: false`; build + deploy step using `@opennextjs/cloudflare deploy` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` env vars sourced from repo secrets.
- [ ] `gh secret list` shows `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (already set in this session before the spec landed).
- [ ] After merge, the deploy workflow finishes successfully (green check on `main`).
- [ ] `curl -s https://zeno-docs.<account>.workers.dev/` returns HTTP 200 and the Welcome page HTML.
- [ ] `curl -s https://zeno-docs.<account>.workers.dev/llms.txt` returns the same `# Zeno` markdown that `curl -s http://localhost:4242/llms.txt` does locally.
- [ ] `curl -s 'https://zeno-docs.<account>.workers.dev/api/search?query=SUPERCALIFRAGILISTIC'` returns the `/configuration` page in `hits`.
- [ ] No real identifiers (maintainer email, real names, etc.) appear in `wrangler.jsonc`, the workflow, or any committed file. Account ID is the only Cloudflare identifier shipped.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `opennextjs-cloudflare` build fails on first attempt because `.source/` (Fumadocs MDX cache) isn't materialized in CI. | The existing `postinstall` script in `apps/docs/package.json` runs `fumadocs-mdx` after `pnpm install`, so `.source/` is present before OpenNext invokes Next.js build. Verified by the existing scaffold workflow. |
| Workers free tier exhausts under unexpected traffic. | 100k req/day is the free cap. Docs site is low-traffic by definition; cap is unlikely to bind. If it does, the upgrade ($5/mo) is trivial; alternatively, gate by IP or move to a static export. |
| Account ID committed in `wrangler.jsonc` is mistaken for a secret. | Cloudflare's docs explicitly state account IDs are not sensitive. Add an inline comment in `wrangler.jsonc` so future contributors don't try to "fix" it by moving it to a secret. |
| GitHub Action runs on every push to `main`, slowing unrelated PRs. | `paths` filter limits triggers to `apps/docs/**`, `pnpm-lock.yaml`, and the workflow file itself. Touch elsewhere → no deploy. |
| Two deploys collide if a content fix is merged while the previous one is still building. | `concurrency.group: deploy-docs` with `cancel-in-progress: false` queues runs serially. |
| OpenNext's default in-memory cache is empty on every cold start, causing a 1–2s first-paint hit globally. | Acceptable for the MVP. R2-backed incremental cache is a follow-up. |
| Repo-level `CLOUDFLARE_API_TOKEN` leaks via a malicious workflow. | Token scope is "Edit Cloudflare Workers" — narrow but still account-wide. Recommend rotating after first verified deploy. Mark this in the PR description. |

## Open Questions

None at spec time. Domain decision was made (no domain yet → default `workers.dev`); preview deployments deferred; cache strategy deferred.
