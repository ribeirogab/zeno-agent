---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-07-apps-docs-scaffold/spec]]"
created: 2026-05-07
---
# Tailwind 4 + Fumadocs needs a `postcss.config.mjs` even on Next.js Turbopack

A Next.js 16 app using Tailwind 4 + a Fumadocs preset will appear to load CSS but compile *no* utilities — the page renders unstyled with errors like `Cannot apply unknown utility class 'bg-fd-diff-remove'` — unless `apps/<app>/postcss.config.mjs` is present and exports `@tailwindcss/postcss` as a plugin. The fact that Next 16 defaults to Turbopack does **not** remove the requirement.

## Context

Found while bringing up `apps/docs` (PR #19 / spec [[../specs/2026-05-07-apps-docs-scaffold/spec]]). First boot rendered an unstyled DOM and the dev server crashed on `@apply bg-fd-diff-remove` from `fumadocs-ui/css/lib/shiki.css`. Removing the postcss config didn't help; adding it back, restarting, fixed everything. The dashboard happens to ship its own `postcss.config.js` because it uses Vite — so the symptom is invisible there.

## How It Works

Tailwind 4's PostCSS adapter is what evaluates `@import "tailwindcss"`, `@theme`, `@apply`, and the Fumadocs preset's `@source inline(...)` directives. Turbopack picks up `postcss.config.{js,mjs,cjs}` automatically — but if the file is missing, Turbopack's CSS pipeline does not invoke Tailwind, the preset's `@apply` calls reference utilities that don't exist, and the build aborts.

Minimum viable file (matches the upstream Fumadocs starter):

```js
// apps/<app>/postcss.config.mjs
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

The plugin is `@tailwindcss/postcss`, not `tailwindcss` — Tailwind 4 split them.

## How to Apply

- Any new Next.js workspace that imports `tailwindcss` and/or `fumadocs-ui/css/preset.css` must ship a `postcss.config.mjs` at the workspace root.
- Add `@tailwindcss/postcss` and `postcss` to `devDependencies`.
- When you see `Cannot apply unknown utility class 'bg-fd-…'` in `next dev`, the postcss config is the first thing to check.
- The dashboard's `apps/dashboard/postcss.config.js` (Vite + Tailwind 4) is the reference; copy its shape with the export adjusted for ESM (`postcss.config.mjs`).
