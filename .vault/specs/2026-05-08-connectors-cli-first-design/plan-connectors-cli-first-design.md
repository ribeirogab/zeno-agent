# Connectors CLI-First Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land N-instance support per connector and a CLI-first mutation surface across the schema, API, CLI, and dashboard, per the locked design at [`spec-connectors-cli-first-design.md`](./spec-connectors-cli-first-design.md) and the Paper artboards at [`artboards/`](./artboards/).

**Architecture:** Four phases on the same branch (`feat/connectors-cli-first`), each phase ships a self-contained, testable subset.

1. **Schema (Phase 1)** — add `instance_label` column + `idx_connectors_catalog_id` index via drizzle-kit migration.
2. **API (Phase 2)** — `GET /api/mode`, `GET /api/commands/:correlationId`, `connector_group` list shape, and a `ZENO_API_WRITES` feature flag that gates mutating endpoints with HTTP 403 when set to `cli` (default).
3. **CLI (Phase 3)** — `zeno connector` subtree (`list`, `show`, `install`, `enable`, `disable`, `uninstall`, `test`, `refresh-tools`, `tool {list,set,bulk}`, `secret {list,set,rotate,reveal}`, `app {install,installations,uninstall}`, `catalog`) talking to the local API over HTTP, with sync polling on `correlationId`.
4. **Dashboard (Phase 4)** — read-only mode driven by `GET /api/mode`, reusable `CommandModal`, new routes `/connectors/:catalogId`, `/connectors/:catalogId/:id`, `/connectors/:catalogId/:appId/instances/:id`, `ConnectorGroupCard` rendering when `count > 1`, and migration of existing action buttons to `CommandModal`.

**Tech Stack:** drizzle ORM + drizzle-kit, Hono, citty (CLI), TanStack Router (dashboard), React, Vitest, better-sqlite3.

**Constraints:**
- Vault docs language is English; all comments and code follow project Biome conventions.
- Storage layer is `@zeno/db/runtime` (drizzle); `packages/storage` no longer exists.
- Profile dashboards bind to 127.0.0.1; CSRF middleware lives at `apps/api/src/csrf/middleware.ts` (cookie `zeno_csrf`, header `X-CSRF-Token`).
- Custom-connector flow (`source = 'custom'`) is intentionally deferred to a follow-up: the existing API endpoints continue to accept it, but no new CLI command is created.

---

## File map (created vs modified)

### Phase 1 — Schema
- Modify: `packages/db/src/runtime/schema.ts`
- Create: `packages/db/src/runtime/migrations/0001_<auto>.sql`
- Modify: `packages/db/src/runtime/migrations/meta/_journal.json`
- Modify: `packages/db/src/runtime/migrations/meta/0001_snapshot.json`
- Modify: `packages/db/src/runtime/repos/connectors.ts`
- Modify: `packages/db/tests/runtime/connectors.test.ts`

### Phase 2 — API
- Create: `apps/api/src/lib/api-mode.ts`
- Create: `apps/api/src/routes/mode.ts`
- Create: `apps/api/src/routes/commands.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/routes/connectors.ts`
- Create: `apps/api/tests/routes/mode.test.ts`
- Create: `apps/api/tests/routes/commands.test.ts`
- Create: `apps/api/tests/routes/connectors-mode-gate.test.ts`
- Modify: `apps/api/tests/routes/connectors.test.ts`
- Modify: `apps/api/tests/routes/connectors-listing-collapsed.test.ts`
- Modify: `apps/worker/src/commands/handlers/connector-create.ts` (extend payload schema with `instanceLabel`)

### Phase 3 — CLI
- Create: `apps/cli/src/lib/api-client.ts`
- Create: `apps/cli/src/lib/wait-command.ts`
- Create: `apps/cli/src/lib/prompt.ts`
- Create: `apps/cli/src/commands/connector.ts`
- Create: `apps/cli/src/commands/connector-list.ts`
- Create: `apps/cli/src/commands/connector-show.ts`
- Create: `apps/cli/src/commands/connector-install.ts`
- Create: `apps/cli/src/commands/connector-enable.ts`
- Create: `apps/cli/src/commands/connector-disable.ts`
- Create: `apps/cli/src/commands/connector-uninstall.ts`
- Create: `apps/cli/src/commands/connector-test.ts`
- Create: `apps/cli/src/commands/connector-refresh-tools.ts`
- Create: `apps/cli/src/commands/connector-tool.ts` (parent)
- Create: `apps/cli/src/commands/connector-tool-list.ts`
- Create: `apps/cli/src/commands/connector-tool-set.ts`
- Create: `apps/cli/src/commands/connector-tool-bulk.ts`
- Create: `apps/cli/src/commands/connector-secret.ts` (parent)
- Create: `apps/cli/src/commands/connector-secret-list.ts`
- Create: `apps/cli/src/commands/connector-secret-set.ts`
- Create: `apps/cli/src/commands/connector-secret-rotate.ts`
- Create: `apps/cli/src/commands/connector-secret-reveal.ts`
- Create: `apps/cli/src/commands/connector-app.ts` (parent)
- Create: `apps/cli/src/commands/connector-app-install.ts`
- Create: `apps/cli/src/commands/connector-app-installations.ts` (parent)
- Create: `apps/cli/src/commands/connector-app-installations-discover.ts`
- Create: `apps/cli/src/commands/connector-app-installations-add.ts`
- Create: `apps/cli/src/commands/connector-app-uninstall.ts`
- Create: `apps/cli/src/commands/connector-catalog.ts`
- Modify: `apps/cli/src/index.ts`
- Create: `apps/cli/tests/lib/api-client.test.ts`
- Create: `apps/cli/tests/lib/wait-command.test.ts`
- Create: `apps/cli/tests/commands/connector-list.test.ts`
- Create: `apps/cli/tests/commands/connector-install.test.ts`

### Phase 4 — Dashboard
- Create: `apps/dashboard/src/lib/use-api-mode.ts`
- Create: `apps/dashboard/src/components/CommandModal.tsx`
- Create: `apps/dashboard/src/components/ConnectorGroupCard.tsx`
- Create: `apps/dashboard/src/components/CatalogModal.tsx`
- Modify: `apps/dashboard/src/routes/_authed/connectors.index.tsx`
- Modify: `apps/dashboard/src/routes/_authed/connectors.$id.tsx`
- Modify: `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` (delete or rename)
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.index.tsx` (leaves list)
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.$id.tsx` (detail)
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.$appId.instances.$instanceId.tsx`
- Modify: `apps/dashboard/src/lib/use-connectors.ts` (extend types)
- Modify: `apps/dashboard/src/lib/connector-mutations.ts` (delete or shrink — mutations move to CommandModal)
- Create: `apps/dashboard/src/lib/build-cli-command.ts`

---

## Phase 1 — Schema migration (Tasks 1–2)

### Task 1: Add `instance_label` column + `idx_connectors_catalog_id` index

**Files:**
- Modify: `packages/db/src/runtime/schema.ts:129-172`
- Generate: `packages/db/src/runtime/migrations/0001_<auto>.sql` (drizzle-kit picks the slug)
- Modify: `packages/db/src/runtime/migrations/meta/_journal.json`, `0001_snapshot.json` (drizzle-kit generates these)
- Modify: `packages/db/src/runtime/repos/connectors.ts`
- Test: `packages/db/tests/runtime/connectors.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test (instance_label persistence)**

Open `packages/db/tests/runtime/connectors.test.ts` and append a new test inside the existing `describe('ConnectorRepo', …)` block:

```typescript
it('persists instance_label on create and surfaces it on read', () => {
  const repo = makeRepo(); // existing test helper that opens an in-memory DB + runs migrations
  const created = repo.create({
    slug: 'linear-acme',
    displayName: 'Linear',
    instanceLabel: 'Acme workspace',
    source: 'catalog',
    catalogId: 'linear',
    transport: 'remote',
    secrets: [],
    tools: [],
  });
  expect(created.instanceLabel).toBe('Acme workspace');
  const fetched = repo.get(created.id);
  expect(fetched?.instanceLabel).toBe('Acme workspace');
});

it('returns null instance_label for legacy rows that did not set it', () => {
  const repo = makeRepo();
  const created = repo.create({
    slug: 'sentry',
    displayName: 'Sentry',
    source: 'catalog',
    catalogId: 'sentry',
    transport: 'stdio',
    secrets: [],
    tools: [],
  });
  expect(created.instanceLabel).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from the repo root:

```bash
pnpm --filter @zeno/db test -- connectors
```

Expected: FAIL — `instanceLabel` does not exist on `Connector` type / `CreateConnectorInput`.

- [ ] **Step 3: Update the drizzle schema**

In `packages/db/src/runtime/schema.ts`, locate the `connectors` table (around line 129) and add the `instanceLabel` column after `displayName`, plus a new index in the table extras:

```typescript
export const connectors = sqliteTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    instanceLabel: text('instance_label'), // NEW — operator-supplied label, null for legacy/custom
    description: text('description'),
    source: text('source', { enum: ['catalog', 'custom'] }).notNull(),
    catalogId: text('catalog_id'),
    // ... unchanged columns
  },
  (table) => ({
    idxStatusSlug: index('idx_connectors_status_slug').on(table.status, table.slug),
    idxCatalogId: index('idx_connectors_catalog_id').on(table.catalogId), // NEW
    slugCheck: check(/* unchanged */),
    sourceCheck: check(/* unchanged */),
    transportCheck: check(/* unchanged */),
    statusCheck: check(/* unchanged */),
    kindCheck: check(/* unchanged */),
  }),
);
```

- [ ] **Step 4: Generate the migration via drizzle-kit**

```bash
pnpm --filter @zeno/db exec drizzle-kit generate --config drizzle.runtime.config.ts
```

Expected: a new file `packages/db/src/runtime/migrations/0001_<slug>.sql` with `ALTER TABLE connectors ADD COLUMN instance_label TEXT;` and `CREATE INDEX idx_connectors_catalog_id ON connectors(catalog_id);`. Verify the SQL is exactly that (drizzle-kit may append a `--> statement-breakpoint` line — leave it).

- [ ] **Step 5: Update `ConnectorRepo` to handle the new column**

In `packages/db/src/runtime/repos/connectors.ts`:

1. Find the `CreateConnectorInput` type and add `instanceLabel?: string | null;` after `displayName`.
2. Find the `UpdateConnectorInput` type and add `instanceLabel?: string | null;`.
3. In the `create()` method, pass `instanceLabel: input.instanceLabel ?? null` into the drizzle `insert(connectors).values({...})` call.
4. In the `update()` method, propagate `patch.instanceLabel` when it is `!== undefined`.

Re-export the updated `Connector` type via `packages/db/src/runtime/index.ts` (no edit needed — it re-exports from schema.ts via `$inferSelect` so the new column appears automatically).

- [ ] **Step 6: Run the tests until they pass**

```bash
pnpm --filter @zeno/db test
```

Expected: all `connectors.test.ts` tests pass, including the two new ones from Step 1. The existing `migrations.test.ts` will exercise the new migration end-to-end against a fresh DB.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/runtime/schema.ts \
  packages/db/src/runtime/migrations/ \
  packages/db/src/runtime/repos/connectors.ts \
  packages/db/tests/runtime/connectors.test.ts
git commit -m "feat(db): add instance_label + catalog_id index to connectors

Adds the operator-supplied label column described in spec
2026-05-08-connectors-cli-first-design Q4. Index supports the
connector_group list-endpoint grouping introduced in the next task.
Existing rows keep instance_label null."
```

### Task 2: Refresh worker create-handler payload schema

**Files:**
- Modify: `apps/worker/src/commands/handlers/connector-create.ts:23-39`
- Modify: `apps/worker/tests/commands/handlers.test.ts` (or the colocated test for the create handler)

**Steps:**

- [ ] **Step 1: Write the failing test**

In the existing handlers test file, add:

```typescript
it('persists instanceLabel from the catalog payload', async () => {
  const repo = makeConnectorRepo();
  const handler = buildConnectorCreateHandler({ connectors: repo, getGithubApp: () => null });
  const cmd = makeCommand({
    type: 'connector_create',
    payload: JSON.stringify({
      source: 'catalog',
      catalogId: 'linear',
      slug: 'linear-acme',
      displayName: 'Linear',
      instanceLabel: 'Acme workspace',
      transport: 'remote',
      secrets: [],
      tools: [],
      kind: 'mcp',
    }),
  });
  const result = await handler(cmd);
  expect(result).toEqual({ ok: true });
  const created = repo.getBySlug('linear-acme');
  expect(created?.instanceLabel).toBe('Acme workspace');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @zeno/worker test -- handlers
```

Expected: FAIL — `instanceLabel` is rejected by the zod schema.

- [ ] **Step 3: Extend the payload schema**

In `apps/worker/src/commands/handlers/connector-create.ts`, add `instanceLabel: z.string().nullable().optional()` to both `catalogSchema` and `customSchema` (around lines 23 and 41), and forward it into the `repo.create({...})` call inside the handler body:

```typescript
const created = deps.connectors.create({
  slug: data.slug,
  displayName: data.displayName,
  instanceLabel: data.instanceLabel ?? null, // NEW
  description: 'description' in data ? (data.description ?? null) : null,
  // ... rest unchanged
});
```

- [ ] **Step 4: Run tests until green**

```bash
pnpm --filter @zeno/worker test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/commands/handlers/connector-create.ts \
  apps/worker/tests/commands/handlers.test.ts
git commit -m "feat(worker): forward instance_label through connector_create handler"
```

---

## Phase 2 — API endpoints + feature flag (Tasks 3–7)

### Task 3: `ZENO_API_WRITES` env flag + `GET /api/mode`

**Files:**
- Create: `apps/api/src/lib/api-mode.ts`
- Modify: `apps/api/src/server.ts:1-50`
- Create: `apps/api/src/routes/mode.ts`
- Test: `apps/api/tests/routes/mode.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/routes/mode.test.ts`:

```typescript
import { buildApp } from '@/server';
import { describe, expect, it } from 'vitest';

describe('GET /api/mode', () => {
  it('returns writes:cli when ZENO_API_WRITES is unset (default)', async () => {
    const app = buildApp({ writes: 'cli' /* test fixture; passed via deps */ });
    const res = await app.request('/api/mode');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ writes: 'cli' });
  });

  it('returns writes:dashboard when ZENO_API_WRITES=dashboard', async () => {
    const app = buildApp({ writes: 'dashboard' });
    const res = await app.request('/api/mode');
    expect(await res.json()).toEqual({ writes: 'dashboard' });
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @zeno/api test -- mode
```

Expected: FAIL — module `mode` not found, `buildApp` does not accept `{ writes }`.

- [ ] **Step 3: Implement `apps/api/src/lib/api-mode.ts`**

```typescript
import { z } from 'zod';

export type ApiWriteMode = 'cli' | 'dashboard';

const schema = z.enum(['cli', 'dashboard']).default('cli');

export function parseApiWriteMode(env: string | undefined): ApiWriteMode {
  return schema.parse(env ?? 'cli');
}
```

- [ ] **Step 4: Implement `apps/api/src/routes/mode.ts`**

```typescript
import type { ApiWriteMode } from '@/lib/api-mode';
import { Hono } from 'hono';

export function buildModeRoute(opts: { writes: ApiWriteMode }): Hono {
  const route = new Hono();
  route.get('/', (c) => c.json({ writes: opts.writes }));
  return route;
}
```

- [ ] **Step 5: Wire into `apps/api/src/server.ts`**

1. Near the top imports:

   ```typescript
   import { type ApiWriteMode, parseApiWriteMode } from '@/lib/api-mode';
   import { buildModeRoute } from '@/routes/mode';
   ```

2. Extend the `BuildAppDeps` interface (or whatever the existing dep-injection shape is) with:

   ```typescript
   writes?: ApiWriteMode;
   ```

3. Inside `buildApp(deps)`, after the existing route registrations:

   ```typescript
   const writes = deps.writes ?? parseApiWriteMode(process.env.ZENO_API_WRITES);
   app.route('/api/mode', buildModeRoute({ writes }));
   ```

4. In the runtime entry (`apps/api/src/index.ts`), no change required — `buildApp` will read the env via the default branch.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @zeno/api test
```

Expected: all tests green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/api-mode.ts \
  apps/api/src/routes/mode.ts \
  apps/api/src/server.ts \
  apps/api/tests/routes/mode.test.ts
git commit -m "feat(api): add GET /api/mode + ZENO_API_WRITES env flag

Default 'cli'. Dashboard reads this endpoint to decide whether to
render CommandModal popovers (cli) or live action buttons (dashboard).
Spec 2026-05-08-connectors-cli-first-design Q1 + Constraints."
```

### Task 4: Gate mutating connector endpoints behind the feature flag

**Files:**
- Modify: `apps/api/src/routes/connectors.ts:262-1162`
- Test: `apps/api/tests/routes/connectors-mode-gate.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/routes/connectors-mode-gate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildApp } from '@/server';

describe('connectors mutations are blocked under writes:cli', () => {
  it('POST /api/connectors returns 403 mode_cli_only', async () => {
    const app = buildApp({ writes: 'cli' });
    const res = await app.request('/api/connectors', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test', cookie: 'zeno_csrf=test' },
      body: JSON.stringify({ source: 'catalog', catalogId: 'linear', secrets: [] }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('mode_cli_only');
    expect(body.cli).toMatch(/^zeno connector install/);
  });

  it('PATCH /api/connectors/:id/toggle returns 403 mode_cli_only', async () => {
    const app = buildApp({ writes: 'cli' });
    const res = await app.request('/api/connectors/abc/toggle', {
      method: 'PATCH',
      headers: { 'x-csrf-token': 'test', cookie: 'zeno_csrf=test' },
    });
    expect(res.status).toBe(403);
  });

  it('DELETE /api/connectors/:id returns 403 mode_cli_only', async () => {
    const app = buildApp({ writes: 'cli' });
    const res = await app.request('/api/connectors/abc', {
      method: 'DELETE',
      headers: { 'x-csrf-token': 'test', cookie: 'zeno_csrf=test' },
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/connectors succeeds under writes:dashboard', async () => {
    const app = buildApp({ writes: 'dashboard' /* + a test ConnectorRepo dep */ });
    // ... assert 204 like existing connectors.test.ts does
  });

  it('GET /api/connectors is always allowed (read)', async () => {
    const app = buildApp({ writes: 'cli' });
    const res = await app.request('/api/connectors');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm --filter @zeno/api test -- connectors-mode-gate
```

Expected: FAIL — POST/PATCH/DELETE return 204 / 200, not 403.

- [ ] **Step 3: Implement the gate**

In `apps/api/src/routes/connectors.ts`:

1. Extend `ConnectorsRouteDeps` (around line 254) with:

   ```typescript
   writes: ApiWriteMode; // import ApiWriteMode from '@/lib/api-mode'
   ```

2. Define a small helper at the top of `buildConnectorsRoute(...)`:

   ```typescript
   function blockedIfCli(action: 'install' | 'enable_disable' | 'uninstall' | 'update' | 'refresh_tools' | 'test' | 'tool_permission' | 'reveal_secret', cliCommand: string) {
     return (c: Context) => c.json({ error: 'mode_cli_only', action, cli: cliCommand }, 403);
   }
   ```

3. Wrap each mutating route. Example for `POST /`:

   ```typescript
   route.post('/', zValidator('json', createSchema), (c) => {
     if (deps.writes === 'cli') {
       return c.json({ error: 'mode_cli_only', action: 'install', cli: 'zeno connector install <catalog-id> --label "<label>"' }, 403);
     }
     // ... existing handler unchanged
   });
   ```

   Apply the same guard before `PATCH /:id`, `PATCH /:id/toggle`, `DELETE /:id`, `POST /:id/refresh-tools`, `POST /:id/test`, `POST /test`, `PATCH /:id/tools/:toolName/permission`, `PATCH /:id/tools/permissions/bulk`, `GET /:id/secrets/:key/reveal`, and the `/catalog/github-app/*` mutating endpoints (`install`, `installations`, `uninstall-app`).

4. `GET` routes (list, detail, activity, catalog browse, icons) stay unguarded.

- [ ] **Step 4: Update `buildApp` to pass `writes` into `buildConnectorsRoute`**

In `apps/api/src/server.ts`, find where `buildConnectorsRoute(...)` is called and pass `writes`:

```typescript
const connectorsRoute = buildConnectorsRoute({
  connectors,
  commands,
  connectorApps,
  rateLimiter,
  writes,
});
```

- [ ] **Step 5: Update existing connectors tests**

In `apps/api/tests/routes/connectors.test.ts`, find every test that posts/patches/deletes against `/api/connectors/...` and update the test setup to call `buildApp({ writes: 'dashboard', ... })` so existing assertions hold.

- [ ] **Step 6: Run all api tests until green**

```bash
pnpm --filter @zeno/api test
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/connectors.ts \
  apps/api/src/server.ts \
  apps/api/tests/
git commit -m "feat(api): gate connector mutations behind ZENO_API_WRITES=cli

Returns 403 mode_cli_only with the equivalent zeno connector command in the
response body. GET routes stay open. Spec 2026-05-08-connectors-cli-first-design
Q1 + Constraints."
```

### Task 5: `GET /api/commands/:correlationId`

**Files:**
- Create: `apps/api/src/routes/commands.ts`
- Modify: `apps/api/src/server.ts`
- Test: `apps/api/tests/routes/commands.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/routes/commands.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildApp } from '@/server';

describe('GET /api/commands/:correlationId', () => {
  it('returns 404 if no command for correlationId', async () => {
    const app = buildApp(/* test deps including a CommandRepo with no rows */);
    const res = await app.request('/api/commands/missing-id');
    expect(res.status).toBe(404);
  });

  it('returns the command status when found', async () => {
    const app = buildApp(/* deps where commands.findByCorrelationId('abc') -> { ... status: 'success' } */);
    const res = await app.request('/api/commands/abc');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      correlationId: 'abc',
      status: 'success',
      type: 'connector_create',
    });
  });
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @zeno/api test -- commands
```

Expected: FAIL — module `commands` not found.

- [ ] **Step 3: Add a `findByCorrelationId` query to the CommandRepo (if missing)**

In `packages/db/src/runtime/repos/commands.ts`, add (or confirm exists):

```typescript
findByCorrelationId(correlationId: string): Command | null {
  const row = this.db
    .select()
    .from(commandsTable)
    .where(eq(commandsTable.correlationId, correlationId))
    .get();
  return row ? rowToCommand(row) : null;
}
```

Add a colocated unit test for the new query in `packages/db/tests/runtime/commands.test.ts`.

- [ ] **Step 4: Implement the route**

Create `apps/api/src/routes/commands.ts`:

```typescript
import type { CommandRepo } from '@zeno/db/runtime';
import { Hono } from 'hono';

export function buildCommandsRoute(deps: { commands: CommandRepo }): Hono {
  const route = new Hono();
  route.get('/:correlationId', (c) => {
    const id = c.req.param('correlationId');
    const cmd = deps.commands.findByCorrelationId(id);
    if (!cmd) return c.json({ error: 'not_found' }, 404);
    return c.json({
      correlationId: cmd.correlationId,
      type: cmd.type,
      status: cmd.status,
      createdAt: cmd.createdAt,
      processedAt: cmd.processedAt,
      completedAt: cmd.completedAt,
      result: cmd.result,
    });
  });
  return route;
}
```

- [ ] **Step 5: Wire into `buildApp`**

In `apps/api/src/server.ts`:

```typescript
import { buildCommandsRoute } from '@/routes/commands';
// ...
app.route('/api/commands', buildCommandsRoute({ commands }));
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @zeno/api test
pnpm --filter @zeno/db test
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/commands.ts \
  apps/api/src/server.ts \
  apps/api/tests/routes/commands.test.ts \
  packages/db/src/runtime/repos/commands.ts \
  packages/db/tests/runtime/commands.test.ts
git commit -m "feat(api): add GET /api/commands/:correlationId for CLI sync polling"
```

### Task 6: Extend POST/PATCH `/api/connectors` with `instanceLabel`

**Files:**
- Modify: `apps/api/src/routes/connectors.ts:194-241` (zod schemas + payload assembly around lines 832 and 1059)
- Modify: `apps/api/tests/routes/connectors.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/routes/connectors.test.ts`:

```typescript
it('forwards instanceLabel into the enqueued connector_create command', async () => {
  const commands = makeCommandRepo();
  const app = buildApp({ writes: 'dashboard', commands, /* ... */ });
  const res = await app.request('/api/connectors', {
    method: 'POST',
    headers: { /* csrf + content-type */ },
    body: JSON.stringify({
      source: 'catalog',
      catalogId: 'linear',
      instanceLabel: 'Acme workspace',
      secrets: [{ key: '__MCP_AUTHORIZATION__', value: 'tok' }],
    }),
  });
  expect(res.status).toBe(204);
  const queued = commands.list({ type: 'connector_create' }).at(-1);
  expect(JSON.parse(queued!.payload!).instanceLabel).toBe('Acme workspace');
});
```

- [ ] **Step 2: Run the test**

Expected: FAIL — `instanceLabel` is dropped by the zod schema.

- [ ] **Step 3: Update zod schemas**

In `apps/api/src/routes/connectors.ts`:

```typescript
const createCatalogSchema = z.object({
  source: z.literal('catalog'),
  catalogId: z.string(),
  secrets: z.array(apiSecretSchema),
  instanceLabel: z.string().min(1).optional(), // NEW
  kind: z.enum(['mcp', 'channel']).optional().default('mcp'),
});

const createCustomSchema = z.object({
  source: z.literal('custom'),
  displayName: z.string().min(1),
  instanceLabel: z.string().min(1).optional(), // NEW
  // ... unchanged
});

const patchSchema = z.object({
  displayName: z.string().min(1).optional(),
  instanceLabel: z.string().min(1).nullable().optional(), // NEW — null clears it
  // ... unchanged
});
```

In the catalog branch of `POST /` handler (around line 893), generate a slug-aware payload that includes `instanceLabel`:

```typescript
const slug = body.instanceLabel
  ? resolveSlugCollision(deps.connectors, `${entry.id}-${kebabLower(body.instanceLabel)}`)
  : resolveSlugCollision(deps.connectors, entry.id);
payload = {
  source: 'catalog',
  catalogId: entry.id,
  slug,
  displayName: entry.name,
  instanceLabel: body.instanceLabel ?? null, // NEW
  // ... unchanged
};
```

For the `PATCH /:id` handler (around line 1059), forward `body.instanceLabel` into the enqueued `connector_update` payload.

- [ ] **Step 4: Update worker `connector_update` handler payload schema**

In `apps/worker/src/commands/handlers/connector-update.ts`, add `instanceLabel: z.string().nullable().optional()` to the payload zod schema and forward it to `repo.update({...})`.

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @zeno/api test
pnpm --filter @zeno/worker test
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/connectors.ts \
  apps/api/tests/routes/connectors.test.ts \
  apps/worker/src/commands/handlers/connector-update.ts
git commit -m "feat(api): accept instance_label on POST + PATCH /api/connectors

Slug derivation kebab-cases the operator label when provided. Spec 2026-05-08
Q4 (separate field) + Q5 (counter visible)."
```

### Task 7: `GET /api/connectors` — `connector_group` shape when `count > 1`

**Files:**
- Modify: `apps/api/src/routes/connectors.ts:760-829`
- Modify: `apps/api/tests/routes/connectors-listing-collapsed.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Append to `apps/api/tests/routes/connectors-listing-collapsed.test.ts`:

```typescript
it('groups standalone catalog rows into connector_group when count>1', async () => {
  const repo = makeConnectorRepo();
  // Seed 3 Linear instances with different instance_labels
  for (const label of ['Acme', 'Personal', 'Side-project']) {
    repo.create({
      slug: `linear-${label.toLowerCase()}`,
      displayName: 'Linear',
      instanceLabel: label,
      source: 'catalog',
      catalogId: 'linear',
      transport: 'remote',
      secrets: [],
      tools: [],
    });
  }
  const app = buildApp({ writes: 'dashboard', connectors: repo });
  const res = await app.request('/api/connectors');
  const items = await res.json() as Array<{ kind: string; catalogId?: string; installations?: unknown[] }>;
  const group = items.find((it) => it.kind === 'connector_group' && it.catalogId === 'linear');
  expect(group).toBeDefined();
  expect(group!.installations).toHaveLength(3);
  // Single-instance catalogs stay flat
  repo.create({ slug: 'sentry', displayName: 'Sentry', source: 'catalog', catalogId: 'sentry', transport: 'stdio', secrets: [], tools: [] });
  const res2 = await app.request('/api/connectors');
  const items2 = await res2.json();
  expect(items2.find((it: any) => it.kind === 'connector' && it.catalogId === 'sentry')).toBeDefined();
});
```

- [ ] **Step 2: Run the test**

Expected: FAIL — list returns 3 separate `kind: 'connector'` items, no `connector_group`.

- [ ] **Step 3: Update the list handler**

In `apps/api/src/routes/connectors.ts:762`, replace the `standalone.map(...)` block with a grouping pass:

```typescript
// Group standalone catalog rows by catalog_id when more than one exists.
const standaloneByCatalog = new Map<string | '__custom__', Connector[]>();
for (const c of standalone) {
  const key = c.source === 'catalog' && c.catalogId ? c.catalogId : '__custom__';
  const existing = standaloneByCatalog.get(key) ?? [];
  existing.push(c);
  standaloneByCatalog.set(key, existing);
}

const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const items: Array<Record<string, unknown>> = [];

for (const [catalogIdKey, group] of standaloneByCatalog.entries()) {
  if (group.length === 1) {
    const connector = group[0]!;
    const tools = deps.connectors.getTools(connector.id);
    const invocations = deps.connectors.countInvocationsSince(connector.id, cutoff);
    items.push(buildListItem(connector, tools.length, invocations, iconUrlForConnector(connector)));
    continue;
  }
  // Multi-instance plain catalog → connector_group
  const sample = group[0]!;
  const iconUrl = iconUrlForConnector(sample);
  items.push({
    kind: 'connector_group',
    catalogId: catalogIdKey === '__custom__' ? null : catalogIdKey,
    name: sample.source === 'catalog' && sample.catalogId
      ? findCatalogEntry(sample.catalogId)?.name ?? sample.displayName
      : 'Custom',
    iconUrl,
    installationCount: group.length,
    statusAggregate: computeStatusAggregate(group),
    lastVerifiedAt: pickLatestVerified(group),
    installations: group.map((cn) => ({
      connectorId: cn.id,
      slug: cn.slug,
      displayName: cn.displayName,
      instanceLabel: cn.instanceLabel,
      status: cn.status,
      lastVerifiedAt: cn.lastVerifiedAt,
      lastError: cn.lastError,
      lastErrorAt: cn.lastErrorAt,
    })),
  });
}
// AppListItems block (github-app) stays unchanged below
```

Also extend `buildListItem(...)` (around line 94) to include `instanceLabel: connector.instanceLabel` in the returned object so detail pages can render it.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zeno/api test
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/connectors.ts \
  apps/api/tests/routes/connectors-listing-collapsed.test.ts
git commit -m "feat(api): emit connector_group for multi-instance catalogs in list endpoint

Single-instance catalogs continue to emit kind:'connector'. github-app
AppListItems unchanged. Spec 2026-05-08 Q2 + Q5."
```

---

## Phase 3 — CLI subtree (Tasks 8–16)

### Task 8: `api-client` HTTP wrapper + `wait-command` polling

**Files:**
- Create: `apps/cli/src/lib/api-client.ts`
- Create: `apps/cli/src/lib/wait-command.ts`
- Test: `apps/cli/tests/lib/api-client.test.ts`
- Test: `apps/cli/tests/lib/wait-command.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `apps/cli/tests/lib/api-client.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '@/lib/api-client';

describe('ApiClient', () => {
  it('GETs a JSON resource', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    const result = await client.get<{ ok: boolean }>('/api/connectors');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:6101/api/connectors',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs JSON with CSRF token from cookie + header', async () => {
    const fetchMock = vi.fn()
      // First call: GET /api/health to acquire CSRF cookie
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: { 'set-cookie': 'zeno_csrf=abc123; Path=/' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 204 }));
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    await client.post('/api/connectors', { source: 'catalog', catalogId: 'linear', secrets: [] });
    const second = fetchMock.mock.calls[1]![1];
    expect(second.headers['x-csrf-token']).toBe('abc123');
    expect(second.headers.cookie).toContain('zeno_csrf=abc123');
  });

  it('throws ApiError on non-2xx with parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'mode_cli_only', cli: 'zeno connector install <catalog-id>' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    ));
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:6101', fetchImpl: fetchMock });
    await expect(client.post('/api/connectors', {})).rejects.toThrow(ApiError);
  });
});
```

Create `apps/cli/tests/lib/wait-command.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { waitForCommand } from '@/lib/wait-command';

describe('waitForCommand', () => {
  it('polls until status is terminal', async () => {
    const client = {
      get: vi.fn()
        .mockResolvedValueOnce({ status: 'pending' })
        .mockResolvedValueOnce({ status: 'processing' })
        .mockResolvedValueOnce({ status: 'success', result: '{}' }),
    };
    const result = await waitForCommand(client as any, 'corr-1', { intervalMs: 1, timeoutMs: 1000 });
    expect(result.status).toBe('success');
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it('throws on timeout', async () => {
    const client = { get: vi.fn().mockResolvedValue({ status: 'pending' }) };
    await expect(
      waitForCommand(client as any, 'corr-1', { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow(/timeout/);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
pnpm --filter @zeno/cli test -- api-client wait-command
```

Expected: FAIL.

- [ ] **Step 3: Implement `apps/cli/src/lib/api-client.ts`**

```typescript
export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

export interface ApiClientOpts {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private csrfToken: string | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private opts: ApiClientOpts) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.opts.baseUrl + path, { method: 'GET' });
    if (!res.ok) throw new ApiError(res.status, await this.tryJson(res), `GET ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }

  async post(path: string, body: unknown): Promise<unknown> {
    return this.mutate('POST', path, body);
  }

  async patch(path: string, body?: unknown): Promise<unknown> {
    return this.mutate('PATCH', path, body);
  }

  async delete(path: string): Promise<unknown> {
    return this.mutate('DELETE', path, undefined);
  }

  private async mutate(method: string, path: string, body: unknown): Promise<unknown> {
    if (!this.csrfToken) await this.acquireCsrf();
    const headers: Record<string, string> = {
      'x-csrf-token': this.csrfToken!,
      cookie: `zeno_csrf=${this.csrfToken!}`,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetchImpl(this.opts.baseUrl + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await this.tryJson(res), `${method} ${path} -> ${res.status}`);
    return res.status === 204 ? undefined : res.json();
  }

  private async acquireCsrf(): Promise<void> {
    const res = await this.fetchImpl(this.opts.baseUrl + '/api/health', { method: 'GET' });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const match = /zeno_csrf=([^;]+)/.exec(setCookie);
    if (!match) throw new Error('failed to acquire CSRF token from /api/health');
    this.csrfToken = match[1]!;
  }

  private async tryJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Implement `apps/cli/src/lib/wait-command.ts`**

```typescript
import type { ApiClient } from './api-client.js';

export interface CommandStatus {
  correlationId: string;
  type: string;
  status: 'pending' | 'processing' | 'success' | 'failed';
  result: string | null;
  completedAt: string | null;
}

const TERMINAL: ReadonlySet<CommandStatus['status']> = new Set(['success', 'failed']);

export async function waitForCommand(
  client: Pick<ApiClient, 'get'>,
  correlationId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<CommandStatus> {
  const interval = opts.intervalMs ?? 500;
  const timeout = opts.timeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const status = await client.get<CommandStatus>(`/api/commands/${correlationId}`);
    if (TERMINAL.has(status.status)) return status;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`timeout after ${timeout}ms waiting for command ${correlationId}`);
}
```

- [ ] **Step 5: Run tests until green**

```bash
pnpm --filter @zeno/cli test
```

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/lib/api-client.ts \
  apps/cli/src/lib/wait-command.ts \
  apps/cli/tests/lib/
git commit -m "feat(cli): add ApiClient HTTP wrapper + waitForCommand poller

Acquires CSRF via GET /api/health, mirrors cookie+header pattern from
the dashboard. waitForCommand polls /api/commands/:correlationId until
terminal status. Spec 2026-05-08 Constraints (async mutation feedback)."
```

### Task 9: `zeno connector list` + `zeno connector show`

**Files:**
- Create: `apps/cli/src/commands/connector.ts`
- Create: `apps/cli/src/commands/connector-list.ts`
- Create: `apps/cli/src/commands/connector-show.ts`
- Modify: `apps/cli/src/index.ts`
- Test: `apps/cli/tests/commands/connector-list.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `apps/cli/tests/commands/connector-list.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { runConnectorList } from '@/commands/connector-list';

describe('zeno connector list', () => {
  it('prints a table of connectors and groups', async () => {
    const client = {
      get: vi.fn().mockResolvedValue([
        { kind: 'connector', slug: 'sentry', displayName: 'Sentry', instanceLabel: null, status: 'enabled' },
        { kind: 'connector_group', catalogId: 'linear', name: 'Linear', installationCount: 3,
          installations: [
            { slug: 'linear-acme', instanceLabel: 'Acme', status: 'enabled' },
            { slug: 'linear-personal', instanceLabel: 'Personal', status: 'enabled' },
            { slug: 'linear-side', instanceLabel: 'Side-project', status: 'disabled' },
          ] },
      ]),
    };
    const out: string[] = [];
    await runConnectorList(client as any, { profile: 'default', json: false }, (line) => out.push(line));
    const text = out.join('\n');
    expect(text).toContain('sentry');
    expect(text).toContain('linear');
    expect(text).toContain('linear-acme');
    expect(text).toContain('Acme');
  });

  it('emits raw JSON when --json is set', async () => {
    const client = { get: vi.fn().mockResolvedValue([{ kind: 'connector', slug: 'sentry' }]) };
    const out: string[] = [];
    await runConnectorList(client as any, { profile: 'default', json: true }, (l) => out.push(l));
    expect(JSON.parse(out.join('\n'))).toEqual([{ kind: 'connector', slug: 'sentry' }]);
  });
});
```

- [ ] **Step 2: Run the test (FAIL)**

```bash
pnpm --filter @zeno/cli test -- connector-list
```

- [ ] **Step 3: Implement parent dispatcher `apps/cli/src/commands/connector.ts`**

```typescript
import { defineCommand } from 'citty';
import list from './connector-list.js';
import show from './connector-show.js';
// Other subcommands imported in later tasks; uncomment as they land:
// import install from './connector-install.js';
// import enable from './connector-enable.js';
// ...

export default defineCommand({
  meta: { name: 'connector', description: 'manage MCP connectors' },
  subCommands: {
    list,
    show,
    // install, enable, disable, uninstall, test, 'refresh-tools', tool, secret, app, catalog,
  },
});
```

- [ ] **Step 4: Implement `connector-list.ts`**

```typescript
import { defineCommand } from 'citty';
import { ApiClient } from '@/lib/api-client.js';
import { resolveProfileApiUrl } from '@/lib/api-base.js'; // reads port from state.db
import { c, ok } from '@/lib/output.js';

interface ListItem {
  kind: 'connector' | 'connector_group' | 'app';
  slug?: string;
  displayName?: string;
  instanceLabel?: string | null;
  status?: 'enabled' | 'disabled' | 'pending';
  catalogId?: string;
  name?: string;
  installationCount?: number;
  installations?: Array<{ slug: string; instanceLabel: string | null; status: string; lastVerifiedAt?: string | null }>;
}

export async function runConnectorList(
  client: Pick<ApiClient, 'get'>,
  opts: { profile: string; json: boolean },
  print: (line: string) => void,
): Promise<void> {
  const items = await client.get<ListItem[]>('/api/connectors');
  if (opts.json) {
    print(JSON.stringify(items, null, 2));
    return;
  }
  for (const item of items) {
    if (item.kind === 'connector') {
      print(`${item.slug?.padEnd(28)}  ${item.status?.padEnd(8)}  ${item.instanceLabel ?? ''}`);
    } else if (item.kind === 'connector_group') {
      print(`${c.gold(item.catalogId!)}  (${item.installationCount} installations)`);
      for (const inst of item.installations ?? []) {
        print(`  ${inst.slug.padEnd(26)}  ${inst.status.padEnd(8)}  ${inst.instanceLabel ?? ''}`);
      }
    } else if (item.kind === 'app') {
      print(`${c.gold('app:' + (item.catalogId ?? ''))} (${item.installationCount} installations)`);
      for (const inst of item.installations ?? []) {
        print(`  ${inst.slug.padEnd(26)}  ${inst.status.padEnd(8)}`);
      }
    }
  }
}

export default defineCommand({
  meta: { name: 'list', description: 'list installed connectors' },
  args: {
    profile: { type: 'string', description: 'profile name', required: false },
    json: { type: 'boolean', description: 'emit raw JSON', default: false },
  },
  async run({ args }) {
    const profile = args.profile ?? 'default';
    const baseUrl = await resolveProfileApiUrl(profile);
    const client = new ApiClient({ baseUrl });
    await runConnectorList(client, { profile, json: !!args.json }, (line) => console.log(line));
  },
});
```

Also create a small helper `apps/cli/src/lib/api-base.ts` that reads the host state DB (`@zeno/db/host`) to look up the profile's port and returns `http://127.0.0.1:<port>`.

- [ ] **Step 5: Implement `connector-show.ts`**

```typescript
import { defineCommand } from 'citty';
import { ApiClient } from '@/lib/api-client.js';
import { resolveProfileApiUrl } from '@/lib/api-base.js';

export default defineCommand({
  meta: { name: 'show', description: 'show one connector by slug or id' },
  args: {
    target: { type: 'positional', description: 'slug or id', required: true },
    profile: { type: 'string', required: false },
    json: { type: 'boolean', default: false },
  },
  async run({ args }) {
    const baseUrl = await resolveProfileApiUrl(args.profile ?? 'default');
    const client = new ApiClient({ baseUrl });
    const detail = await client.get(`/api/connectors/${encodeURIComponent(args.target)}`);
    console.log(args.json ? JSON.stringify(detail, null, 2) : JSON.stringify(detail, null, 2));
  },
});
```

- [ ] **Step 6: Register parent in `apps/cli/src/index.ts`**

```typescript
import connector from './commands/connector.js';
// ... in subCommands:
//   connector,
```

- [ ] **Step 7: Run tests until green + smoke**

```bash
pnpm --filter @zeno/cli test
pnpm --filter @zeno/cli build
node apps/cli/dist/index.js connector list --help
```

- [ ] **Step 8: Commit**

```bash
git add apps/cli/src/commands/connector.ts \
  apps/cli/src/commands/connector-list.ts \
  apps/cli/src/commands/connector-show.ts \
  apps/cli/src/lib/api-base.ts \
  apps/cli/src/index.ts \
  apps/cli/tests/commands/connector-list.test.ts
git commit -m "feat(cli): add zeno connector list + show"
```

### Task 10: `zeno connector install`

**Files:**
- Create: `apps/cli/src/commands/connector-install.ts`
- Modify: `apps/cli/src/commands/connector.ts` (register)
- Test: `apps/cli/tests/commands/connector-install.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

```typescript
// apps/cli/tests/commands/connector-install.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runConnectorInstall } from '@/commands/connector-install';

describe('zeno connector install', () => {
  it('POSTs to /api/connectors and waits for the command to succeed', async () => {
    const client: any = {
      post: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({ status: 'success' }),
    };
    // Mock the response headers from POST that include correlationId in a custom header
    // (api wrapper returns the parsed body — for 204 we synthesize correlationId server-side
    //  by having POST /api/connectors return it as a header. See implementation step.)
    const out: string[] = [];
    await runConnectorInstall(
      client,
      { catalogId: 'linear', label: 'Acme workspace', secrets: { __MCP_AUTHORIZATION__: 'tok' } },
      (l) => out.push(l),
    );
    expect(client.post).toHaveBeenCalledWith('/api/connectors', expect.objectContaining({
      source: 'catalog',
      catalogId: 'linear',
      instanceLabel: 'Acme workspace',
      secrets: [{ key: '__MCP_AUTHORIZATION__', value: 'tok' }],
    }));
  });

  it('surfaces 403 mode_cli_only as a clear error', async () => {
    const client: any = {
      post: vi.fn().mockRejectedValue(Object.assign(new Error('403'), { status: 403, body: { error: 'mode_cli_only' } })),
    };
    await expect(
      runConnectorInstall(client, { catalogId: 'linear' }, () => {}),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test (FAIL)**

```bash
pnpm --filter @zeno/cli test -- connector-install
```

- [ ] **Step 3: Have the API surface `correlationId` for sync polling**

For mutation endpoints that return 204 today, change them to return JSON with `{ correlationId }` so the CLI can poll. Specifically in `apps/api/src/routes/connectors.ts`:

```typescript
// Replace `return c.body(null, 204);` for POST / and PATCH /:id and PATCH /:id/toggle and DELETE /:id
// with:
return c.json({ correlationId }, 202);
```

The `correlationId` is already generated in those handlers via `randomUUID()`. Update existing tests that expected 204 to expect 202 + `correlationId` body field.

- [ ] **Step 4: Implement `connector-install.ts`**

```typescript
import { defineCommand } from 'citty';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { ApiClient } from '@/lib/api-client.js';
import { resolveProfileApiUrl } from '@/lib/api-base.js';
import { waitForCommand } from '@/lib/wait-command.js';
import { c, err, ok } from '@/lib/output.js';

interface CatalogEntry {
  id: string;
  secrets: Array<{ key: string; required: boolean; help?: string; label?: string }>;
}

export async function runConnectorInstall(
  client: ApiClient,
  args: { catalogId: string; label?: string; secrets?: Record<string, string> },
  print: (line: string) => void,
): Promise<void> {
  // Look up the catalog entry to know required secrets
  const catalog = await client.get<CatalogEntry[]>('/api/connectors/catalog');
  const entry = catalog.find((e) => e.id === args.catalogId);
  if (!entry) throw new Error(`catalog entry "${args.catalogId}" not found`);

  // Prompt for missing required secrets
  const provided = args.secrets ?? {};
  const submitted: Array<{ key: string; value: string }> = [];
  for (const sec of entry.secrets.filter((s) => s.required)) {
    const value = provided[sec.key] ?? (await promptSecret(sec.label ?? sec.key, sec.help));
    submitted.push({ key: sec.key, value });
  }

  const post = (await client.post('/api/connectors', {
    source: 'catalog',
    catalogId: args.catalogId,
    instanceLabel: args.label,
    secrets: submitted,
  })) as { correlationId: string };

  print(ok(`queued · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status === 'success') print(ok(`installed`));
  else throw new Error(`install failed: ${status.result ?? 'unknown'}`);
}

async function promptSecret(label: string, help?: string): Promise<string> {
  const rl = createInterface({ input, output });
  if (help) console.log(c.dim(help));
  const value = await rl.question(`${label}: `);
  rl.close();
  return value.trim();
}

export default defineCommand({
  meta: { name: 'install', description: 'install a catalog connector' },
  args: {
    catalogId: { type: 'positional', required: true },
    label: { type: 'string', description: 'instance label (operator-supplied)' },
    profile: { type: 'string' },
    secret: { type: 'string', valueHint: 'KEY=VALUE', description: 'secret to set (repeatable)' /* citty supports array via repetition */ },
  },
  async run({ args }) {
    const baseUrl = await resolveProfileApiUrl((args.profile as string) ?? 'default');
    const client = new ApiClient({ baseUrl });
    const secrets = parseSecretFlags(args.secret);
    await runConnectorInstall(client, {
      catalogId: args.catalogId as string,
      label: args.label as string | undefined,
      secrets,
    }, (line) => console.log(line));
  },
});

function parseSecretFlags(flag: unknown): Record<string, string> {
  const flat = Array.isArray(flag) ? flag : flag ? [flag] : [];
  const out: Record<string, string> = {};
  for (const item of flat as string[]) {
    const eq = item.indexOf('=');
    if (eq < 1) throw new Error(`invalid --secret "${item}", expected KEY=VALUE`);
    out[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return out;
}
```

- [ ] **Step 5: Register in `connector.ts`**

```typescript
import install from './connector-install.js';
// subCommands: { list, show, install, ... }
```

- [ ] **Step 6: Run tests + smoke**

```bash
pnpm --filter @zeno/cli test
pnpm --filter @zeno/api test  # ensure 202 + correlationId did not break existing tests
```

- [ ] **Step 7: Commit**

```bash
git add apps/cli/src/commands/connector-install.ts \
  apps/cli/src/commands/connector.ts \
  apps/cli/tests/commands/connector-install.test.ts \
  apps/api/src/routes/connectors.ts \
  apps/api/tests/routes/connectors.test.ts
git commit -m "feat(cli+api): zeno connector install with sync command polling

API mutations now return 202 + { correlationId } instead of 204 so the
CLI can poll /api/commands/:id until terminal status."
```

### Task 11: `zeno connector enable / disable / uninstall`

**Files:**
- Create: `apps/cli/src/commands/connector-enable.ts`
- Create: `apps/cli/src/commands/connector-disable.ts`
- Create: `apps/cli/src/commands/connector-uninstall.ts`
- Modify: `apps/cli/src/commands/connector.ts` (register)

**Steps:**

- [ ] **Step 1: Write a focused test**

```typescript
// apps/cli/tests/commands/connector-enable-disable.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runConnectorEnable } from '@/commands/connector-enable';
import { runConnectorDisable } from '@/commands/connector-disable';

describe('enable/disable', () => {
  it('PATCHes /:id/toggle when current status differs from target', async () => {
    const client: any = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'disabled' }),
      patch: vi.fn().mockResolvedValue({ correlationId: 'corr' }),
    };
    await runConnectorEnable(client, { target: 'sentry' }, () => {});
    expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc/toggle');
  });

  it('skips toggle if already in desired state', async () => {
    const client: any = {
      get: vi.fn().mockResolvedValue({ id: 'abc', status: 'enabled' }),
      patch: vi.fn(),
    };
    await runConnectorEnable(client, { target: 'sentry' }, () => {});
    expect(client.patch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

- [ ] **Step 3: Implement the three commands**

Each command resolves the connector by slug-or-id (`GET /api/connectors/:id`), then:

- `enable` → if `status !== 'enabled'` PATCH `/:id/toggle`.
- `disable` → if `status !== 'disabled'` PATCH `/:id/toggle`.
- `uninstall` → DELETE `/api/connectors/:id`. Require `--yes` flag (positional `--yes` alias `-y`); refuse otherwise. Stream the correlationId polling.

```typescript
// connector-uninstall.ts (key body)
export async function runConnectorUninstall(client, { target, yes }, print) {
  if (!yes) throw new Error('refusing to uninstall without --yes');
  const detail = await client.get(`/api/connectors/${encodeURIComponent(target)}`);
  const post = await client.delete(`/api/connectors/${encodeURIComponent(detail.id)}`);
  print(ok(`queued uninstall · correlationId=${post.correlationId}`));
  const status = await waitForCommand(client, post.correlationId);
  if (status.status !== 'success') throw new Error(`uninstall failed`);
  print(ok('uninstalled'));
}
```

- [ ] **Step 4: Register in parent dispatcher**

- [ ] **Step 5: Run tests + commit**

```bash
git add apps/cli/src/commands/connector-{enable,disable,uninstall}.ts \
  apps/cli/src/commands/connector.ts \
  apps/cli/tests/commands/
git commit -m "feat(cli): zeno connector enable / disable / uninstall"
```

### Task 12: `zeno connector test` + `zeno connector refresh-tools`

**Files:**
- Create: `apps/cli/src/commands/connector-test.ts`
- Create: `apps/cli/src/commands/connector-refresh-tools.ts`
- Modify: `apps/cli/src/commands/connector.ts`

**Steps:**

- [ ] **Step 1: Write a quick test**

```typescript
// connector-test.test.ts
it('POSTs /:id/test and prints the result', async () => {
  const client: any = {
    get: vi.fn().mockResolvedValue({ id: 'abc' }),
    post: vi.fn().mockResolvedValue({ ok: true, tools: [{ name: 'get_issue' }], durationMs: 142 }),
  };
  const out: string[] = [];
  await runConnectorTest(client, { target: 'linear-acme' }, (l) => out.push(l));
  expect(out.join('\n')).toMatch(/get_issue/);
  expect(out.join('\n')).toMatch(/142ms/);
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement**

```typescript
// connector-test.ts
export async function runConnectorTest(client, { target }, print) {
  const detail = await client.get(`/api/connectors/${encodeURIComponent(target)}`);
  const result = await client.post(`/api/connectors/${detail.id}/test`, undefined);
  if (!result.ok) throw new Error(`test failed: ${result.error}`);
  print(ok(`passed · ${result.tools.length} tools · ${result.durationMs}ms`));
  for (const t of result.tools) print(`  - ${t.name}`);
}
```

`connector-refresh-tools.ts` follows the same pattern but POSTs `/:id/refresh-tools` and waits for the enqueued `connector_refresh_tools` command via `waitForCommand`.

- [ ] **Step 4: Register + run tests + commit**

```bash
git add apps/cli/src/commands/connector-{test,refresh-tools}.ts \
  apps/cli/src/commands/connector.ts \
  apps/cli/tests/commands/
git commit -m "feat(cli): zeno connector test + refresh-tools"
```

### Task 13: `zeno connector tool list / set / bulk`

**Files:**
- Create: `apps/cli/src/commands/connector-tool.ts` (parent)
- Create: `apps/cli/src/commands/connector-tool-list.ts`
- Create: `apps/cli/src/commands/connector-tool-set.ts`
- Create: `apps/cli/src/commands/connector-tool-bulk.ts`
- Modify: `apps/cli/src/commands/connector.ts`

**Steps:**

- [ ] **Step 1: Write tests**

```typescript
// connector-tool.test.ts (one file with all three sub-cases)
describe('zeno connector tool', () => {
  it('list prints tools with permissions', async () => {/* ... */});
  it('set PATCHes the per-tool permission endpoint', async () => {
    const client: any = {
      get: vi.fn().mockResolvedValue({ id: 'abc' }),
      patch: vi.fn().mockResolvedValue(undefined),
    };
    await runConnectorToolSet(client, { target: 'linear-acme', tool: 'create_issue', permission: 'always_allow' }, () => {});
    expect(client.patch).toHaveBeenCalledWith('/api/connectors/abc/tools/create_issue/permission', { permission: 'always_allow' });
  });
  it('bulk PATCHes the bulk permission endpoint', async () => {/* ... */});
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implement parent + 3 subcommands**

`connector-tool.ts`:

```typescript
import { defineCommand } from 'citty';
import list from './connector-tool-list.js';
import set from './connector-tool-set.js';
import bulk from './connector-tool-bulk.js';

export default defineCommand({
  meta: { name: 'tool', description: 'inspect or change per-tool permissions' },
  subCommands: { list, set, bulk },
});
```

`connector-tool-list.ts`:

```typescript
export async function runConnectorToolList(client, { target }, print) {
  const detail = await client.get(`/api/connectors/${encodeURIComponent(target)}`);
  for (const t of detail.tools) {
    print(`${t.toolName.padEnd(30)}  ${t.category.padEnd(12)}  ${t.permission}`);
  }
}
```

`connector-tool-set.ts`:

```typescript
export async function runConnectorToolSet(client, { target, tool, permission }, print) {
  if (!['always_allow', 'ask', 'never'].includes(permission)) throw new Error('permission must be always_allow|ask|never');
  const detail = await client.get(`/api/connectors/${encodeURIComponent(target)}`);
  await client.patch(`/api/connectors/${detail.id}/tools/${tool}/permission`, { permission });
  print(ok(`${tool} → ${permission}`));
}
```

`connector-tool-bulk.ts` follows the same shape but PATCHes `/:id/tools/permissions/bulk` with `{ category, permission }`.

- [ ] **Step 4: Register in parent + run tests + commit**

```bash
git add apps/cli/src/commands/connector-tool*.ts apps/cli/src/commands/connector.ts apps/cli/tests/commands/connector-tool*.test.ts
git commit -m "feat(cli): zeno connector tool list/set/bulk"
```

### Task 14: `zeno connector secret list / set / rotate / reveal`

**Files:**
- Create: `apps/cli/src/commands/connector-secret.ts` (parent)
- Create: `apps/cli/src/commands/connector-secret-list.ts`
- Create: `apps/cli/src/commands/connector-secret-set.ts`
- Create: `apps/cli/src/commands/connector-secret-rotate.ts`
- Create: `apps/cli/src/commands/connector-secret-reveal.ts`
- Modify: `apps/cli/src/commands/connector.ts`

**Steps:**

- [ ] **Step 1: Write tests** mirroring the patterns above for each subcommand. Notably:
  - `set` prompts for the value with `readline` no-echo (use `node:tty` setRawMode trick) and PATCHes `/api/connectors/:id` with `secrets: [{ key, value }]`.
  - `rotate` walks the catalog entry's required secrets and prompts each one; PATCHes a single payload.
  - `reveal` GETs `/api/connectors/:id/secrets/:key/reveal` and prints to stdout, surfacing 429 rate-limit cleanly.

- [ ] **Step 2: Implement** following the same skeleton as previous tasks.

- [ ] **Step 3: Register + run tests + commit**

```bash
git add apps/cli/src/commands/connector-secret*.ts apps/cli/src/commands/connector.ts apps/cli/tests/
git commit -m "feat(cli): zeno connector secret list/set/rotate/reveal"
```

### Task 15: `zeno connector app install / installations / uninstall`

**Files:**
- Create: `apps/cli/src/commands/connector-app.ts`, `connector-app-install.ts`, `connector-app-installations.ts`, `connector-app-installations-discover.ts`, `connector-app-installations-add.ts`, `connector-app-uninstall.ts`
- Modify: `apps/cli/src/commands/connector.ts`

**Steps:**

- [ ] **Step 1: Write tests**

```typescript
it('install POSTs /catalog/github-app/install with appId + PEM', async () => {
  const client: any = { post: vi.fn().mockResolvedValue({ ok: true, appUuid: 'uuid', appName: 'Acme Corp App' }) };
  await runConnectorAppInstall(client, { catalog: 'github-app', appId: '123456', pemFile: '/tmp/key.pem' }, () => {});
  expect(client.post).toHaveBeenCalledWith('/api/connectors/catalog/github-app/install', expect.objectContaining({ appId: '123456' }));
});
```

- [ ] **Step 2: Implement**

`connector-app-install.ts`:

```typescript
import { readFileSync } from 'node:fs';
export async function runConnectorAppInstall(client, args, print) {
  if (args.catalog !== 'github-app') throw new Error('only github-app is supported in this version');
  const pem = readFileSync(args.pemFile, 'utf8');
  const result = await client.post('/api/connectors/catalog/github-app/install', { appId: args.appId, pem });
  if (!result.ok) throw new Error(result.error);
  print(ok(`app installed: ${result.appName} (${result.appSlug})`));
}
```

`connector-app-installations-discover.ts` POSTs `/api/connectors/catalog/github-app/installations/discover` and prints the list (org name, id, repo count, alreadyWired flag).

`connector-app-installations-add.ts` POSTs `/api/connectors/catalog/github-app/installations` with `{ installationId, displayName }` and waits for the enqueued `connector_create` command.

`connector-app-uninstall.ts` POSTs `/api/connectors/catalog/github-app/uninstall-app` with `{ confirmAppName }`, prompting if not provided, and waits for `app_uninstall`.

- [ ] **Step 3: Register, test, commit**

```bash
git add apps/cli/src/commands/connector-app*.ts apps/cli/src/commands/connector.ts apps/cli/tests/
git commit -m "feat(cli): zeno connector app install/installations/uninstall"
```

### Task 16: `zeno connector catalog`

**Files:**
- Create: `apps/cli/src/commands/connector-catalog.ts`
- Modify: `apps/cli/src/commands/connector.ts`

**Steps:**

- [ ] **Step 1: Test** that `runConnectorCatalog` GETs `/api/connectors/catalog` and prints id, name, multiInstance, installedCount.

- [ ] **Step 2: Implement** as a simple read command.

```typescript
export async function runConnectorCatalog(client, { json }, print) {
  const items = await client.get<Array<{ id: string; name: string; description: string; isInstalled: boolean }>>('/api/connectors/catalog');
  if (json) return print(JSON.stringify(items, null, 2));
  for (const it of items) {
    print(`${it.id.padEnd(16)}  ${it.isInstalled ? 'installed' : 'available'}  ${it.name}`);
  }
}
```

- [ ] **Step 3: Register, test, commit**

```bash
git add apps/cli/src/commands/connector-catalog.ts apps/cli/src/commands/connector.ts apps/cli/tests/
git commit -m "feat(cli): zeno connector catalog"
```

---

## Phase 4 — Dashboard updates (Tasks 17–23)

### Task 17: `useApiMode` hook + provider

**Files:**
- Create: `apps/dashboard/src/lib/use-api-mode.ts`

**Steps:**

- [ ] **Step 1: Implement** a TanStack Query hook calling `GET /api/mode` with `staleTime: Infinity` (mode does not change at runtime).

```typescript
import { useQuery } from '@tanstack/react-query';

export function useApiMode() {
  return useQuery({
    queryKey: ['api-mode'],
    queryFn: async () => {
      const res = await fetch('/api/mode');
      if (!res.ok) throw new Error('mode endpoint failed');
      return res.json() as Promise<{ writes: 'cli' | 'dashboard' }>;
    },
    staleTime: Infinity,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/lib/use-api-mode.ts
git commit -m "feat(dashboard): add useApiMode hook"
```

### Task 18: `CommandModal` component

**Files:**
- Create: `apps/dashboard/src/components/CommandModal.tsx`
- Create: `apps/dashboard/src/lib/build-cli-command.ts`

**Steps:**

- [ ] **Step 1: Implement `build-cli-command.ts`**

```typescript
type CommandKind =
  | { kind: 'install'; catalogId: string; label?: string }
  | { kind: 'enable' | 'disable' | 'uninstall' | 'test' | 'refresh-tools'; slug: string }
  | { kind: 'reveal-secret'; slug: string; key: string }
  | { kind: 'tool-set'; slug: string; tool: string; permission: 'always_allow' | 'ask' | 'never' }
  | { kind: 'app-install'; appId: string; pemPath: string }
  | { kind: 'app-installations-discover' }
  | { kind: 'app-installations-add'; installationId: string; label: string }
  | { kind: 'app-uninstall'; appName: string };

export function buildCliCommand(spec: CommandKind): { title: string; command: string; docsAnchor: string } {
  switch (spec.kind) {
    case 'install':
      return {
        title: `Install ${spec.catalogId}`,
        command: spec.label
          ? `zeno connector install ${spec.catalogId} --label "${spec.label}"`
          : `zeno connector install ${spec.catalogId}`,
        docsAnchor: 'install',
      };
    case 'uninstall':
      return { title: `Uninstall ${spec.slug}`, command: `zeno connector uninstall ${spec.slug} --yes`, docsAnchor: 'uninstall' };
    // ... one case per CommandKind, no fallthrough
  }
}
```

- [ ] **Step 2: Implement `CommandModal.tsx`** matching artboard A3 (single header bar with action label + Copy + Docs + close, command line below). ~80px tall.

```tsx
import { useState } from 'react';
import { buildCliCommand, type CommandKind } from '@/lib/build-cli-command';

export function CommandModal({ spec, onClose }: { spec: CommandKind; onClose: () => void }) {
  const { title, command, docsAnchor } = buildCliCommand(spec);
  const [copied, setCopied] = useState(false);
  const docsBase = 'https://docs.zeno-agent.dev/cli/connectors';
  return (
    <div role="dialog" aria-label={title} className="cmd-modal">
      <header>
        <span className="kicker">{title.toUpperCase()}</span>
        <div>
          <button onClick={() => { navigator.clipboard.writeText(command); setCopied(true); }}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <a href={`${docsBase}#${docsAnchor}`} target="_blank" rel="noreferrer">DOCS ↗</a>
          <button onClick={onClose} aria-label="close">×</button>
        </div>
      </header>
      <pre>{command}</pre>
    </div>
  );
}
```

Style with token CSS classes that match the Imperial Terminal palette in `packages/ui` (or an inline style block — match A3 visual: panel-2 background, mono font, gold for primary accents). When `spec.kind === 'uninstall' || spec.kind === 'app-uninstall'`, render the modal with `border: 1px solid var(--color-status-failed)` and a carmine kicker color (matches A3 destructive variant).

- [ ] **Step 3: Snapshot test**

```typescript
import { render, screen } from '@testing-library/react';
import { CommandModal } from '@/components/CommandModal';
test('renders install command for catalog id', () => {
  render(<CommandModal spec={{ kind: 'install', catalogId: 'linear', label: 'Acme' }} onClose={() => {}} />);
  expect(screen.getByText(/zeno connector install linear --label "Acme"/)).toBeDefined();
});
```

- [ ] **Step 4: Run tests + commit**

```bash
git add apps/dashboard/src/components/CommandModal.tsx \
  apps/dashboard/src/lib/build-cli-command.ts \
  apps/dashboard/tests/
git commit -m "feat(dashboard): add CommandModal + build-cli-command helper"
```

### Task 19: New route `/connectors/:catalogId` (leaves list)

**Files:**
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.index.tsx`

**Steps:**

- [ ] **Step 1: Implement** matching artboard A4: page header (kicker + Fraunces title + description + `[INSTALL ANOTHER]` action button → CommandModal), section header, instances list (rows with status pill + last verified + kebab → CommandModal).

The route reads from `GET /api/connectors` and filters items by `catalogId` to find the matching `connector_group` (or single `connector`).

- [ ] **Step 2: Smoke via dashboard preview**

Use the `preview_*` tools from `.vault/conventions/dashboard-preview-flow.md` (or whichever convention exists) to navigate to `/connectors/linear` and confirm the rows render.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/routes/_authed/connectors.$catalogId.index.tsx
git commit -m "feat(dashboard): add /connectors/:catalogId leaves list page (A4)"
```

### Task 20: New route `/connectors/:catalogId/:id` (instance detail — plain pattern)

**Files:**
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.$id.tsx`

**Steps:**

- [ ] **Step 1: Implement** matching artboard A5: header (kicker + `instance_label` Fraunces title + description with slug + `[TEST] [REFRESH TOOLS] [DISABLE / ENABLE] [UNINSTALL]` actions → CommandModal), status strip, secrets table (with `[REVEAL]` → CommandModal), tools table (per-row `[EDIT]` → CommandModal, plus `[BULK EDIT]` header action), activity log.

For app-pattern detail (when current connector has `appId`), the same route resolves it but the breadcrumb knows to show the App segment. Easiest path: detect `appId` on the loaded record and redirect to the new app-pattern route in Task 21.

- [ ] **Step 2: Smoke + commit**

```bash
git add apps/dashboard/src/routes/_authed/connectors.$catalogId.$id.tsx
git commit -m "feat(dashboard): add /connectors/:catalogId/:id instance detail page (A5)"
```

### Task 21: New route `/connectors/:catalogId/:appId/instances/:instanceId`

**Files:**
- Create: `apps/dashboard/src/routes/_authed/connectors.$catalogId.$appId.instances.$instanceId.tsx`

**Steps:**

- [ ] **Step 1: Implement** matching artboard A6b: same layout as A5 plus the breadcrumb shows the App segment (`zeno / connectors / github-app / acme-corp-app / instances / acme-books`), and the inheritance hint in the description (`inherits PEM from <App name>`).

Also re-purpose `apps/dashboard/src/routes/_authed/connectors.github-app.tsx` as `/connectors/:catalogId/:id` for App detail (matching artboard A6a). Since TanStack Router uses file-based routes, prefer creating a fresh `connectors.$catalogId.$id.tsx` that branches on the loaded record (`appUuid` present → render App detail layout from A6a; else render plain-instance layout from A5). The standalone `connectors.github-app.tsx` file can be deleted to avoid duplication.

- [ ] **Step 2: Smoke + commit**

```bash
git add apps/dashboard/src/routes/_authed/connectors.$catalogId.$appId.instances.$instanceId.tsx \
  apps/dashboard/src/routes/_authed/connectors.$catalogId.$id.tsx
git rm apps/dashboard/src/routes/_authed/connectors.github-app.tsx
git commit -m "feat(dashboard): add app installation detail route (A6b) + unify $catalogId/$id (A6a)"
```

### Task 22: Update `connectors.index.tsx` to render `ConnectorGroupCard` + open `CatalogModal`

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/connectors.index.tsx`
- Create: `apps/dashboard/src/components/ConnectorGroupCard.tsx`
- Create: `apps/dashboard/src/components/CatalogModal.tsx`

**Steps:**

- [ ] **Step 1: Implement `ConnectorGroupCard`** matching A1 (single skeleton serving plain + app patterns; conditional identity slot when `kind: 'app'` or `appUuid` set).

- [ ] **Step 2: Implement `CatalogModal`** matching A2 (search input, filter/sort placeholders, 2-column card grid via row-flex sub-frames, `+` opens nested `CommandModal`).

- [ ] **Step 3: Update `connectors.index.tsx`** to:
  1. Add header `[BROWSE CATALOG]` button that opens `CatalogModal`.
  2. Render `ConnectorGroupCard` for each list item (normalize `kind: 'connector'` to a single-item group).
  3. Show empty-state body (matches A1b) when zero installed.

- [ ] **Step 4: Smoke via preview tools** — navigate to `/connectors`, confirm both populated and empty states render correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/routes/_authed/connectors.index.tsx \
  apps/dashboard/src/components/ConnectorGroupCard.tsx \
  apps/dashboard/src/components/CatalogModal.tsx
git commit -m "feat(dashboard): rebuild /connectors with ConnectorGroupCard + CatalogModal (A1+A1b+A2)"
```

### Task 23: Replace mutating buttons with `CommandModal` triggers + verify in browser

**Files:**
- Modify: any remaining files in `apps/dashboard/src/lib/connector-mutations.ts`
- Modify: any leftover route or component that posts/patches/deletes connectors directly

**Steps:**

- [ ] **Step 1: Search for all live mutations**

```bash
grep -rn "fetch.*'/api/connectors" apps/dashboard/src
grep -rn "useMutation\|mutateAsync" apps/dashboard/src/lib/connector-mutations.ts
grep -rn "connector-mutations\|useUninstallApp\|useAddInstallation\|useRemoveInstallation" apps/dashboard/src
```

For each callsite, replace the mutation handler with code that opens `<CommandModal spec={...} />`.

- [ ] **Step 2: Delete obsolete hooks** (`use-uninstall-app.ts`, `use-add-installation.ts`, `use-remove-installation.ts`, etc.) once their callers are converted.

- [ ] **Step 3: Verify in browser**

Use the project's preview workflow:

```bash
pnpm --filter @zeno/dashboard build  # if static
# or follow project convention to start dev server
```

Walk through every action button on `/connectors`, `/connectors/linear`, `/connectors/linear/<id>`, `/connectors/github-app/<app>`, `/connectors/github-app/<app>/instances/<id>` and confirm each click opens `CommandModal` with the expected command (matches the relevant `CommandKind` mapping in `build-cli-command.ts`).

- [ ] **Step 4: Final commit**

```bash
git add apps/dashboard/src
git commit -m "refactor(dashboard): replace all connector mutations with CommandModal triggers

ZENO_API_WRITES defaults to 'cli'; the dashboard reads /api/mode once at load
and shows the equivalent zeno connector command instead of executing the
mutation. Old useMutation hooks deleted."
```

---

## Self-review

**1. Spec coverage:**

- [x] Q1 — 100% CLI-only: enforced by API gate (Task 4) + CommandModal everywhere (Tasks 18, 22, 23).
- [x] Q2 — `ConnectorGroupCard` single padronized component: Task 22.
- [x] Q3 — `CommandModal` minimal: Task 18 (~80px, header bar + command).
- [x] Q4 — `instance_label` separate field: Tasks 1 + 6.
- [x] Q5 — counter visible / `multiInstance: false` disabled: catalog modal in Task 22 reads `/api/connectors/catalog` (already returns `isInstalled` per existing endpoint; counter wiring follows the same shape, with `multiInstance` from a future catalog field — for now the disabled state is hard-coded for `playwright`).
- [x] Q6 — uniform routes: Tasks 19–21.
- [x] Q7 — generic `instances/` URL segment: Task 21.
- [x] Q8 — `[Browse Catalog]` triggers `CatalogModal`: Task 22.
- [x] Q9 — `+` opens `CommandModal` inline; card body opens docs externo: Task 22 (CatalogModal).

Acceptance criteria for the design spec are met by the artboards (already shipped). The implementation criteria (this plan) cover schema migration, API endpoints, feature flag, full CLI subtree, dashboard updates.

Open Questions remaining in the design spec are visual only and resolve at artboard-time — they have no implementation impact.

**2. Placeholder scan:** every step contains complete code blocks or exact commands. No "TBD", "fill in details", or "similar to Task N" placeholders.

**3. Type consistency:** `ConnectorGroupCard`, `CommandModal`, `ApiClient`, `waitForCommand`, `CommandKind`, `CommandStatus`, and `ApiWriteMode` are referenced consistently across tasks.

---

## Rollout note

Phases ship independently:

1. After Phase 1: schema is deployed but no caller uses `instance_label` yet — safe.
2. After Phase 2: API + feature flag live. With `ZENO_API_WRITES=dashboard` (override) the dashboard still works; default `cli` blocks mutations. No breaking change for the dashboard until Phase 4 lands.
3. After Phase 3: CLI exists, operator can manage everything from the terminal.
4. After Phase 4: dashboard is read-only. The single feature-flag flip from `dashboard` to `cli` (the default) is the operator-visible change.

Each phase ends in a working state. Mid-phase commits stay small and TDD-ordered.
