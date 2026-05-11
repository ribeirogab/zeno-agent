---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-10-docs-ui-polish/spec]]"
created: 2026-05-10
---
# Turbopack rejects `opengraph-image` siblings of an optional catch-all

Next.js 16 + Turbopack panics at build time when a static OG file (`opengraph-image.tsx`, `opengraph-image.png`, etc.) is placed inside an optional catch-all segment like `app/[[...slug]]/`. The error reads:

```
Invalid segment Static("opengraph-image"), catch all segment must be the
last segment modifying the path (segments: [OptionalCatchAll("slug")])
```

The Next.js docs imply that the convention works at any route level, and it does on the App Router runtime — but Turbopack's static-segment validator refuses it. The crash happens during dev server startup, not later.

## Context

Hit during `apps/docs` UI polish (spec [[../specs/2026-05-10-docs-ui-polish/spec]]). The scaffold uses `app/[[...slug]]/page.tsx` as the catch-all docs page. Adding `app/[[...slug]]/opengraph-image.tsx` to render per-slug OG images crashed Turbopack on `pnpm dev`. Same file works under Webpack mode, but Fumadocs ships Turbopack by default in Next 16.

## How It Works

Turbopack treats optional catch-all (`[[...slug]]`) as a terminal path consumer — nothing static may follow it because the catch-all is what consumes the rest of the URL. Standard catch-all (`[...slug]`) probably has the same restriction. The error message is precise but the fix is not obvious because the OG file convention was designed pre-Turbopack.

Fix: lift the OG generator out of the catch-all directory. The clean replacement is an explicit route handler at `app/og/route.tsx` (or any non-dynamic path) that reads `?slug=<slug>` from the query string and renders an `ImageResponse`. Wire it in via `generateMetadata` on the catch-all page:

```ts
// app/[[...slug]]/page.tsx
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  const ogQuery = slug ? `?slug=${encodeURIComponent(slug.join('/'))}` : '';
  return {
    openGraph: { images: [{ url: `/og${ogQuery}`, width: 1200, height: 630 }] },
    twitter:   { images: [`/og${ogQuery}`], card: 'summary_large_image' },
  };
}
```

```ts
// app/og/route.tsx
import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { source } from '@/lib/source';

export async function GET(request: NextRequest) {
  const slugParam = request.nextUrl.searchParams.get('slug') ?? '';
  const page = source.getPage(slugParam ? slugParam.split('/') : undefined);
  // ... ImageResponse(...)
}
```

Trade-off vs the file-convention path: the URLs become `/og?slug=install` instead of `/install/opengraph-image`. Social platforms don't care — both serve the same PNG. The convention's "no metadata change needed in page.tsx" optimization is lost, but the explicit wiring is a few lines and removes a bundler trap.

## How to Apply

- When adding `opengraph-image.tsx`, `twitter-image.tsx`, or similar static-file conventions to a Next 16 + Turbopack project, **never place them inside an `[[...slug]]` or `[...slug]` directory**. Lift to a sibling route or a non-dynamic path.
- The crash is at dev-server startup with a `TurbopackInternalError`. Don't waste time on `pnpm install` / cache clears — the file location is wrong.
- For catch-all docs scaffolds (Fumadocs, Nextra, similar), prefer an explicit `/og` route handler with query-string slug from day one. The file-convention shortcut isn't available.
