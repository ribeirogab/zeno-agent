---
tags:
  - learning
  - gotcha
related:
  - "[[tailwind-v4-source-directive-cross-package]]"
  - "[[peer-react-in-workspace-ui-package]]"
created: 2026-04-26
---
# `@import "@workspace/pkg/path.css"` needs the dep declared

Adding `@import "@zeno/ui/styles/tokens.css";` in a consumer's `globals.css` looks like a Tailwind/PostCSS concern, but it's resolved by Node module resolution under the hood. If the consumer's `package.json` doesn't list `@zeno/ui` as a workspace dep, PostCSS errors with `ENOENT: no such file or directory, open '@zeno/ui/styles/tokens.css'` — even though the package physically exists in the monorepo and TypeScript imports from `@zeno/ui` would work fine in `.tsx` files.

## Context

During spec 0030, Phase 2 task 2.3 slimmed `apps/design/src/styles/globals.css` to import tokens from `@zeno/ui` instead of duplicating the `@theme` block:

```css
@import "tailwindcss";
@import "@zeno/ui/styles/tokens.css";
```

`pnpm --filter @zeno/design build` failed with `[plugin vite:css] [postcss] ENOENT: no such file or directory, open '@zeno/ui/styles/tokens.css'`. The fix was to add the workspace dep to `apps/design/package.json`:

```json
"dependencies": {
  "@zeno/ui": "workspace:*",
  ...
}
```

Followed by `pnpm install`. After that, `@import` resolved fine.

`apps/dashboard` was already importing the same path successfully because it had `@zeno/ui` declared as a dep already (used by `import { Pill } from '@zeno/ui'` in `.tsx` files). The CSS import inherits the same resolution path.

## How It Works

PostCSS / Tailwind v4 resolve `@import "<specifier>"` through Node's module resolution algorithm when the specifier looks like a package name (starts with `@scope/` or a bare name). The specifier `@zeno/ui/styles/tokens.css` resolves to `<package-root>/styles/tokens.css` if `@zeno/ui` is a discoverable Node module — and inside a pnpm monorepo, "discoverable" means **declared in the consumer's `package.json`**. pnpm's symlink layout doesn't make sibling workspace packages globally available; they appear in `node_modules/` only when declared.

The `package.json` `exports` field on `@zeno/ui` already permits the path:

```json
"exports": {
  ".": "./src/index.ts",
  "./styles/tokens.css": "./src/styles/tokens.css"
}
```

— so once the dep is declared and `pnpm install` has run, the import path is honored. Without the dep, the resolution never even consults `exports`.

## How to Apply

When wiring a consumer to import CSS (or any non-`.ts`/`.tsx` asset) from a sibling workspace package:

1. **Declare the workspace dep first.** Add `"@zeno/ui": "workspace:*"` (or whatever the package is named) to the consumer's `package.json` `dependencies`.
2. Run `pnpm install` to materialize the symlink.
3. Then add the `@import` (or `import` for non-TS assets like SVG/PNG/JSON) in your CSS / TS / config file.

Symptoms that mean you skipped step 1:
- `[plugin vite:css] [postcss] ENOENT: no such file or directory, open '<specifier>'`
- The TS import `import x from '@zeno/ui'` still works (because TS uses tsconfig path aliases and is more forgiving) but the CSS import or any tooling that uses pure Node resolution fails.

Don't assume "it's the same monorepo, the path will resolve" — pnpm's strict workspace layout requires explicit `dependencies` for resolution. The dep declaration is the source of truth, not the filesystem.
