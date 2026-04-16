---
status: draft
feature: dashboard-foundation
created: 2026-04-16
shipped: null
---
# Dashboard Foundation — Spec

**Status:** Draft
**Scope:** Phase A of Zeno's web dashboard. Restructure the repo into a Turborepo monorepo (`apps/worker`, `apps/api`, `apps/dashboard` + `packages/storage`, `packages/logger`), add a Hono HTTP API behind hand-rolled HMAC cookie auth, and ship a Vite + React SPA implementing the Login + Home artboards from spec 0008. Phase B (Crons + Sessions + Settings) and Phase C (Logs + streaming) are explicitly out of scope.

## Context

Spec 0008 designed Zeno's dashboard end-to-end in Paper. The user approved the visual design and the implementation tech stack pivoted from Next.js (placeholder in 0008) to Vite + React + a separate Hono API. Reasoning:

- The dashboard is private, single-user, behind a password — Next.js's RSC/ISR/edge features are wasted weight.
- Constitution favors ports & adapters: a SPA consuming an API is literally that — UI is just another adapter, swappable later without touching the agent.
- Live-tail logs (Phase C) and SSE patterns are more natural in plain React than in App Router.
- Splitting `apps/api` from `apps/worker` keeps each process focused (worker = autonomous agent, api = reactive query/command surface) and avoids the worker becoming a frankenstein process. DB tables are the contract between them; zero direct IPC.

The dashboard will share the existing SQLite database with the worker via the `workspace` Docker volume. better-sqlite3 + WAL allows N concurrent readers + 1 writer, and Phase A is read-only from the API side, so contention is a non-issue.

This phase is foundation work: the layout component, the auth flow, and the build pipeline get used by every subsequent dashboard feature. Getting them right now means Phase B and C are pure feature additions.

## Problem Statement

Today Zeno is invisible outside of Slack:

- The only way to see what crons are scheduled, what sessions are open, or whether a cron run failed is `pnpm run docker:logs | grep cron`. That's fine for the developer; embarrassing to show to anyone.
- There is no operator console. Pausing a cron, inspecting a thread's transcript, restarting the agent, all require either a Slack message to Zeno or `docker exec` + `sqlite3` queries.
- Profile authoring (SOUL.md, USER.md, crons.yaml) is fine over SSH/laptop but painful from a phone.

Phase A doesn't solve all of that — it ships the front door (login) and the at-a-glance view (Home with stats + recent activity timeline). The remaining problems get solved in Phase B and C, riding on the foundation this spec lays.

## Non-Goals

1. **Crons / Sessions / Settings UIs.** Deferred to Phase B (spec 0013). The sidebar shows them as nav items but they render a "coming soon" placeholder or disabled-with-tooltip state.
2. **Logs page + live streaming.** Deferred to Phase C (spec 0014). Requires Pino transport changes and SSE infrastructure that aren't worth doing twice.
3. **`commands` table + worker command poller.** Phase A has no mutations beyond auth — no need for the API → worker coordination mechanism yet. Comes in Phase B with the first write operation (cron pause/resume).
4. **Dashboard chat (talking to the agent via UI).** Acknowledged as a future possibility; would require either IPC + a `WebChannel` adapter in the worker, or a deeper restructure into `apps/agent`. Not designed now.
5. **Hot reload inside the container.** Adds complexity (volume bind of `apps/`, `tsx watch`, named volume for `node_modules`). For Phase A, edits require `pnpm run docker:build && pnpm run docker:up`. Hot reload can come as a separate spec if iteration speed becomes a pain point.
6. **Multi-user, OAuth, password reset, signup, MFA.** Single-user single-password from `DASHBOARD_PASSWORD` env. Constitution-aligned.
7. **Light mode / theme toggle.** Dark only, matching the Paper artboards.
8. **Mobile-responsive layout.** Designed at 1440×900 desktop. Mobile pass is a future spec only if real demand appears.
9. **Playwright e2e tests.** Phase A uses vitest unit + integration via Hono test client. Browser e2e enters Phase B at earliest.
10. **API rate limiting beyond the login endpoint's 500ms delay on bad password.** Internal single-user tool; not a serious threat surface.

## Constraints

- **Docker-only execution.** No `pnpm dev`/`start` scripts in `package.json` that run apps locally. Only `pnpm docker:*` commands. `pnpm run quality-gate` (biome + tsc + knip + vitest) continues to run locally for IDE feedback speed.
- **No `any` and no `// biome-ignore`** anywhere in new code. Existing violations from prior commits stay (cleanup deferred); new code is held to the rule.
- **Turborepo + pnpm workspaces** as the monorepo orchestrator. `apps/` for deployable processes, `packages/` for internal libs (no `packages/shared` umbrella — names by domain).
- **Same container as worker.** Two Node processes running concurrently in one container, orchestrated by `concurrently` with `init: true` (Docker-injected tini) for signal propagation.
- **Single SQLite database.** Worker and API both open `/workspace/zeno.db`. WAL mode (already enabled) allows concurrent reads. API is read-only in Phase A.
- **Visual fidelity to the Paper artboards.** Login + Home + Sidebar must use the locked palette and type system from spec 0008 exactly. Components from shadcn/ui are styled via CSS variables that map 1:1 to the Paper tokens.
- **TypeScript strict mode** everywhere. Each workspace has its own `tsconfig.json` extending a root `tsconfig.base.json`.
- **All HTTP traffic on port 3000.** Same-origin between SPA and API → cookie auth works without CORS. The API serves the dashboard's built static assets at `/` and routes API requests under `/api/*`.

## Design

### Repository structure (after refactor)

```
zeno-agent/
├── apps/
│   ├── worker/       # Slack listener + cron runner + profile watcher + agent core
│   │   └── src/{index.ts, config.ts, agent/, channels/, cron/, profile/}
│   ├── api/          # Hono HTTP server (port 3000)
│   │   └── src/{index.ts, config.ts, server.ts, auth/, routes/}
│   └── dashboard/    # Vite + React + TanStack + shadcn SPA
│       └── src/{main.tsx, routes/, components/, lib/, styles/}
├── packages/
│   ├── storage/      # @zeno/storage — DB + migrations + 3 repos + types
│   └── logger/       # @zeno/logger — pino factory tipado
├── infra/
│   ├── Dockerfile           # multi-stage, builds all workspaces, runtime concurrently
│   └── docker-compose.yml   # init: true, port 3000, named volumes
├── profile/                 # unchanged
├── context/                 # unchanged
├── pnpm-workspace.yaml      # NEW — lists apps/* and packages/*
├── turbo.json               # NEW — pipeline (build, test, lint depend on ^build)
├── tsconfig.base.json       # NEW — strict, target ES2022, module NodeNext
├── biome.json               # unchanged at root, workspaces extend
├── package.json             # root: workspace scripts + turbo + concurrently devDeps
└── .env                     # gains DASHBOARD_PASSWORD + DASHBOARD_SESSION_SECRET
```

Movement summary:
- `src/storage/*` → `packages/storage/src/*`
- `src/logger.ts` → `packages/logger/src/index.ts`
- `src/{agent,channels,cron,profile,index.ts,config.ts}` → `apps/worker/src/*`
- `tests/storage/*` → `packages/storage/tests/*`
- `tests/{agent,cron,profile,channels}/*` → `apps/worker/tests/*`
- All cross-workspace imports become `@zeno/storage` or `@zeno/logger` (no relative paths between workspaces).

### Process model

```
┌───────────────────── Docker container ─────────────────────┐
│                                                            │
│  PID 1: tini (via docker init: true)                       │
│    └── concurrently                                        │
│         ├── [worker] node apps/worker/dist/index.js        │
│         │     ├── Slack Bolt Socket Mode connection        │
│         │     ├── CronRunner (setInterval 60s)             │
│         │     ├── ProfileWatcher (fs.watch)                │
│         │     └── AgentCore (in-process)                   │
│         └── [api] node apps/api/dist/index.js              │
│               ├── Hono server :3000                        │
│               ├── Static SPA at /                          │
│               └── /api/* routes (auth, stats, activity)    │
│                                                            │
│  Shared state: /workspace/zeno.db (better-sqlite3 WAL)     │
│  Shared mounts: /home/node/.claude (volume),               │
│                 /app/profile:ro (bind)                     │
└────────────────────────────────────────────────────────────┘
```

`concurrently --kill-others-on-fail` so a crash in either process kills the container; Docker's restart policy brings it back. Output lines get `[worker]` / `[api]` prefixes; both go to stdout, captured by `pnpm run docker:logs`.

### Auth flow

**Cookie shape:** `zeno_auth=<expiresAtMs>.<hmacSha256Hex(secret, expiresAtMs)>`

Where:
- `secret` is `process.env.DASHBOARD_SESSION_SECRET`, expected length ≥ 32 hex chars (validated at boot).
- `expiresAtMs` is unix ms when the cookie expires (default TTL: 7 days from issue).

**`POST /api/auth/login`:**
1. Body: `{ password: string }` (validated with Zod).
2. `crypto.timingSafeEqual(Buffer.from(body.password), Buffer.from(env.DASHBOARD_PASSWORD))` — same-length comparison; pad shorter side or fail-fast on length mismatch.
3. On mismatch: `await sleep(500)` (anti-brute-force) → `401 { error: 'invalid_credentials' }`.
4. On match: compute `expiresAt = Date.now() + 7 * 24 * 3600 * 1000`, sign HMAC, `Set-Cookie: zeno_auth=<value>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure (if NODE_ENV=production)` → `204 No Content`.

**`requireAuth` middleware (applied to all `/api/*` except `/api/auth/login` and `/api/health`):**
1. Read `zeno_auth` from cookies. If absent → `401`.
2. Split on `.`. If shape wrong → `401`.
3. Recompute HMAC of `expiresAtMs` part with the secret. `crypto.timingSafeEqual(provided, expected)`. If false → `401`.
4. Parse `expiresAtMs`. If `Date.now() > expiresAtMs` → `401`.
5. **Sliding renewal:** if `expiresAtMs - Date.now() < 3.5 days` (>50% TTL gone), issue a fresh cookie via `Set-Cookie` on the response. Continue handler.

**`POST /api/auth/logout`:** `Set-Cookie: zeno_auth=; Max-Age=0; Path=/` → `204`.

**Login page (React):** single password Input + Submit button; on success the API client redirects to `/`; on 401 a Sonner toast renders "senha inválida".

### Read endpoints (Phase A)

| Method | Path | Returns | Notes |
|---|---|---|---|
| `GET` | `/api/health` | `{ status: 'ok', uptime: number }` | Unauthenticated. Used by Docker healthcheck and external monitoring; never used to gate the SPA. |
| `GET` | `/api/auth/me` | `204 No Content` | Authenticated. Used by the SPA's auth guard — middleware-only handler; if `requireAuth` lets it through, the cookie is valid. |
| `GET` | `/api/stats` | `{ activeCrons, sessions24h, runsToday, failures24h }` | All `number`. Each computed by a single SQL `COUNT(*)`: `activeCrons = WHERE enabled=1`; `sessions24h = WHERE last_used_at > datetime('now','-24 hours')` (uses `sessions.last_used_at`, the most recent activity on a thread); `runsToday = WHERE date(started_at) = date('now')`; `failures24h = WHERE status='failed' AND started_at > datetime('now','-24 hours')`. |
| `GET` | `/api/activity?limit=10` | `Array<{ id, kind: 'cron_run' \| 'message_received', timestamp, summary, status }>` | Phase A: just `cron_run` rows from `cron_runs` joined with `crons` for the name. Phase B+ may add `message_received` from a future events stream. |

All authenticated. Each response is JSON validated by a Zod schema co-located with the route — request and response shapes are typed end-to-end via shared types in `apps/api/src/routes/*.types.ts`, importable by the dashboard via duplication (Phase A) or a future shared package (deferred).

### Dashboard SPA

**Routes (TanStack Router, file-based):**

```
src/routes/
├── __root.tsx        # provides QueryClient, renders <Outlet/>; catches auth redirect
├── login.tsx         # /login — public
└── _authed/          # route group with beforeLoad guard
    ├── _layout.tsx   # provides <Sidebar/> + <main>
    └── index.tsx     # / (home)
```

The `_authed` group's `beforeLoad` calls `GET /api/auth/me` (the authenticated lightweight endpoint declared in the read-endpoints table). The middleware either lets it through (204) or returns 401; on 401 the loader throws `redirect({ to: '/login' })`. `/api/health` is **not** used here because it is unauthenticated and would always pass — the guard would never fire.

**Components:**
- `<Layout>` — sidebar (240px fixed) + content area, exact paste of the Paper sidebar (logo, nav with 5 items, status section, user chip)
- `<StatTile>` — Instrument Serif numeral + Inter uppercase label, used 4× on Home
- `<ActivityRow>` — dot + timestamp + kind label + summary, used N× on Home

**Styling:**
- Tailwind v4 with `@theme` block in `globals.css` defining `--canvas`, `--panel`, `--sidebar`, `--text-primary`, etc — exact hex values from spec 0008.
- shadcn components (Button, Input, Sonner) installed via `pnpm dlx shadcn add`, reviewed for any/biome-ignore violations and fixed before commit.
- Inter and Instrument Serif via `<link>` to Google Fonts in `index.html`.

**Data:**
- `lib/api-client.ts` — typed `fetch` wrapper that always sends `credentials: 'include'`, throws on non-2xx with parsed error.
- `lib/query-client.ts` — single `QueryClient` instance with sane defaults (1min staleTime, retry: 1).
- Hooks like `useStats()` and `useActivity()` are thin TanStack Query wrappers around the API client.

### Logger

`@zeno/logger` exports a single function:

```typescript
export function createLogger(options: { service: string }): pino.Logger;
```

Hardcoded JSON format, level from `LOG_LEVEL` env (default `info`), `service` field always present. Worker and API call `createLogger({ service: 'worker' })` / `createLogger({ service: 'api' })` at boot. Pino transport changes (writing to a `logs` table for the Logs page) are deferred to Phase C — out of scope here.

### Docker

**Dockerfile (multi-stage):**

```dockerfile
# Stage 1: base
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends git python3 build-essential gh \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Stage 2: deps (cached when lockfile unchanged)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/storage/package.json ./packages/storage/
COPY packages/logger/package.json ./packages/logger/
RUN pnpm install --frozen-lockfile

# Stage 3: builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/*/node_modules ./apps/
COPY --from=deps /app/packages/*/node_modules ./packages/
COPY . .
RUN pnpm turbo run build

# Stage 4: runtime
FROM base AS runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/dashboard/dist ./apps/dashboard/dist
COPY package.json ./
RUN mkdir -p /workspace && chown node:node /workspace
USER node
EXPOSE 3000
CMD ["pnpm", "exec", "concurrently", "--kill-others-on-fail", \
     "--prefix", "[{name}]", "--names", "worker,api", \
     "node apps/worker/dist/index.js", "node apps/api/dist/index.js"]
```

**docker-compose.yml additions:**

```yaml
services:
  zeno-agent:
    init: true                       # NEW — tini PID 1
    ports:
      - "3000:3000"                  # NEW — dashboard
    volumes:
      - workspace:/workspace
      - claude_home:/home/node/.claude
      - ./profile:/app/profile:ro
volumes:
  workspace:
  claude_home:
```

(No bind mounts on `apps/`/`packages/` — hot reload is non-goal; rebuilds via `pnpm run docker:build`.)

### Files changed / added

| Action | Path |
|---|---|
| NEW | `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` |
| MOVE | `src/storage/*` → `packages/storage/src/*` |
| MOVE | `src/logger.ts` → `packages/logger/src/index.ts` |
| MOVE | `src/{agent,channels,cron,profile,index.ts,config.ts}` → `apps/worker/src/*` |
| MOVE | `tests/storage/*` → `packages/storage/tests/*` |
| MOVE | `tests/{agent,cron,profile,channels}/*` → `apps/worker/tests/*` |
| NEW | `packages/{storage,logger}/{package.json,tsconfig.json,vitest.config.ts}` |
| NEW | `apps/worker/{package.json,tsconfig.json,vitest.config.ts}` |
| NEW | `apps/api/**` (full tree) |
| NEW | `apps/dashboard/**` (full tree) |
| EDIT | `infra/Dockerfile` (multi-stage refactor for monorepo) |
| EDIT | `infra/docker-compose.yml` (init, port 3000) |
| EDIT | `package.json` root (workspaces, turbo + concurrently devDeps, docker scripts) |
| EDIT | `.env.example` (add `DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`) |
| EDIT | `CLAUDE.md` (update Knowledge locations + commands sections) |

## User Stories / Scenarios

1. **Operator opens the dashboard for the first time.**
   - Boot the container, navigate to `http://localhost:3000`.
   - SPA loads → no cookie present → redirect to `/login`.
   - Operator types the password from `.env` → submit.
   - Cookie set, redirect to `/`.
   - Sees "Boa noite, Operator." (or "Bom dia"/"Boa tarde" based on local hour) + 4 stat tiles with real numbers + activity timeline with the last 10 cron runs.

2. **Operator hits the dashboard with an expired session.**
   - Cookie present but `expiresAt < now` → middleware returns 401 to `/api/health` → TanStack Router `beforeLoad` catches → redirect to `/login`.

3. **Operator types wrong password 3 times.**
   - Each attempt waits 500ms server-side. No lockout in Phase A — relies on the slowdown to make brute force impractical for a single-user local tool.

4. **Worker is down but API is up.**
   - Stats and activity queries succeed (read directly from DB).
   - Sidebar status indicator (next to "backend" / "slack" / "runner" labels) would show red — but **the status indicator is part of Phase A's Layout**, populated from a `GET /api/health` that includes a coarse worker-heartbeat check (read the most recent `cron_runs.started_at` and infer "ticking" if within last 90s).
   - In Phase A this is best-effort; full worker-health protocol comes with the `commands` table in Phase B.

5. **Operator wants to log out.**
   - Click the user chip in the sidebar → dropdown → "Sair" → `POST /api/auth/logout` → redirect `/login`.

## Success Criteria

1. `pnpm run quality-gate` is green after the refactor: 75 existing tests still pass, plus new tests for `apps/api` (auth + stats + activity routes via Hono test client) and `apps/dashboard` (basic component render of Login + Home).
2. `pnpm run docker:build && pnpm run docker:up` succeeds. `pnpm run docker:logs` shows both `[worker] zeno_online` and `[api] api listening on :3000`.
3. `curl http://localhost:3000/api/health` → `200 {"status":"ok","uptime":N}`.
4. Browser at `http://localhost:3000` redirects to `/login` when no cookie is present.
5. Submitting the wrong password shows a Sonner toast with "senha inválida" and no cookie is set.
6. Submitting the correct password sets the cookie and lands on `/` showing: greeting line, 4 stat tiles with values matching the DB, an activity timeline with up to 10 most recent cron runs.
7. F5 (browser refresh) keeps the operator authenticated until the cookie expires.
8. Logout clears the cookie and returns to `/login`.
9. Visual rendering of `/` and `/login` matches the corresponding Paper artboards (palette, type, spacing) on a 1440×900 viewport.
10. No `any` types or `// biome-ignore` comments in any code added by this spec.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Refactor breaks the existing 75 tests | Move workspace by workspace; run `pnpm run quality-gate` after each move; commit per workspace so a bad move can be reverted cheaply. |
| shadcn copies a component containing `any` or a biome-ignore | Review every pasted component before commit; refactor to `unknown` + narrow or rewrite the offending bit. If a component is genuinely irreparable, swap that one specifically for a hand-written Radix wrapper. |
| Two SQLite connections (worker + api) race or corrupt data | better-sqlite3 + WAL is documented to support N readers + 1 writer concurrently. API is read-only in Phase A; no contention possible. The risk surfaces only with Phase B writes. |
| Cookie missing `Secure` in dev breaks something | Conditional flag on `NODE_ENV === 'production'`. Tested explicitly. |
| Tailwind v4 + shadcn integration has rough edges (both relatively new together) | Plan B documented: fall back to Tailwind v3 if blocking issue appears. ~30min cost of rework. |
| Build of the dashboard takes too long inside Docker | Turborepo cache + `apps/dashboard/dist/` is a build artifact in the image (not built at runtime). Cold build ~30s, cached <5s. |
| `concurrently` swallows or delays exit codes / signals | `init: true` (tini) handles signal propagation correctly. `--kill-others-on-fail` ensures one crash takes the container down for Docker to restart. Tested with `docker stop` (SIGTERM should reach Slack disconnect handler in worker). |
| User confuses "dashboard down" vs "agent down" | Sidebar status block (Phase A) shows three indicators: backend, slack, runner. Each pulled from a `GET /api/health` enriched with last-tick timestamp from `cron_runs`. Operator can see at a glance whether the worker is ticking even when the dashboard is up. |
| TS path alias `@zeno/storage` resolves at compile-time but blows up at runtime | pnpm workspaces handle this natively (workspace deps install as symlinks); no path-alias hack needed. Confirmed by `node` resolving `@zeno/storage` from `apps/api/node_modules/@zeno/storage`. |
| Existing `any`/`biome-ignore` violations in legacy code (claude-code.ts, slack adapter, normalize, tests) interfere with strict mode | Out of scope for Phase A (user explicitly deferred cleanup). New code follows the rule; old code untouched until a separate cleanup pass. |

## Open Questions

None blocking. Implementation will surface tactical detail like:
- Exact JSON shape of `Set-Cookie` returned for tests (parse vs. literal compare).
- Whether the `useStats()` hook polls (every 30s?) or just refetches on focus (TanStack default).
- Whether shadcn's `Sonner` integration on Tailwind v4 needs a small CSS variable shim.

These are low-risk, decided during implementation per spec's intent.
