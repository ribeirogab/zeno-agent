# @zeno/docs

Outsider-facing documentation site for Zeno. Built with Fumadocs (Next.js 16 + MDX) and Fumadocs's built-in Orama search (served at `/api/search`).

> **Status:** scaffold only. Real content lands in a future spec; see `vault/specs/2026-05-07-apps-docs-scaffold/spec.md`.

## Run locally

```bash
pnpm --filter @zeno/docs dev
```

Open http://localhost:4242.

## Build

```bash
pnpm --filter @zeno/docs build
```

## AI-friendly endpoints

- `/llms.txt` — page sitemap in markdown
- `/llms-full.txt` — full corpus in markdown
- `/llms.mdx/<slug>` — raw MDX of a single page
