---
id: "0027"
title: Documentation Platform
status: superseded
created: 2026-04-23
superseded_by: "[[../2026-05-07-apps-docs-scaffold/spec]]"
---

# 0027 — Documentation Platform

**Status:** Superseded by [[../2026-05-07-apps-docs-scaffold/spec]] — kept as research history (framework comparison: Mintlify, Starlight, Nextra, Docusaurus). The new spec adopts Fumadocs (not in 0027's comparison) and limits scope to a structural scaffold, deferring official content authoring and hosting to follow-up specs.
**Scope:** Choose and configure a documentation framework for Zeno that is self-hostable, agent-friendly, and visually aligned with the Imperial Terminal design system.

## Context

Zeno is approaching open-source readiness. Before release, it needs a public documentation site covering installation, configuration, profiles, connector authoring, dashboard usage, and API reference. The site must be self-hostable (no SaaS dependency), support the llms.txt standard for agent discoverability, and match the Imperial Terminal dark theme (ink-blue surfaces, imperial gold accent, mono-first typography).

The reference benchmark is https://modelcontextprotocol.io/docs/learn/architecture — clean navigation, MDX content, structured for both humans and agents.

## Problem Statement

Zeno has no public documentation. Internal knowledge lives in `context/` markdown files, `CLAUDE.md`, and inline code comments. None of this is accessible to end users or to AI agents discovering the project.

## Research Findings

### Platform Comparison

#### Mintlify (SaaS, closed-source)

- **Model:** Hosted SaaS. Not self-hostable. $300/month Pro plan, $600+ Custom.
- **Used by:** modelcontextprotocol.io (MCP docs), Anthropic, many AI companies.
- **Strengths:** Best-in-class DX, automatic API reference from OpenAPI, built-in AI assistant with cited answers, Autopilot agent that proposes doc updates from code changes, native llms.txt generation, beautiful defaults.
- **Weaknesses:** Not self-hostable — hard dependency on Mintlify's infrastructure. Expensive ($300-500/month with seats and AI overages). Closed-source, limited deep customization. Cannot live in `apps/docs/` as a buildable workspace.
- **llms.txt:** Native, automatic generation of `/llms.txt` and `/llms-full.txt`.
- **Theme:** Configurable via `docs.json` but within Mintlify's design constraints. Full Imperial Terminal theming would require their Custom plan ($600+/month).
- **Verdict:** Disqualified. Not self-hostable, SaaS lock-in contradicts Zeno's self-hosted ethos.

#### Starlight (Astro, open-source)

- **Model:** Fully open-source. MIT license. Static site generator.
- **Strengths:** Excellent performance (zero JS by default, island architecture), built-in Pagefind search (no external service), i18n, automatic sidebar from file system, dark/light mode, MDX + Markdoc support, rich plugin ecosystem.
- **Weaknesses:** Not React — uses Astro components (can embed React islands but framework mismatch with Zeno's React/TypeScript stack). No native API reference generation from OpenAPI. Less mature than Docusaurus.
- **llms.txt:** First-class support via `starlight-llms-txt` plugin. Generates `llms.txt`, `llms-full.txt`, and `llms-small.txt`. Most mature llms.txt plugin in the ecosystem.
- **Theme:** Highly customizable CSS. Full control over colors, typography, layout. Imperial Terminal theme achievable.
- **Search:** Built-in Pagefind (local, no external service).
- **SSG:** Pure static output. Excellent performance.

#### Nextra (Next.js, open-source)

- **Model:** Fully open-source. MIT license. Built on Next.js.
- **Strengths:** Next.js ecosystem (SSG + SSR + ISR), MDX 3 with React components, Pagefind search, Shiki syntax highlighting, i18n, App Router support.
- **Weaknesses:** Tightly coupled to Next.js — adds a Next.js dependency to a monorepo that doesn't use it. No native llms.txt support (must implement manually or use third-party Next.js plugin). Less active maintenance than Fumadocs. Search was FlexSearch, now Pagefind.
- **llms.txt:** No native support. Must implement via `next-plugin-llms` or custom route handler.
- **Theme:** Full control via CSS/Tailwind. Customizable.
- **Verdict:** Viable but adds Next.js as a dependency without clear advantage over Fumadocs.

#### Docusaurus (React, open-source)

- **Model:** Fully open-source by Meta. MIT license. React-based.
- **Strengths:** Most mature ecosystem, built-in versioning, Algolia DocSearch (free for OSS), i18n via Crowdin, MDX support, large community, battle-tested at scale.
- **Weaknesses:** Heavier bundle size than Astro/Starlight. No AI/agent features. Aging architecture — React class components in some internals. Build times can be slow for large sites. No native llms.txt (community plugins only, not officially maintained).
- **llms.txt:** Community plugins (`docusaurus-plugin-llms`, `@signalwire/docusaurus-plugin-llms-txt`). Not official.
- **Theme:** Swizzling system allows deep customization but can be complex. CSS modules.
- **Verdict:** Viable but feels heavy for a project this size. Versioning is a strength Zeno doesn't need yet.

#### Fumadocs (Next.js, open-source)

- **Model:** Fully open-source. MIT license. Built on Next.js (also supports TanStack Start, React Router).
- **Used by:** Vercel (v0 docs), Ultracite, growing adoption (10k+ GitHub stars).
- **Strengths:** Modern architecture with Content -> Core -> UI separation. Headless mode available. Native llms.txt integration (route handler, no build step). OpenAPI spec rendering for API reference. Shiki syntax highlighting. Orama and Algolia search integration. MDX with full React component support. Minimal client JS. Well-designed default theme with dark mode.
- **Weaknesses:** Adds Next.js as a dependency. Younger project than Docusaurus (though actively maintained). Smaller community.
- **llms.txt:** Native support. `getLLMText(page)` helper extracts content per page. Route handler serves `/llms.txt` dynamically — no extra build step.
- **Theme:** Headless mode + CSS variables. Full control over design. Imperial Terminal theme achievable with CSS custom properties.
- **Search:** Orama (local, open-source) or Algolia.
- **API Reference:** OpenAPI spec rendering built in.
- **SSG/SSR:** Next.js hybrid — can do full static export or server-rendered.

### llms.txt Standard

The llms.txt specification (proposed by Jeremy Howard, Answer.AI) defines a standard for making website content accessible to LLMs:

- **Files:** `/llms.txt` (structured index with links and descriptions) and `/llms-full.txt` (all content concatenated).
- **Format:** Markdown. H1 project name, blockquote summary, H2 sections with bullet-point links. Each link has a description.
- **Adoption:** Used by Anthropic, Cloudflare, Vercel, MCP docs, and thousands of other sites.
- **Purpose:** Allows AI agents to discover and consume documentation without scraping HTML. Critical for agent-friendly projects.
- **Best practice:** Generate automatically from content source, not hand-maintained.

### How modelcontextprotocol.io Is Built

- **Framework:** Mintlify (hosted SaaS).
- **Content:** MDX files in a GitHub repo, configured via `docs.json` with tab-based navigation, theming, and redirects.
- **llms.txt:** Yes — serves `/llms.txt` with structured index of all pages, organized by section (Docs, Development, Learning, Security, Extensions, Specification).
- **What makes it good:** Clean hierarchy, consistent page structure (concept -> example -> reference), every page has a one-line description in llms.txt, fast search, good mobile experience.

## Recommendation

**Fumadocs** is the recommended platform for Zeno's documentation site.

### Rationale

1. **Self-hostable:** Fully open-source, deploys as a static site or Node server. Lives in `apps/docs/` as a pnpm workspace member.
2. **Native llms.txt:** Built-in route handler generates `/llms.txt` from content — no plugins, no build step, always in sync.
3. **OpenAPI support:** API reference pages generated from OpenAPI specs. Zeno's Hono API can export its schema and Fumadocs renders it.
4. **React/TypeScript native:** Same stack as Zeno's dashboard. Shared knowledge, shared tooling (Biome, TypeScript, pnpm).
5. **Imperial Terminal theming:** Headless mode + CSS custom properties allow pixel-perfect implementation of the design system. Dark-only mode is straightforward.
6. **Content -> Core -> UI separation:** Clean architecture. Can start with the default theme and progressively customize.
7. **Search:** Orama (local, open-source, no external service) fits the self-hosted requirement.
8. **Modern:** Active development, 10k+ stars, used by Vercel's own v0 docs.

### Trade-off acknowledged

Fumadocs adds Next.js as a dependency to the monorepo. This is acceptable because:
- It only affects `apps/docs/`, not the worker/API/dashboard.
- Next.js is used solely for static export — no runtime server required in production.
- The alternative (Starlight/Astro) would add a completely different framework with different component model, making it harder for contributors.

### Why not Starlight?

Starlight is the strongest alternative. Its Pagefind search and zero-JS output are excellent. However:
- Astro components are a different paradigm from React — contributors must learn a new component model.
- No native API reference generation from OpenAPI.
- llms.txt plugin is mature but still a plugin, not built-in.

If Next.js dependency is unacceptable, Starlight is the fallback recommendation.

## Proposed Architecture

```
apps/docs/
  content/
    docs/
      getting-started/
        installation.mdx
        configuration.mdx
        profiles.mdx
      guides/
        skills-authoring.mdx
        dashboard-usage.mdx
        mcp-integration.mdx
      reference/
        api/              # Generated from OpenAPI spec
        configuration.mdx
        environment.mdx
      concepts/
        architecture.mdx
        agent-model.mdx
  app/
    layout.tsx
    llms.txt/route.ts    # llms.txt route handler
  fumadocs.config.ts
  package.json
  tsconfig.json
```

## Content Plan

| Section | Pages | Priority |
|---|---|---|
| Getting Started | Installation, Configuration, Profiles | P0 |
| Guides | Skills Authoring, Dashboard Usage, MCP Integration | P0 |
| Concepts | Architecture, Agent Model | P1 |
| API Reference | Generated from Hono OpenAPI spec | P1 |
| Reference | Config file reference, Environment variables | P1 |
| Advanced | Custom storage, Multi-profile, Guardrails | P2 |

## Success Criteria

1. `apps/docs/` builds as a pnpm workspace member via `turbo run build`.
2. Documentation site serves at `localhost:4000` in dev mode.
3. `/llms.txt` returns a valid, structured index of all pages.
4. `/llms-full.txt` returns all content concatenated.
5. Imperial Terminal theme applied — ink-blue background, gold accent, mono typography, dark-only.
6. API reference pages render from the Hono API's OpenAPI spec.
7. Search works locally via Orama without external services.
8. Static export produces a deployable bundle (no Node runtime required in production).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Next.js adds weight to the monorepo | Isolated to `apps/docs/`, static export only, no runtime dependency |
| Fumadocs is younger than Docusaurus | Active development, used by Vercel (v0), 10k+ stars, responsive maintainer |
| Imperial Terminal theme requires deep CSS work | Fumadocs headless mode gives full control; design tokens already defined in spec 0026 |
| OpenAPI spec not yet exported from Hono API | Hono has `@hono/zod-openapi` — can be added incrementally |

## Open Questions

- [NEEDS CLARIFICATION: Deploy target] Will the docs be deployed to a subdomain (docs.zeno.dev), a path (/docs), or bundled into the existing API server?
- [NEEDS CLARIFICATION: Versioning] Is documentation versioning needed before v1.0, or only after?
