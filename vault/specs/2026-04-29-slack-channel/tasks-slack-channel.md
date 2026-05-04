---
feature: slack-channel-connector-code
plan: "[[plan-slack-channel]]"
spec: "[[spec-slack-channel]]"
created: 2026-04-29
---
# Spec 0057 — Slack channel connector (code) — Tasks

**For this plan:** `[[plan-slack-channel]]`

> **For agentic workers:** Implement task-by-task in order. Use TDD strictly — write test first, run to fail, write minimal impl, run to pass, commit. NO Docker commands ANYWHERE — operator's `profiles/<example>` container is running and would conflict. Per cleanup contract (`tmp/zeno-cleanup-contract.md`) Rule 4: skip approvals for trivia, only stop at `git push` / `gh pr create`.
>
> All commands run from the worktree root: `/Users/<you>/www/your-github-username/zeno-agent-worktrees/2026-04-29-slack-channel/`. Tests run via `pnpm vitest run <pattern>` from package roots.

---

## Phase A — Storage foundation

**Goal:** Add `kind` column to `connectors` table; types + repo support `Connector.kind`; new `listByKind()` method. Nothing else compiles without this phase.

### Task A.1 — Migration id=18 adds `kind` column

**Files:**
- Modify: `packages/storage/src/migrations.ts` (append migration id=18)
- Test: `packages/storage/src/migrations.test.ts` (or wherever migration tests co-locate)

- [ ] **A.1.1** Verify last migration id is still 17:
  ```bash
  grep -c '^  { id:' packages/storage/src/migrations.ts
  grep '^  { id:' packages/storage/src/migrations.ts | tail -3
  ```
  Expected: count is at least 17; last 3 ids end with `id: 17`. If count >17, adjust new migration id below.

- [ ] **A.1.2** Write the failing migration test in `packages/storage/src/migrations.test.ts`:

  ```ts
  import Database from 'better-sqlite3';
  import { describe, expect, test } from 'vitest';
  import { runMigrations } from './migrations';

  describe('migration 18 — connectors.kind', () => {
    test('adds kind column with mcp default', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      // Insert a row without kind — should default to 'mcp'
      db.prepare(`INSERT INTO connectors (id, slug, display_name, source, transport, status) VALUES ('t1', 'test', 'Test', 'catalog', 'stdio', 'enabled')`).run();
      const row = db.prepare(`SELECT kind FROM connectors WHERE id = 't1'`).get() as { kind: string };
      expect(row.kind).toBe('mcp');
    });

    test('rejects kind values outside the enum', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      expect(() => {
        db.prepare(`INSERT INTO connectors (id, slug, display_name, source, transport, status, kind) VALUES ('t1', 'test', 'Test', 'catalog', 'stdio', 'enabled', 'bogus')`).run();
      }).toThrow(/CHECK constraint failed/);
    });

    test('accepts channel kind explicitly', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      db.prepare(`INSERT INTO connectors (id, slug, display_name, source, transport, status, kind) VALUES ('t1', 'slack', 'Slack', 'catalog', 'remote', 'enabled', 'channel')`).run();
      const row = db.prepare(`SELECT kind FROM connectors WHERE id = 't1'`).get() as { kind: string };
      expect(row.kind).toBe('channel');
    });
  });
  ```

- [ ] **A.1.3** Run test to confirm fails:
  ```bash
  pnpm --filter @zeno/storage vitest run migrations.test.ts -t 'migration 18'
  ```
  Expected: 3 tests fail (no `kind` column yet).

- [ ] **A.1.4** Add the migration. Open `packages/storage/src/migrations.ts`, find last entry (`id: 17`), append:

  ```ts
  {
    id: 18,
    name: 'connectors_kind_column',
    sql: `
      ALTER TABLE connectors
        ADD COLUMN kind TEXT NOT NULL DEFAULT 'mcp'
        CHECK (kind IN ('mcp', 'channel'));
    `,
  },
  ```

- [ ] **A.1.5** Run test to confirm passes:
  ```bash
  pnpm --filter @zeno/storage vitest run migrations.test.ts -t 'migration 18'
  ```
  Expected: all 3 tests PASS.

- [ ] **A.1.6** Commit:
  ```bash
  git add packages/storage/src/migrations.ts packages/storage/src/migrations.test.ts
  git commit -m "feat(storage): migration 18 — add connectors.kind column (spec 0057)"
  ```

### Task A.2 — Types: ConnectorKind + Connector.kind + CreateConnectorInput.kind + ListConnectorsFilter.kind

**Files:**
- Modify: `packages/storage/src/types.ts` (add `ConnectorKind` type, extend `Connector`, `CreateConnectorInput`)
- Modify: `packages/storage/src/repos/connectors.ts` (extend `ListConnectorsFilter`)

- [ ] **A.2.1** Open `packages/storage/src/types.ts`. Add `ConnectorKind` type near the existing `ConnectorTransport` / `ConnectorSource` types:

  ```ts
  export type ConnectorKind = 'mcp' | 'channel';
  ```

- [ ] **A.2.2** Extend the `Connector` interface (locate at line ~145) — add `kind: ConnectorKind` field. Keep the rest unchanged.

- [ ] **A.2.3** Extend `CreateConnectorInput` interface (locate at line ~242) — add `kind?: ConnectorKind` field (optional with no explicit default in the type; default applied at the repo INSERT). Keep `transport: ConnectorTransport` REQUIRED — do NOT make it optional.

- [ ] **A.2.4** Open `packages/storage/src/repos/connectors.ts`. Find `ListConnectorsFilter` interface (locate at line ~130) — add `kind?: ConnectorKind` field.

- [ ] **A.2.5** Verify nothing else breaks — run typecheck across the package:
  ```bash
  pnpm --filter @zeno/storage typecheck
  ```
  Expected: ANY remaining error here is a callsite that reads `Connector` and asserts a fully-typed object — fix by widening or by handling new field. If no errors, proceed.

- [ ] **A.2.6** Commit:
  ```bash
  git add packages/storage/src/types.ts packages/storage/src/repos/connectors.ts
  git commit -m "feat(storage): types — ConnectorKind + Connector.kind + filter.kind (spec 0057)"
  ```

### Task A.3 — ConnectorRepo: ConnectorRow.kind, rowToConnector, INSERT, listByKind

**Files:**
- Modify: `packages/storage/src/repos/connectors.ts`
- Test: `packages/storage/src/repos/connectors.test.ts`

- [ ] **A.3.1** Write failing tests in `packages/storage/src/repos/connectors.test.ts` (append to existing test file):

  ```ts
  describe('ConnectorRepo.kind', () => {
    test('rowToConnector maps kind from DB row', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c1', slug: 'sentry', displayName: 'Sentry', source: 'catalog',
        transport: 'stdio', status: 'enabled', kind: 'mcp',
      });
      const row = repo.get('c1');
      expect(row?.kind).toBe('mcp');
    });

    test('create() defaults kind to mcp when not provided', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c2', slug: 'linear', displayName: 'Linear', source: 'catalog',
        transport: 'stdio', status: 'enabled',
      });
      const row = repo.get('c2');
      expect(row?.kind).toBe('mcp');
    });

    test('create() accepts kind=channel explicitly', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c3', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'enabled', kind: 'channel',
      });
      const row = repo.get('c3');
      expect(row?.kind).toBe('channel');
    });

    test('listByKind filters by kind', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const repo = new ConnectorRepo(db);
      repo.create({ id: 'm1', slug: 'sentry', displayName: 'Sentry', source: 'catalog', transport: 'stdio', status: 'enabled', kind: 'mcp' });
      repo.create({ id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog', transport: 'remote', status: 'enabled', kind: 'channel' });
      const channels = repo.listByKind('channel');
      expect(channels).toHaveLength(1);
      expect(channels[0].slug).toBe('slack');
      const mcps = repo.listByKind('mcp');
      expect(mcps).toHaveLength(1);
      expect(mcps[0].slug).toBe('sentry');
    });

    test('list({ kind: "mcp" }) excludes channel rows', () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const repo = new ConnectorRepo(db);
      repo.create({ id: 'm1', slug: 'sentry', displayName: 'Sentry', source: 'catalog', transport: 'stdio', status: 'enabled', kind: 'mcp' });
      repo.create({ id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog', transport: 'remote', status: 'enabled', kind: 'channel' });
      const result = repo.list({ kind: 'mcp' });
      expect(result).toHaveLength(1);
      expect(result[0].slug).toBe('sentry');
    });
  });
  ```

- [ ] **A.3.2** Run tests to confirm fails:
  ```bash
  pnpm --filter @zeno/storage vitest run connectors.test.ts -t 'ConnectorRepo.kind'
  ```
  Expected: 5 tests fail (kind not in `ConnectorRow`, INSERT doesn't write it, listByKind missing, etc.).

- [ ] **A.3.3** In `packages/storage/src/repos/connectors.ts`, locate `ConnectorRow` interface (around line ~20) — add `kind: string;` field.

- [ ] **A.3.4** Locate `rowToConnector()` function — add `kind: row.kind as ConnectorKind` to the returned object.

- [ ] **A.3.5** Locate the INSERT statement in `create()` (around line ~206). Update the column list and VALUES placeholders to include `kind`. The `INSERT INTO connectors (...)` line should become:

  ```sql
  INSERT INTO connectors (id, slug, display_name, description, source, catalog_id, transport, command, args, url, status, app_id, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ```

  And the `.run(...)` arguments append `input.kind ?? 'mcp'` as the last positional. (Read existing `.run(...)` order; preserve order, append at end matching INSERT order.)

- [ ] **A.3.6** Update the `list()` method (around line ~138) to handle the new `kind` filter. Inside the existing query builder pattern, when `filter.kind` is provided, append `AND kind = ?` to the WHERE clause and push `filter.kind` to the params array.

- [ ] **A.3.7** Add `listByKind(kind: ConnectorKind): Connector[]` as a thin wrapper after `list()`:

  ```ts
  listByKind(kind: ConnectorKind): Connector[] {
    return this.list({ kind });
  }
  ```

- [ ] **A.3.8** Run tests to confirm passes:
  ```bash
  pnpm --filter @zeno/storage vitest run connectors.test.ts -t 'ConnectorRepo.kind'
  ```
  Expected: 5 tests PASS.

- [ ] **A.3.9** Run full storage tests to confirm nothing else broke:
  ```bash
  pnpm --filter @zeno/storage vitest run
  ```
  Expected: all green.

- [ ] **A.3.10** Commit:
  ```bash
  git add packages/storage/src/repos/connectors.ts packages/storage/src/repos/connectors.test.ts
  git commit -m "feat(storage): ConnectorRepo — kind in row+INSERT, listByKind, list filter (spec 0057)"
  ```

---

## Phase B — Catalog assets

**Goal:** Slack catalog entry + icon + new loader module.

### Task B.1 — `agent/channels-catalog.json` with Slack entry

**Files:**
- Create: `agent/channels-catalog.json`

- [ ] **B.1.1** Create `agent/channels-catalog.json`:

  ```json
  {
    "_doc": "Curated channel adapters offered to the operator in the dashboard. Each channel is a transport that delivers messages to the agent core. Adding an entry here makes it appear under GET /api/channels/catalog. The runtime stores channel configuration in the connectors table (kind=channel) after install — this file is the directory.",
    "version": 1,
    "channels": [
      {
        "id": "slack",
        "slug": "slack",
        "name": "Slack",
        "description": "Talk to Zeno from a Slack workspace. The bot listens via socket-mode and replies in the same channel/thread.",
        "icon": "slack.svg",
        "docsUrl": "https://api.slack.com/apis/socket-mode",
        "secrets": [
          {
            "key": "SLACK_APP_TOKEN",
            "label": "App Token",
            "help": "Starts with `xapp-`. Generate at api.slack.com → your app → Basic Information → App-Level Tokens. Required scope: `connections:write`.",
            "required": true
          },
          {
            "key": "SLACK_BOT_TOKEN",
            "label": "Bot Token",
            "help": "Starts with `xoxb-`. Found at api.slack.com → your app → OAuth & Permissions → Bot User OAuth Token. Required scopes: `app_mentions:read`, `chat:write`, `files:read`, `files:write`, `im:history`, `im:read`, `im:write`, `reactions:read`, `reactions:write`.",
            "required": true
          }
        ]
      }
    ]
  }
  ```

- [ ] **B.1.2** Verify JSON parses:
  ```bash
  python3 -c "import json; json.load(open('agent/channels-catalog.json')); print('ok')"
  ```
  Expected: `ok`.

- [ ] **B.1.3** Commit:
  ```bash
  git add agent/channels-catalog.json
  git commit -m "feat(catalog): channels-catalog.json with Slack entry (spec 0057)"
  ```

### Task B.2 — Slack icon

**Files:**
- Create: `agent/assets/connectors/slack.svg`

- [ ] **B.2.1** Find or create a public-domain Slack SVG icon. If no asset is on hand, use a minimal placeholder SVG and replace later:

  ```bash
  cat > agent/assets/connectors/slack.svg <<'EOF'
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
  </svg>
  EOF
  ```

- [ ] **B.2.2** Verify file exists + non-empty:
  ```bash
  ls -la agent/assets/connectors/slack.svg
  ```
  Expected: file size > 100 bytes.

- [ ] **B.2.3** Commit:
  ```bash
  git add agent/assets/connectors/slack.svg
  git commit -m "feat(catalog): Slack icon asset (spec 0057)"
  ```

### Task B.3 — `apps/api/src/lib/channels-catalog-loader.ts`

**Files:**
- Create: `apps/api/src/lib/channels-catalog-loader.ts`
- Test: `apps/api/src/lib/channels-catalog-loader.test.ts`

- [ ] **B.3.1** First, study the reference: `apps/api/src/lib/catalog-loader.ts`. The new loader mirrors its shape — load JSON, validate, expose lookup. Read it briefly:
  ```bash
  head -100 apps/api/src/lib/catalog-loader.ts
  ```

- [ ] **B.3.2** Write failing test in `apps/api/src/lib/channels-catalog-loader.test.ts`:

  ```ts
  import { describe, expect, test } from 'vitest';
  import { loadChannelsCatalog, findChannelCatalogEntry } from './channels-catalog-loader';

  describe('channels-catalog-loader', () => {
    test('loadChannelsCatalog returns catalog with at least one channel', () => {
      const catalog = loadChannelsCatalog();
      expect(catalog.channels.length).toBeGreaterThan(0);
    });

    test('catalog has slack entry', () => {
      const catalog = loadChannelsCatalog();
      const slack = catalog.channels.find(c => c.id === 'slack');
      expect(slack).toBeDefined();
      expect(slack?.name).toBe('Slack');
      expect(slack?.secrets).toHaveLength(2);
    });

    test('findChannelCatalogEntry returns Slack entry by id', () => {
      const catalog = loadChannelsCatalog();
      const slack = findChannelCatalogEntry(catalog, 'slack');
      expect(slack?.slug).toBe('slack');
    });

    test('findChannelCatalogEntry returns null for unknown id', () => {
      const catalog = loadChannelsCatalog();
      const result = findChannelCatalogEntry(catalog, 'discord');
      expect(result).toBeNull();
    });
  });
  ```

- [ ] **B.3.3** Run test to confirm fails:
  ```bash
  pnpm --filter @zeno/api vitest run channels-catalog-loader.test.ts
  ```
  Expected: 4 tests fail (module not found).

- [ ] **B.3.4** Create `apps/api/src/lib/channels-catalog-loader.ts`:

  ```ts
  import { readFileSync } from 'node:fs';
  import { join, resolve } from 'node:path';
  import { z } from 'zod';

  const channelSecretSchema = z.object({
    key: z.string(),
    label: z.string(),
    help: z.string().optional(),
    required: z.boolean().optional(),
  });

  const channelEntrySchema = z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().optional(),
    icon: z.string(),
    docsUrl: z.string().optional(),
    secrets: z.array(channelSecretSchema),
  });

  const channelsCatalogSchema = z.object({
    _doc: z.string().optional(),
    version: z.number(),
    channels: z.array(channelEntrySchema),
  });

  export type ChannelCatalogEntry = z.infer<typeof channelEntrySchema>;
  export type ChannelsCatalog = z.infer<typeof channelsCatalogSchema>;

  /** Resolve channels-catalog.json path. Mirrors catalog-loader.ts pattern. */
  function resolveCatalogPath(): string {
    // Worktree root → agent/channels-catalog.json
    const root = resolve(process.cwd());
    return join(root, 'agent', 'channels-catalog.json');
  }

  let cached: ChannelsCatalog | null = null;

  export function loadChannelsCatalog(): ChannelsCatalog {
    if (cached) return cached;
    const raw = readFileSync(resolveCatalogPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    cached = channelsCatalogSchema.parse(parsed);
    return cached;
  }

  export function findChannelCatalogEntry(catalog: ChannelsCatalog, id: string): ChannelCatalogEntry | null {
    return catalog.channels.find(c => c.id === id) ?? null;
  }

  /** For tests: reset the module-level cache. */
  export function _resetChannelsCatalogCache(): void {
    cached = null;
  }
  ```

- [ ] **B.3.5** Run test:
  ```bash
  pnpm --filter @zeno/api vitest run channels-catalog-loader.test.ts
  ```
  Expected: 4 PASS.

- [ ] **B.3.6** Commit:
  ```bash
  git add apps/api/src/lib/channels-catalog-loader.ts apps/api/src/lib/channels-catalog-loader.test.ts
  git commit -m "feat(api): channels-catalog-loader (spec 0057)"
  ```

---

## Phase C — Worker resolver + adapter test hook

**Goal:** Slack credential resolver (sync, takes ConnectorRepo); SlackChannel `_appOverride` for testing; config schema makes SLACK tokens optional; index.ts uses resolver.

### Task C.1 — SlackChannel `_appOverride` opt for testability

**Files:**
- Modify: `apps/worker/src/channels/slack/adapter.ts`

- [ ] **C.1.1** Open `apps/worker/src/channels/slack/adapter.ts`. Locate `SlackChannelOptions` interface (around line 23). Add field:
  ```ts
  /** Test-only: inject a pre-built App instance instead of constructing one. Production code never sets this. */
  _appOverride?: App;
  ```

- [ ] **C.1.2** Locate the constructor (around line 38). Change `this.app = new App({ token: opts.botToken, ... });` to:
  ```ts
  this.app = opts._appOverride ?? new App({
    token: opts.botToken,
    appToken: opts.appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });
  ```

- [ ] **C.1.3** Run typecheck to confirm clean:
  ```bash
  pnpm --filter @zeno/worker typecheck
  ```
  Expected: green.

- [ ] **C.1.4** Commit:
  ```bash
  git add apps/worker/src/channels/slack/adapter.ts
  git commit -m "feat(worker/slack): _appOverride opt for test injection (spec 0057)"
  ```

### Task C.2 — `resolveSlackCredentials` resolver + tests

**Files:**
- Create: `apps/worker/src/channels/slack/resolve-credentials.ts`
- Create: `apps/worker/src/channels/slack/resolve-credentials.test.ts`

- [ ] **C.2.1** Write failing test in `apps/worker/src/channels/slack/resolve-credentials.test.ts`:

  ```ts
  import Database from 'better-sqlite3';
  import { describe, expect, test } from 'vitest';
  import { ConnectorRepo, runMigrations } from '@zeno/storage';
  import { createLogger } from '@zeno/logger';
  import { resolveSlackCredentials } from './resolve-credentials';

  function makeDb() {
    const db = new Database(':memory:');
    runMigrations(db);
    return db;
  }

  const logger = createLogger({ service: 'test' });

  describe('resolveSlackCredentials — resolution table', () => {
    test('1. enabled DB row + both secrets → DB creds, source=connector_secrets', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'enabled', kind: 'channel',
      });
      repo.setSecret('c1', 'SLACK_APP_TOKEN', 'xapp-fromdb');
      repo.setSecret('c1', 'SLACK_BOT_TOKEN', 'xoxb-fromdb');
      const result = resolveSlackCredentials({
        connectors: repo,
        env: { appToken: undefined, botToken: undefined },
        logger,
      });
      expect(result.appToken).toBe('xapp-fromdb');
      expect(result.botToken).toBe('xoxb-fromdb');
      expect(result.source).toBe('connector_secrets');
    });

    test('2. enabled DB row + missing secret → hard error', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'enabled', kind: 'channel',
      });
      repo.setSecret('c1', 'SLACK_APP_TOKEN', 'xapp-only');
      // Missing SLACK_BOT_TOKEN
      expect(() => resolveSlackCredentials({
        connectors: repo,
        env: { appToken: 'xapp-fallback', botToken: 'xoxb-fallback' },
        logger,
      })).toThrow(/credentials missing/);
    });

    test('3. disabled row + both env tokens → env fallback', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'disabled', kind: 'channel',
      });
      const result = resolveSlackCredentials({
        connectors: repo,
        env: { appToken: 'xapp-env', botToken: 'xoxb-env' },
        logger,
      });
      expect(result.source).toBe('env_fallback');
      expect(result.appToken).toBe('xapp-env');
    });

    test('4. disabled row + missing env → hard error', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      repo.create({
        id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'disabled', kind: 'channel',
      });
      expect(() => resolveSlackCredentials({
        connectors: repo,
        env: { appToken: undefined, botToken: undefined },
        logger,
      })).toThrow(/Slack credentials not configured/);
    });

    test('5. no DB row + both env tokens → env fallback', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      const result = resolveSlackCredentials({
        connectors: repo,
        env: { appToken: 'xapp-env', botToken: 'xoxb-env' },
        logger,
      });
      expect(result.source).toBe('env_fallback');
      expect(result.appToken).toBe('xapp-env');
      expect(result.botToken).toBe('xoxb-env');
    });

    test('6. no DB row + missing env → hard error', () => {
      const db = makeDb();
      const repo = new ConnectorRepo(db);
      expect(() => resolveSlackCredentials({
        connectors: repo,
        env: { appToken: undefined, botToken: undefined },
        logger,
      })).toThrow(/Slack credentials not configured/);
    });
  });
  ```

- [ ] **C.2.2** Run test to confirm fails:
  ```bash
  pnpm --filter @zeno/worker vitest run resolve-credentials.test.ts
  ```
  Expected: 6 tests fail (module missing).

- [ ] **C.2.3** Create `apps/worker/src/channels/slack/resolve-credentials.ts`:

  ```ts
  import type { ConnectorRepo } from '@zeno/storage';
  import type { Logger } from '@zeno/logger';

  export interface SlackCredentialsResolverDeps {
    connectors: ConnectorRepo;
    env: { appToken: string | undefined; botToken: string | undefined };
    logger: Logger;
  }

  export interface ResolvedSlackCredentials {
    appToken: string;
    botToken: string;
    source: 'connector_secrets' | 'env_fallback';
  }

  /**
   * Resolve Slack credentials at worker boot.
   *
   * Priority (per spec 0057):
   *   1. Enabled DB row + both secrets → DB creds (source: connector_secrets)
   *   2. Enabled DB row + missing secret → hard error
   *   3. Disabled/pending DB row → fall through to env (treated as not installed)
   *   4. No DB row → fall through to env
   *   5. Env present → env creds (source: env_fallback)
   *   6. Env missing → hard error
   */
  export function resolveSlackCredentials(deps: SlackCredentialsResolverDeps): ResolvedSlackCredentials {
    const { connectors, env, logger } = deps;

    const allChannels = connectors.listByKind('channel');
    const slack = allChannels.find(c => c.slug === 'slack' && c.status === 'enabled');

    if (slack) {
      const secrets = connectors.getSecrets(slack.id);
      const appToken = secrets.find(s => s.key === 'SLACK_APP_TOKEN')?.value;
      const botToken = secrets.find(s => s.key === 'SLACK_BOT_TOKEN')?.value;

      if (!appToken || !botToken) {
        const msg = 'Slack channel installed but credentials missing — fix via dashboard or uninstall the channel';
        logger.error({ event: 'slack_creds_empty_after_install', connectorId: slack.id }, msg);
        throw new Error(msg);
      }

      logger.info({ event: 'slack_creds_resolved', source: 'connector_secrets', connectorId: slack.id }, 'Slack creds: connector_secrets');
      return { appToken, botToken, source: 'connector_secrets' };
    }

    if (env.appToken && env.botToken) {
      logger.info({ event: 'slack_creds_resolved', source: 'env_fallback' }, 'Slack creds: env_fallback');
      return { appToken: env.appToken, botToken: env.botToken, source: 'env_fallback' };
    }

    const msg = 'Slack credentials not configured — install Slack channel via dashboard or set SLACK_APP_TOKEN/SLACK_BOT_TOKEN in profile .env';
    logger.error({ event: 'slack_creds_missing' }, msg);
    throw new Error(msg);
  }
  ```

- [ ] **C.2.4** Run test to confirm passes:
  ```bash
  pnpm --filter @zeno/worker vitest run resolve-credentials.test.ts
  ```
  Expected: 6 tests PASS.

- [ ] **C.2.5** Commit:
  ```bash
  git add apps/worker/src/channels/slack/resolve-credentials.ts apps/worker/src/channels/slack/resolve-credentials.test.ts
  git commit -m "feat(worker/slack): resolveSlackCredentials with 6-case resolution table (spec 0057)"
  ```

### Task C.3 — config.ts: SLACK_*_TOKEN optional

**Files:**
- Modify: `apps/worker/src/config.ts`

- [ ] **C.3.1** Open `apps/worker/src/config.ts`. Locate `envSchema` (lines 4-5):
  ```ts
  SLACK_APP_TOKEN: z.string().startsWith('xapp-'),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-'),
  ```
  Change to:
  ```ts
  SLACK_APP_TOKEN: z.string().startsWith('xapp-').optional(),
  SLACK_BOT_TOKEN: z.string().startsWith('xoxb-').optional(),
  ```

- [ ] **C.3.2** Locate the `Config` type (line ~13-14):
  ```ts
  slack: { appToken: string; botToken: string };
  ```
  Change to:
  ```ts
  /** Spec 0057: optional — resolved at boot via resolveSlackCredentials. May be undefined when Slack channel is installed via dashboard (DB-only). */
  slack: { appToken: string | undefined; botToken: string | undefined };
  ```

- [ ] **C.3.3** Locate the `loadConfig` return (line ~32):
  ```ts
  slack: { appToken: env.SLACK_APP_TOKEN, botToken: env.SLACK_BOT_TOKEN },
  ```
  This already passes through the parsed values; no change needed (`env.SLACK_APP_TOKEN` is now `string | undefined` from the optional Zod schema).

- [ ] **C.3.4** Run typecheck — expect ONE error at `apps/worker/src/index.ts:362` where `config.slack` is spread into `SlackChannel`. Don't fix yet — that's Task C.4:
  ```bash
  pnpm --filter @zeno/worker typecheck 2>&1 | head -10
  ```
  Expected: error mentions `appToken` / `botToken` type incompatibility at index.ts:362.

- [ ] **C.3.5** Commit (don't run quality gate yet — typecheck will be green after C.4):
  ```bash
  git add apps/worker/src/config.ts
  git commit -m "feat(worker/config): SLACK_*_TOKEN optional + Config.slack types (spec 0057)"
  ```

### Task C.4 — index.ts wires resolver

**Files:**
- Modify: `apps/worker/src/index.ts`

- [ ] **C.4.1** Open `apps/worker/src/index.ts`. Add import near other channels imports:
  ```ts
  import { resolveSlackCredentials } from '@/channels/slack/resolve-credentials';
  ```

- [ ] **C.4.2** Locate line 362:
  ```ts
  const slack = new SlackChannel({
    ...config.slack,
    workspaceDir: config.workspaceDir,
  });
  ```
  Replace with:
  ```ts
  // Spec 0057: resolve Slack creds (DB-first with .env fallback). The resolver
  // throws on misconfigured states (installed-but-empty / no-row-no-env).
  const slackCreds = resolveSlackCredentials({
    connectors,
    env: config.slack,
    logger,
  });
  const slack = new SlackChannel({
    appToken: slackCreds.appToken,
    botToken: slackCreds.botToken,
    workspaceDir: config.workspaceDir,
  });
  ```
  (Note: `connectors` is the existing `ConnectorRepo` instance constructed earlier in `main()`. Verify by `grep -n 'new ConnectorRepo\|connectors =' apps/worker/src/index.ts` to confirm the variable name.)

- [ ] **C.4.3** Run typecheck:
  ```bash
  pnpm --filter @zeno/worker typecheck
  ```
  Expected: green.

- [ ] **C.4.4** Run worker test suite (any existing tests that boot the worker):
  ```bash
  pnpm --filter @zeno/worker vitest run
  ```
  Expected: green (resolver tests + any boot-related tests pass).

- [ ] **C.4.5** Commit:
  ```bash
  git add apps/worker/src/index.ts
  git commit -m "feat(worker): index.ts uses resolveSlackCredentials at boot (spec 0057)"
  ```

---

## Phase D — Worker MCP guard + handler kind forwarding

**Goal:** mcp-build.ts skips `kind=channel` rows. connector-create.ts handler accepts and forwards `kind`.

### Task D.1 — mcp-build.ts kind guard + test

**Files:**
- Modify: `apps/worker/src/agent/mcp-build.ts`
- Test: `apps/worker/src/agent/mcp-build.test.ts` (or co-located tests)

- [ ] **D.1.1** Locate the loop in `apps/worker/src/agent/mcp-build.ts:58`:
  ```bash
  sed -n '55,65p' apps/worker/src/agent/mcp-build.ts
  ```
  Confirm it's `for (const { connector, secrets } of userLayer)`.

- [ ] **D.1.2** Write failing test in `apps/worker/src/agent/mcp-build.test.ts` (create file or append):

  ```ts
  import Database from 'better-sqlite3';
  import { describe, expect, test } from 'vitest';
  import { ConnectorRepo, runMigrations } from '@zeno/storage';
  import { createLogger } from '@zeno/logger';
  import { buildMcpServersMap } from './mcp-build';

  function makeDeps() {
    const db = new Database(':memory:');
    runMigrations(db);
    const connectors = new ConnectorRepo(db);
    return { db, connectors };
  }

  describe('buildMcpServersMap — kind guard', () => {
    test('skips rows where kind=channel', () => {
      const { connectors } = makeDeps();
      // Insert a channel row that LOOKS like a remote MCP — but is a Slack channel.
      connectors.create({
        id: 'ch1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'enabled', kind: 'channel',
      });
      const logger = createLogger({ service: 'test' });
      // Build with no MCP rows — only the channel row exists.
      const result = buildMcpServersMap({ connectors, logger /* + any other deps the function needs */ });
      // Channel rows must NOT appear in the map.
      expect(Object.keys(result)).toHaveLength(0);
    });

    test('includes mcp rows', () => {
      const { connectors } = makeDeps();
      connectors.create({
        id: 'm1', slug: 'sentry', displayName: 'Sentry', source: 'catalog',
        transport: 'stdio', command: 'echo', args: '[]', status: 'enabled', kind: 'mcp',
      });
      const logger = createLogger({ service: 'test' });
      const result = buildMcpServersMap({ connectors, logger });
      expect(Object.keys(result)).toContain('sentry');
    });
  });
  ```

  (Adjust the deps shape — `buildMcpServersMap` may take more args; read the actual signature first via `grep -n 'export function buildMcpServersMap\|export const buildMcpServersMap' apps/worker/src/agent/mcp-build.ts`.)

- [ ] **D.1.3** Run test to confirm fails:
  ```bash
  pnpm --filter @zeno/worker vitest run mcp-build.test.ts
  ```
  Expected: at least the "skips channel" test fails (channel row would be picked up by the for-loop and its `transport='remote'` would attempt remote MCP registration).

- [ ] **D.1.4** Add the guard at line 58 inside the for-loop (just after `for (const { connector, secrets } of userLayer) {`):
  ```ts
  // Spec 0057: skip channel rows (they live in the same connectors table but
  // are NOT MCP servers — registering them as remote MCPs would silently
  // create a broken server entry).
  if (connector.kind !== 'mcp') continue;
  ```

- [ ] **D.1.5** Run test to confirm passes:
  ```bash
  pnpm --filter @zeno/worker vitest run mcp-build.test.ts
  ```
  Expected: PASS.

- [ ] **D.1.6** Commit:
  ```bash
  git add apps/worker/src/agent/mcp-build.ts apps/worker/src/agent/mcp-build.test.ts
  git commit -m "feat(worker/mcp): skip kind=channel rows (spec 0057)"
  ```

### Task D.2 — connector-create handler: kind field + forward

**Files:**
- Modify: `apps/worker/src/commands/handlers/connector-create.ts`
- Test: `apps/worker/src/commands/handlers/connector-create.test.ts` (create or extend)

- [ ] **D.2.1** Read current handler:
  ```bash
  cat apps/worker/src/commands/handlers/connector-create.ts | head -60
  ```
  Note location of `catalogSchema` and `customSchema` (around line 23-37).

- [ ] **D.2.2** Write failing test in `apps/worker/src/commands/handlers/connector-create.test.ts`:

  ```ts
  import Database from 'better-sqlite3';
  import { describe, expect, test } from 'vitest';
  import { ConnectorRepo, runMigrations } from '@zeno/storage';
  import { createLogger } from '@zeno/logger';
  import { handleConnectorCreate } from './connector-create';  // adjust to actual export

  describe('connector_create handler — kind=channel', () => {
    test('forwards kind=channel to ConnectorRepo.create', async () => {
      const db = new Database(':memory:');
      runMigrations(db);
      const connectors = new ConnectorRepo(db);
      const logger = createLogger({ service: 'test' });

      // Synthesized payload as the API route would produce for a channel install
      const payload = {
        source: 'catalog',
        kind: 'channel',
        slug: 'slack',
        catalogId: 'slack',
        displayName: 'Slack',
        description: 'Talk to Zeno from Slack',
        transport: 'remote',
        command: null,
        args: null,
        url: null,
        tools: [],
        secrets: { SLACK_APP_TOKEN: 'xapp-x', SLACK_BOT_TOKEN: 'xoxb-x' },
      };

      await handleConnectorCreate(/* command shape */, { connectors, logger });

      const all = connectors.listByKind('channel');
      expect(all).toHaveLength(1);
      expect(all[0].slug).toBe('slack');
      expect(all[0].kind).toBe('channel');
    });
  });
  ```

  (Adjust dependency shape and command argument to match the real handler signature; use `cat` to read it first.)

- [ ] **D.2.3** Run test to confirm fails.

- [ ] **D.2.4** In `connector-create.ts`, extend `catalogSchema` and `customSchema` to include `kind`:

  ```ts
  // catalogSchema (existing) + new field
  kind: z.enum(['mcp', 'channel']).optional().default('mcp'),
  ```

- [ ] **D.2.5** Locate the `ConnectorRepo.create({...})` call inside the handler. Add `kind: input.kind ?? 'mcp'` to the spread.

- [ ] **D.2.6** Run test to confirm passes.

- [ ] **D.2.7** Commit:
  ```bash
  git add apps/worker/src/commands/handlers/connector-create.ts apps/worker/src/commands/handlers/connector-create.test.ts
  git commit -m "feat(worker/handlers): connector_create forwards kind to repo (spec 0057)"
  ```

---

## Phase E — API surface

**Goal:** GET /api/connectors filters MCP only; POST /api/connectors handles kind=channel branch; icon endpoint accepts channel icons; new /api/channels routes; server.ts mount.

### Task E.1 — GET /api/connectors filters kind='mcp'

**Files:**
- Modify: `apps/api/src/routes/connectors.ts:728`
- Test: `apps/api/src/routes/connectors.test.ts` (extend or create)

- [ ] **E.1.1** Write failing test:

  ```ts
  test('GET /api/connectors excludes channel rows', async () => {
    const { app, connectors } = makeTestApp();
    connectors.create({ id: 'm1', slug: 'sentry', displayName: 'Sentry', source: 'catalog', transport: 'stdio', status: 'enabled', kind: 'mcp' });
    connectors.create({ id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog', transport: 'remote', status: 'enabled', kind: 'channel' });
    const res = await app.request('/api/connectors', { headers: authHeaders() });
    const body = await res.json();
    const slugs = body.standalone.map((c: any) => c.slug);  // adjust shape to match buildListItem
    expect(slugs).toContain('sentry');
    expect(slugs).not.toContain('slack');
  });
  ```

  (Adjust `makeTestApp()` and `authHeaders()` to your existing test fixtures.)

- [ ] **E.1.2** Run test to confirm fails.

- [ ] **E.1.3** In `apps/api/src/routes/connectors.ts:728`, change `deps.connectors.list()` to `deps.connectors.list({ kind: 'mcp' })`.

- [ ] **E.1.4** Run test to confirm passes.

- [ ] **E.1.5** Commit:
  ```bash
  git add apps/api/src/routes/connectors.ts apps/api/src/routes/connectors.test.ts
  git commit -m "feat(api/connectors): GET / filters kind=mcp (spec 0057)"
  ```

### Task E.2 — POST /api/connectors extension (kind branch + channel install)

**Files:**
- Modify: `apps/api/src/routes/connectors.ts` (around line 196-296)

- [ ] **E.2.1** Write failing test:

  ```ts
  test('POST /api/connectors with kind=channel installs Slack', async () => {
    const { app, connectors, channelsCatalog } = makeTestApp();
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'catalog',
        catalogId: 'slack',
        kind: 'channel',
        secrets: { SLACK_APP_TOKEN: 'xapp-x', SLACK_BOT_TOKEN: 'xoxb-x' },
      }),
    });
    expect(res.status).toBe(204);
    // Drain the command queue (if test fixture exposes it) — assert row created
    const installed = connectors.listByKind('channel');
    expect(installed).toHaveLength(1);
    expect(installed[0].slug).toBe('slack');
    expect(installed[0].kind).toBe('channel');
  });

  test('POST /api/connectors rejects kind=channel + source=custom', async () => {
    const { app } = makeTestApp();
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'custom', kind: 'channel', /* ... */ }),
    });
    expect(res.status).toBe(400);
  });
  ```

- [ ] **E.2.2** Run test to confirm fails.

- [ ] **E.2.3** In `apps/api/src/routes/connectors.ts`, locate `createCatalogSchema` (line ~196) and `createCustomSchema`. Add `kind` to BOTH:
  ```ts
  // inside z.object(...) for each branch
  kind: z.enum(['mcp', 'channel']).optional().default('mcp'),
  ```

- [ ] **E.2.4** In the POST handler (line ~795+), add the validation pre-check (before any catalog lookup):
  ```ts
  if (body.source === 'custom' && body.kind === 'channel') {
    return c.json({
      error: 'channel_must_be_catalog_source',
      message: 'Channels only support source: catalog. Custom channels are not supported.',
    }, 400);
  }
  ```

- [ ] **E.2.5** Inside the `if (body.source === 'catalog')` branch, add the kind branch BEFORE the existing `findCatalogEntry()` call:
  ```ts
  if (body.kind === 'channel') {
    const channelEntry = findChannelCatalogEntry(deps.channelsCatalog, body.catalogId);
    if (!channelEntry) {
      return c.json({ error: 'channel_not_found', catalogId: body.catalogId }, 404);
    }
    // Validate secrets payload against channel entry's required secrets
    for (const secret of channelEntry.secrets.filter(s => s.required)) {
      if (!body.secrets?.[secret.key]) {
        return c.json({ error: 'missing_required_secret', key: secret.key }, 400);
      }
    }
    const slug = resolveSlugCollision(deps.connectors, channelEntry.id);
    // Synthesize the connector_create payload — channel-specific defaults
    const payload = {
      source: 'catalog' as const,
      kind: 'channel' as const,
      slug,
      catalogId: channelEntry.id,
      displayName: channelEntry.name,
      description: channelEntry.description ?? null,
      transport: 'remote' as const,
      command: null,
      args: null,
      url: null,
      tools: [],
      secrets: body.secrets ?? {},
    };
    await deps.commands.enqueue({ type: 'connector_create', payload });
    return c.body(null, 204);
  }
  // ... existing kind='mcp' code path follows
  ```

  (Adjust `findChannelCatalogEntry` import + `deps.channelsCatalog` access to match how the route receives its deps. Add to the route's `deps` interface if not yet.)

- [ ] **E.2.6** Run test to confirm passes.

- [ ] **E.2.7** Commit:
  ```bash
  git add apps/api/src/routes/connectors.ts apps/api/src/routes/connectors.test.ts
  git commit -m "feat(api/connectors): POST extends kind branch + channel install (spec 0057)"
  ```

### Task E.3 — Icon endpoint extends knownIcons

**Files:**
- Modify: `apps/api/src/routes/connectors.ts` (around line 306-316)

- [ ] **E.3.1** Write failing test:

  ```ts
  test('GET /api/connectors/catalog/icons/slack.svg serves channel icon', async () => {
    const { app } = makeTestApp();
    const res = await app.request('/api/connectors/catalog/icons/slack.svg', { headers: authHeaders() });
    expect(res.status).toBe(200);
  });
  ```

- [ ] **E.3.2** Run test, expect 404 (slack.svg not in `knownIcons`).

- [ ] **E.3.3** Locate `knownIcons` construction (around line 315). Currently uses `loadCatalog()`. Extend to also include channel icons:
  ```ts
  const knownIcons = new Set<string>([
    ...loadCatalog().connectors.map(c => c.icon).filter(Boolean),
    ...loadChannelsCatalog().channels.map(c => c.icon).filter(Boolean),
  ]);
  ```
  (Add `import { loadChannelsCatalog } from '@/lib/channels-catalog-loader';` at the top.)

- [ ] **E.3.4** Run test, confirm passes.

- [ ] **E.3.5** Commit:
  ```bash
  git add apps/api/src/routes/connectors.ts apps/api/src/routes/connectors.test.ts
  git commit -m "feat(api/connectors): icon endpoint serves channels-catalog icons (spec 0057)"
  ```

### Task E.4 — New /api/channels routes

**Files:**
- Create: `apps/api/src/routes/channels.ts`
- Test: `apps/api/src/routes/channels.test.ts`

- [ ] **E.4.1** Write failing tests:

  ```ts
  import { describe, expect, test } from 'vitest';
  import { Hono } from 'hono';
  import Database from 'better-sqlite3';
  import { ConnectorRepo, runMigrations } from '@zeno/storage';
  import { loadChannelsCatalog } from '@/lib/channels-catalog-loader';
  import { buildChannelsRoute } from './channels';

  function makeApp() {
    const db = new Database(':memory:');
    runMigrations(db);
    const connectors = new ConnectorRepo(db);
    const channelsCatalog = loadChannelsCatalog();
    const app = new Hono();
    app.route('/api/channels', buildChannelsRoute({ connectors, channelsCatalog }));
    return { app, connectors };
  }

  describe('GET /api/channels/catalog', () => {
    test('returns catalog with Slack', async () => {
      const { app } = makeApp();
      const res = await app.request('/api/channels/catalog');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.channels.find((c: any) => c.id === 'slack')).toBeDefined();
    });
  });

  describe('GET /api/channels', () => {
    test('returns empty array when no channels installed', async () => {
      const { app } = makeApp();
      const res = await app.request('/api/channels');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    test('returns installed channels with projection', async () => {
      const { app, connectors } = makeApp();
      connectors.create({
        id: 'c1', slug: 'slack', displayName: 'Slack', source: 'catalog',
        transport: 'remote', status: 'enabled', kind: 'channel', catalogId: 'slack',
      });
      const res = await app.request('/api/channels');
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0].slug).toBe('slack');
      expect(body[0].kind).toBeUndefined(); // projection should NOT include kind/transport
      expect(body[0].transport).toBeUndefined();
    });
  });
  ```

- [ ] **E.4.2** Run test to confirm fails.

- [ ] **E.4.3** Create `apps/api/src/routes/channels.ts`:

  ```ts
  import { Hono } from 'hono';
  import type { ConnectorRepo } from '@zeno/storage';
  import type { ChannelsCatalog } from '@/lib/channels-catalog-loader';

  export interface BuildChannelsRouteDeps {
    connectors: ConnectorRepo;
    channelsCatalog: ChannelsCatalog;
  }

  export function buildChannelsRoute(deps: BuildChannelsRouteDeps): Hono {
    const route = new Hono();

    // Static segments BEFORE any :id dynamic segment per the existing convention.
    route.get('/catalog', (c) => {
      return c.json(deps.channelsCatalog);
    });

    route.get('/', (c) => {
      const rows = deps.connectors.listByKind('channel');
      const projected = rows.map(r => ({
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        description: r.description,
        status: r.status,
        lastError: r.lastError,
        lastErrorAt: r.lastErrorAt,
        lastVerifiedAt: r.lastVerifiedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        catalogId: r.catalogId,
      }));
      return c.json(projected);
    });

    return route;
  }
  ```

- [ ] **E.4.4** Run test to confirm passes.

- [ ] **E.4.5** Commit:
  ```bash
  git add apps/api/src/routes/channels.ts apps/api/src/routes/channels.test.ts
  git commit -m "feat(api/channels): GET /catalog and GET / endpoints (spec 0057)"
  ```

### Task E.5 — server.ts AppDeps + mount

**Files:**
- Modify: `apps/api/src/server.ts`

- [ ] **E.5.1** Add to `AppDeps` interface (line ~36-65):
  ```ts
  /** Spec 0057: channels catalog loader. Optional — when present, /api/channels/* routes mount; absent in tests. */
  channelsCatalog?: ChannelsCatalog;
  ```
  Plus the import:
  ```ts
  import type { ChannelsCatalog } from '@/lib/channels-catalog-loader';
  ```

- [ ] **E.5.2** Add the mount block immediately after the `/api/connectors` mount (~line 105). Pattern matches existing optional-subsystem gates:
  ```ts
  // Spec 0057: channels routes (gated on connectorRepo + channelsCatalog).
  if (deps.connectorRepo && deps.channelsCatalog) {
    app.use('/api/channels', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.use('/api/channels/*', requireAuth({ secret: deps.config.sessionSecret, secure }));
    app.route('/api/channels', buildChannelsRoute({
      connectors: deps.connectorRepo,
      channelsCatalog: deps.channelsCatalog,
    }));
  }
  ```
  Add the import:
  ```ts
  import { buildChannelsRoute } from '@/routes/channels';
  ```

- [ ] **E.5.3** At the API entry point (search for `buildServer(...)` call):
  ```bash
  grep -n 'buildServer(' apps/api/src/index.ts apps/api/src/main.ts 2>/dev/null
  ```
  Add `channelsCatalog: loadChannelsCatalog()` to the deps object passed to `buildServer`. (Adjust import.)

- [ ] **E.5.4** Run typecheck:
  ```bash
  pnpm --filter @zeno/api typecheck
  ```
  Expected: green.

- [ ] **E.5.5** Run all API tests:
  ```bash
  pnpm --filter @zeno/api vitest run
  ```
  Expected: green.

- [ ] **E.5.6** Commit:
  ```bash
  git add apps/api/src/server.ts apps/api/src/*.ts
  git commit -m "feat(api/server): mount /api/channels (spec 0057)"
  ```

---

## Phase F — Quality gate

- [ ] **F.1** Run full quality gate from worktree root:
  ```bash
  pnpm run quality-gate
  ```
  Expected: all green (lint + typecheck + test across all workspaces).

- [ ] **F.2** If any failure, fix and re-run. Do NOT commit until quality gate is green.

- [ ] **F.3** Commit any fixes:
  ```bash
  git add -A
  git commit -m "chore: quality gate fixes (spec 0057)"
  ```
  (Skip if no fixes needed.)

---

## Phase G — 3-round branch review

Per cleanup contract Rule 2: each round inspects the full branch diff. Reset counter on any BLOCKING finding. Need 3 consecutive clean.

- [ ] **G.1 R1** — dispatch a fresh review agent:
  ```
  Review the branch feat/spec-2026-04-29-slack-channel against main.
  Inspect git diff main..HEAD --stat (verify scope contained), spec coverage,
  test coverage of resolution table cases, and behavior of the kind guard.
  Flag BLOCKING vs advisory.
  ```
  If BLOCKING: fix, reset to G.1.

- [ ] **G.2 R2** — fresh review (no R1 context). Same scope. If BLOCKING: fix, reset.

- [ ] **G.3 R3** — fresh review. If clean → proceed.

---

## Phase H — Push + open PR

- [ ] **H.1** Push branch:
  ```bash
  git push -u origin feat/spec-2026-04-29-slack-channel
  ```

- [ ] **H.2** Open PR using `/open-pr` slash command (project convention) targeting `main`. PR description: summarize architecture (catalog/storage/worker/api split), confirm `profiles/<example>` untouched, list all 8 commits' purposes, link spec.

- [ ] **H.3** Return PR URL. STOP — done.
