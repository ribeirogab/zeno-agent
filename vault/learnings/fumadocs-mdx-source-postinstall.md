---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-07-apps-docs-scaffold/spec]]"
created: 2026-05-07
---
# `fumadocs-mdx` needs a `postinstall` hook to materialize `.source/`

Fumadocs's MDX adapter does not eagerly generate the `.source/` directory that `lib/source.ts` imports — it must be materialized by running the `fumadocs-mdx` CLI. Without it, `pnpm install` followed by `pnpm dev` (or `pnpm build`) fails because the runtime tries to import `../../.source/server` and the file does not exist. The fix is package-managed: add `postinstall`, `predev`, and `prebuild` scripts that run the CLI.

## Context

While bringing up `apps/docs` (PR #19 / spec [[../specs/2026-05-07-apps-docs-scaffold/spec]]), `pnpm dev` failed at module resolution time because `apps/docs/.source/` was empty. Running `pnpm exec fumadocs-mdx` once produced `.source/{server,browser,dynamic}.ts` and `.source/source.config.mjs`, after which the dev server boots fine. The official Fumadocs starter ships the same hook, so this is the expected setup — just not surfaced anywhere visible until you trip on it.

## How It Works

The `fumadocs-mdx` package ships a CLI under `bin: { "fumadocs-mdx": "./dist/bin.mjs" }` that calls `postInstall` from either the Next or Vite adapter, depending on which framework's config it detects in the workspace. The Next adapter scans `content/docs/` against the collection defined in `source.config.ts`, then emits TypeScript files under `.source/`:

- `.source/server.ts` — server-only export `docs` (top-level await over `create.docs(...)`); has `// @ts-nocheck` because the inferred type leaks zod internals.
- `.source/browser.ts` — client-side `default` export.
- `.source/dynamic.ts` — environment-aware loader with the same data, used by Fumadocs's `dynamic` runtime.
- `.source/source.config.mjs` — compiled snapshot of the workspace's `source.config.ts`.

Recommended package.json wiring:

```json
{
  "scripts": {
    "dev": "next dev -p 4242",
    "build": "next build",
    "start": "next start -p 4242",
    "test": "vitest run --passWithNoTests",
    "clean": "rm -rf .next .source",
    "postinstall": "fumadocs-mdx",
    "predev": "fumadocs-mdx",
    "prebuild": "fumadocs-mdx"
  }
}
```

`predev`/`prebuild` are belt-and-suspenders — they cover the case where someone wipes `.source/` between installs (e.g., the workspace `clean` script, or the editor deleting it).

`.source/` and `.next/` should both live in a workspace `.gitignore`; they are throwaway build artifacts.

## How to Apply

- Any Next.js workspace consuming `fumadocs-mdx` ships the three scripts above.
- When `apps/docs` (or any future Fumadocs workspace) errors with `Cannot find module '../../.source/server'`, the `.source/` dir is missing — run `pnpm exec fumadocs-mdx` from the workspace, or check that the postinstall hook fired.
- `lib/source.ts` should import from `../../.source/server` (NOT `../../.source` — there is no barrel index file) and cast the imported `docs` to `DocsCollectionEntry` from `fumadocs-mdx/runtime/server` because `.source/server.ts` ships `@ts-nocheck`.
