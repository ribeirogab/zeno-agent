---
status: shipped
feature: connectors-dashboard
created: 2026-04-26
shipped: 2026-04-26
---
# Connectors Dashboard — Spec

**Status:** Draft
**Scope:** Implements the Connectors UI defined in spec 0029 against the backend laid down by specs 0032 (storage + stdio) and 0033 (remote). Adds Hono API endpoints under `/api/connectors`, the `agent/connectors-catalog.json` data file, four worker-side commands (`connector_create`, `connector_update`, `connector_refresh_tools`, `connector_uninstall`) plumbed through the existing `commands` table, and ports the validated UI from `apps/design/src/routes/dashboard/connectors/` into `apps/dashboard/src/routes/_authed/connectors.*` with real data wiring (TanStack Query + the project's `useOptimisticMutation` pattern).

## Context

Spec 0029 defined behavior. Spec 0032 made the worker DB-aware. Spec 0033 lit up remote transport. Now the dashboard becomes the operator surface.

Three pieces have to land together for this to be coherent:

1. **The catalog data file** (`agent/connectors-catalog.json`) — read by the API to render the directory area of the list screen and to drive the catalog install modal's form schema. Spec 0029 §Catalog Model defined the entry shape; this spec lands the file with eight initial entries (linear, notion, granola, sentry, github, slack, google-drive, cloudflare).
2. **The API surface** — read endpoints for installed connectors and the catalog, write endpoints for install / edit / toggle / refresh-tools / uninstall, a synchronous test-connection endpoint, and the secret-reveal endpoint. Mutations follow the **fire-and-forget command pattern** established in spec 0013: enqueue a row in `commands`, return `204`, the worker processes within a tick, the dashboard refetches after a 1.5s delay. Toggle and per-tool permission edits do NOT need a worker action — they are direct DB writes from the API (the worker reads them on the next agent turn via spec 0032's `getMcpServers` factory).
3. **The dashboard frontend** — port what exists in `apps/design`, swap fixture data for live API queries, hook up mutations using `useOptimisticMutation` + `cacheChange<T>()` per the project convention, and wire all five existing modals (catalog install, custom local, custom remote, refresh-tools, uninstall) to real endpoints.

The result: an operator opens `/connectors`, picks Linear from the catalog, pastes a key, clicks Test, clicks Add — and the next time they ask Zeno to look at Linear, it works. Without restarting anything.

## Problem Statement

Specs 0032 and 0033 ship a worker that can read connectors from the DB but no human-facing way to manage them. The dashboard surface in spec 0029 + the validated design playground in `apps/design` exist but are not wired to anything. Operators can only manage connectors via direct SQL, which is unfriendly and contradicts the feature's whole point ("connect Zeno to external tools without writing code").

This spec closes the loop.

## Non-Goals

1. **Real OAuth flow orchestration.** Spec 0029 §Non-Goal 9; spec 0033 reaffirmed. The Advanced section of the Add custom (remote) modal collects the bearer token; no dynamic registration.
2. **Encryption-at-rest of secrets.** Inherited from spec 0032 §Non-Goal 5.
3. **Catalog growth ergonomics** (search/filter/pagination inside the catalog area). Eight entries fit; revisit at ~30+. Spec 0029 §Open Question 3.
4. **Multi-profile switcher in the dashboard UI.** The dashboard already binds to the active session's profile; profile switching is a separate concern.
5. **Per-connector activity retention policy.** The Activity feed reads the most recent 20 invocations from `connector_invocations`; no UI for older history. Spec 0032 § Risks calls retention out as a follow-up.
6. **Bulk operations on multiple connectors.** No "select all and disable". The list affords actions per row only.
7. **Server-side rendering / streaming of connector pages.** The dashboard is a client SPA; data loads via queries.
8. **Catalog sourcing from a remote registry.** Static JSON in repo. Spec 0029 §Non-Goal 6.
9. **Real-time updates via SSE / WebSocket.** TanStack Query refetch-on-focus + delayed invalidation post-mutation, matching spec 0013's pattern.
10. **Audit log surfacing in the UI.** The `approvals_log` table is queryable elsewhere (logs page); the connectors UI shows only `connector_invocations`.
11. **Tool category override** (manual move between read/write/interactive). Spec 0029 §Non-Goal 1; spec 0032 §Non-Goal 8.
12. **Reorderable lists, drag-drop.** Spec 0029 §Non-Goal 12.

## Constraints

- **Same Hono API + cookie auth as spec 0013.** All `/api/connectors/*` routes sit behind `requireAuth`. The SPA uses the existing `apiFetch` helper.
- **Mutations route through the `commands` table.** The worker is the only writer for connector lifecycle changes that need runtime side effects (spawn an MCP, kill a process, reload the SDK config). The API never touches MCP processes directly. **Exceptions** that DO write directly from the API (no command needed):
  - **Toggle** (`PATCH /api/connectors/:id/toggle` — flips `status` between `enabled` and `disabled`). The worker reads `status` per turn via `getMcpServers`, so the next turn picks it up. No process to kill (stdio MCPs are spawned per-call by the SDK; remote MCPs are reconnected per-call).
  - **Tool permission edits** (`PATCH /api/connectors/:id/tools/:toolName/permission`, `PATCH /api/connectors/:id/tools/permissions/bulk` for category-wide). The policy reads from the DB on each tool call; immediate effect.
  - **Test connection** for an *unsaved* config (`POST /api/connectors/test`). Synchronous endpoint — uses the worker's `discoverTools` helper through a direct call. Does not write to DB.
  - **Test connection** for an *installed* connector (`POST /api/connectors/:id/test`). Same call, but persists the result (updates `last_error`, `last_error_at`, `last_verified_at`).
- **Synchronous test-connection endpoint runs *in-process*.** Adding a separate "test_connection" command type would make the dashboard wait for the worker tick + the spawn + the response — round-trip too slow for a user-facing button (~2-5s minimum). The API process is the same Node container as the worker, but a different process. The API reaches into the worker via... wait, that breaks the constitution ("DB is the contract"). Resolution: **the test-connection endpoint runs `discoverTools` from the API process directly**, importing the helper from a new package or duplicating it. This is the second "duplication for boundary clarity" decision in the project (spec 0013 §`mcpServers` duplicated `loadMcpConfig` between API and worker for the same reason). Concretely: extract `discoverTools` into a new package `@zeno/mcp-discover` (or duplicate inline into `apps/api/src/lib/mcp-discover.ts`). Decision below in §Test connection architecture.
- **Toggle and tool-permission edits are direct API writes.** They affect runtime via the DB-on-each-turn read (no worker tick needed). This is acceptable because they are reversible single-column updates with no process side effects.
- **Catalog file location and shape.** `agent/connectors-catalog.json` at repo root (matches `agent/skills/`). Read fresh by the API on each `/api/connectors/catalog` request (small file, low traffic). No caching layer in MVP.
- **Catalog icons.** SVG assets at `agent/assets/connectors/<id>.svg`. Served by the API under `/api/connectors/catalog/icons/<id>.svg` with a long-cache header. Eight initial assets shipped in this spec.
- **TanStack Query keys.** Establish conventions in this spec, document them in `apps/dashboard/src/lib/query-client.ts` comments:
  - `['connectors']` — list of installed connectors.
  - `['connectors', id]` — connector detail (includes secrets metadata + tools).
  - `['connectors', id, 'activity']` — invocation feed.
  - `['catalog']` — catalog entries.
- **Optimistic mutation pattern.** Per the project convention (`feedback_apps_design_data_pattern` learning + `useOptimisticMutation` + `cacheChange<T>()`). Toggle, permission edits, and uninstall are optimistic. Create / update / refresh-tools follow the fire-and-forget shape (toast + delayed invalidate, like crons).
- **Secret reveal endpoint is rate-limited and audited.** `GET /api/connectors/:id/secrets/:key/reveal` returns the plaintext value, but only one reveal per (connector, key) per minute, and every reveal writes a log row (`event=connector_secret_revealed`, no value content). The dashboard's "eye icon" calls this endpoint on click; the value is held in browser memory only for the auto-hide window (10s per spec 0029 §Connection section).
- **Mask shape for secrets in list/detail responses.** API returns `{ key, masked: true, last4: 'xxxx' }` or `{ key, masked: false, value: '<plaintext>' }` (the latter only on the reveal endpoint). The list/detail responses always have `masked: true` plus `last4` of the stored value (so the UI can show `••••XXXX`). Empty values still show `••••`.
- **Custom connector slug derivation.** API endpoint `POST /api/connectors` accepts `displayName: string`; the API derives `slug = slugify(displayName)` and resolves collisions via `slug-2`, `slug-3`, etc. The collision logic queries the DB for existing slugs before insert. Implementation detail: this is API-side, not repo-side (spec 0032 left collision handling to the writer).
- **Worker command shapes.** Four new types: `connector_create`, `connector_update`, `connector_refresh_tools`, `connector_uninstall`. Each is a payload-bearing command processed by a new handler. The worker's `commands_poller` (spec 0013) is the dispatch engine — no new poller.
- **Frontend route paths.** `/connectors`, `/connectors/$id`. Modals are nested routes (`/connectors/add-catalog/$catalogId`, `/connectors/add-local`, `/connectors/add-remote`, `/connectors/$id/refresh-tools`, `/connectors/$id/uninstall`) following the same convention used in `apps/design`.
- **API route registration order.** Hono matches routes in registration order. Static path segments under `/api/connectors/*` (e.g., `/catalog`, `/test`, `/catalog/icons/:filename`) MUST be registered **before** any dynamic `:id` route. Otherwise a request for `/api/connectors/catalog` matches `:id='catalog'` and 404s. Concretely the registration order is: catalog endpoints first, then `/test`, then `/:id`, then `/:id/*` sub-routes. Tasks enforce this in the route-scaffolding step.
- **Sidebar update.** `apps/dashboard/src/components/layout/sidebar.tsx` (or wherever sidebar lives — verify during implementation) gains a Connectors entry between Sessions and Logs (per the design playground's order). Single icon, no badge.
- **Style + tokens.** Reuse exactly what `apps/design` produced (tokens locked from spec 0008 / 0017 / 0031). The port is "swap fixtures for live data," not "redo design."
- **No `any`, no `// biome-ignore`** in new code.

## Design

### Catalog file `agent/connectors-catalog.json`

```json
{
  "$schema": "./connectors-catalog.schema.json",
  "version": 1,
  "connectors": [
    {
      "id": "linear",
      "name": "Linear",
      "description": "Issues, projects, cycles.",
      "icon": "linear.svg",
      "docsUrl": "https://linear.app/docs",
      "transport": "remote",
      "transportConfig": { "url": "https://mcp.linear.app/sse" },
      "secrets": [
        { "key": "__MCP_AUTHORIZATION__", "label": "Linear API Key", "help": "Get one at linear.app/settings/api. Paste as `Bearer xxx` (the dashboard will prepend Bearer if you forget).", "required": true }
      ],
      "tools": [
        { "name": "list_issues", "description": "List issues with filters and pagination.", "category": "read", "defaultPermission": "always_allow" },
        { "name": "get_issue", "description": "Fetch a single issue by id.", "category": "read", "defaultPermission": "always_allow" },
        { "name": "create_issue", "description": "Create a new issue.", "category": "write", "defaultPermission": "ask" },
        { "name": "update_issue", "description": "Update issue fields.", "category": "write", "defaultPermission": "ask" },
        { "name": "delete_issue", "description": "Permanently delete an issue.", "category": "write", "defaultPermission": "ask" }
      ],
      "tags": ["issues", "productivity"]
    },
    { /* notion */ },
    { /* granola */ },
    { /* sentry */ },
    { /* github */ },
    { /* slack */ },
    { /* google-drive */ },
    { /* cloudflare */ }
  ]
}
```

The full eight entries are populated at implementation time per spec 0029 §Initial catalog. The catalog reader returns the parsed JSON wholesale.

The optional `connectors-catalog.schema.json` is a JSON Schema that the API validates against on read (defensive — catches malformed entries early). If validation fails, the API responds 500 with `{ error: 'catalog malformed', detail: '...' }`.

### Type extensions in shared types

A new package or shared module exposes types used by both the API and the dashboard:

- `@zeno/storage` already exports `Connector`, `ConnectorSecret`, `ConnectorToolPermission`, `ConnectorInvocation`, etc. (spec 0032).
- The API response shapes layer on top:

```typescript
// apps/api/src/lib/connector-shapes.ts (or shared in @zeno/storage if convenient)

export interface MaskedSecret {
  key: string;
  masked: true;
  last4: string;
}

export interface ConnectorListItem {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  source: 'catalog' | 'custom';
  catalogId: string | null;
  iconUrl: string | null;        // resolved at API time: catalog → /api/connectors/catalog/icons/<id>.svg, custom → null
  transport: 'stdio' | 'remote';
  status: 'enabled' | 'disabled' | 'pending';
  lastError: string | null;
  lastErrorAt: string | null;
  lastVerifiedAt: string | null;
  toolCount: number;             // SUM of tool rows
  invocationCount24h: number;    // count from connector_invocations WHERE created_at > now-24h
}

export interface ConnectorDetail extends ConnectorListItem {
  command: string | null;
  args: string[] | null;
  url: string | null;
  secrets: MaskedSecret[];
  tools: Array<{
    toolName: string;
    description: string | null;
    category: 'read' | 'write' | 'interactive';
    permission: 'always_allow' | 'ask' | 'never';
  }>;
}

export interface CatalogEntryPublic {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  docsUrl: string;
  transport: 'stdio' | 'remote';
  // transportConfig is NOT returned to the dashboard — it's used internally to build commands.
  secrets: Array<{ key: string; label: string; help: string; required: boolean }>;
  toolCount: number;
  isInstalled: boolean;          // true when this catalog id already exists in the DB
}

export interface TestConnectionRequest {
  transport: 'stdio' | 'remote';
  command?: string;              // stdio only
  args?: string[];               // stdio only
  url?: string;                  // remote only
  secrets: Array<{ key: string; value: string }>;
}

export type TestConnectionResponse =
  | { ok: true; tools: Array<{ name: string; description: string | null; category: 'read' | 'write' | 'interactive' }>; durationMs: number }
  | { ok: false; errorKind: 'auth' | 'network' | 'timeout' | 'unknown' | 'spawn'; error: string };
```

### API endpoints

All under `requireAuth`. JSON in / JSON out unless noted.

| Method | Path | Body | Returns | Worker action |
|---|---|---|---|---|
| `GET` | `/api/connectors` | — | `ConnectorListItem[]` | None |
| `GET` | `/api/connectors/:id` | — | `ConnectorDetail` (404 on miss) | None |
| `GET` | `/api/connectors/:id/activity?limit=20` | — | `ConnectorInvocation[]` ordered newest first | None |
| `GET` | `/api/connectors/catalog` | — | `CatalogEntryPublic[]` | None |
| `GET` | `/api/connectors/catalog/icons/:filename` | — | SVG file with long-cache headers | None |
| `POST` | `/api/connectors/test` | `TestConnectionRequest` | `TestConnectionResponse` | None (synchronous, in-API) |
| `POST` | `/api/connectors` | `{ source: 'catalog'\|'custom', ... }` (see below) | `204` | Enqueues `connector_create` |
| `PATCH` | `/api/connectors/:id` | `{ command?, args?, url?, displayName?, secrets? }` | `204` | Enqueues `connector_update` |
| `PATCH` | `/api/connectors/:id/toggle` | — | `{ status: 'enabled' \| 'disabled' }` | None (direct DB write) |
| `PATCH` | `/api/connectors/:id/tools/:toolName/permission` | `{ permission: 'always_allow' \| 'ask' \| 'never' }` | `204` | None (direct DB write) |
| `PATCH` | `/api/connectors/:id/tools/permissions/bulk` | `{ category: 'read' \| 'write' \| 'interactive', permission: 'always_allow' \| 'ask' \| 'never' }` | `{ rowsAffected: number }` | None (direct DB write) |
| `POST` | `/api/connectors/:id/test` | — | `TestConnectionResponse` | None (synchronous, persists result) |
| `POST` | `/api/connectors/:id/refresh-tools` | — | `204` | Enqueues `connector_refresh_tools` |
| `DELETE` | `/api/connectors/:id` | — | `204` | Enqueues `connector_uninstall` |
| `GET` | `/api/connectors/:id/secrets/:key/reveal` | — | `{ value: string }` (rate-limited 1/min, audited) | None |

Body for `POST /api/connectors`:

```typescript
type CreateConnectorRequest =
  | {
      source: 'catalog';
      catalogId: string;                    // must exist in agent/connectors-catalog.json
      secrets: Array<{ key: string; value: string }>;
    }
  | {
      source: 'custom';
      displayName: string;
      transport: 'stdio' | 'remote';
      command?: string;                     // stdio
      args?: string[];                      // stdio
      url?: string;                         // remote
      secrets: Array<{ key: string; value: string }>;
      // tools and permissions are populated by the worker after a successful test;
      // for `pending` custom connectors (no test ran), tools is empty and permissions is empty.
    };
```

Validation: Zod schemas at the route boundary. Catalog source: `secrets` must contain values for every required key declared by the catalog entry (or the value is empty string for an optional one — the test-connection step will surface "missing key" if the operator skipped it). Custom source: `transport` plus the corresponding fields must be present.

### Test connection architecture

`POST /api/connectors/test` and `POST /api/connectors/:id/test` need to call `discoverTools` from the API process. Two options were considered:

- **(A)** Add a `connector_test` command, the worker handles it, the API polls for the result. Rejected: synchronous UX requires sub-second response; commands are a 1s tick + spawn time. Adds latency the operator notices.
- **(B)** Run `discoverTools` directly in the API process, importing the helper. Adopted.

Concretely: extract `apps/worker/src/agent/mcp-discover.ts` + the helpers it depends on (the heuristic classifier, the SDK MCP client wiring, the `toStdioConfig`/`toRemoteConfig` builders, the `RESERVED_*` keys) into a new package `@zeno/mcp-discover` published in the workspace. Both `apps/worker` and `apps/api` depend on it. This is a structural improvement (test-connection logic was always going to be reused by the worker for refresh-tools and now by the API for the synchronous endpoints) and replaces the duplication-instead-of-package decision that spec 0013 made for the smaller `loadMcpConfig`.

The new package shape:

```
packages/mcp-discover/
  src/
    index.ts            re-exports
    discover.ts         discoverTools(connector, secrets) — dispatches on transport
    discover-stdio.ts
    discover-remote.ts
    build-config.ts     toStdioConfig, toRemoteConfig, RESERVED_* keys
    classify.ts         category heuristic
  package.json
  tsconfig.json
```

The worker imports from `@zeno/mcp-discover` instead of the local file. A small refactor in spec 0034's Phase 1 moves the code over with no behavior change. The package has a single dependency on the Anthropic SDK (already present transitively).

The synchronous test endpoints look like:

```typescript
// apps/api/src/routes/connectors.ts (excerpt)

import { discoverTools } from '@zeno/mcp-discover';

connectorsRouter.post('/test', requireAuth, zValidator('json', TestConnectionSchema), async (c) => {
  const body = c.req.valid('json');
  // Construct a transient `Connector` shape from the body, run discoverTools.
  const transient = bodyToTransientConnector(body);
  const result = await discoverTools(transient, body.secrets);
  if ('error' in result) {
    return c.json({ ok: false, errorKind: result.errorKind, error: result.error }, 200);
  }
  return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs }, 200);
});

connectorsRouter.post('/:id/test', requireAuth, async (c) => {
  const { id } = c.req.param();
  const connector = connectorRepo.get(id);
  if (!connector) return c.json({ error: 'not_found' }, 404);
  const secrets = connectorRepo.getSecrets(id);
  const result = await discoverTools(connector, secrets);
  // Persist the result.
  if ('error' in result) {
    connectorRepo.update(id, { lastError: result.error, lastErrorAt: now() });
    return c.json({ ok: false, errorKind: result.errorKind, error: result.error });
  }
  connectorRepo.update(id, { lastError: null, lastErrorAt: null, lastVerifiedAt: now() });
  // Note: tool list is NOT persisted here — that's the refresh-tools command's job.
  return c.json({ ok: true, tools: result.tools, durationMs: result.durationMs });
});
```

### Worker command shapes

Four new payload-bearing types added to the `commands` table machinery (spec 0013 already supports arbitrary `type` strings; add handlers).

```typescript
// connector_create
// Slug is REQUIRED in both branches and is computed by the API (catalog → use catalog.id;
// custom → slugify(displayName) with collision resolution against the DB).
type CreateConnectorPayload =
  | { source: 'catalog'; catalogId: string; slug: string; displayName: string; secrets: Array<{ key: string; value: string }>; tools: Array<{ toolName: string; description: string | null; category: 'read'|'write'|'interactive'; permission: 'always_allow'|'ask'|'never' }> }
  | { source: 'custom'; slug: string; displayName: string; transport: 'stdio'|'remote'; command?: string; args?: string[]; url?: string; secrets: Array<{ key: string; value: string }>; tools: Array<{ toolName: string; description: string | null; category: 'read'|'write'|'interactive'; permission: 'always_allow'|'ask'|'never' }> };

// connector_update
type UpdateConnectorPayload = {
  id: string;
  patch: Partial<{
    displayName: string;
    description: string | null;
    command: string | null;
    args: string[] | null;
    url: string | null;
  }>;
  // Secrets full-replace:
  secrets?: Array<{ key: string; value: string }>;
};

// connector_refresh_tools
type RefreshToolsPayload = { id: string };

// connector_uninstall
type UninstallConnectorPayload = { id: string };
```

**Slug ownership** is fixed: the **API computes the slug** (catalog source: reuse the catalog id; custom source: `slugify(displayName)` with collision resolution against the existing DB rows via `-2`, `-3`, …) and includes it as a required string in the `connector_create` payload. The handler **does not** recompute or change the slug — it inserts the value verbatim. If a concurrent insert lands the same slug between the API's collision check and the handler's insert, the UNIQUE constraint on `connectors.slug` fires; the handler catches the SQLite constraint error and finishes the command with `status='failed', result={ error: 'slug collision', slug }` so the dashboard surfaces it. The API's own pre-check is best-effort optimization for the common case.

The four handlers:

- `handleConnectorCreate(cmd)`: parses payload (slug is required and pre-computed by the API), calls `connectorRepo.create(...)`. On UNIQUE-violation: finish with `status='failed'`. No slug recomputation in the handler.
- `handleConnectorUpdate(cmd)`: parses payload, applies `update()` patch, calls `replaceSecrets` if secrets provided. Triggers an internal test-connection only if `secrets` was changed (same logic as the API's `:id/test` endpoint, but inline) — outcome populates `last_error` / `last_verified_at`. Tools list and permissions are NOT touched.
- `handleConnectorRefreshTools(cmd)`: loads connector + secrets, calls `discoverTools`. On success: `replaceTools(id, discovered.map(t => ({ ...t, permission: defaultForCategory(t.category) })))`. On failure: writes `last_error` and stops (does not clear existing tools). The dashboard surfaces the error via the next list refresh.
- `handleConnectorUninstall(cmd)`: `connectorRepo.delete(id)`. Cascade handles secrets / tools / invocations.

Each handler matches the spec 0013 contract: parse payload (Zod), do work, call `commandRepo.finish(id, status, result?)`. Failures become `status='failed'` with `result={ error: '...' }`.

### Dashboard frontend port

```
apps/dashboard/src/routes/_authed/
├── connectors.tsx                                  (list screen — index.tsx logic from apps/design)
├── connectors.$id.tsx                              (detail — linear/notion/fn-scrum logic merged into one parameterized screen)
├── connectors.add-catalog.$catalogId.tsx           (modal route)
├── connectors.add-local.tsx                        (modal route)
├── connectors.add-remote.tsx                       (modal route)
├── connectors.$id.refresh-tools.tsx                (modal route)
└── connectors.$id.uninstall.tsx                    (modal route)
```

(TanStack Router flat-file naming. Modals follow the same pattern other routes use today — verify the exact naming during implementation.)

New shared components:

```
apps/dashboard/src/components/connectors/
├── activity-section.tsx          (ported from apps/design — accepts feed via prop)
├── catalog-grid.tsx              (ported from apps/design — fetches catalog via useCatalog)
├── kebab-menu.tsx                (ported from apps/design)
├── modal-backdrop.tsx            (ported)
└── status-pill.tsx               (extracted from the various detail screens for reuse)
```

New hooks in `apps/dashboard/src/lib/`:

```
use-connectors.ts             — list query
use-connector.ts              — detail query
use-connector-activity.ts     — activity feed
use-catalog.ts                — catalog query (long stale time)
use-connector-mutations.ts    — collected mutations: create, update, toggle, setPermission, setBulkPermission, refreshTools, uninstall, testConnection
```

Mutation patterns:

- **Toggle, permission edits**: optimistic. Update cache immediately; rollback on error toast.
- **Create, update, refresh-tools, uninstall**: fire-and-forget. Toast + 1.5s delayed `invalidateQueries`. Matches spec 0013 §Mutation UX pattern.
- **Test connection**: not a mutation in the cache sense. POST + return body; render the result inline. Wrap in `useMutation` for the loading state but don't invalidate anything.

Sidebar nav:

```typescript
// apps/dashboard/src/components/layout/sidebar.tsx
{ to: '/connectors', label: 'connectors', icon: PlugIcon },   // NEW; placed between sessions and logs (or wherever the design ordering puts it — verify)
```

### Secret reveal flow

Browser side:

1. User clicks the eye icon on a secret row.
2. `useMutation` fires `GET /api/connectors/:id/secrets/:key/reveal`.
3. On 200: store the value in component state, render unmasked, start a 10s timer.
4. On 429 (rate-limited): toast `aguarde alguns segundos pra revelar de novo`.
5. After 10s: clear from state, re-mask.
6. Component unmount: clear from state.

Server side rate-limit:

- In-memory map keyed by `(connectorId, key)`. On request: check timestamp, deny with 429 if last reveal < 60s ago, otherwise update timestamp and return value. Lost on API restart — acceptable single-user.
- Audit log: `logger.info({ event: 'connector_secret_revealed', connectorId, key, requesterUserId: 'dashboard' })`. No value content. The single `requesterUserId='dashboard'` reflects single-user; future multi-user adds a real id.

### Catalog drift in installed connectors

Per spec 0029 §Detail Screen Behavior → Catalog drift behavior, installed connectors are frozen at install time. The dashboard does NOT show an out-of-date indicator. Implementation: nothing special — the connector's tools and secret keys are stored in the DB at install time and are read from there forever. Catalog updates only affect new installs.

## User Stories / Scenarios

The seven user stories are inherited verbatim from spec 0029 §User Stories / Scenarios, now executable end-to-end. Story 7 (migrating an existing setup) is the user-visible cutover from spec 0032; the dashboard simply shows an empty list and the catalog/custom flows produce new rows.

Additional dashboard-specific scenarios:

8. **Operator clicks Test connection in the catalog modal, the test takes 4s, succeeds.**
   - Modal fires `POST /api/connectors/test` with the entered secrets.
   - API runs `discoverTools` synchronously. ~3s wall-clock for the upstream MCP to respond.
   - Modal shows spinner during; on response, shows ✓ + tool count.
   - Add button enables.

9. **Operator clicks Refresh tools on an installed connector.**
   - Confirmation modal appears (spec 0029 mandates copy `This will reset tool permissions to defaults.`).
   - Confirm → `POST /api/connectors/:id/refresh-tools` → 204 → toast + 1.5s invalidate.
   - Worker tick (≤1s) processes the command: `discoverTools`, `replaceTools` with category defaults.
   - Dashboard refetches; tool list updates; per-tool overrides are gone.

10. **Operator changes a per-tool permission from `ask` to `always_allow`.**
    - Click a permission segment in the tool row.
    - `useOptimisticMutation` updates the cache + fires `PATCH /api/connectors/:id/tools/:toolName/permission`.
    - 204 returned. Cache is already correct.
    - Next agent turn that calls this tool: `connector_permission` policy reads the new value, allows immediately.

11. **Operator reveals a secret on a screen-share.**
    - Click the eye icon. Value appears.
    - 10s pass; value re-masks.
    - Operator clicks again immediately — gets toast `aguarde alguns segundos pra revelar de novo` (within the 60s rate limit).

## Success Criteria

1. `agent/connectors-catalog.json` exists with eight valid entries. The optional `connectors-catalog.schema.json` validates them.
2. `agent/assets/connectors/{linear,notion,granola,sentry,github,slack,google-drive,cloudflare}.svg` exist.
3. The new package `@zeno/mcp-discover` builds and exports the documented API. Worker imports from it (replacing the local `mcp-discover.ts`) without behavior change.
4. All API routes land with Zod-validated bodies and integration tests using the Hono test client.
5. The four worker handlers each have unit tests; integration test exercises one of each through the real `commands_poller`.
6. Dashboard routes render with live data; quality gate green; smoke render tests for each route.
7. `useOptimisticMutation` is wired to toggle, per-tool permission, bulk permission. Other mutations follow the fire-and-forget pattern.
8. Secret reveal endpoint enforces the 60s rate limit and writes the audit log line.
9. Test connection endpoints (synchronous + per-id) call into `@zeno/mcp-discover` correctly. Wall-clock latency is dominated by the upstream MCP, not the API.
10. Refresh-tools confirmation modal shows the exact text `This will reset tool permissions to defaults.` (matches the spec 0029 contract).
11. Catalog install requires Test connection success before Add becomes enabled. Custom add allows Add at any time (lands as `pending` if no test ran).
12. Sidebar shows a Connectors entry; clicking it navigates to `/connectors`.
13. `pnpm run quality-gate` green: lint + typecheck + tests across all workspaces. No new `any`, no new `// biome-ignore`.
14. Manual smoke at `pnpm run docker:up`: visit `/connectors`, install Linear from the catalog, send `@zeno list my linear issues` in Slack, assert the agent uses the connector successfully without restarting the worker.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Extracting `@zeno/mcp-discover` breaks the worker mid-port | Done as a refactor in Phase 1 with no behavior change; the existing tests in `apps/worker` move with the code or stay where they are and verify the imported package. |
| Test connection in the API process forks an MCP per test, leaking processes | The discovery helper guarantees teardown in `try/finally`. Add a smoke test that runs 100 sequential test-connection calls and asserts no leak (process count stable). |
| Catalog JSON drifts out of schema | Optional JSON Schema check on read; failing validation returns 500 with the offending entry id so the operator can fix the file and redeploy. |
| Rate-limit on secret reveal is in-memory and gets bypassed by API restart | Acceptable for single-user. If multi-user comes, the rate-limit moves to a DB table or Redis. |
| Dashboard mutations race against worker tick (toggle off then back on within 1s) | Toggle is a direct DB write; the worker reads on the next agent turn. Fast flip-flop is fine — the worker simply reflects the latest committed state on the next turn. |
| Per-tool permission edits affect a turn already in flight | Acceptable. The next tool call inside that turn reads the updated permission. The current call (if any) completes under the prior rule. |
| Custom remote connectors with mistyped headers fail in confusing ways | The Add custom (remote) modal's help text + the test-connection result distinguishes auth (401/403) from network (refused/timeout). The dashboard maps `errorKind` to a human hint per spec 0029 §Error display. |
| Catalog install flow lets the user paste a non-Bearer token where Bearer is expected | The dashboard prepends `Bearer ` to the input value if absent (catalog hint flag in the entry — implementation can default-on for catalog entries that declare `__MCP_AUTHORIZATION__`). Custom modal does not auto-prepend. |
| Tool list refresh after a connector update wipes carefully-tuned per-tool overrides | Spec 0029 §Refresh tools mandates the confirmation. Implementation honors. |
| Activity feed deep-link `View turn` points at a session that has been deleted | Same risk as `/sessions/:threadId` already handles; renders "transcript unavailable" on miss. No new code needed. |
| Catalog file is a single huge JSON (eventual size concern) | Eight entries is small. At 30+, lazy-load per entry id. Out of scope for MVP. |
| Connector_create handler runs slowly because it triggers an internal test-connection | It does not. Only `connector_update` (when secrets changed) does. `connector_create` just inserts; the API has already done the test in the modal. |

## Open Questions

None blocking. Implementation-time:

1. **Whether the four catalog-icon SVGs come from upstream brand pages or are hand-drawn coral monochromes per the design system.** Implementation choice; honor the design system's "single coral accent" rule by going monochrome if the brand glyph would clash. The design playground in `apps/design` already has a treatment that can guide.
2. **How to convey the `__MCP_AUTHORIZATION__` reserved key in the dashboard form.** Hide the actual key name from the operator; display the catalog's `label` and `help`. The DB still stores under the reserved key. Implementation detail.
3. **Whether the secret reveal rate-limit timestamp survives `useEffect`-style navigation between detail and list.** It lives on the server; the client doesn't know. Implementation just shows the toast on 429.
4. **Where exactly to place the Connectors sidebar entry.** Between Sessions and Logs in the order, mirroring `apps/design`. Final placement during implementation.
5. **Whether `@zeno/mcp-discover` includes the heuristic classifier or it stays in the worker.** Include it — the dashboard relies on the same heuristic for custom connectors, and the API uses the package. Single source of truth.
