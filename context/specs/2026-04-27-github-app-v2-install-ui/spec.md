---
status: shipped
feature: github-app-v2-install-ui
created: 2026-04-27
shipped: 2026-04-27
---
# GitHub App v2 — Install + Listing/Detail UI Spec

**Status:** Draft
**Scope:** Dashboard UI for the github-app v2 install flow + listing collapse + App detail page + per-installation detail page. Also fixes the 0-tools bug on existing 4 `github-app-*` connectors via a one-shot data migration.

Implements artboards C7, C8, C10, M6 (per spec 0043). Depends on spec 0044's backend foundation (new schema, packages/github-app, install endpoint v2, GET /api/connectors/apps/:appId).

C9 (App detail empty state), M7-M11 (lifecycle modals) are deferred to spec 0046.

## Brainstorm Q&A

User answered Q1-Q4 explicitly during `/brainstorming`.

### Q1 — Custom install modal: hardcode vs registry pattern?

**Decision: Option B — registry pattern.**

`apps/dashboard/src/components/connectors/install-modals/registry.ts` exports `Record<catalogId, React.ComponentType<{entry, onClose}>>`. The default `catalog-install-modal.tsx` checks `entry.customInstallComponent` and routes to the registry; falls back to the standard secret-fields layout if absent.

Rationale: spec 0042 already added `customInstallComponent: 'github-app'` to the catalog schema. The registry is just the consumer. Hardcoding (Option A) spreads conditional logic in the default modal. Hooks-based plugin (Option C) overengineered for single-tenant.

### Q2 — Listing endpoint shape: server-side collapse vs client-side?

**Decision: Option A — server-side collapse with discriminated union.**

`GET /api/connectors` returns `(ConnectorListItem | AppListItem)[]` where:
- `ConnectorListItem`: `{ kind: 'connector', id, slug, displayName, transport, status, lastVerified, ... }` (existing shape today, with added `kind` discriminator)
- `AppListItem`: `{ kind: 'app', appId, catalogId, displayName, appName, installationCount, statusAggregate: 'active'|'mixed'|'error', lastVerified, installations: [{slug, status}] }` (new for github-app)

Backend joins `connector_apps` + `connectors` and aggregates. The 4 `github-app-*` rows are NOT returned individually in the listing — they appear nested inside the parent `AppListItem`.

Rationale: entity logic lives with the data layer; 1 fetch for the full listing; dashboard just renders by `kind`. Client collapse (Option B) duplicates the entity model in UI. Separate endpoint (Option C) requires merge + sort in client.

### Q3 — Detail page route: `/connectors/_app/github-app` (per 0043) or revise?

**Decision: Option B — `/connectors/github-app`. Revise spec 0043 accordingly.**

The leading `_app` segment from spec 0043's C8 artboard text was illustrative. Catalog ids are unique (zod regex `^[a-z0-9][a-z0-9-]*$` + unique catalog file constraint), so collision with installed connector slugs isn't possible: `github-app` itself isn't an installed slug (Personal is `github`; installations are `github-app-fnlivros` etc.).

URL stays clean. Spec 0043's C8 artboard text needs a 1-line update; PNG snapshot may be re-exported (visual content of the artboard doesn't change).

Rationale: `_app` prefix conflicts with TanStack Router convention (underscore for layout-only routes). Separate `/apps/` root (Option C) breaks "all connectors live under /connectors" mental model.

### Q4 — 0-tools fix logistics: where does the data correction live?

**Decision: Option A — new migration id 7 in spec 0045.**

Migration body:
```sql
INSERT INTO connector_tool_permissions (connector_id, tool_name, description, category, permission)
SELECT
  c.id,
  t.tool_name,
  t.description,
  t.category,
  t.default_permission
FROM connectors c
CROSS JOIN (
  -- 51 tools from the `github` (Personal) catalog entry, hardcoded as a VALUES table
  SELECT 'add_issue_comment' AS tool_name, '...' AS description, 'interactive' AS category, 'ask' AS default_permission
  UNION ALL SELECT 'list_issues', ..., 'read', 'always_allow'
  ...
) AS t
WHERE c.slug LIKE 'github-app-%'
AND NOT EXISTS (
  SELECT 1 FROM connector_tool_permissions
  WHERE connector_id = c.id
);
```

**Atomicity guarantees:** The migration runner wraps each migration in a transaction (`BEGIN TRANSACTION; … INSERT OR REPLACE INTO migrations (id) VALUES (7); COMMIT;`). If any single INSERT fails, the entire transaction rolls back — no partial-insert state is possible. The migration ID is only recorded on full success, so re-runs after a failure restart from a clean slate.

**Idempotency on full success:** The `NOT EXISTS` clause prevents re-inserting rows on a re-run. Combined with the runner's "id 7 is recorded after first success" guard, the migration is a strict no-op on subsequent boots.

**Catalog freeze:** The 51-row VALUES list is hardcoded into the migration body, generated at migration-write time from `agent/connectors-catalog.json`'s `github` entry. The migration is frozen — if the live catalog evolves later (e.g., GitHub MCP adds a tool, or `regenerate-catalog-tool-snapshots.mjs` reruns), only NEW installations get the updated tools (via the install endpoint, which reads the live catalog). The 4 existing rows stay at the migration-frozen tool list until manually re-installed.

Going forward, the install endpoint (replaced in this spec — see API Endpoints) copies tools from the `github` catalog entry (NOT from `github-app`'s empty array) when creating each new `github-app-*` connector.

Rationale: keeps spec 0044 schema-only (clean separation of concerns). Spec 0045 owns the install endpoint logic where the runtime fix also lives. Boot-time backfill (Option C) makes initialization more complex.

## Context

Spec 0044 ships the backend foundation: `connector_apps` table, schema migration id 6, surgical mutations on `GitHubAppAuth`, dedicated API endpoints, `packages/github-app/`, JWT signing extracted, `@live` GitHub API tests.

This spec consumes that foundation to build the dashboard UI. The visible bugs from spec 0042's shipping (4 rows with 0 tools, missing UI for install/manage) are resolved here.

Specs 0046 (lifecycle modals M7-M11) and 0047 (always_sensitive) ship after this. This spec is the user-visible payoff — once 0045 ships, operator can install github-app fresh, see the App detail page with the 4 installations correctly, and use all 51 GitHub tools per installation.

## Problem Statement

Today, after specs 0042+0044:
- Catalog has `github-app` entry with `customInstallComponent: 'github-app'` (added in 0042) but no React component registered.
- Dashboard's catalog modal hits the default secret-fields layout for `github-app`, which has empty `secrets[]` → renders no fields → "Add" creates broken connector row.
- The 4 existing `github-app-*` connectors show `0 tools` in the listing (cosmetic + functional bug — tool permissions aren't enforced because there are no rows in `connector_tool_permissions`).
- Listing shows 4 separate rows for the 4 installations (per Q1 of spec 0043, should be 1 collapsed row).
- No App detail page exists.
- `LAST VERIFIED` column is empty for `github-app-*` rows.

This spec fixes all of the above.

## Non-Goals

1. **Lifecycle modals** (M7 add installation, M8 manual fallback, M9 rotate PEM, M10 remove confirm, M11 edit env_var). Spec 0046 owns these.
2. **C9 empty state** (App detail with 0 installations). Spec 0046 owns this — it's the natural follow-up after install creates the App but before user adds first installation.
3. **always_sensitive UI** (spec 0047).
4. **Connector polish** (spec 0048).
5. **Multi-app support**. Single-app enforced in install endpoint (reject if any `connector_apps` row with `catalog_id='github-app'` already exists).

## Constraints

- **Sequential dependency on spec 0044.** All backend endpoints and `packages/github-app` must exist.
- **No breaking changes to existing `/api/connectors` consumers.** Adding `kind` field is additive; default `kind: 'connector'` for existing items.
- **No new design system primitives.** Reuse Foundations + Primitives from the Paper file.
- **TanStack Router** for the new `/connectors/github-app` route.
- **TanStack Query** for the new `GET /api/connectors/apps/:appId` endpoint (fits existing pattern).
- **Single React Query key family** for App detail: `['app', appId]`.

## Schema Changes

None. Spec 0044 already shipped the schema. This spec only adds:
- Migration id 7 (data only): populates `connector_tool_permissions` for existing `github-app-*` rows from the hardcoded `github` catalog entry tool list.

## Files Created

- `apps/dashboard/src/components/connectors/install-modals/registry.ts` — `Record<catalogId, ComponentType>` exporting the github-app modal.
- `apps/dashboard/src/components/connectors/install-modals/github-app-install-modal.tsx` — M6 implementation (full component).
- `apps/dashboard/src/components/connectors/app-detail/` — directory:
  - `app-detail-page.tsx` — C8 page component
  - `app-config-section.tsx` — App config block (`app_id` + PEM + rotate trigger)
  - `installations-table.tsx` — installations list with status, env_var, tools count
  - `pem-reveal.tsx` — REVEAL/HIDE button + sha256 fingerprint display
  - `aggregated-status-pill.tsx` — `4/4 ACTIVE` style aggregator
- `apps/dashboard/src/components/connectors/connector-detail/inherited-app-callout.tsx` — gold callout used in C10 ("app credentials inherited from github-app")
- `apps/dashboard/src/lib/use-app-detail.ts` — TanStack Query hook for `GET /api/connectors/apps/:appId`
- `apps/dashboard/src/lib/use-install-github-app.ts` — mutation hook
- `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` — TanStack route for `/connectors/github-app`. Uses dot-notation flat-file convention (existing routes are `connectors.$id.tsx`, `connectors.index.tsx`). Static segment `github-app` matches BEFORE the dynamic `$id` route per TanStack's static-first matching priority within the same parent (`connectors.*`).
- `apps/dashboard/tests/components/connectors/github-app-install-modal.test.tsx` — UI test (mock fetch + assert flow)
- `apps/dashboard/tests/lib/use-app-detail.test.ts` — hook test
- `apps/api/tests/routes/connectors-listing-collapsed.test.ts` — integration test for the discriminated union shape
- `apps/api/tests/routes/connectors-app-detail.test.ts` — integration test for `GET /api/connectors/apps/:appId`

## Files Modified

- `apps/api/src/routes/connectors.ts` — multiple changes:
  - `GET /api/connectors` now returns `(ConnectorListItem | AppListItem)[]` with `kind` discriminator. App entries are constructed by joining `connector_apps` to `connectors` and aggregating status.
  - New `GET /api/connectors/apps/:appId` returns rich App detail (`{ app: {...}, installations: [{...with full tool counts}] }`).
  - Install endpoint logic (the v2 endpoint added in spec 0044): when creating a `github-app-*` connector via `POST /catalog/github-app/installations`, copy tools from `findCatalogEntry('github').tools` (NOT from `github-app`'s empty array).
  - Re-install guard: `POST /catalog/github-app/install` returns 409 if any `connector_apps.catalog_id='github-app'` row exists.
- `apps/dashboard/src/components/connectors/catalog-install-modal.tsx` — check `entry.customInstallComponent`; if set + present in registry, render that instead of default. Existing default flow unchanged.
- `apps/dashboard/src/routes/_authed/connectors/index.tsx` — render rows polymorphic by `kind` (existing connector row vs new App row component).
- `apps/dashboard/src/components/connectors/listing/` — split row component into `connector-row.tsx` + new `app-row.tsx`. App row has the gold "4" badge overlay on icon (per C7 design).
- `apps/dashboard/src/lib/use-connectors.ts` — refactor types:
  - Add `kind: 'connector'` as a required discriminant field on `ConnectorListItem` (existing fields unchanged).
  - Define new `AppListItem` interface with `kind: 'app'` discriminant.
  - Define `ConnectorListEntry = ConnectorListItem | AppListItem`.
  - Hook return type becomes `ConnectorListEntry[]`.
  - Existing call sites narrow via `if (entry.kind === 'connector')` (TypeScript exhaustiveness check on the union enforces at compile time that handlers cover both branches).
  - Backend MUST set `kind: 'connector'` on every existing-shape item (no implicit defaulting; explicit field required for type-safe narrowing).
- `agent/connectors-catalog.json` — `github-app` entry's `secrets[]` updated to set `isPublic: true` on `__GITHUB_APP_ID__` (cosmetic for the install modal — the modal doesn't render secrets here since it's overridden by the custom component, but keeps schema honest).
- `packages/storage/src/migrations.ts` — add migration id 7 (data only, populates `connector_tool_permissions` for existing `github-app-*` rows).

## API Endpoints

### Modified: `GET /api/connectors`

**Old shape:**
```json
[
  { "id": "...", "slug": "linear", "displayName": "Linear", "transport": "remote", "status": "enabled", ... },
  ...
]
```

**New shape:**
```json
[
  {
    "kind": "connector",
    "id": "...", "slug": "linear", "displayName": "Linear", "transport": "remote", "status": "enabled", "lastVerifiedAt": "...", "toolCount": 30, "iconUrl": "/api/connectors/catalog/icons/linear.svg", "source": "catalog", ...
  },
  {
    "kind": "app",
    "appId": "abc-uuid",
    "catalogId": "github-app",
    "appName": "Acme Bot",
    "appSlug": "acme-bot",
    "iconUrl": "/api/connectors/catalog/icons/github.svg",
    "installationCount": 4,
    "statusAggregate": "active",
    "lastVerifiedAt": "2026-04-27T13:00:00Z",
    "installations": [
      { "slug": "github-app-fnlivros", "displayName": "AcmeBooks", "status": "enabled", "lastVerifiedAt": "..." },
      ...
    ]
  },
  ...
]
```

The `installations` array on `AppListItem` is light (no tools, no secrets) — just enough for the listing row. Full installation details fetched via `GET /api/connectors/:id` per-installation.

### New: `GET /api/connectors/apps/:appId`

**Mount order:** registered BEFORE the existing `GET /:id` dynamic route in `connectors.ts` (per the file's load-bearing order comment: static paths first). Path is `/apps/:appId` under the `/api/connectors` prefix.

Returns:
```json
{
  "app": {
    "id": "abc-uuid",
    "appId": "12345",
    "catalogId": "github-app",
    "appName": "Acme Bot",
    "appSlug": "acme-bot",
    "pemSha256": "5e3b·a1c2·ff84·1027·…",
    "pemRotatedAt": null,
    "createdAt": "2026-04-27T...",
    "updatedAt": "2026-04-27T..."
  },
  "installations": [
    {
      "connectorId": "...",
      "slug": "github-app-fnlivros",
      "displayName": "AcmeBooks",
      "installationId": "125887887",
      "envVar": "ACME_GH_TOKEN",
      "status": "enabled",
      "lastVerifiedAt": "2026-04-27T13:00:00Z",
      "toolCount": 51
    },
    ...
  ]
}
```

PEM is NEVER returned to the client. Only the sha256 fingerprint + rotated-at timestamp. Reveal pattern in C8 design shows the fingerprint, not the PEM itself.

### Modified: `POST /catalog/github-app/install` (v2 from spec 0044)

**Architectural change vs the v1 endpoint (current code in `connectors.ts` lines 301-379):**

The v1 endpoint ONLY enqueues `connector_create` commands and returns 204 — all DB writes are deferred to the worker. This is what the existing pattern looks like for catalog connector installs.

The v2 endpoint takes a different shape: it performs the `connector_apps` row INSERT **synchronously in the API handler** (before returning), then enqueues an `app_install` command for the worker to bootstrap the `GitHubAppAuth` instance. Two reasons for the architectural divergence from v1:

1. **App-level config doesn't fit the connector_create command model.** `connector_apps` is a different table; the existing `connector_create` handler validates a discriminated union of `catalog | custom` shapes, neither of which match. Adding a third discriminator just to enqueue a single INSERT adds indirection without value.
2. **Synchronous write removes the race window.** Without the sync write, the dashboard navigates to `/connectors/github-app` immediately after the POST returns 200, but `GET /api/connectors/apps/:appId` would 404 until the worker processes the queue (~1s). With the sync write, the row is queryable immediately; the App detail page loads on the first render.

The `app_install` command is still needed because **`GitHubAppAuth` lives in the worker process**, not the API process. The API can't bootstrap it directly.

**Sequence:**
1. API handler validates input ({appId, pem}) — sign JWT, call `/app`, verify app_id matches.
2. API handler validates re-install guard: `SELECT 1 FROM connector_apps WHERE catalog_id = 'github-app' LIMIT 1`. If exists, return `409 Conflict` with body `{ error: 'app_already_installed', appUuid: '<existing>' }`.
3. API handler INSERTs `connector_apps` row directly (synchronous SQLite write, ~5ms).
4. API handler enqueues `app_install` command with the new `appUuid`.
5. API handler returns 200 with `{appUuid, appName, appSlug, installationsAvailable: [...]}`.
6. Worker (asynchronously, ~1s later) processes `app_install` → bootstraps `GitHubAppAuth(appUuid)` instance → starts refresh interval.

The race window for `installationsAvailable` listing fetches (M7's auto-discover) is small and bounded: API can sign JWT itself (PEM is in `connector_apps` from step 3), so M7 doesn't depend on worker bootstrap. The bootstrap only matters for runtime MCP token minting (which happens during agent turns, not during dashboard interactions).

**Re-install guard:** as above.

**UI handling of 409:** dashboard surfaces inline error in M6: "GitHub App already installed · view details ↗" linking to `/connectors/github-app`.

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| UI1 | Dashboard | Open `/connectors`. Listing shows 1 row "GitHub App · 4 installations" with `4/4 ACTIVE` aggregate pill instead of 4 separate rows. Icon has gold "4" badge overlay (per C7 design). |
| UI2 | Dashboard | Click the github-app row → navigate to `/connectors/github-app`. App detail page (C8) renders: header with title, app config block (`app_id` plain + PEM masked + REVEAL/ROTATE), installations table with 4 rows, footnote about per-installation tool permissions. |
| UI3 | Dashboard | Click any installation row in the table → navigate to `/connectors/github-app-fnlivros` (existing connector detail route). C10 layout: breadcrumb shows `connectors / github-app / AcmeBooks`, inherited app callout in gold, per-installation fields (installation_id + env_var), tool permissions section with all 51 tools at default permissions. |
| UI4 | Dashboard | Open `/connectors`, click "GitHub App" in catalog → M6 modal opens (custom component routed via registry). Enter `app_id`, paste/upload PEM. Click TEST CONNECTION → backend signs JWT, returns "credentials valid · 4 installations available · AcmeBooks · ..." green strip. Click INSTALL APP → POST → row created in `connector_apps` → modal closes → navigate to `/connectors/github-app` (which shows C9 empty state per spec 0046). |
| UI5 | Migration | Migration id 7 runs at next worker boot → backfills `connector_tool_permissions` for existing 4 rows → dashboard now shows "51 tools" per installation row in C8 + C10 instead of 0. |
| UI6 | Re-install guard | If user opens M6 while `connector_apps` already has a github-app row → backend returns 409 → UI surfaces error inline with link "Already installed; view details ↗" routing to `/connectors/github-app`. |
| UI7 | Default catalog modal still works | Click "Linear" in catalog → default modal opens (catalog-install-modal.tsx hits the `customInstallComponent` check, finds null, falls through to default secret-fields layout). Sentry, Klaviyo, Swarmia, github (Personal) all work as before. |

## Success Criteria

- All 4 brainstormed decisions reflected in code.
- Listing endpoint returns discriminated union shape; existing callers (just dashboard) handle via `kind` narrowing.
- M6 modal renders via registry routing (custom component for `github-app`, default for everything else).
- App detail page renders correctly populated with 4 installations.
- Per-installation detail page (C10) shows the inherited app callout.
- Migration id 7 backfills tools for existing 4 rows; idempotent.
- Re-install attempt returns 409 with helpful body.
- All artboard visuals from spec 0043 (C7, C8, C10, M6) match the rendered UI.
- Quality gate green; all new tests pass.
- Spec 0043 patched with `/connectors/github-app` URL update (1-line revision, status changes back to draft for ~2min then re-shipped).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Discriminated union breaks an unexpected caller | Only the dashboard consumes `/api/connectors` today. Type-narrow in `apps/dashboard/src/lib/use-connectors.ts`. Existing tests catch regressions. |
| Migration id 7 fails (catalog file unreadable, etc.) | Wrap in transaction; runner records failure. The 4 rows continue to show 0 tools until re-run. Migration test asserts success path. |
| `customInstallComponent` registry import circular | Use lazy import in registry: `const GitHubAppInstallModal = lazy(() => import('./github-app-install-modal'))`. |
| User installs PEM that signs but doesn't match `app_id` (App credentials swap) | Backend `/catalog/github-app/test` endpoint mints test tokens via `/app/installations` — fails with `errorKind: 'auth'` if mismatch. UI surfaces inline. |
| TanStack route collision: `/connectors/github-app` and `/connectors/$id` for actual connectors | Routes are static-first within the same parent in TanStack Router. The new `connectors.github-app.tsx` (literal segment) matches BEFORE `connectors.$id.tsx` (dynamic). Unit test asserts: navigating to `/connectors/github-app` lands on the App detail page; `/connectors/sentry` lands on the connector detail page. |
| Race window after install: M6 navigates to `/connectors/github-app` before worker processes `app_install` command and `connector_apps` row is queryable | The API endpoint creates the `connector_apps` row SYNCHRONOUSLY before returning 200 from `POST /catalog/github-app/install` (worker `app_install` command only handles `GitHubAppAuth` bootstrap, not the row insert). So `GET /api/connectors/apps/:appId` succeeds immediately after install. The worker's bootstrap completes within a few seconds in the background; the App detail page loads instantly with the empty installations list (C9 stub). `use-app-detail` hook does NOT need 404 retry logic. |
| Migration runs but `agent/connectors-catalog.json` was edited (e.g. user removed `github` entry) | Migration uses hardcoded VALUES table (not live catalog read). Robust to runtime catalog changes. |

## Open Questions

All resolved during brainstorming.

## Coverage gaps (acknowledged)

- C9 (App detail empty state — 0 installations) is rendered immediately after M6 ships (UI4 user story), but its FULL design + add-installation CTA flow lives in spec 0046. For 0045's window, C9 shows a stub: "0 installations · use the lifecycle modals (coming in spec 0046) to add". Acceptable since 0045+0046 are sequential.
- Add/remove/rotate UI deferred (spec 0046).
- always_sensitive deferred (spec 0047).

## Review procedure

3 consecutive review rounds. Same protocol as 0036/0037/0038/0042/0043/0044.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews (this).
2. **Phase 1**: Migration id 7 (data fix for existing 4 rows). Migration test.
3. **Phase 2**: Backend listing endpoint shape change. Integration test.
4. **Phase 3**: New `GET /api/connectors/apps/:appId` endpoint. Integration test.
5. **Phase 4**: Install endpoint v2 — copy tools from `github` catalog + re-install 409 guard. Integration test.
6. **Phase 5**: Dashboard registry pattern + custom modal routing in `catalog-install-modal.tsx`. Unit test.
7. **Phase 6**: M6 component (full implementation per the artboard). UI test.
8. **Phase 7**: C7 listing change — `app-row.tsx` + polymorphic render in `index.tsx`. UI test.
9. **Phase 8**: C8 App detail page (route + page + sections). UI test.
10. **Phase 9**: C10 inherited-app-callout component injected into the existing connector detail page. UI test.
11. **Phase 10**: Patch spec 0043 (1-line URL update from `/connectors/_app/github-app` to `/connectors/github-app`).
12. **Phase 11**: Quality gate green. Smoke against `fn` profile (re-deploy, verify 0-tools fix, verify M6 install, verify navigation).
13. **Phase 12**: `status: shipped`, commit on feature branch, PR.

## Definition of Done

- All UI artboards (C7, C8, C10, M6) implemented per spec 0043.
- `0-tools` bug fixed for existing 4 rows + going forward.
- 3 clean reviews.
- Quality gate green.
- Smoke green: install via M6 works (creates `connector_apps` + redirects to detail), listing shows collapsed App row, detail page renders correctly, per-installation detail shows inherited app callout.
- Spec 0043 patched.
