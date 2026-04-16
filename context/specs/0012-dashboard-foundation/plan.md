---
feature: dashboard-foundation
spec: "[[spec]]"
created: 2026-04-16
---
# Dashboard Foundation — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended for this plan — large, many files) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the repo into a Turborepo monorepo, ship a Hono HTTP API behind hand-rolled HMAC cookie auth, and deliver a Vite + React SPA implementing the Login + Home artboards from spec 0008. Phase B/C deferred.

**Architecture:** Two Node processes in one Docker container (`apps/worker` for Slack/cron/agent + `apps/api` for HTTP) coordinate via a shared SQLite file. The dashboard SPA (`apps/dashboard`) is built into static assets served by the API on the same origin. Two internal packages (`@zeno/storage`, `@zeno/logger`) consolidate cross-app concerns.

**Tech Stack:** Node 24 · TypeScript strict · pnpm workspaces · Turborepo · Hono · Vite · React 18 · Tailwind v4 · shadcn/ui · TanStack Router · TanStack Query · vitest · concurrently · Docker

## Approach

Implementation runs in **5 phases** that each leave the system in a working, releasable state. Phase 1 (monorepo restructure) is purely mechanical — no behavior change, just file moves + import updates. Quality gate must stay green throughout. Phases 2–5 add the new apps incrementally: API skeleton → auth → read endpoints → dashboard SPA → final polish.

The plan is **TDD-shaped** wherever the unit boundary is testable in isolation: HMAC functions, repo queries, route handlers via Hono test client, and Zod schemas. UI work that's primarily visual (Login layout, Sidebar component) ships with smoke render tests only — golden-image diffs against the Paper artboards are out of scope per spec.

The plan is **Docker-first** per user direction: there are no new `pnpm dev`/`pnpm start` scripts that run apps locally. Verification commands are either `pnpm run quality-gate` (local, for the linter+typechecker+test runner) or `pnpm run docker:build && pnpm run docker:up && pnpm run docker:logs` (for end-to-end checks).

## Architecture

```
┌──────────────── Docker container ─────────────────┐
│                                                   │
│  PID 1: tini (via docker init: true)              │
│   └── pnpm exec concurrently …                    │
│        ├── [worker] node apps/worker/dist/index.js│
│        │     ├── Slack Bolt Socket Mode           │
│        │     ├── CronRunner (setInterval 60s)     │
│        │     ├── ProfileWatcher                   │
│        │     └── AgentCore                        │
│        └── [api] node apps/api/dist/index.js      │
│              ├── Hono server :3000                │
│              ├── Static SPA at /                  │
│              └── /api/* routes                    │
│                                                   │
│  Shared: /workspace/zeno.db (better-sqlite3 WAL)  │
│  Shared: /home/node/.claude (volume)              │
│  Shared: /app/profile (bind, ro)                  │
└───────────────────────────────────────────────────┘
                       ▲
                       │ HTTP :3000
                       │
                  Browser SPA
```

Workspace layout:

```
zeno-agent/
├── apps/
│   ├── worker/
│   ├── api/
│   └── dashboard/
├── packages/
│   ├── storage/
│   └── logger/
├── infra/{Dockerfile,docker-compose.yml}
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json (root)
└── package.json (root)
```

## File Structure

### NEW — root-level monorepo config

| File | Responsibility |
|---|---|
| `pnpm-workspace.yaml` | Declare `apps/*` and `packages/*` as workspaces |
| `turbo.json` | Pipeline: `build`, `test`, `lint`, `typecheck` with `^build` deps |
| `tsconfig.base.json` | Shared compilerOptions: strict, target ES2022, module NodeNext |
| Root `package.json` | Workspace scripts (`docker:*`, `quality-gate`), turbo + concurrently devDeps |

### NEW — `packages/storage/` (extracted from current `src/storage/`)

| File | Responsibility |
|---|---|
| `packages/storage/package.json` | Name `@zeno/storage`, dep `better-sqlite3`, devDep `@types/better-sqlite3`, vitest |
| `packages/storage/tsconfig.json` | Extends base, outputs to `dist/`, types in `dist/index.d.ts` |
| `packages/storage/vitest.config.ts` | Vitest config (resolves `@/` alias for tests) |
| `packages/storage/src/index.ts` | Re-exports `db`, `migrations`, `types`, all repos |

### MOVE — `src/storage/*` → `packages/storage/src/*`

| Source | Destination |
|---|---|
| `src/storage/db.ts` | `packages/storage/src/db.ts` |
| `src/storage/migrations.ts` | `packages/storage/src/migrations.ts` |
| `src/storage/types.ts` | `packages/storage/src/types.ts` |
| `src/storage/repos/sessions.ts` | `packages/storage/src/repos/sessions.ts` |
| `src/storage/repos/crons.ts` | `packages/storage/src/repos/crons.ts` |
| `src/storage/repos/cron-runs.ts` | `packages/storage/src/repos/cron-runs.ts` |
| `tests/storage/*.test.ts` | `packages/storage/tests/*.test.ts` |

### NEW — `packages/logger/`

| File | Responsibility |
|---|---|
| `packages/logger/package.json` | Name `@zeno/logger`, dep `pino` |
| `packages/logger/tsconfig.json` | Extends base |
| `packages/logger/src/index.ts` | Exports `createLogger({ service })` factory |

### MOVE — `src/logger.ts` → `packages/logger/src/index.ts`

(refactored to accept `service` parameter)

### NEW — `apps/worker/`

| File | Responsibility |
|---|---|
| `apps/worker/package.json` | Name `@zeno/worker`, deps from current root, including workspace deps `@zeno/storage` + `@zeno/logger` |
| `apps/worker/tsconfig.json` | Extends base, references `../../packages/storage` and `../../packages/logger` |
| `apps/worker/vitest.config.ts` | Vitest config |

### MOVE — current worker source

| Source | Destination |
|---|---|
| `src/index.ts` | `apps/worker/src/index.ts` |
| `src/config.ts` | `apps/worker/src/config.ts` |
| `src/agent/**` | `apps/worker/src/agent/**` |
| `src/channels/**` | `apps/worker/src/channels/**` |
| `src/cron/**` | `apps/worker/src/cron/**` |
| `src/profile/**` | `apps/worker/src/profile/**` |
| `tests/agent/**` | `apps/worker/tests/agent/**` |
| `tests/cron/**` | `apps/worker/tests/cron/**` |
| `tests/profile/**` | `apps/worker/tests/profile/**` |
| `tests/channels/**` | `apps/worker/tests/channels/**` |

### NEW — `apps/api/`

| File | Responsibility |
|---|---|
| `apps/api/package.json` | Name `@zeno/api`, deps: `hono`, `zod`, `@hono/zod-validator`, `@hono/node-server`, workspace deps |
| `apps/api/tsconfig.json` | Extends base |
| `apps/api/vitest.config.ts` | Vitest config |
| `apps/api/src/index.ts` | Boot: load env → openDatabase → create Hono app → start server on port 3000 |
| `apps/api/src/config.ts` | Zod-validated env: `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`, `LOG_LEVEL`, `WORKSPACE_DIR`, `NODE_ENV` |
| `apps/api/src/server.ts` | Exported `createApp({ db, config }): Hono` factory — used by tests + index.ts |
| `apps/api/src/auth/hmac.ts` | `signSession(secret, expiresAt)` and `verifySession(secret, value)` pure functions |
| `apps/api/src/auth/middleware.ts` | `requireAuth` Hono middleware (validates cookie, injects sliding renewal) |
| `apps/api/src/routes/auth.ts` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| `apps/api/src/routes/health.ts` | `GET /api/health` (unauthenticated) |
| `apps/api/src/routes/stats.ts` | `GET /api/stats` (authenticated) |
| `apps/api/src/routes/activity.ts` | `GET /api/activity` (authenticated) |
| `apps/api/src/routes/static.ts` | Catch-all SPA fallback serving `apps/dashboard/dist/` |
| `apps/api/tests/auth/hmac.test.ts` | Unit tests for sign/verify, tampered cookies, expired cookies |
| `apps/api/tests/routes/auth.test.ts` | Integration tests via `app.request()`: login success, login failure, /me with/without cookie, logout |
| `apps/api/tests/routes/stats.test.ts` | Integration tests with seeded DB |
| `apps/api/tests/routes/activity.test.ts` | Integration tests with seeded DB |

### NEW — `apps/dashboard/`

| File | Responsibility |
|---|---|
| `apps/dashboard/package.json` | Name `@zeno/dashboard`, deps: `react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `sonner`, plus shadcn deps |
| `apps/dashboard/tsconfig.json` | Extends base, JSX preserve, lib DOM |
| `apps/dashboard/vite.config.ts` | Vite + React + TanStack Router plugin |
| `apps/dashboard/tailwind.config.ts` | Content paths |
| `apps/dashboard/postcss.config.js` | Tailwind v4 PostCSS plugin |
| `apps/dashboard/components.json` | shadcn config (Tailwind v4 style, neutral base, RSC false) |
| `apps/dashboard/index.html` | HTML shell with Inter + Instrument Serif Google Fonts links |
| `apps/dashboard/src/main.tsx` | Entry: mount RouterProvider + QueryClientProvider |
| `apps/dashboard/src/styles/globals.css` | `@import "tailwindcss"` + `@theme` block with Paper palette tokens |
| `apps/dashboard/src/lib/api-client.ts` | `apiFetch<T>(path, opts)` wrapper, `credentials: 'include'`, throws on non-2xx |
| `apps/dashboard/src/lib/query-client.ts` | `QueryClient` instance with sane defaults |
| `apps/dashboard/src/lib/use-stats.ts` | TanStack Query hook for `/api/stats` |
| `apps/dashboard/src/lib/use-activity.ts` | TanStack Query hook for `/api/activity` |
| `apps/dashboard/src/components/ui/button.tsx` | shadcn Button (audited for any/biome-ignore) |
| `apps/dashboard/src/components/ui/input.tsx` | shadcn Input (audited) |
| `apps/dashboard/src/components/ui/sonner.tsx` | shadcn Sonner toaster (audited) |
| `apps/dashboard/src/components/layout/Sidebar.tsx` | Sidebar with brand, nav (Home active, others disabled), status section, user chip |
| `apps/dashboard/src/components/home/StatTile.tsx` | One stat tile (label + serif numeral) |
| `apps/dashboard/src/components/home/ActivityRow.tsx` | One activity row (dot, timestamp, kind, message) |
| `apps/dashboard/src/routes/__root.tsx` | TanStack root: providers + Outlet |
| `apps/dashboard/src/routes/login.tsx` | Login page |
| `apps/dashboard/src/routes/_authed.tsx` | Route group with `beforeLoad` auth guard via `/api/auth/me` |
| `apps/dashboard/src/routes/_authed/index.tsx` | Home page |
| `apps/dashboard/src/route-tree.gen.ts` | Generated by TanStack Router CLI (gitignored, regenerated on build) |
| `apps/dashboard/tests/components/Sidebar.test.tsx` | Render test |
| `apps/dashboard/tests/lib/api-client.test.ts` | Unit test |

### EDIT — existing files

| File | Changes |
|---|---|
| `infra/Dockerfile` | Replace single-stage with 4-stage: base → deps → builder → runtime. Build runs `pnpm turbo run build`. CMD uses `concurrently` with worker + api. |
| `infra/docker-compose.yml` | Add `init: true`, `ports: ["3000:3000"]`. Keep existing volumes. |
| `package.json` (root) | Become workspace root: scripts (`docker:*`, `quality-gate`, `typecheck`, `lint`), devDeps (turbo, concurrently, biome, vitest, typescript). Delete app deps (moved to apps/packages). |
| `pnpm-lock.yaml` | Regenerated by pnpm |
| `.env.example` | Add `DASHBOARD_PASSWORD=changeme` and `DASHBOARD_SESSION_SECRET=<openssl rand -hex 32>` lines |
| `.gitignore` | Add `apps/*/dist/`, `packages/*/dist/`, `.turbo/`, `apps/dashboard/src/route-tree.gen.ts`, `apps/dashboard/dist/` |
| `CLAUDE.md` | Update Commands and Knowledge locations to reflect monorepo + Docker-only |
| `biome.json` | Adjust includes to match new structure |
| `tsconfig.json` (root) | Convert to `tsconfig.base.json` extension + project references aggregator |

### DELETE — replaced by moves

| Path | Reason |
|---|---|
| `src/` | Contents distributed into `apps/worker/`, `packages/storage/`, `packages/logger/` |
| `tests/` | Contents distributed into `apps/worker/tests/`, `packages/storage/tests/` |
| `vitest.config.ts` (root) | Each workspace has its own |
| `tsconfig.json` (root, in current form) | Replaced by `tsconfig.base.json` + per-workspace configs |

## Phase Ordering

Five phases, each ends with a green quality gate. Don't proceed if a phase is red.

1. **Monorepo restructure** (mechanical, zero behavior change). Verifies that workspaces compile and Docker still boots the worker.
2. **API skeleton + Docker multi-process.** Add empty Hono server, run worker + api in parallel, verify both come up.
3. **Auth (HMAC + cookie + 3 routes + middleware).** Pure server-side; no UI yet. Tested via Hono test client.
4. **Read endpoints (stats + activity).** Authenticated routes with seeded-DB tests.
5. **Dashboard SPA (Login + Home).** Vite + React + Tailwind + TanStack + shadcn. Visual fidelity to Paper artboards.

After all 5: smoke test the full flow end-to-end in Docker, update `CLAUDE.md`, commit and open PR.

## Risks / Open Decisions

These get decided during implementation; capture the decision in the commit message.

- **Whether `useStats()` polls or only refetches on focus.** TanStack default (refetch on focus + on mount) is good enough for Phase A. Don't add polling unless explicitly observed staleness during smoke testing.
- **Exact cookie `Domain` attribute.** Default (omitted) → host-only cookie, fine for `localhost`. Don't set `Domain=` unless we add reverse-proxy support later.
- **Rate-limiting login.** 500ms delay on bad password is the only defense in Phase A. If brute-force attempts appear in `pnpm run docker:logs`, add a real limiter (out of Phase A scope, would be a follow-up spec).
- **shadcn `Sonner` Tailwind v4 compat.** May need a small CSS variable adapter. Decide when installing the component; if non-trivial, swap for hand-written toast container.
- **Whether to use Hono's `serveStatic` or a custom catch-all SPA route.** `@hono/node-server`'s `serveStatic` is the canonical way; default to it unless it fails to handle the SPA fallback.
- **Dashboard build artifact location during multi-stage Docker build.** The `runtime` stage needs `apps/dashboard/dist/` to be copied from `builder`. Lock this in the Dockerfile.
