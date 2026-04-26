---
feature: connectors-dashboard
spec: "[[spec]]"
created: 2026-04-26
---
# Connectors Dashboard — Plan

**For this spec:** `[[spec]]`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended — multi-app, multi-package, coordinated changes). TDD-shaped for non-UI units. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up `/connectors` end-to-end. Catalog, API, worker handlers, frontend port — all wired together and observable.

**Architecture:** Pulls together specs 0032 (DB-first MCP loader, ConnectorRepo, per-tool permissions) and 0033 (remote transport) by adding the API and UI surfaces. Mutations flow through the existing `commands` table (spec 0013) for actions that need worker-side side effects; toggle and per-tool permission edits go straight to DB. Test connection runs in the API process via a new shared `@zeno/mcp-discover` package. Frontend ports the validated `apps/design` layout, swaps fixtures for live data, follows the project's `useOptimisticMutation` + fire-and-forget mutation conventions.

**Tech Stack:** No new dependencies. Same as spec 0013 — Hono + cookie auth on the API, Vite + React 19 + Tailwind v4 + TanStack Router + Query on the dashboard. New workspace package `@zeno/mcp-discover` reuses the SDK already pinned by `apps/worker`.

## Approach

Eight phases, ordered to minimize breakage:

1. **Catalog data + assets.** `agent/connectors-catalog.json` + 8 SVG icons + optional schema.
2. **Extract `@zeno/mcp-discover` package.** Pure refactor — moves `mcp-discover.ts` and the helpers it imports out of the worker into a workspace package. Worker tests stay green.
3. **API: read endpoints.** `GET /api/connectors`, `:id`, `:id/activity`, `/catalog`, `/catalog/icons/:filename`. No worker action.
4. **API: synchronous test endpoints.** `POST /api/connectors/test`, `POST /api/connectors/:id/test`. Use the new package.
5. **API: direct mutations.** Toggle, per-tool permission, bulk permission, secret reveal (with rate-limit + audit log). No worker action.
6. **API: command-enqueueing mutations.** Create, update, refresh-tools, uninstall — plus the four worker handlers.
7. **Dashboard frontend port.** Routes, components, hooks, modals. Wired to live data.
8. **Smoke + manual e2e.** Quality gate + Docker run + a real catalog install end-to-end.

The plan is **TDD-shaped for the API routes, the worker handlers, and the package extract** (the latter is verified by all existing worker tests passing after the move). UI work gets smoke render tests; visual fidelity is verified manually against `apps/design`.

No `any`, no `// biome-ignore` in new code.

## Architecture

```
                       ┌── Browser SPA (Dashboard) ──┐
                       │  /connectors                 │
                       │  /connectors/$id             │
                       │  modals (5)                  │
                       └──────────────┬───────────────┘
                                      │ HTTP :3000 (cookie)
                                      ▼
┌─────── Docker container ─────────────────────────────────────────┐
│                                                                  │
│  [api] node apps/api/dist/index.js                               │
│   ├── /api/connectors/**          (read + mutate)                │
│   │     ├── reads → ConnectorRepo                                │
│   │     ├── direct writes → ConnectorRepo                        │
│   │     ├── test → @zeno/mcp-discover (SYNC, in-process)         │
│   │     └── command-enqueue → CommandRepo (fire-and-forget)      │
│   └── /api/connectors/catalog     (reads agent/connectors-catalog│
│                                    .json + serves SVG icons)     │
│                                                                  │
│  [worker] node apps/worker/dist/index.js                         │
│   ├── existing CommandsPoller picks up new types:                │
│   │     connector_create, connector_update,                      │
│   │     connector_refresh_tools, connector_uninstall             │
│   └── existing chat/cron backends already read connectors        │
│       from DB on each turn (spec 0032)                           │
│                                                                  │
│  shared:                                                         │
│   - /workspace/zeno.db (better-sqlite3)                          │
│   - agent/connectors-catalog.json (read-only)                    │
│   - agent/assets/connectors/*.svg                                │
└──────────────────────────────────────────────────────────────────┘
```

## File Structure

### NEW packages

```
packages/mcp-discover/
├── package.json               name: @zeno/mcp-discover
├── tsconfig.json
├── src/
│   ├── index.ts               re-exports the public API
│   ├── discover.ts            discoverTools(connector, secrets) — dispatcher
│   ├── discover-stdio.ts      stdio transport (moved from apps/worker)
│   ├── discover-remote.ts     remote transport (moved from apps/worker)
│   ├── build-config.ts        toStdioConfig, toRemoteConfig, RESERVED_* keys
│   └── classify.ts            heuristic category classifier
└── tests/
    └── (mirrors apps/worker tests/agent/mcp-* — moved or duplicated; see Phase 2)
```

### NEW files

#### Catalog (Phase 1)

| File | Responsibility |
|---|---|
| `agent/connectors-catalog.json` | Eight catalog entries per spec §Catalog file |
| `agent/connectors-catalog.schema.json` | Optional JSON Schema for validation |
| `agent/assets/connectors/linear.svg` | Brand or design-system glyph |
| `agent/assets/connectors/notion.svg` | … |
| `agent/assets/connectors/granola.svg` | … |
| `agent/assets/connectors/sentry.svg` | … |
| `agent/assets/connectors/github.svg` | … |
| `agent/assets/connectors/slack.svg` | … |
| `agent/assets/connectors/google-drive.svg` | … |
| `agent/assets/connectors/cloudflare.svg` | … |

#### API (Phases 3-6)

| File | Responsibility |
|---|---|
| `apps/api/src/routes/connectors.ts` | All `/api/connectors/*` route handlers |
| `apps/api/src/lib/connector-shapes.ts` | API response types per spec §Type extensions; or co-locate in `@zeno/storage` |
| `apps/api/src/lib/catalog-loader.ts` | Reads `agent/connectors-catalog.json` + validates against schema; resolves `iconUrl` for each entry |
| `apps/api/src/lib/secret-rate-limit.ts` | In-memory rate limiter for the reveal endpoint |
| `apps/api/tests/routes/connectors.test.ts` | Hono test-client integration tests (read endpoints, mutations, test endpoints, secret reveal) |
| `apps/api/tests/lib/catalog-loader.test.ts` | Catalog loader unit tests |
| `apps/api/tests/lib/secret-rate-limit.test.ts` | Rate limiter unit tests |

#### Worker handlers (Phase 6)

| File | Responsibility |
|---|---|
| `apps/worker/src/commands/handlers/connector-create.ts` | `handleConnectorCreate(cmd)` |
| `apps/worker/src/commands/handlers/connector-update.ts` | `handleConnectorUpdate(cmd)` |
| `apps/worker/src/commands/handlers/connector-refresh-tools.ts` | `handleConnectorRefreshTools(cmd)` |
| `apps/worker/src/commands/handlers/connector-uninstall.ts` | `handleConnectorUninstall(cmd)` |
| `apps/worker/tests/commands/handlers/connector-*.test.ts` | One test file per handler |

#### Dashboard (Phase 7)

| File | Responsibility |
|---|---|
| `apps/dashboard/src/routes/_authed/connectors.tsx` | List screen |
| `apps/dashboard/src/routes/_authed/connectors.$id.tsx` | Detail screen (parameterized — replaces the per-connector hardcoded screens in `apps/design`) |
| `apps/dashboard/src/routes/_authed/connectors.add-catalog.$catalogId.tsx` | Catalog install modal route |
| `apps/dashboard/src/routes/_authed/connectors.add-local.tsx` | Custom stdio modal route |
| `apps/dashboard/src/routes/_authed/connectors.add-remote.tsx` | Custom remote modal route |
| `apps/dashboard/src/routes/_authed/connectors.$id.refresh-tools.tsx` | Refresh-tools modal |
| `apps/dashboard/src/routes/_authed/connectors.$id.uninstall.tsx` | Uninstall modal |
| `apps/dashboard/src/components/connectors/activity-section.tsx` | Ported from `apps/design` |
| `apps/dashboard/src/components/connectors/catalog-grid.tsx` | Ported, fetches via `useCatalog` |
| `apps/dashboard/src/components/connectors/kebab-menu.tsx` | Ported |
| `apps/dashboard/src/components/connectors/modal-backdrop.tsx` | Ported |
| `apps/dashboard/src/components/connectors/status-pill.tsx` | Extracted from per-detail screens |
| `apps/dashboard/src/lib/use-connectors.ts` | List query |
| `apps/dashboard/src/lib/use-connector.ts` | Detail query |
| `apps/dashboard/src/lib/use-connector-activity.ts` | Activity feed query |
| `apps/dashboard/src/lib/use-catalog.ts` | Catalog query (long stale time) |
| `apps/dashboard/src/lib/use-connector-mutations.ts` | All mutations |

### MODIFIED files

| File | Change |
|---|---|
| `apps/worker/src/commands/dispatcher.ts` | Add the four new command types to the dispatch map |
| `apps/worker/src/commands/handlers/index.ts` | Export the four new handlers |
| `apps/worker/src/index.ts` | Wire the four new handlers into `buildHandlerMap` |
| `apps/worker/src/agent/mcp-discover.ts` | Reduced to a thin re-export from `@zeno/mcp-discover` (or deleted entirely if no internal usage remains; transitional) |
| `apps/worker/src/agent/mcp-build.ts` | Imports `@zeno/mcp-discover` for the helpers it now shares |
| `apps/api/src/server.ts` | Mount `/api/connectors/*` routes |
| `apps/dashboard/src/components/layout/sidebar.tsx` | Add Connectors entry |
| `apps/dashboard/src/lib/query-client.ts` | Document the new query keys in comments |
| `packages/storage/src/types.ts` | Extend `CommandType` union with the four new values (`'connector_create' \| 'connector_update' \| 'connector_refresh_tools' \| 'connector_uninstall'`). Connector data types (`Connector`, `ConnectorSecret`, etc.) were already added in spec 0032; this spec only touches `CommandType`. See tasks Phase 6 Task 6.0. |
| `packages/mcp-discover/package.json` | New package manifest |
| `pnpm-workspace.yaml` | Add `packages/mcp-discover` |

### REMOVED files

| File | Reason |
|---|---|
| `apps/worker/src/agent/mcp-discover.ts` | Moved to `@zeno/mcp-discover` (or kept as a thin re-export per the table above; pick one in implementation) |

## Phase Ordering

### Phase 1 — Catalog + assets (independent)

- Author the JSON file with 8 entries.
- Author the schema (optional but recommended).
- Add 8 SVG icons. Style guidance: monochrome coral if a brand glyph clashes; otherwise the upstream brand mark in muted form.
- Quality gate: `pnpm run lint` accepts the new files.

### Phase 2 — Extract `@zeno/mcp-discover`

- Create the package directory + `package.json` + `tsconfig.json`.
- Move `apps/worker/src/agent/mcp-discover.ts` and its dependencies (`build-config.ts`, the heuristic, `discover-stdio.ts`, `discover-remote.ts`) into the package. Update import paths in `apps/worker`.
- Move the corresponding tests or keep them in `apps/worker/tests/agent/` with updated imports. Pick one location; the package's own tests are cleaner long-term.
- Update `apps/worker/src/agent/mcp-build.ts` (the loader) to import from `@zeno/mcp-discover`.
- Quality gate: full repo green; spec 0032's matrix tests still pass; spec 0033's matrix tests still pass.

### Phase 3 — API read endpoints

- `GET /api/connectors` — joins the connectors list with tool counts and 24h invocation counts.
- `GET /api/connectors/:id` — full detail with tools + masked secrets (`last4` from the stored value).
- `GET /api/connectors/:id/activity?limit=20` — invocation feed.
- `GET /api/connectors/catalog` — read JSON + resolve icon URLs + flag installed entries.
- `GET /api/connectors/catalog/icons/:filename` — serve SVG with a long-cache header (`Cache-Control: public, max-age=86400`). Validate the filename is in the catalog (defends against path traversal).
- Each endpoint has a Hono test-client test.
- Quality gate green.

### Phase 4 — Synchronous test endpoints

- `POST /api/connectors/test` — receives the unsaved config, calls `discoverTools` from `@zeno/mcp-discover`, returns the typed result.
- `POST /api/connectors/:id/test` — same, but for an installed connector; persists `lastError` / `lastErrorAt` / `lastVerifiedAt`.
- Tests run against the fixture stdio MCP from spec 0032 and the fixture remote MCP from spec 0033. The fixtures are reused — they live under `apps/worker/tests/fixtures/` and are accessible to API tests via path resolution.
- Quality gate green.

### Phase 5 — Direct mutations

- `PATCH /api/connectors/:id/toggle` — flip status, return the new status.
- `PATCH /api/connectors/:id/tools/:toolName/permission` — update single permission row.
- `PATCH /api/connectors/:id/tools/permissions/bulk` — update per category.
- `GET /api/connectors/:id/secrets/:key/reveal` — rate-limited + audited reveal.
- Tests for each, including the rate-limit (assert second call within 60s gets 429) and the audit log write.
- Quality gate green.

### Phase 6 — Command-enqueueing mutations + handlers

- API endpoints: `POST /api/connectors`, `PATCH /api/connectors/:id`, `POST /api/connectors/:id/refresh-tools`, `DELETE /api/connectors/:id`. Each enqueues the matching command type.
- Worker handlers: one file per type, each with unit tests using a stub `ConnectorRepo` and a stub `discoverTools` for the refresh path.
- Wire handlers in `apps/worker/src/commands/handlers/index.ts` and `dispatcher.ts`. Update `index.ts` to include them in `buildHandlerMap`.
- Integration test: enqueue one of each command type via the API, drive a worker tick, assert the DB state matches and the command row reaches `status='success'`.
- Quality gate green.

### Phase 7 — Dashboard frontend port

- Sidebar entry first (smallest visible change; wires the route).
- Hooks (queries + mutations) before components.
- Components ported one at a time from `apps/design` to `apps/dashboard`. Order: `status-pill` → `catalog-grid` → `kebab-menu` → `modal-backdrop` → `activity-section`.
- Routes: list → detail → modals.
- Smoke render tests per route (just assert no throw on empty/loading/error states).
- Manual visual diff between `apps/design` and `apps/dashboard` after each route lands; tweak markup/classes if needed (the design system tokens transfer 1:1).
- Quality gate green.

### Phase 8 — End-to-end smoke

- `pnpm run docker:build`, `pnpm run docker:up`.
- Visit `http://localhost:3000/connectors`. Empty list. Catalog grid visible.
- Install Linear from catalog with a real (or fixture) API key. Test passes. Add succeeds.
- Connector appears as `enabled` with last_verified_at set.
- Send `@zeno list my linear issues` in Slack. Agent uses the connector. Invocation row appears in the Activity feed within 1.5s of refresh.
- Toggle off. Send the same message again. Agent reports it doesn't have Linear tools.
- Toggle on. Send again. Agent uses the connector.
- Refresh tools. Permissions reset to defaults.
- Uninstall. Connector disappears.
- Quality gate green.
- Update `context/specs/0034-connectors-dashboard/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.

## Risks / Open Decisions

- **Whether `apps/worker/src/agent/mcp-discover.ts` becomes a thin re-export or is deleted entirely.** Implementation choice. Cleaner is delete; transitional risk is lower with a re-export. Either is fine.
- **Whether the SVG icons for the eight catalog entries are brand-true or design-system monochromes.** Style decision; honor "single coral accent per screen" rule from spec 0008 / 0017. If brand glyphs clash, fall back to monochromes built in the design system.
- **Where the `connectorRepo` instance comes from inside the API process.** Hono's app context already holds DB-backed repos in spec 0013's pattern. The instantiation point in `apps/api/src/index.ts` (or wherever) gains a `new ConnectorRepo(db)`. Implementer follows the existing repo wiring convention.
- **Optional JSON Schema validation of the catalog file.** Adds dependency on `ajv` or similar. Project may already have it via `zod`-from-JSON-Schema; if not, prefer a hand-rolled validator (the catalog shape is simple). Implementation choice — cheap to add later.
- **How to expose `@zeno/mcp-discover` to the API workspace.** Add to `apps/api/package.json` deps as `"@zeno/mcp-discover": "workspace:*"`. Standard pnpm workspace pattern.
- **Rate-limit storage scope.** A single Map shared across the API process is fine. If the API ever runs multi-instance, move to a DB column or external store. Out of scope.
- **Whether to add a separate `connector_test` command for symmetry.** Decided against (spec § Test connection architecture). The synchronous in-API approach wins for UX latency.
- **Dashboard route naming conventions for nested modal routes.** TanStack Router flat-file naming is `connectors.$id.refresh-tools.tsx` for `/connectors/$id/refresh-tools`. Verify with `tanstack/router-vite-plugin` config in the dashboard.
- **Whether `useCatalog` polls or is purely cache-driven.** Catalog file changes only with deploys. Use a long stale time (1 hour) and refetch-on-focus. No polling.
- **How to surface a custom remote connector's `__MCP_TYPE__` override in the form.** Hide it under "Advanced > Transport type" with values `auto` / `http` / `sse`; persist `__MCP_TYPE__` in the secrets table only when the operator picks `http` or `sse`. `auto` (default) means no row written. The dashboard converts before the API call.
- **Activity feed pagination.** "Last 20" is a hardcoded limit in the API. If the feed grows usable beyond that, add a `?cursor=` query later. Out of scope.
