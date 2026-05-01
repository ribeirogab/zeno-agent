---
feature: slack-channel-connector-code
spec: "[[spec]]"
created: 2026-04-29
---
# Spec 0057 — Slack channel connector (code) — Plan

**For this spec:** `[[spec]]`

## Approach

Refactor in-place across 8 files (3 storage, 2 worker, 3 API) plus 4 new files (catalog JSON, icon, catalog loader, channels route, resolver, resolver test). The change pattern is **additive** — every existing call path keeps working unchanged. New paths (`kind='channel'` rows, channels catalog, resolver) layer on top.

The work is sequenced strictly bottom-up: **storage → worker → API**. Storage migration + types + repo land first because nothing else compiles without them. Worker changes (resolver + mcp-build guard + handler kind-forward) come second because they're the consumers. API changes come last because they're the user-facing surface and depend on both.

TDD throughout — vitest tests written before each change, run to fail, then implementation. No Docker anywhere (the operator's `profiles/fn` container is running; running our own would conflict). Tests use in-memory SQLite for storage and a mocked Slack `App` for adapter integration.

## Architecture

### File structure

```
agent/
├── channels-catalog.json                                # NEW: 1 entry (Slack)
└── assets/connectors/slack.svg                          # NEW: icon

packages/storage/src/
├── migrations.ts                                        # +migration id=18 (ADD COLUMN kind)
├── types.ts                                             # +ConnectorKind type, +Connector.kind, +CreateConnectorInput.kind?
└── repos/connectors.ts                                  # +ConnectorRow.kind, +rowToConnector mapping, +INSERT kind, +listByKind, +ListConnectorsFilter.kind?

apps/worker/src/
├── config.ts                                            # SLACK_*_TOKEN optional; Config.slack fields → string|undefined
├── channels/slack/
│   ├── adapter.ts                                       # +_appOverride? for testability
│   ├── resolve-credentials.ts                           # NEW: sync resolver fn
│   └── resolve-credentials.test.ts                      # NEW: 6 resolution-table cases
├── agent/mcp-build.ts                                   # +guard: if (connector.kind !== 'mcp') continue
├── commands/handlers/connector-create.ts                # +kind field in catalogSchema/customSchema, forward to repo
└── index.ts                                             # call resolveSlackCredentials() instead of spreading config.slack

apps/api/src/
├── lib/channels-catalog-loader.ts                       # NEW: load+validate channels-catalog.json
├── routes/channels.ts                                   # NEW: buildChannelsRoute (GET /catalog, GET /)
├── routes/connectors.ts                                 # GET / passes {kind:'mcp'}; POST / extends kind on both schemas + branches; icon endpoint extends knownIcons
└── server.ts                                            # AppDeps.channelsCatalog?, mount /api/channels block
```

### Data flow at boot

```
Worker main() {
  config = loadConfig()                    // SLACK_*_TOKEN now optional → may be undefined
  db = openDatabase()
  connectors = new ConnectorRepo(db)
  // NEW: resolve creds via resolver, not spread of config.slack
  { appToken, botToken } = resolveSlackCredentials({ connectors, env: config.slack, logger })
  slack = new SlackChannel({ appToken, botToken, workspaceDir })
  ...
}
```

### Data flow at install (channel via dashboard / curl)

```
POST /api/connectors  body: { source: 'catalog', kind: 'channel', catalogId: 'slack', secrets: {...} }
  ↓
Zod validate (createCatalogSchema with new kind field)
  ↓
if (body.source === 'custom' && body.kind === 'channel') → 400 channel_must_be_catalog_source
  ↓ (source === 'catalog' branch)
if (body.kind === 'channel'):
  channelEntry = findChannelCatalogEntry(body.catalogId)
  slug = resolveSlugCollision(connectors, channelEntry.id)
  enqueue { kind: 'channel', slug, catalogId, displayName, description, transport: 'remote', command: null, args: null, url: null, tools: [], secrets }
else (kind === 'mcp', existing behavior):
  entry = findCatalogEntry(body.catalogId)
  // existing logic
  ↓
worker connector_create handler:
  zValidator(catalogSchema with new kind field)
  ConnectorRepo.create({ ...input, kind: input.kind ?? 'mcp' })
  ↓
INSERT INTO connectors (..., kind) VALUES (..., 'channel')
```

## Phase Ordering

Hard ordering — each phase blocks the next:

```
A. Storage foundation
   ├─ A.1 Migration id=18 (ADD COLUMN kind)
   ├─ A.2 Types: ConnectorKind, Connector.kind, CreateConnectorInput.kind?, ListConnectorsFilter.kind?
   └─ A.3 ConnectorRepo: ConnectorRow.kind, rowToConnector, INSERT, listByKind helper
   ↓
B. Catalog assets
   ├─ B.1 agent/channels-catalog.json (Slack entry)
   ├─ B.2 agent/assets/connectors/slack.svg
   └─ B.3 apps/api/src/lib/channels-catalog-loader.ts
   ↓
C. Worker — resolver + adapter test hook
   ├─ C.1 apps/worker/src/channels/slack/adapter.ts (+_appOverride)
   ├─ C.2 apps/worker/src/channels/slack/resolve-credentials.ts (sync fn) + 6 tests
   ├─ C.3 apps/worker/src/config.ts (SLACK_*_TOKEN optional)
   └─ C.4 apps/worker/src/index.ts:362 (call resolver)
   ↓
D. Worker — MCP guard + handler forward
   ├─ D.1 apps/worker/src/agent/mcp-build.ts (+kind guard) + test
   └─ D.2 apps/worker/src/commands/handlers/connector-create.ts (+kind field, forward) + test
   ↓
E. API
   ├─ E.1 apps/api/src/routes/connectors.ts:728 GET / (+kind:'mcp' filter)
   ├─ E.2 apps/api/src/routes/connectors.ts:222+ POST / (extend schema + branch)
   ├─ E.3 apps/api/src/routes/connectors.ts:306+ icon endpoint (extend knownIcons)
   ├─ E.4 apps/api/src/routes/channels.ts (NEW: buildChannelsRoute) + tests
   └─ E.5 apps/api/src/server.ts (AppDeps.channelsCatalog? + mount block)
   ↓
F. Quality gate
   └─ pnpm run quality-gate green (lint + typecheck + test)
   ↓
G. 3-round branch review (per cleanup contract Rule 2; reset on any blocking finding)
   ↓
H. Push + open PR (target: main)
```

A → B → C → D → E is strictly serial. F requires all of A-E. G requires F. H requires G clean.

## Risks / Open Decisions

- **Migration id collision risk.** Spec asserts last migration is id=17; new migration must be id=18. If another spec (or a concurrent branch) lands a migration first, our id=18 conflicts. Mitigation: re-verify `wc -l packages/storage/src/migrations.ts` and `grep -c '  id: ' packages/storage/src/migrations.ts` immediately before writing the migration; pick next free id at write time.
- **TypeScript edge case in `Config.slack`**. Making `appToken: string | undefined` propagates to one consumer (`index.ts:362`). The fix is documented in spec, but the implementer must replace the entire spread `...config.slack` with the resolver call — leaving the spread alongside the resolver is a TS error and a logic duplication.
- **Worker handler `connector-create.ts` payload schemas**. Both `catalogSchema` and `customSchema` get the same optional `kind` field. The implementer must update BOTH to keep symmetry with the API route schema. Missing one means the API accepts the field but the handler rejects it.
- **Channel install via curl during testing**. The spec doesn't add a dashboard UI, so testing the install end-to-end requires `curl -X POST /api/connectors`. Sandbox SQLite + an integration test against the in-process Hono server is enough for spec 0057. Real curl against `profiles/fn` is spec 0058's job.
- **Tests must NOT use docker:up / docker:down**. Anywhere a test wants a "running worker" or "running API", use vitest's in-process bootstrap. Adding a `docker compose` invocation in this PR's tests would race the running `profiles/fn` container.
- **Worker `resolver` testing pattern**. Spec says use real ConnectorRepo against in-memory SQLite (no `vi.fn()` stubs). Implementer must construct `new Database(':memory:')`, run migrations, then exercise the resolver with real DB inserts. Pattern matches existing repo tests.
- **`buildMcpServersMap` test fixture**. The MCP-vs-channel guard test inserts a channel row with `transport='remote'` and asserts the loop body skips it. Implementer must arrange a real connectors row + real `getEnabledWithRelations()` call (not mock-only) — otherwise the guard placement isn't actually verified.

## Self-Review

After authoring plan.md + tasks.md, verify:

- [ ] Every spec section has at least one task in tasks.md.
- [ ] Phase ordering A→B→C→D→E→F→G→H is consistent between plan.md and tasks.md.
- [ ] Every task has a TDD sequence (test fails → impl → test passes → commit).
- [ ] No `docker compose`, `docker run`, or any container-touching command anywhere.
- [ ] Resolver tests cover all 6 rows of the resolution table from spec.
- [ ] MCP-vs-channel guard has a dedicated test that exercises real DB insert.
- [ ] All file paths in tasks.md are absolute under `/Users/operator/www/octocat/zeno-agent-worktrees/2026-04-29-slack-channel/` OR clearly relative to the worktree root with explicit `cd`.
- [ ] Each commit message clearly identifies which Phase + Task.
