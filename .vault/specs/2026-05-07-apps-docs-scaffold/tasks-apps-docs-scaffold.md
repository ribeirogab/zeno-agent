---
feature: apps-docs-scaffold
plan: "[[plan-apps-docs-scaffold]]"
spec: "[[spec-apps-docs-scaffold]]"
created: 2026-05-07
---
# Apps/Docs Minimal Scaffold — Tasks

**For this plan:** [[plan-apps-docs-scaffold]]

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each commit step is a logical boundary; `git add` / `git commit` require explicit user approval per `CLAUDE.md` rule 20.

**Goal:** Ship `apps/docs` workspace with Fumadocs + Pagefind + Imperial Terminal tokens + AI-friendly endpoints + 3 placeholder pages.

**Architecture:** Single new pnpm workspace at `apps/docs/` running Next.js 16 + Fumadocs UI + Tailwind 4 with CSS-variable theming. Three MDX placeholder pages drive both human navigation and `/llms.txt`, `/llms-full.txt`, `/llms.mdx/<slug>` AI endpoints. Custom `CopyMarkdownButton` client component fetches `/llms.mdx/<slug>` and copies to clipboard.

**Tech Stack:** Next.js 16, React 19, Fumadocs Core 16 + UI 16 + MDX 15, Tailwind 4, Pagefind (built-in), Vitest + Testing Library, Biome, TypeScript.

---

## Phase 1: Workspace skeleton

### Task 1.1: Create directory layout

**Files:**
- Create: `apps/docs/` (directory)
- Create: `apps/docs/content/docs/` (directory)
- Create: `apps/docs/public/fonts/LICENSES/` (directory)
- Create: `apps/docs/src/{app,lib,components,styles}/` (directories)
- Create: `apps/docs/src/app/{(home),docs,llms.txt,llms-full.txt,llms.mdx}/` (directories)

- [ ] **Step 1: Create directory tree**

```bash
mkdir -p apps/docs/{content/docs,public/fonts/LICENSES,src/{app,lib,components,styles}}
mkdir -p apps/docs/src/app/{"(home)",docs,llms.txt,"llms-full.txt",llms.mdx}
```

- [ ] **Step 2: Verify tree**

```bash
find apps/docs -type d | sort
```

Expected: 12 directories under `apps/docs/`.

### Task 1.2: Workspace `package.json`

**Files:**
- Create: `apps/docs/package.json`

- [ ] **Step 1: Write `apps/docs/package.json`**

```json
{
  "name": "@zeno/docs",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 4242",
    "build": "next build",
    "start": "next start -p 4242",
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "clean": "rm -rf .next"
  },
  "dependencies": {
    "fumadocs-core": "^16.8.8",
    "fumadocs-mdx": "^15.0.0",
    "fumadocs-ui": "^16.8.8",
    "next": "^16.2.6",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "lucide-react": "^0.460.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.2.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "25.6.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^4.2.2",
    "typescript": "^6.0.2",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 2: Verify with `pnpm install` (do not commit yet)**

Run from repo root:
```bash
pnpm install
```

Expected: install completes. **`@zeno/docs`-attributed peer warnings are blockers** — if `pnpm` reports any unmet peer that lists `apps/docs` (or `@zeno/docs`) in its dependency chain, stop and document the package, constraint, and proposed resolution. **Pre-existing peer warnings from unrelated workspaces (e.g. `@google/design.md` requiring zod 4 / ink 6) are out of scope**: log them in the report so they aren't silently lost, but do not let them block Phase 1.

### Task 1.3: Workspace `tsconfig.json`

**Files:**
- Create: `apps/docs/tsconfig.json`

- [ ] **Step 1: Write `apps/docs/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }],
    "ignoreDeprecations": "6.0"
  },
  "include": ["src/**/*", "next-env.d.ts", ".next/types/**/*.ts", "source.config.ts"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 2: Verify the file parses**

```bash
node -e "JSON.parse(require('node:fs').readFileSync('apps/docs/tsconfig.json','utf8')); console.log('ok')"
```

Expected: prints `ok`. (`tsc --showConfig` is deferred to Phase 2 because Phase 1 creates no source files; `tsc` would exit non-zero with `TS18003: No inputs were found`.)

### Task 1.4: No workspace `biome.json`

**Rationale:** Other apps in this monorepo (`@zeno/cli`, `@zeno/api`, `@zeno/dashboard`, `@zeno/worker`) ship no workspace-level `biome.json`. The root `biome.json` already globs `apps/**` via `files.includes` and is picked up automatically. Adding a workspace-level Biome config breaks this convention; Biome 2.4.12 also rejects the Turborepo-style `"extends": ["//"]` self-reference. There is no per-workspace Biome config to add.

**Files:**
- Delete (if a prior attempt left it behind): `apps/docs/biome.json`

- [ ] **Step 1: Remove any pre-existing `apps/docs/biome.json`**

```bash
rm -f apps/docs/biome.json
```

- [ ] **Step 2: Verify lint runs against `apps/docs/` via the root config**

After Phase 2 introduces source files, `pnpm --filter @zeno/docs lint` will use the root `biome.json`. There is nothing to verify in Phase 1 — proceed.

### Task 1.5: Workspace `turbo.json` override

**Files:**
- Create: `apps/docs/turbo.json`

- [ ] **Step 1: Write `apps/docs/turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "extends": ["//"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    }
  }
}
```

- [ ] **Step 2: Verify cache behaviour (deferred)**

This is verified at Phase 8 once build succeeds. Mark step done if file was written.

### Task 1.6: Workspace `README.md`

**Files:**
- Create: `apps/docs/README.md`

- [ ] **Step 1: Write `apps/docs/README.md`**

```markdown
# @zeno/docs

Outsider-facing documentation site for Zeno. Built with Fumadocs (Next.js 15 + MDX) and Pagefind for local search.

> **Status:** scaffold only. Real content lands in a future spec; see `.vault/specs/2026-05-07-apps-docs-scaffold/spec.md`.

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
```

- [ ] **Step 2: Commit Phase 1 (request user approval first)**

```bash
git add apps/docs/package.json apps/docs/tsconfig.json apps/docs/turbo.json apps/docs/README.md pnpm-lock.yaml
git commit -m "feat(docs): scaffold apps/docs workspace skeleton"
```

---

## Phase 2: Next.js + Fumadocs base

### Task 2.1: `next.config.mjs`

**Files:**
- Create: `apps/docs/next.config.mjs`

- [ ] **Step 1: Write `apps/docs/next.config.mjs`**

```js
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
};

export default withMDX(config);
```

### Task 2.2: `source.config.ts`

**Files:**
- Create: `apps/docs/source.config.ts`

- [ ] **Step 1: Write `apps/docs/source.config.ts`**

```ts
import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
```

### Task 2.3: `src/lib/source.ts`

**Files:**
- Create: `apps/docs/src/lib/source.ts`

- [ ] **Step 1: Write `apps/docs/src/lib/source.ts`**

```ts
import { docs } from "@/../.source";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
```

> Note: `.source` is generated by `fumadocs-mdx` at build/dev time. The relative `@/../.source` alias resolves to `apps/docs/.source` from the workspace root. If the import path differs in the installed Fumadocs version, follow the installed package's docs and update — log the deviation in the PR.

### Task 2.4: Root `app/layout.tsx`

**Files:**
- Create: `apps/docs/src/app/layout.tsx`

- [ ] **Step 1: Write `apps/docs/src/app/layout.tsx`**

```tsx
import "@/styles/globals.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";

export const metadata = {
  title: "Zeno Docs",
  description: "Documentation for Zeno — a personal agent that operates across the apps you use.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <RootProvider theme={{ enabled: false, defaultTheme: "dark" }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
```

### Task 2.5: Home redirect

**Files:**
- Create: `apps/docs/src/app/(home)/page.tsx`

- [ ] **Step 1: Write `apps/docs/src/app/(home)/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/docs");
}
```

### Task 2.6: Docs layout

**Files:**
- Create: `apps/docs/src/app/docs/layout.tsx`

- [ ] **Step 1: Write `apps/docs/src/app/docs/layout.tsx`**

```tsx
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{ title: "Zeno Docs" }}
    >
      {children}
    </DocsLayout>
  );
}
```

### Task 2.7: Docs page route (without copy button yet)

**Files:**
- Create: `apps/docs/src/app/docs/[[...slug]]/page.tsx`

- [ ] **Step 1: Write `apps/docs/src/app/docs/[[...slug]]/page.tsx`**

```tsx
import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from "fumadocs-ui/page";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{}} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
```

### Task 2.8: Verify Phase 2 build does not crash (no content yet → expect missing-content error, not config error)

- [ ] **Step 1: Run dev server smoke**

```bash
pnpm --filter @zeno/docs dev
```

Expected: server starts on `:4242`. Visiting `http://localhost:4242` redirects to `/docs` and renders an empty Fumadocs sidebar (no pages yet — Phase 4 adds them). Stop the server with Ctrl+C.

If the server crashes with a non-content error (e.g. missing dep, malformed config), fix before continuing.

### Task 2.9: Commit Phase 2

- [ ] **Step 1: Stage and request approval**

```bash
git add apps/docs/next.config.mjs apps/docs/source.config.ts apps/docs/src
git commit -m "feat(docs): add Fumadocs Next.js shell and source loader"
```

---

## Phase 3: Imperial Terminal theming

### Task 3.1: Self-host fonts

**Files:**
- Create: `apps/docs/public/fonts/SpaceGrotesk-Variable.woff2`
- Create: `apps/docs/public/fonts/JetBrainsMono-Variable.woff2`
- Create: `apps/docs/public/fonts/Fraunces-Variable.woff2`

- [ ] **Step 1: Download variable woff2 from upstream**

Use the upstream sources (do NOT mirror via Google Fonts CDN at runtime):

```bash
# Space Grotesk: https://fonts.google.com/specimen/Space+Grotesk → "Download family"
# JetBrains Mono: https://github.com/JetBrains/JetBrainsMono/releases (variable woff2)
# Fraunces: https://fonts.google.com/specimen/Fraunces → "Download family"
```

Convert/extract the variable woff2 build for each. Place under `apps/docs/public/fonts/` with the exact filenames above.

- [ ] **Step 2: Verify file sizes (sanity check)**

```bash
ls -lh apps/docs/public/fonts/*.woff2
```

Expected: each file < 200KB. If a file exceeds 200KB, subset to Latin-only.

### Task 3.2: License files

**Files:**
- Create: `apps/docs/public/fonts/LICENSES/SpaceGrotesk-OFL.txt`
- Create: `apps/docs/public/fonts/LICENSES/JetBrainsMono-Apache-2.0.txt`
- Create: `apps/docs/public/fonts/LICENSES/Fraunces-OFL.txt`

- [ ] **Step 1: Copy each font's upstream LICENSE file**

Each license is shipped alongside the font in its source repo. Copy verbatim into the corresponding file under `LICENSES/`.

### Task 3.3: `globals.css`

**Files:**
- Create: `apps/docs/src/styles/globals.css`

- [ ] **Step 1: Write `apps/docs/src/styles/globals.css`**

```css
@import "tailwindcss";
@import "fumadocs-ui/css/preset.css";

@font-face {
  font-family: "Space Grotesk";
  src: url("/fonts/SpaceGrotesk-Variable.woff2") format("woff2-variations");
  font-weight: 300 700;
  font-display: swap;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("/fonts/JetBrainsMono-Variable.woff2") format("woff2-variations");
  font-weight: 100 800;
  font-display: swap;
}
@font-face {
  font-family: "Fraunces";
  src: url("/fonts/Fraunces-Variable.woff2") format("woff2-variations");
  font-weight: 100 900;
  font-display: swap;
}

@theme inline {
  --font-sans: "Space Grotesk", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
  --font-display: "Fraunces", serif;
}

:root,
.dark {
  /* Imperial Terminal — see DESIGN.md */
  --color-fd-background: #08090f;
  --color-fd-foreground: #e8eaf5;
  --color-fd-muted: #0f1119;
  --color-fd-muted-foreground: #8a8fab;
  --color-fd-card: #0f1119;
  --color-fd-card-foreground: #e8eaf5;
  --color-fd-popover: #151824;
  --color-fd-popover-foreground: #e8eaf5;
  --color-fd-border: #1e2131;
  --color-fd-primary: #d9b362;
  --color-fd-primary-foreground: #0a0b12;
  --color-fd-accent: #151824;
  --color-fd-accent-foreground: #e8eaf5;
  --color-fd-ring: #d9b362;
}

body {
  font-family: var(--font-sans);
}

code,
pre {
  font-family: var(--font-mono);
}
```

- [ ] **Step 2: Verify dev server applies tokens**

```bash
pnpm --filter @zeno/docs dev
```

Open `http://localhost:4242/docs`. In DevTools console:

```js
getComputedStyle(document.body).backgroundColor
```

Expected: `"rgb(8, 9, 15)"`.

```js
getComputedStyle(document.documentElement).getPropertyValue("--color-fd-primary").trim()
```

Expected: `"#d9b362"`.

Stop dev server with Ctrl+C.

### Task 3.4: Commit Phase 3

- [ ] **Step 1: Stage and request approval**

```bash
git add apps/docs/public/fonts apps/docs/src/styles/globals.css
git commit -m "feat(docs): apply Imperial Terminal tokens and self-host fonts"
```

---

## Phase 4: Placeholder MDX content

### Task 4.1: Sidebar `meta.json`

**Files:**
- Create: `apps/docs/content/docs/meta.json`

- [ ] **Step 1: Write `apps/docs/content/docs/meta.json`**

```json
{
  "title": "Docs",
  "pages": ["index", "hello", "configuration"]
}
```

### Task 4.2: Index page

**Files:**
- Create: `apps/docs/content/docs/index.mdx`

- [ ] **Step 1: Write `apps/docs/content/docs/index.mdx`**

```mdx
---
title: Welcome
description: Zeno docs — under construction.
---

This is a placeholder; real content lands in a future spec.

`apps/docs` ships only the structural scaffold — Fumadocs, Pagefind search, Imperial Terminal tokens, and AI-friendly endpoints. The official documentation will replace these placeholder pages.

## Where to look meanwhile

- Repo root `README.md` — install + first run.
- `ROADMAP.md` — what is in flight.
- `.vault/` (in the repo) — maintainer-facing project memory.
```

### Task 4.3: Hello page

**Files:**
- Create: `apps/docs/content/docs/hello.mdx`

- [ ] **Step 1: Write `apps/docs/content/docs/hello.mdx`**

```mdx
---
title: Hello
description: Placeholder dummy page exercising headings and TOC.
---

This is a placeholder; real content lands in a future spec.

## Section A

Body text for section A.

## Section B

Body text for section B.

### Subsection B.1

Nested body text.

## Section C

Body text for section C.
```

### Task 4.4: Configuration page (with unique search term)

**Files:**
- Create: `apps/docs/content/docs/configuration.mdx`

- [ ] **Step 1: Write `apps/docs/content/docs/configuration.mdx`**

```mdx
---
title: Configuration
description: Placeholder dummy page used to verify Pagefind search.
---

This is a placeholder; real content lands in a future spec.

The unique token `SUPERCALIFRAGILISTIC` lives only on this page so the search test can target it deterministically.
```

### Task 4.5: Verify pages render

- [ ] **Step 1: Start dev server and visit each page**

```bash
pnpm --filter @zeno/docs dev
```

Visit:
- `http://localhost:4242/docs` → renders "Welcome" page; sidebar lists Welcome, Hello, Configuration.
- `http://localhost:4242/docs/hello` → renders "Hello" page with TOC showing Section A/B/B.1/C.
- `http://localhost:4242/docs/configuration` → renders "Configuration" page with `SUPERCALIFRAGILISTIC` visible.

Stop server.

### Task 4.6: Commit Phase 4

- [ ] **Step 1: Stage and request approval**

```bash
git add apps/docs/content
git commit -m "feat(docs): add three placeholder MDX pages"
```

---

## Phase 5: AI-friendly endpoints

### Task 5.1: `getLLMText` helper

**Files:**
- Create: `apps/docs/src/lib/llm-text.ts`

- [ ] **Step 1: Write `apps/docs/src/lib/llm-text.ts`**

```ts
import type { InferPageType } from "fumadocs-core/source";
import type { source } from "@/lib/source";

type Page = InferPageType<typeof source>;

/**
 * Returns the page's markdown body without MDX-only constructs (JSX components, imports).
 * Used by /llms-full.txt and /llms.mdx/<slug>.
 *
 * The Fumadocs source exposes `page.data.content` (raw frontmatter-stripped markdown) when the
 * source is configured to retain it. If `content` is not available, fall back to the title +
 * description so the endpoint still returns something deterministic.
 */
export async function getLLMText(page: Page): Promise<string> {
  const title = page.data.title;
  const description = page.data.description ?? "";
  const body = (page.data as { content?: string }).content ?? "";
  const url = page.url;
  return `# ${title}\n\n> ${description}\n\nSource: ${url}\n\n${body}`.trim();
}
```

> Note: if the installed Fumadocs version exposes a different field for raw markdown (e.g. `page.data.raw`), adjust the cast accordingly. Verify by logging `Object.keys(page.data)` once during dev.

### Task 5.2: `/llms.txt` route

**Files:**
- Create: `apps/docs/src/app/llms.txt/route.ts`

- [ ] **Step 1: Write `apps/docs/src/app/llms.txt/route.ts`**

```ts
import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
  const lines: string[] = [];
  lines.push("# Zeno");
  lines.push("");
  lines.push("> Personal agent that operates across the apps you use.");
  lines.push("");
  lines.push("## Docs");
  lines.push("");

  for (const page of source.getPages()) {
    const description = page.data.description;
    if (!description) continue;
    lines.push(`- [${page.data.title}](${page.url}): ${description}`);
  }

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

### Task 5.3: `/llms-full.txt` route

**Files:**
- Create: `apps/docs/src/app/llms-full.txt/route.ts`

- [ ] **Step 1: Write `apps/docs/src/app/llms-full.txt/route.ts`**

```ts
import { source } from "@/lib/source";
import { getLLMText } from "@/lib/llm-text";

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();
  const chunks = await Promise.all(pages.map(getLLMText));
  return new Response(chunks.join("\n\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

### Task 5.4: `/llms.mdx/<slug>` route

**Files:**
- Create: `apps/docs/src/app/llms.mdx/[[...slug]]/route.ts`

- [ ] **Step 1: Write `apps/docs/src/app/llms.mdx/[[...slug]]/route.ts`**

```ts
import { source } from "@/lib/source";
import { getLLMText } from "@/lib/llm-text";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) {
    return new Response("Not Found", { status: 404 });
  }
  const text = await getLLMText(page);
  return new Response(text, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
```

### Task 5.5: Verify all three endpoints

- [ ] **Step 1: Start dev server**

```bash
pnpm --filter @zeno/docs dev
```

- [ ] **Step 2: Curl each endpoint**

```bash
curl -s http://localhost:4242/llms.txt
curl -s http://localhost:4242/llms-full.txt
curl -s http://localhost:4242/llms.mdx/hello
curl -sI http://localhost:4242/llms.mdx/does-not-exist | head -1
```

Expected:
- `llms.txt` contains `# Zeno`, `> Personal agent...`, three list entries (Welcome, Hello, Configuration) with descriptions.
- `llms-full.txt` contains all three pages joined by `---`.
- `llms.mdx/hello` returns markdown starting with `# Hello`.
- `llms.mdx/does-not-exist` returns `HTTP/1.1 404 Not Found`.

Stop server.

### Task 5.6: Commit Phase 5

- [ ] **Step 1: Stage and request approval**

```bash
git add apps/docs/src/app/llms.txt apps/docs/src/app/llms-full.txt apps/docs/src/app/llms.mdx apps/docs/src/lib/llm-text.ts
git commit -m "feat(docs): expose /llms.txt /llms-full.txt /llms.mdx endpoints"
```

---

## Phase 6: Copy-as-markdown button

### Task 6.1: `vitest.config.ts`

**Files:**
- Create: `apps/docs/vitest.config.ts`

- [ ] **Step 1: Write `apps/docs/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 2: Write `apps/docs/vitest.setup.ts`**

**Files:**
- Create: `apps/docs/vitest.setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
```

### Task 6.2: Failing unit test for `CopyMarkdownButton`

**Files:**
- Create: `apps/docs/src/components/CopyMarkdownButton.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyMarkdownButton } from "./CopyMarkdownButton";

describe("CopyMarkdownButton", () => {
  const writeText = vi.fn();
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    vi.restoreAllMocks();
  });

  it("fetches /llms.mdx/<slug> and writes the body to the clipboard", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("# Hello\n\nbody", {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
      }),
    );

    render(<CopyMarkdownButton slug="hello" />);
    await userEvent.click(screen.getByRole("button", { name: /copy as markdown/i }));

    expect(global.fetch).toHaveBeenCalledWith("/llms.mdx/hello");
    expect(writeText).toHaveBeenCalledWith("# Hello\n\nbody");
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("shows a failure state when the fetch is not ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("Not Found", { status: 404 }));

    render(<CopyMarkdownButton slug="missing" />);
    await userEvent.click(screen.getByRole("button", { name: /copy as markdown/i }));

    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText(/failed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @zeno/docs test
```

Expected: 2 failures, both because `CopyMarkdownButton` does not exist.

### Task 6.3: Implement `CopyMarkdownButton`

**Files:**
- Create: `apps/docs/src/components/CopyMarkdownButton.tsx`

- [ ] **Step 1: Write `apps/docs/src/components/CopyMarkdownButton.tsx`**

```tsx
"use client";

import { Check, Copy, X } from "lucide-react";
import { useState } from "react";

type State = "idle" | "copied" | "failed";

export function CopyMarkdownButton({ slug }: { slug: string }) {
  const [state, setState] = useState<State>("idle");

  async function handleClick() {
    try {
      const res = await fetch(`/llms.mdx/${slug}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    } finally {
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const Icon = state === "copied" ? Check : state === "failed" ? X : Copy;
  const label =
    state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy as markdown";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-md border border-fd-border bg-fd-card px-3 py-1.5 text-sm text-fd-foreground hover:bg-fd-accent"
      aria-label="Copy as markdown"
    >
      <Icon size={14} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
pnpm --filter @zeno/docs test
```

Expected: 2 passes.

### Task 6.4: Wire `CopyMarkdownButton` into the docs page

**Files:**
- Modify: `apps/docs/src/app/docs/[[...slug]]/page.tsx`

- [ ] **Step 1: Replace the file with this version**

```tsx
import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from "fumadocs-ui/page";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const slugString = (slug ?? []).join("/");

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <DocsTitle>{page.data.title}</DocsTitle>
          <DocsDescription>{page.data.description}</DocsDescription>
        </div>
        <CopyMarkdownButton slug={slugString} />
      </div>
      <DocsBody>
        <MDX components={{}} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
```

- [ ] **Step 2: Smoke-test in the browser**

```bash
pnpm --filter @zeno/docs dev
```

Visit `http://localhost:4242/docs/hello`. Click "Copy as markdown". Confirm:
- Button label briefly changes to "Copied".
- Pasting elsewhere yields the same markdown returned by `curl http://localhost:4242/llms.mdx/hello`.

Stop server.

### Task 6.5: Commit Phase 6

- [ ] **Step 1: Stage and request approval**

```bash
git add apps/docs/vitest.config.ts apps/docs/vitest.setup.ts apps/docs/src/components apps/docs/src/app/docs
git commit -m "feat(docs): add CopyMarkdownButton with unit test and wire into docs page"
```

---

## Phase 7: Mark spec 0027 superseded

### Task 7.1: Edit 0027 frontmatter

**Files:**
- Modify: `.vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md` (frontmatter only)

- [ ] **Step 1: Replace the frontmatter block at the top of the file**

Old:
```
---
id: "0027"
title: Documentation Platform
status: draft
created: 2026-04-23
---
```

New:
```
---
id: "0027"
title: Documentation Platform
status: superseded
created: 2026-04-23
superseded_by: "[[../2026-05-07-apps-docs-scaffold/spec]]"
---
```

- [ ] **Step 2: Verify**

```bash
grep -A6 "^---$" .vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md | head -8
```

Expected: `status: superseded` and `superseded_by` line present.

### Task 7.2: Commit Phase 7

- [ ] **Step 1: Stage and request approval**

```bash
git add .vault/specs/2026-04-23-documentation-platform/spec-documentation-platform.md
git commit -m "docs(vault): mark spec 0027 superseded by apps-docs-scaffold"
```

---

## Phase 8: Quality gate + acceptance verification

### Task 8.1: Clean install from scratch

- [ ] **Step 1: Wipe and reinstall**

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

Expected: clean install, zero peer-dep warnings. If a warning appears, document and resolve before continuing.

### Task 8.2: Production build

- [ ] **Step 1: Run build**

```bash
pnpm --filter @zeno/docs build
```

Expected: exits zero; `.next/` populated.

### Task 8.3: Turbo cache hit verification

- [ ] **Step 1: Build twice**

```bash
pnpm turbo build --filter=@zeno/docs
pnpm turbo build --filter=@zeno/docs
```

Expected: second invocation prints `>>> FULL TURBO` (or per-task `cache hit, replaying logs`). If not, the workspace `apps/docs/turbo.json` is wrong.

### Task 8.4: Run full quality gate

- [ ] **Step 1: Run quality-gate**

```bash
pnpm run quality-gate
```

Expected: lint + typecheck + tests pass across all workspaces, including `@zeno/docs`.

### Task 8.5: Acceptance criteria walkthrough

- [ ] **Step 1: Start production server**

```bash
pnpm --filter @zeno/docs start
```

- [ ] **Step 2: Verify each AC by curl/browser**

Run through every checkbox in `spec.md` § Acceptance Criteria. Tick boxes in the spec as each one passes.

For the AC requiring "page without `description` is excluded from `/llms.txt` but still in `/llms-full.txt`":
1. Add `apps/docs/content/docs/_test-no-desc.mdx` with frontmatter that has `title` only (no `description`).
2. Re-curl `/llms.txt` and `/llms-full.txt`.
3. Confirm `_test-no-desc` is absent from `/llms.txt` and present in `/llms-full.txt`.
4. Delete the test file.

For "DevTools Network panel shows zero external requests": load `http://localhost:4242/` with Network tab open and "Disable cache" checked. Inspect the request list; confirm every URL hostname is `localhost:4242`.

- [ ] **Step 3: Stop the server**

### Task 8.6: Final commit (if any AC fixes were needed)

- [ ] **Step 1: Stage and request approval**

If any task above required fixes, stage them now:

```bash
git status
git add <changed files>
git commit -m "fix(docs): address acceptance criteria findings"
```

If no fixes were needed, skip this step.

### Task 8.7: Open PR

- [ ] **Step 1: Use the project's `/open-pr` slash command**

`CLAUDE.md` and `.vault/_index/home.md` reference `/open-pr` as the required path for opening PRs (auto title + description). Invoke it to create the PR for the branch.

- [ ] **Step 2: Tick all acceptance criteria in `spec.md`**

Edit `.vault/specs/2026-05-07-apps-docs-scaffold/spec.md`, change every `- [ ]` under § Acceptance Criteria to `- [x]`, then commit:

```bash
git add .vault/specs/2026-05-07-apps-docs-scaffold/spec.md
git commit -m "docs(vault): tick acceptance criteria for apps-docs-scaffold"
```

- [ ] **Step 3: Update spec frontmatter status to `shipped`**

Once PR is merged, edit `spec.md` frontmatter: `status: shipped`, `shipped: 2026-MM-DD`. Commit.

- [ ] **Step 4: Run the post-shipping reflection**

Per `CLAUDE.md` § "After completing a spec":
1. Ask: what was learned implementing this that wasn't obvious from the spec?
2. For each non-obvious learning, write an atomic note in `.vault/learnings/` using `.vault/templates/learning.md`, link it back to this spec, and add it to `.vault/_index/learnings.md`.
3. If nothing non-obvious surfaced, write that explicitly: "No new learnings from apps-docs-scaffold."
