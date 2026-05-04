---
feature: connectors-dashboard
plan: "[[plan-connectors-dashboard]]"
spec: "[[spec-connectors-dashboard]]"
created: 2026-04-26
---
# Connectors Dashboard — Tasks

**For this plan:** `[[plan-connectors-dashboard]]`

Eight phases. Each ends with a green `pnpm run quality-gate`.

---

## Phase 1: Catalog data + assets

### Task 1.1: Author the catalog JSON

- [ ] Step 1: Create `agent/connectors-catalog.json` with the eight entries listed in spec 0029 §Initial catalog (linear, notion, granola, sentry, github, slack, google-drive, cloudflare). Use the shape in spec 0034 §Catalog file.
- [ ] Step 2: For each entry, populate: `id`, `name`, `description`, `icon` (filename), `docsUrl`, `transport`, `transportConfig` (`url` for remote / `command`+`args` for stdio), `secrets[]`, `tools[]`, `tags[]`. Reasonable defaults from spec 0029 §Catalog and from existing `profiles/<example>/mcp.json` references.
- [ ] Step 3: Manual sanity check: `cat agent/connectors-catalog.json | jq . > /dev/null` — JSON parses cleanly.
- [ ] Step 4: Commit: `feat(catalog): initial connectors-catalog.json with 8 entries`.

### Task 1.2: Optional schema

- [ ] Step 1: Author `agent/connectors-catalog.schema.json` (JSON Schema draft 7 or 2020-12). Validate against the JSON file using a CLI like `npx ajv-cli validate -s schema -d data` to confirm.
- [ ] Step 2: Commit: `feat(catalog): connectors-catalog JSON schema`.

### Task 1.3: SVG icons

- [ ] Step 1: Add `agent/assets/connectors/<id>.svg` for each of the eight ids. Style guidance: respect spec 0008 "single coral accent" rule; fall back to monochrome glyph if a brand mark would clash.
- [ ] Step 2: Verify each SVG has `viewBox`, no inline scripts, < 4KB each.
- [ ] Step 3: Commit: `feat(catalog): SVG icons for 8 catalog connectors`.

---

## Phase 2: Extract `@zeno/mcp-discover` package

### Task 2.1: Scaffold the package

- [ ] Step 1: `mkdir -p packages/mcp-discover/src packages/mcp-discover/tests`.
- [ ] Step 2: Author `packages/mcp-discover/package.json`: `name: '@zeno/mcp-discover', version: '0.0.0', private: true, main: 'src/index.ts', types: 'src/index.ts', dependencies: { '@anthropic-ai/claude-agent-sdk': workspace pinned version, '@zeno/storage': 'workspace:*' }`.
- [ ] Step 3: Author `tsconfig.json` mirroring `packages/storage/tsconfig.json`.
- [ ] Step 4: Update `pnpm-workspace.yaml` to include `packages/mcp-discover`.
- [ ] Step 5: `pnpm install`.
- [ ] Step 6: Commit: `feat(workspace): scaffold @zeno/mcp-discover`.

### Task 2.2: Move sources

- [ ] Step 1: Move `apps/worker/src/agent/mcp-discover.ts` → `packages/mcp-discover/src/discover.ts`.
- [ ] Step 2: Move `apps/worker/src/agent/mcp-build.ts`'s `toStdioConfig`, `toRemoteConfig`, `RESERVED_*` constants → `packages/mcp-discover/src/build-config.ts`. Re-export from `apps/worker/src/agent/mcp-build.ts` so existing imports (the loader's `buildMcpServersMap`) keep working.
- [ ] Step 3: If spec 0033 split `discoverToolsStdio` and `discoverToolsRemote` into separate files, move them: → `discover-stdio.ts`, `discover-remote.ts`.
- [ ] Step 4: Move the heuristic classifier (the `read_*`/`write_*`/`...` switch) into `packages/mcp-discover/src/classify.ts`.
- [ ] Step 5: Author `packages/mcp-discover/src/index.ts`: re-export `discoverTools`, `toStdioConfig`, `toRemoteConfig`, the heuristic classifier, the `RESERVED_*` constants, and the public types (`DiscoveredTool`, `TestConnectionResponse` shapes if shared).
- [ ] Step 6: Update `apps/worker/package.json` to add `"@zeno/mcp-discover": "workspace:*"` to `dependencies`.
- [ ] Step 7: Update import paths in `apps/worker`: any `from '@/agent/mcp-discover'` → `from '@zeno/mcp-discover'`. Same for `mcp-build`'s shared helpers.
- [ ] Step 8: Move tests. Specifically relocate from spec 0032 + 0033:
  - `apps/worker/tests/agent/mcp-build.test.ts` → `packages/mcp-discover/tests/build-config.test.ts` (only the parts that test `toStdioConfig` + `toRemoteConfig`; loader-level tests stay in `apps/worker`).
  - `apps/worker/tests/agent/mcp-build-remote.test.ts` → `packages/mcp-discover/tests/build-remote.test.ts`.
  - `apps/worker/tests/agent/mcp-discover-remote.test.ts` → `packages/mcp-discover/tests/discover-remote.test.ts`.
  - Stdio discovery tests (if 0032 created any standalone) → `packages/mcp-discover/tests/discover-stdio.test.ts`.
  - **Stay in `apps/worker/tests/`** (not moved): integration tests that boot the worker (`tests/integration/connectors-stdio.test.ts`, `tests/integration/connectors-remote.test.ts`) — they exercise the worker boot path, not the package internals.
  - Fixtures (`apps/worker/tests/fixtures/echo-mcp/`, `apps/worker/tests/fixtures/remote-mcp/`) **stay where they are**; the package's tests reference them by relative path or via a shared helper.
  Adapt imports accordingly.
- [ ] Step 9: `pnpm run typecheck` green; `pnpm run test` green at the workspace level — every existing assertion from specs 0032 and 0033 still passes.
- [ ] Step 10: Commit: `refactor(workspace): extract @zeno/mcp-discover from apps/worker`.

---

## Phase 3: API read endpoints

### Task 3.1: Wire the connectors router

- [ ] Step 1: Create `apps/api/src/routes/connectors.ts`. Author the Hono sub-app pattern matching spec 0013's `crons.ts`.
- [ ] Step 2: **Route registration order is fixed and load-bearing.** Inside the sub-app, declare routes in this exact sequence: (1) `GET /catalog`, (2) `GET /catalog/icons/:filename`, (3) `POST /test`, (4) `GET /` (list), (5) `POST /` (create), (6) `GET /:id`, (7) `GET /:id/activity`, (8) `POST /:id/test`, (9) `PATCH /:id`, (10) `PATCH /:id/toggle`, (11) `PATCH /:id/tools/permissions/bulk`, (12) `PATCH /:id/tools/:toolName/permission`, (13) `POST /:id/refresh-tools`, (14) `DELETE /:id`, (15) `GET /:id/secrets/:key/reveal`. Static segments before any `:id` to avoid Hono matching `id='catalog'` (or `'test'`) on a misordered registration. Add a comment in the file referencing this constraint from spec 0034 §Constraints.
- [ ] Step 3: Add `connectorRepo = new ConnectorRepo(db)` instantiation in `apps/api/src/index.ts` (or wherever the existing repos are wired).
- [ ] Step 4: Mount the sub-app in `apps/api/src/server.ts` at `/api/connectors` behind `requireAuth`.
- [ ] Step 5: Build a Hono test-client harness (already exists per spec 0013 — reuse).
- [ ] Step 6: Stub `GET /catalog` (returning `[]`) and `GET /` (returning `[]`) and write passing tests for both, including a regression test that `GET /api/connectors/catalog` does NOT match `:id='catalog'` (asserts the registration order is correct).
- [ ] Step 7: Commit: `feat(api): scaffold /api/connectors router`.

### Task 3.2: `GET /api/connectors`

- [ ] Step 1: Implement: `connectorRepo.list()` + map to `ConnectorListItem[]`. Resolve `iconUrl` for catalog connectors (`/api/connectors/catalog/icons/<filename>`); null for custom.
- [ ] Step 2: Compute `toolCount` via `connectorRepo.getTools(id).length`. Compute `invocationCount24h` via a new repo method `countInvocationsSince(connectorId, since)` — **this method is added in this task**, not in spec 0032 (the 0032 repo's TDD list intentionally does not include it because the method is dashboard-specific). Add the method + its unit test in `packages/storage/src/repos/connectors.ts` and `packages/storage/tests/connectors.test.ts` as a sub-step of this task.
- [ ] Step 3: Test cases: empty DB → `[]`; one enabled stdio connector → array with one entry; counts populated correctly.
- [ ] Step 4: Commit: `feat(api): GET /api/connectors returns list with counts`.

### Task 3.3: `GET /api/connectors/:id`

- [ ] Step 1: Implement: `connectorRepo.get(id)` + secrets + tools. Mask secrets: `last4 = value.length >= 4 ? value.slice(-4) : 'xxxx'`. Rationale: short values (< 4 chars) reveal too much shape if partially echoed, so they are fully masked as `xxxx`. Empty string → `xxxx`.
- [ ] Step 2: 404 on miss.
- [ ] Step 3: Test cases: hit (full payload), miss (404), empty secret (`'xxxx'`), short secret (`<4 chars` → fully `'xxxx'`), normal-length secret (last 4 chars).
- [ ] Step 4: Commit: `feat(api): GET /api/connectors/:id detail`.

### Task 3.4: `GET /api/connectors/:id/activity`

- [ ] Step 1: Implement: `connectorRepo.recentInvocations(id, limit)`. Default `limit=20`, cap at 100.
- [ ] Step 2: 404 on miss.
- [ ] Step 3: Tests: empty (returns `[]`), populated (newest first), limit honored.
- [ ] Step 4: Commit: `feat(api): GET /api/connectors/:id/activity feed`.

### Task 3.5: `GET /api/connectors/catalog`

- [ ] Step 1: Create `apps/api/src/lib/catalog-loader.ts`. Read `agent/connectors-catalog.json` (try multiple candidates: `/app/agent/...`, `agent/...`). Validate against schema if `ajv` is added; otherwise hand-roll a Zod schema mirroring the file shape.
- [ ] Step 2: For each entry: resolve `iconUrl = '/api/connectors/catalog/icons/' + entry.icon`. Compute `isInstalled` by checking `connectorRepo.list({ source: 'catalog' })` for matching `catalogId`. Compute `toolCount = entry.tools.length`.
- [ ] Step 3: Tests: well-formed file → 8 entries returned; one entry already installed → `isInstalled: true` for that one; malformed file → 500 with `{ error: 'catalog malformed' }`.
- [ ] Step 4: Commit: `feat(api): GET /api/connectors/catalog with isInstalled flag`.

### Task 3.6: `GET /api/connectors/catalog/icons/:filename`

- [ ] Step 1: Implement: validate `filename` against the catalog's known icons; reject anything else with 404 (path traversal defense). Read the SVG file from `agent/assets/connectors/<filename>`. Return with `Content-Type: image/svg+xml` and `Cache-Control: public, max-age=86400`.
- [ ] Step 2: Tests: valid filename → SVG body; unknown filename → 404; `..` in filename → 404 (won't even pass validation).
- [ ] Step 3: Commit: `feat(api): GET /api/connectors/catalog/icons/:filename serves SVG`.

### Task 3.7: Final phase 3 quality gate

- [ ] Step 1: `pnpm run quality-gate` green.
- [ ] Step 2: Commit (squash if multiple): the phase complete.

---

## Phase 4: Synchronous test endpoints

### Task 4.1: `POST /api/connectors/test`

- [ ] Step 1: Zod schema for `TestConnectionRequest` (spec §Type extensions).
- [ ] Step 2: Build a transient `Connector` shape from the body (no DB write). Call `discoverTools(transient, body.secrets)` from `@zeno/mcp-discover`. Return the typed result as JSON (200 either way; success vs failure is in the body's `ok` field per spec).
- [ ] Step 3: Tests: stdio path against the echo MCP fixture (success); remote path against a stubbed fixture (success); failures (auth, timeout, network, unknown).
- [ ] Step 4: Commit: `feat(api): POST /api/connectors/test sync test-connection`.

### Task 4.2: `POST /api/connectors/:id/test`

- [ ] Step 1: Load connector + secrets. Call `discoverTools`. Persist outcome to the connector row (lastError/lastErrorAt/lastVerifiedAt per spec).
- [ ] Step 2: Tests: success path (connector verified, lastError cleared); failure (lastError populated; status NOT flipped).
- [ ] Step 3: Commit: `feat(api): POST /api/connectors/:id/test persists outcome`.

### Task 4.3: Process leak check

- [ ] Step 1: Add a smoke test that sequentially calls `POST /api/connectors/test` 100 times against the stdio fixture. Use `process.kill(0)` or count active children. Assert no leak.
- [ ] Step 2: If the count drifts upward, fix the teardown in `@zeno/mcp-discover` and re-run.
- [ ] Step 3: Commit: `test(api): no MCP process leaks across 100 test-connection calls`.

---

## Phase 5: Direct mutations

### Task 5.1: `PATCH /api/connectors/:id/toggle`

- [ ] Step 1: Read the current `status`. Flip between `enabled` and `disabled`. If `pending`, return 409 with `error: 'cannot toggle a pending connector — test it first'`.
- [ ] Step 2: Update via repo. Return `{ status: <new> }`.
- [ ] Step 3: Tests: enabled → disabled, disabled → enabled, pending → 409.
- [ ] Step 4: Commit: `feat(api): PATCH /api/connectors/:id/toggle`.

### Task 5.2: Per-tool permission

- [ ] Step 1: `PATCH /api/connectors/:id/tools/:toolName/permission`. Body: `{ permission: 'always_allow' | 'ask' | 'never' }`. Validate.
- [ ] Step 2: Use `connectorRepo.setToolPermission(id, toolName, permission)`. 404 on connector miss; 404 on tool miss (or surface a typed error).
- [ ] Step 3: Tests: success, miss cases.
- [ ] Step 4: Commit: `feat(api): PATCH per-tool permission`.

### Task 5.3: Bulk permission per category

- [ ] Step 1: `PATCH /api/connectors/:id/tools/permissions/bulk`. Body: `{ category, permission }`. Use `setBulkPermission` repo method; return `{ rowsAffected }`.
- [ ] Step 2: Tests: bulk affects only matching category; rowsAffected accurate.
- [ ] Step 3: Commit: `feat(api): PATCH bulk permission per category`.

### Task 5.4: Secret reveal endpoint

- [ ] Step 1: Create `apps/api/src/lib/secret-rate-limit.ts`. `class SecretRateLimiter { check(connectorId, key): boolean; record(connectorId, key): void }` — Map of `(id||key)` → `lastRevealedAt`. `check` returns `false` if last reveal within 60s.
- [ ] Step 2: `GET /api/connectors/:id/secrets/:key/reveal`. On rate-limit fail → 429 with `{ error: 'rate_limited', retryAfter: <secs> }`. On success: read value via `connectorRepo.getSecrets`, find the matching key, return `{ value }`. Always log `event=connector_secret_revealed, connectorId, key`.
- [ ] Step 3: Tests for the rate limiter (allow first call, deny second within 60s, allow after 60s using fake timers); endpoint tests for 200, 429, 404 (connector or key miss); audit log line is asserted.
- [ ] Step 4: Commit: `feat(api): GET reveal secret endpoint with rate limit + audit`.

### Task 5.5: Phase 5 quality gate

- [ ] Step 1: `pnpm run quality-gate` green.

---

## Phase 6: Command-enqueueing mutations + handlers

### Task 6.0: Extend `CommandType` union (REQUIRED — typecheck blocks Phase 6 without it)

- [ ] Step 1: In `packages/storage/src/types.ts`, extend the `CommandType` string-literal union with `'connector_create' | 'connector_update' | 'connector_refresh_tools' | 'connector_uninstall'`. Without this step, every Hono handler that calls `commandRepo.enqueue({ type: 'connector_create', ... })` fails typecheck because `CreateCommandInput.type` rejects the value.
- [ ] Step 2: Re-export from `packages/storage/src/index.ts` if necessary (no change needed if `CommandType` is already re-exported).
- [ ] Step 3: `pnpm --filter @zeno/storage typecheck` green.
- [ ] Step 4: Commit: `feat(storage): extend CommandType with connector_* values`.

### Task 6.1: Worker handlers (TDD)

- [ ] Step 1: For each of the four types (`connector_create`, `connector_update`, `connector_refresh_tools`, `connector_uninstall`), create the handler file and a matching test file. Use a stub `ConnectorRepo` and a stub `discoverTools` so tests are fast and deterministic.
- [ ] Step 2: `connector_create`: parse payload (slug is **required**, computed by the API — handler never recomputes), call `connectorRepo.create`. On SQLite UNIQUE-violation on `connectors.slug`: catch and `commandRepo.finish(cmd.id, 'failed', { error: 'slug collision', slug })`. Tests: catalog source insert succeeds; custom source insert succeeds; UNIQUE-violation path yields a failed command with the slug in the result. Slug collision *resolution* (the `-2`/`-3` suffix logic) is tested in the API task (Task 6.2 Step 1), not here — the handler trusts the payload.
- [ ] Step 3: `connector_update`: parse, apply patch via `connectorRepo.update`. If `secrets` present in payload, call `replaceSecrets` and run an internal test-connection (using `discoverTools` from `@zeno/mcp-discover`) to refresh `last_error` / `last_verified_at`. The internal test inherits `discoverTools`'s 10s upper-bound timeout — same as `POST /api/connectors/:id/test`. The handler holds the command processor for that duration; acceptable at single-user scale (rare event, single connector). Tests: patch only without secrets (no test); patch with secrets triggers internal test; secrets cleared (empty array) → `replaceSecrets` with `[]` and internal test will likely fail with auth, populating `last_error`.
- [ ] Step 4: `connector_refresh_tools`: load connector + secrets, call `discoverTools`. On success → `replaceTools` with category defaults; on failure → set `last_error`. Tests: success replaces (per-tool overrides lost); failure leaves tools unchanged but sets last_error.
- [ ] Step 5: `connector_uninstall`: call `connectorRepo.delete`. Test cascade: secrets/tools/invocations gone.
- [ ] Step 6: Each handler ends with `commandRepo.finish(cmd.id, status, result?)` per spec 0013 contract. Failures wrap in try/catch and call `finish(cmd.id, 'failed', { error })`.
- [ ] Step 7: Wire handlers in `apps/worker/src/commands/handlers/index.ts` (export map) and `apps/worker/src/commands/dispatcher.ts` (switch). Update `buildHandlerMap` in `apps/worker/src/index.ts` to inject the connector repo + the discover function.
- [ ] Step 8: `pnpm --filter @zeno/worker test` green.
- [ ] Step 9: Commit (one per handler ideally, or grouped with care): `feat(worker): connector_* command handlers`.

### Task 6.2: API command-enqueueing endpoints

- [ ] Step 1: `POST /api/connectors`: validate body (catalog vs custom branches). For catalog: load catalog, build payload with the catalog's tools + default permissions, set `slug = catalog.id` (catalog ids are already kebab-case and unique within the catalog file). For custom: derive `slug = slugify(displayName)`, then resolve collision: query `connectorRepo.getBySlug(slug)` in a loop, appending `-2`, `-3`, … until a free slug is found. Include the user-supplied tools (empty for `pending` custom; populated by the test-modal flow). The slug is included in the payload as a required string — the worker handler will not recompute it. Enqueue `connector_create`. Return 204.
- [ ] Step 2: `PATCH /api/connectors/:id`: validate body, enqueue `connector_update`.
- [ ] Step 3: `POST /api/connectors/:id/refresh-tools`: enqueue `connector_refresh_tools`.
- [ ] Step 4: `DELETE /api/connectors/:id`: enqueue `connector_uninstall`. 404 on miss.
- [ ] Step 5: Tests for each: assert a command row landed in `commands` with the right `type` and a parseable payload; status starts as `pending`.
- [ ] Step 6: Integration test (one): full round-trip — POST `/api/connectors` creates a catalog connector; the worker (running in the test) processes the command; the connector row appears with `status='enabled'`. Use the existing in-test commands poller pattern from spec 0013.
- [ ] Step 7: Commit: `feat(api): connector mutation endpoints (create/update/refresh/uninstall)`.

### Task 6.3: Phase 6 quality gate

- [ ] Step 1: `pnpm run quality-gate` green.

---

## Phase 7: Dashboard frontend port

### Task 7.1: Sidebar entry

- [ ] Step 1: In `apps/dashboard/src/components/layout/sidebar.tsx`, add a Connectors entry between Sessions and Logs. Match the existing icon + label conventions.
- [ ] Step 2: The route doesn't exist yet — add a placeholder `connectors.tsx` route that renders an empty shell so the link doesn't 404.
- [ ] Step 3: Commit: `feat(dashboard): connectors sidebar entry + placeholder route`.

### Task 7.2: Hooks

- [ ] Step 1: `apps/dashboard/src/lib/use-connectors.ts` — `useQuery({ queryKey: ['connectors'], queryFn: () => apiFetch<ConnectorListItem[]>('/api/connectors') })`.
- [ ] Step 2: `use-connector.ts` — detail query.
- [ ] Step 3: `use-connector-activity.ts` — activity feed query.
- [ ] Step 4: `use-catalog.ts` — catalog query with `staleTime: 60 * 60 * 1000`, `refetchOnWindowFocus: true`.
- [ ] Step 5: `use-connector-mutations.ts` — collected mutations:
  - `useToggleConnector` (optimistic).
  - `useSetToolPermission` (optimistic).
  - `useSetBulkPermission` (optimistic).
  - `useCreateConnector` (fire-and-forget — toast + `invalidateSoon`).
  - `useUpdateConnector` (fire-and-forget).
  - `useRefreshTools` (fire-and-forget).
  - `useUninstallConnector` (optimistic — remove from list immediately; rollback on error).
  - `useTestConnection` — plain `useMutation`; renders the result inline; no cache effect.
  - `useRevealSecret` — `useMutation`; the component holds the value in state for 10s.
- [ ] Step 6: Document the new query keys in `apps/dashboard/src/lib/query-client.ts` comments.
- [ ] Step 7: Tests: render a component that uses `useConnectors` and assert it renders the list returned by a mocked fetch.
- [ ] Step 8: Commit: `feat(dashboard): connector hooks (queries + mutations)`.

### Task 7.3: Components ported from `apps/design`

- [ ] Step 1: Port `status-pill.tsx` from `apps/design`. Pure presentational.
- [ ] Step 2: Port `catalog-grid.tsx`. Replace its hardcoded array with `useCatalog`. Each card opens the appropriate modal route via `useNavigate` (catalog cards → `/connectors/add-catalog/$catalogId`; "Add custom" → `/connectors/add-local` or `/connectors/add-remote` per the "transport choice" sub-modal in `apps/design`).
- [ ] Step 3: Port `kebab-menu.tsx` (already generic; minor import path tweaks).
- [ ] Step 4: Port `modal-backdrop.tsx`.
- [ ] Step 5: Port `activity-section.tsx`. Already accepts `feed` via prop.
- [ ] Step 6: Smoke render tests per component.
- [ ] Step 7: Commit: `feat(dashboard): port connector components from apps/design`.

### Task 7.4: List route

- [ ] Step 1: Replace the placeholder `connectors.tsx` with the full screen: Header (title + Add custom), InstalledConnectorSection, CatalogSectionHeader + CatalogGrid. Use `useConnectors` and `useCatalog`. Render skeletons during loading.
- [ ] Step 2: Hook the per-row kebab → toggle, delete (uninstall via modal route).
- [ ] Step 3: Empty state: when `useConnectors` returns `[]`, render the EmptyHero (per the design playground).
- [ ] Step 4: Smoke render test.
- [ ] Step 5: Visual diff against `apps/design/.../connectors/index.tsx`. Tweak as needed.
- [ ] Step 6: Commit: `feat(dashboard): /connectors list screen wired to live data`.

### Task 7.5: Detail route

- [ ] Step 1: Implement `connectors.$id.tsx`. Use `useConnector(id)` + `useConnectorActivity(id)`. Render Header, ConnectionSection, ToolPermissionsSection, ActivitySection.
- [ ] Step 2: Header: KebabMenu wired to `useTestConnection`, navigate to `/connectors/$id/refresh-tools`, navigate to `/connectors/$id/uninstall`. Toggle wired to `useToggleConnector`.
- [ ] Step 3: ConnectionSection: render URL or command/args based on transport. Iterate masked secrets; render eye icon hooked to `useRevealSecret`. Edit affordance opens an inline edit form (re-uses the secret-edit modal from `apps/design` via a route or inline overlay; pick the simpler option).
- [ ] Step 4: ToolPermissionsSection: groups by category, decisionToggle per tool wired to `useSetToolPermission`, bulk dropdown wired to `useSetBulkPermission`. Compute "mixed" when individual decisions disagree.
- [ ] Step 5: ActivitySection: feed prop sourced from `useConnectorActivity`.
- [ ] Step 6: Visual diff against `apps/design/.../connectors/{linear,notion,acme-scrum}`. The three states are now driven by data — `enabled+lastError=null` looks like Linear, `enabled+lastError=non-null` looks like Notion, `pending` looks like acme-scrum.
- [ ] Step 7: Commit: `feat(dashboard): /connectors/:id detail screen wired to live data`.

### Task 7.6: Modals

- [ ] Step 1: `connectors.add-catalog.$catalogId.tsx` — fetch the catalog entry, render the form, wire Test connection (`useTestConnection`) and Add (`useCreateConnector` with `source: 'catalog'`).
- [ ] Step 2: `connectors.add-local.tsx` — render the stdio form, wire Test (`useTestConnection`) and Add (`useCreateConnector` with `source: 'custom', transport: 'stdio'`). Allow saving as `pending` if no test ran.
- [ ] Step 3: `connectors.add-remote.tsx` — same shape, remote variant. Surface the `__MCP_TYPE__` advanced field as a `auto/http/sse` selector.
- [ ] Step 4: `connectors.$id.refresh-tools.tsx` — confirmation modal. The exact text `This will reset tool permissions to defaults.` (verify against spec 0029 §Refresh tools). Wire to `useRefreshTools`.
- [ ] Step 5: `connectors.$id.uninstall.tsx` — confirmation modal; wire to `useUninstallConnector` (optimistic remove).
- [ ] Step 6: Visual diff against the corresponding `apps/design` modals.
- [ ] Step 7: Commit: `feat(dashboard): connector modals (5 total) wired to mutations`.

### Task 7.7: Phase 7 quality gate

- [ ] Step 1: `pnpm run quality-gate` green.

---

## Phase 8: End-to-end smoke

### Task 8.1: Manual smoke

- [ ] Step 1: `pnpm run docker:build && pnpm run docker:up`.
- [ ] Step 2: Open `http://localhost:3000/connectors`. Empty state renders. Catalog visible.
- [ ] Step 3: Click Linear card. Modal opens. Paste a real Linear API key. Test → ✓ + tool count. Add → modal closes, connector appears in Installed with `enabled` status.
- [ ] Step 4: In Slack, send `@zeno list my linear issues`. Agent calls Linear MCP, returns issues.
- [ ] Step 5: In dashboard, observe the Activity feed within ~2s. The invocation row is visible.
- [ ] Step 6: Toggle off. Send the same message in Slack. Agent reports it doesn't have Linear tools. Toggle on. Send again. Agent uses the connector.
- [ ] Step 7: Click ⋯ → Refresh tools. Confirmation modal. Confirm. Tools list refreshes (per-tool overrides reset to defaults).
- [ ] Step 8: Click ⋯ → Uninstall. Confirmation. Confirm. Connector disappears.
- [ ] Step 9: Add a custom remote connector pointing at `https://mcp.linear.app/sse` with the same key. Test → ✓. Add. Send another Slack message. Works identically.
- [ ] Step 10: Check the API audit log: `pnpm run docker:sh && sqlite3 /workspace/zeno.db "SELECT event, connector_id FROM logs WHERE event='connector_secret_revealed'"`. Reveal a secret in the dashboard. Run the query again — new row.

### Task 8.2: Final verification

- [ ] Step 1: `pnpm run quality-gate` green at repo root.
- [ ] Step 2: Check that no `// biome-ignore` was added in `apps/api/src/routes/connectors.ts`, `apps/dashboard/src/lib/use-connector*.ts`, or any new file.
- [ ] Step 3: Update `context/specs/2026-04-26-connectors-dashboard/spec.md` frontmatter: `status: shipped`, `shipped: <date>`.
- [ ] Step 4: Commit: `chore(spec-0034): mark shipped`.

---

## Verification checklist (against spec § Success Criteria)

- [ ] 1. Catalog file with 8 entries (Phase 1).
- [ ] 2. SVG icons (Phase 1).
- [ ] 3. `@zeno/mcp-discover` package + worker re-imports (Phase 2).
- [ ] 4. API routes with Zod + integration tests (Phases 3-6).
- [ ] 5. Worker handlers tests + integration (Phase 6).
- [ ] 6. Dashboard routes render with smoke tests (Phase 7).
- [ ] 7. `useOptimisticMutation` wired correctly (Phase 7.2).
- [ ] 8. Secret reveal rate-limit + audit (Phase 5.4).
- [ ] 9. Test connection latency dominated by upstream (Phase 4).
- [ ] 10. Refresh-tools confirmation copy exact (Phase 7.6).
- [ ] 11. Catalog Add gating (Phase 7.6).
- [ ] 12. Sidebar Connectors entry (Phase 7.1).
- [ ] 13. `pnpm run quality-gate` green (Phase 8.2).
- [ ] 14. End-to-end smoke (Phase 8.1).
