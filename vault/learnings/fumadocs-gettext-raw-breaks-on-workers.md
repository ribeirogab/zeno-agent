---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-07-apps-docs-cf-deploy/spec]]"
  - "[[fumadocs-mdx-source-postinstall]]"
created: 2026-05-07
---
# Fumadocs `page.data.getText('raw')` reads from disk — breaks on Cloudflare Workers

The Fumadocs MDX runtime exposes `page.data.getText('raw' | 'processed')` to fetch a page's markdown. The `'raw'` variant calls `fs.readFile` against the source `.mdx` path — fine on Node.js, fatal on Cloudflare Workers (no filesystem). Use `'processed'` instead and enable `postprocess.includeProcessedMarkdown` in `source.config.ts` so the markdown is bundled into the page data at build time.

## Context

Found while deploying `apps/docs` to Cloudflare Workers (PR #29 / spec [[../specs/2026-05-07-apps-docs-cf-deploy/spec]]). The `/llms.mdx/<slug>` route handler called `getText('raw')` and worked locally; the first production deploy returned HTTP 500 on every page slug. Logs showed `x-opennext: 1` + empty body — OpenNext caught the FS error and surfaced it as a 500.

## How It Works

The runtime helper is in `node_modules/fumadocs-mdx/dist/runtime/server.mjs`:

```js
async getText(type) {
  if (type === 'processed') {
    if (typeof data._markdown !== 'string')
      throw new Error("getText('processed') requires `includeProcessedMarkdown` to be enabled in your collection config.");
    return data._markdown;
  }
  // 'raw' branch reads from fs
  return fs.readFile(info.fullPath, 'utf-8');
}
```

`'processed'` reads `data._markdown` directly — no FS, just a bundled string. To make `_markdown` available, the docs collection must opt in:

```ts
// apps/docs/source.config.ts
import { type DocsCollection, defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs: DocsCollection = defineDocs({
  dir: 'content/docs',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
```

Then any consumer (route handler, MDX page) can do `await page.data.getText('processed')` and get back the post-MDX-pipeline markdown body. The same flag also unlocks `data._markdown` as a synchronous field if you'd rather skip the helper.

## How to Apply

- Any apps/docs route handler that emits markdown — `/llms.mdx/<slug>`, `/llms-full.txt`, future raw-content endpoints — must use `getText('processed')`. Treat `'raw'` as Node.js-only.
- When wiring a Fumadocs collection that will be deployed to a serverless edge runtime (Workers, Vercel Edge, Deno Deploy, Netlify Edge), set `postprocess.includeProcessedMarkdown: true` upfront — local dev hides the regression.
- Symptom in prod: `/llms.mdx/<slug>` returns HTTP 500 with empty body and `x-opennext: 1` header. Check the route handler's `getText` argument before debugging anything else.
- Rebuild `.source/` after toggling the flag (`pnpm exec fumadocs-mdx`) — the generated runtime files reference the postprocess config snapshot, so a stale `.source/` won't pick up the change.
