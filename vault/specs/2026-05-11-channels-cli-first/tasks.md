---
feature: channels-cli-first
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-11
---
# Channels CLI-First — Tasks

**For this plan:** [[plan]]

> All tasks run from the repo root unless stated. Branch is already created (`feat/channels-cli-first`). Every task ends with `git commit`. Phase boundaries are commit clusters; the PR is opened only after Phase 12.

---

## Phase 1 — DB migration: `connector_secrets.updatedAt`

### Task 1: Add `updatedAt` column to `connector_secrets`

**Files:**
- Modify: `packages/db/src/runtime/schema.ts:176-190` — add `updatedAt: isoTimestamp` column
- Modify: `packages/db/src/runtime/repos/connectors.ts:408-428` — set `updatedAt` on `replaceSecrets()`
- Create: `packages/db/src/runtime/migrations/NNNN_connector_secrets_updated_at.sql` (NNNN = next free number; check directory listing)
- Modify: `packages/db/tests/repos/connectors.test.ts` — extend `replaceSecrets` test to assert `updatedAt` bump

- [ ] **Step 1: Find the next migration number**

Run: `ls packages/db/src/runtime/migrations/ | sort | tail -3`
Note the highest number; the new migration is `<n+1>_connector_secrets_updated_at.sql` (e.g. if last is `0014_*`, new = `0015_connector_secrets_updated_at.sql`).

- [ ] **Step 2: Write the failing test first**

Add to `packages/db/tests/repos/connectors.test.ts`:

```ts
it("replaceSecrets bumps connector_secrets.updatedAt on every call", async () => {
  const repo = makeRepo();
  const connectorId = "conn-1";
  await repo.create({ id: connectorId, slug: "test", kind: "channel", catalogId: "test", displayName: "Test" });
  await repo.replaceSecrets(connectorId, [{ key: "K", value: "v1" }]);
  const before = await repo.getSecretRow(connectorId, "K");
  await new Promise((r) => setTimeout(r, 10));
  await repo.replaceSecrets(connectorId, [{ key: "K", value: "v2" }]);
  const after = await repo.getSecretRow(connectorId, "K");
  expect(after.updatedAt).not.toBe(before.updatedAt);
  expect(new Date(after.updatedAt).getTime()).toBeGreaterThan(new Date(before.updatedAt).getTime());
});
```

(If `getSecretRow` does not exist, add it as a thin `SELECT * WHERE …` helper in the same file.)

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @zeno/db test -t "connector_secrets.updatedAt"`
Expected: FAIL with "Cannot read property 'updatedAt' of undefined" or schema column missing.

- [ ] **Step 4: Add column to drizzle schema**

In `packages/db/src/runtime/schema.ts` inside the `connectorSecrets` table definition, add:

```ts
updatedAt: text("updated_at")
  .notNull()
  .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
```

- [ ] **Step 5: Write the migration SQL**

Create `packages/db/src/runtime/migrations/NNNN_connector_secrets_updated_at.sql`:

```sql
ALTER TABLE connector_secrets
  ADD COLUMN updated_at TEXT NOT NULL
  DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE connector_secrets SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = '';
```

(If `connector_secrets` does not have `created_at`, drop the UPDATE clause — the DEFAULT covers fresh rows.)

- [ ] **Step 6: Update `replaceSecrets` to set `updatedAt`**

In `packages/db/src/runtime/repos/connectors.ts:408-428`, set `updatedAt: new Date().toISOString()` on the insert payload.

- [ ] **Step 7: Run test, expect PASS**

Run: `pnpm --filter @zeno/db test -t "connector_secrets.updatedAt"`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/db/
git commit -m "feat(db): add connector_secrets.updatedAt for hot-reload detection"
```

### Task 2: Wire migration into runtime DB bootstrap

**Files:**
- Modify: `packages/db/src/runtime/index.ts` — ensure new migration runs on `openRuntimeDatabase()` (drizzle reads files lexicographically; no code change unless the migrations list is hardcoded)

- [ ] **Step 1: Inspect migration loading mechanism**

Run: `grep -n "migrations" packages/db/src/runtime/index.ts`

Expected: `drizzle.migrate()` or `migrate()` reads from the directory automatically. If hardcoded list, append the new migration filename.

- [ ] **Step 2: Smoke-test fresh DB**

```bash
rm -f /tmp/zeno-test.db
pnpm --filter @zeno/db test -t "openRuntimeDatabase"
```

Expected: PASS. The migration runs without error on an empty DB.

- [ ] **Step 3: Smoke-test pre-existing DB**

Copy any existing dev `zeno.db` to `/tmp/` and open it. The ALTER should add the column idempotently. If not idempotent, wrap in `IF NOT EXISTS` (SQLite ALTER does not support that; instead detect via `PRAGMA table_info` in a JS migration step).

- [ ] **Step 4: Commit**

```bash
git add packages/db/
git commit -m "chore(db): verify connector_secrets.updatedAt migration on fresh + existing DBs"
```

---

## Phase 2 — Catalog refactor: `fields[]` + `public` flag

### Task 3: Rewrite `agent/channels-catalog.json` to `fields[]` shape

**Files:**
- Modify: `agent/channels-catalog.json` — replace `secrets[]` with `fields[]`

- [ ] **Step 1: Read current contents**

Run: `cat agent/channels-catalog.json`

- [ ] **Step 2: Rewrite to new shape**

Replace with:

```json
{
  "channels": [
    {
      "id": "slack",
      "slug": "slack",
      "name": "Slack",
      "description": "Operator talks to Zeno via Slack mentions, DMs, and reactions.",
      "icon": "slack",
      "docsUrl": "https://zeno-agent.dev/channels#slack",
      "transport": "socket-mode",
      "testStrategy": "slack_auth_test",
      "fields": [
        {
          "key": "SLACK_APP_TOKEN",
          "label": "App-level token",
          "help": "Starts with xapp- · Slack admin → Your apps → Basic Information → App-Level Tokens",
          "required": true,
          "public": false,
          "inputType": "password"
        },
        {
          "key": "SLACK_BOT_TOKEN",
          "label": "Bot user OAuth token",
          "help": "Starts with xoxb- · Slack admin → Your apps → OAuth & Permissions",
          "required": true,
          "public": false,
          "inputType": "password"
        },
        {
          "key": "dm_owner_user_id",
          "label": "DM owner user id",
          "help": "Slack user id (Uxxx) — restricts DMs to this user. Optional.",
          "required": false,
          "public": true,
          "inputType": "text"
        }
      ]
    }
  ]
}
```

- [ ] **Step 3: Validate JSON**

Run: `cat agent/channels-catalog.json | jq .`
Expected: no parse errors.

- [ ] **Step 4: Commit**

```bash
git add agent/channels-catalog.json
git commit -m "feat(catalog): collapse channels-catalog secrets+config into fields[] with public flag"
```

### Task 4: Update `channels-catalog-loader.ts` to consume `fields[]`

**Files:**
- Modify: `apps/api/src/lib/channels-catalog-loader.ts:51-72` — replace `secrets[]` type with `fields[]`; add `findField(catalogId, key)` helper
- Modify: `apps/api/tests/lib/channels-catalog-loader.test.ts` — update fixture + assertions

- [ ] **Step 1: Write failing test for `fields[]` shape**

In `apps/api/tests/lib/channels-catalog-loader.test.ts`, add:

```ts
it("loads slack entry with fields[] including public dm_owner_user_id", () => {
  const catalog = loadChannelsCatalog();
  const slack = catalog.entries.find((e) => e.id === "slack");
  expect(slack).toBeDefined();
  expect(slack!.fields).toHaveLength(3);
  const appToken = slack!.fields.find((f) => f.key === "SLACK_APP_TOKEN");
  expect(appToken).toMatchObject({ required: true, public: false });
  const dmOwner = slack!.fields.find((f) => f.key === "dm_owner_user_id");
  expect(dmOwner).toMatchObject({ required: false, public: true });
});

it("findField returns field metadata for a known key", () => {
  const catalog = loadChannelsCatalog();
  const field = catalog.findField("slack", "SLACK_BOT_TOKEN");
  expect(field).toMatchObject({ required: true, public: false });
});

it("findField returns undefined for unknown key", () => {
  const catalog = loadChannelsCatalog();
  expect(catalog.findField("slack", "NOPE")).toBeUndefined();
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test channels-catalog-loader`
Expected: FAIL — `fields` undefined, `findField` does not exist.

- [ ] **Step 3: Rewrite loader types + parsing**

Replace `ChannelCatalogEntry` (lines 51-60) with:

```ts
export interface ChannelField {
  key: string;
  label: string;
  help?: string;
  required: boolean;
  public: boolean;
  inputType?: "text" | "password";
}

export interface ChannelCatalogEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  docsUrl?: string;
  transport: string;
  testStrategy: string;
  fields: ChannelField[];
}

export interface ChannelsCatalog {
  entries: ChannelCatalogEntry[];
  findField(catalogId: string, key: string): ChannelField | undefined;
}
```

In `loadChannelsCatalog()`, parse `fields` directly from the JSON, build a `Map<catalogId, Map<key, ChannelField>>` and expose `findField` reading from it.

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/api test channels-catalog-loader`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/channels-catalog-loader.ts apps/api/tests/lib/channels-catalog-loader.test.ts
git commit -m "feat(api): channels catalog loader reads fields[] with public flag + findField helper"
```

### Task 5: Update `GET /api/channels/catalog` response shape

**Files:**
- Modify: `apps/api/src/routes/channels.ts:59-77` — emit `fields` instead of `secrets`
- Modify: `apps/api/tests/routes/channels.test.ts` — update GET /catalog assertion

- [ ] **Step 1: Write failing test**

In `apps/api/tests/routes/channels.test.ts`, replace the `GET /catalog` test body to assert the new shape:

```ts
it("GET /catalog returns entries with fields[]", async () => {
  const res = await app.request("/api/channels/catalog");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.channels[0]).toHaveProperty("fields");
  expect(body.channels[0].fields[0]).toMatchObject({ key: expect.any(String), required: expect.any(Boolean), public: expect.any(Boolean) });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test -t "GET /catalog"`
Expected: FAIL — response still has `secrets`.

- [ ] **Step 3: Update route handler (channels.ts:59-77)**

Replace the projection inside `route.get('/catalog', ...)` with:

```ts
const entries = deps.channelsCatalog.entries.map((e) => ({
  id: e.id,
  slug: e.slug,
  name: e.name,
  description: e.description,
  icon: e.icon,
  iconUrl: `/api/connectors/catalog/icons/${e.icon}`,
  docsUrl: e.docsUrl,
  transport: e.transport,
  fields: e.fields.map((f) => ({
    key: f.key,
    label: f.label,
    help: f.help,
    required: f.required,
    public: f.public,
    inputType: f.inputType ?? (f.public ? "text" : "password"),
  })),
}));
return c.json({ channels: entries });
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/api test -t "GET /catalog"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/tests/routes/channels.test.ts
git commit -m "feat(api): GET /api/channels/catalog emits fields[] with public flag"
```

---

## Phase 3 — Shared `blockIfCli` middleware

### Task 6: Extract `blockIfCli` to `apps/api/src/lib/block-if-cli.ts`

**Files:**
- Create: `apps/api/src/lib/block-if-cli.ts`
- Modify: `apps/api/src/routes/connectors.ts:285-286` — import from shared module
- Modify: `apps/api/tests/lib/block-if-cli.test.ts` — focused unit tests

- [ ] **Step 1: Find all current consumers**

Run: `grep -Rn "blockIfCli" apps/ packages/`
Note paths. Expected: one definition in `connectors.ts`, zero other consumers.

- [ ] **Step 2: Write failing test for the shared module**

Create `apps/api/tests/lib/block-if-cli.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { blockIfCli } from "../../src/lib/block-if-cli";

describe("blockIfCli", () => {
  it("returns 403 mode_cli_only when writes='cli' and X-Zeno-Origin missing", async () => {
    const app = new Hono();
    app.post("/x", blockIfCli({ writes: "cli", action: "install", cli: "zeno foo install" }), (c) => c.text("ok"));
    const res = await app.request("/x", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "mode_cli_only", action: "install", cli: "zeno foo install" });
  });

  it("passes through when X-Zeno-Origin=cli", async () => {
    const app = new Hono();
    app.post("/x", blockIfCli({ writes: "cli", action: "install", cli: "zeno foo install" }), (c) => c.text("ok"));
    const res = await app.request("/x", { method: "POST", headers: { "x-zeno-origin": "cli" } });
    expect(res.status).toBe(200);
  });

  it("passes through when writes='dashboard'", async () => {
    const app = new Hono();
    app.post("/x", blockIfCli({ writes: "dashboard", action: "install", cli: "zeno foo install" }), (c) => c.text("ok"));
    const res = await app.request("/x", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run, expect FAIL (module does not exist)**

Run: `pnpm --filter @zeno/api test block-if-cli`
Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Implement the shared module**

Create `apps/api/src/lib/block-if-cli.ts`:

```ts
import type { MiddlewareHandler } from "hono";

export type ApiWriteMode = "cli" | "dashboard";

export interface BlockIfCliOpts {
  writes: ApiWriteMode;
  action: string;
  cli: string;
}

export function blockIfCli(opts: BlockIfCliOpts): MiddlewareHandler {
  return async (c, next) => {
    if (opts.writes === "cli" && c.req.header("x-zeno-origin") !== "cli") {
      return c.json({ error: "mode_cli_only", action: opts.action, cli: opts.cli }, 403);
    }
    await next();
  };
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @zeno/api test block-if-cli`
Expected: PASS (3 tests).

- [ ] **Step 6: Replace `blockIfCli` in `connectors.ts`**

In `apps/api/src/routes/connectors.ts:285-286`, delete the local definition and add `import { blockIfCli } from "@/lib/block-if-cli";` at the top.

- [ ] **Step 7: Run full api test suite**

Run: `pnpm --filter @zeno/api test`
Expected: PASS — no connector test regresses.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/block-if-cli.ts apps/api/src/routes/connectors.ts apps/api/tests/lib/block-if-cli.test.ts
git commit -m "refactor(api): extract blockIfCli to shared lib for connectors + channels reuse"
```

---

## Phase 4 — Retrofit `channels.ts` routes with gate + `isPublic` threading

### Task 7: Add `blockIfCli` gate to `PATCH /api/channels/:slug/secrets`

**Files:**
- Modify: `apps/api/src/routes/channels.ts:148-171`
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Failing test — 403 without cli header**

```ts
it("PATCH /:slug/secrets returns 403 when writes='cli' and X-Zeno-Origin missing", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack/secrets", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "merge", secrets: [{ key: "SLACK_BOT_TOKEN", value: "xoxb-new" }] }),
  });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: "mode_cli_only", action: "rotate" });
});
```

- [ ] **Step 2: Failing test — 204 with cli header**

```ts
it("PATCH /:slug/secrets returns 204 with X-Zeno-Origin=cli", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack/secrets", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-zeno-origin": "cli" },
    body: JSON.stringify({ mode: "merge", secrets: [{ key: "SLACK_BOT_TOKEN", value: "xoxb-new" }] }),
  });
  expect(res.status).toBe(204);
});
```

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test -t "PATCH /:slug/secrets"`
Expected: both new tests FAIL.

- [ ] **Step 4: Apply gate middleware on route**

In `apps/api/src/routes/channels.ts` near line 148, wrap the handler:

```ts
route.patch(
  "/:id/secrets",
  blockIfCli({ writes: deps.writes, action: "rotate", cli: "zeno channel rotate <slug>" }),
  zValidator("json", patchSecretsSchema),
  async (c) => { /* existing body */ }
);
```

Update `BuildChannelsRouteDeps` (line 31) to add `writes: ApiWriteMode`. Update the call site in `apps/api/src/server.ts` to thread `parseApiWriteMode(process.env.ZENO_API_WRITES)` through.

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @zeno/api test channels`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/src/server.ts apps/api/tests/routes/channels.test.ts
git commit -m "feat(api): gate PATCH /api/channels/:slug/secrets with blockIfCli"
```

### Task 8: Thread `isPublic` from catalog into `replaceSecrets()` call

**Files:**
- Modify: `apps/api/src/routes/channels.ts:148-171`
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Failing test — public field row stored with `isPublic=1`**

```ts
it("PATCH /:slug/secrets stores isPublic=true for catalog public fields", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  await app.request("/api/channels/slack/secrets", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-zeno-origin": "cli" },
    body: JSON.stringify({ mode: "merge", secrets: [{ key: "dm_owner_user_id", value: "U123" }] }),
  });
  const row = await selectSecretRow(connectorIdOf("slack"), "dm_owner_user_id");
  expect(row.isPublic).toBe(1);
});

it("PATCH /:slug/secrets stores isPublic=false for catalog non-public fields", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  await app.request("/api/channels/slack/secrets", {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-zeno-origin": "cli" },
    body: JSON.stringify({ mode: "merge", secrets: [{ key: "SLACK_BOT_TOKEN", value: "xoxb-new" }] }),
  });
  const row = await selectSecretRow(connectorIdOf("slack"), "SLACK_BOT_TOKEN");
  expect(row.isPublic).toBe(0);
});
```

(`selectSecretRow` is a test helper that queries `connector_secrets` directly via `db.prepare(...).get(...)`. Add it to `apps/api/tests/helpers/db.ts` if not present.)

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test -t "isPublic"`
Expected: FAIL (current handler always passes `isPublic: false`).

- [ ] **Step 3: Update handler to look up catalog**

In the PATCH handler body, before `replaceSecrets()`:

```ts
const catalogId = connector.catalogId;
const enriched = body.secrets.map((s) => {
  const field = deps.channelsCatalog.findField(catalogId, s.key);
  return { key: s.key, value: s.value, isPublic: field?.public ?? false };
});
await deps.connectors.replaceSecrets(connector.id, enriched);
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/api test -t "isPublic"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/tests/routes/channels.test.ts apps/api/tests/helpers/db.ts
git commit -m "feat(api): thread catalog field.public into replaceSecrets isPublic flag"
```

### Task 9: Add gate to `DELETE /api/channels/:slug` + update `GET /:slug` to expose `isPublic`

**Files:**
- Modify: `apps/api/src/routes/channels.ts:115-142,177-185`
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("DELETE /:slug returns 403 without X-Zeno-Origin=cli when writes='cli'", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack", { method: "DELETE" });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: "mode_cli_only", action: "uninstall" });
});

it("DELETE /:slug cascades to connector_secrets atomically", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  await app.request("/api/channels/slack", { method: "DELETE", headers: { "x-zeno-origin": "cli" } });
  const count = await selectSecretCount(connectorIdOf("slack"));
  expect(count).toBe(0);
});

it("GET /:slug exposes isPublic on each secret entry", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app); // installs SLACK_APP_TOKEN, SLACK_BOT_TOKEN, dm_owner_user_id
  const res = await app.request("/api/channels/slack");
  const body = await res.json();
  const dmOwner = body.secrets.find((s: any) => s.key === "dm_owner_user_id");
  expect(dmOwner.isPublic).toBe(true);
  expect(dmOwner.value).toBe("U123"); // unmasked
  const appToken = body.secrets.find((s: any) => s.key === "SLACK_APP_TOKEN");
  expect(appToken.isPublic).toBe(false);
  expect(appToken.value).toMatch(/^xapp-.{0,4}…[A-Za-z0-9]{4}$/); // masked last4
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test -t "DELETE /:slug" -t "GET /:slug exposes isPublic"`

- [ ] **Step 3: Apply gate on DELETE**

```ts
route.delete(
  "/:id",
  blockIfCli({ writes: deps.writes, action: "uninstall", cli: "zeno channel uninstall <slug>" }),
  async (c) => { /* existing body */ }
);
```

- [ ] **Step 4: Update `GET /:slug` projection**

Modify the secrets projection to include `isPublic: row.isPublic === 1` and conditionally mask:

```ts
secrets: secretRows.map((row) => ({
  key: row.key,
  isPublic: row.isPublic === 1,
  value: row.isPublic === 1 ? decrypt(row) : maskLast4(decrypt(row)),
})),
```

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @zeno/api test channels`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/tests/routes/channels.test.ts
git commit -m "feat(api): gate DELETE /api/channels/:slug + expose isPublic on GET /:slug"
```

---

## Phase 5 — `POST /api/channels/:slug/test` + strategy registry

### Task 10: Create `channel-test-strategies.ts` with `slack_auth_test` handler

**Files:**
- Create: `apps/api/src/lib/channel-test-strategies.ts`
- Create: `apps/api/tests/lib/channel-test-strategies.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runTestStrategy } from "../../src/lib/channel-test-strategies";

describe("slack_auth_test strategy", () => {
  it("returns passed when auth.test succeeds", async () => {
    const mockApp = { client: { auth: { test: vi.fn().mockResolvedValue({ ok: true }) } } };
    const result = await runTestStrategy("slack_auth_test", { app: mockApp as any });
    expect(result.status).toBe("passed");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns failed auth_failed when auth.test returns ok:false", async () => {
    const mockApp = { client: { auth: { test: vi.fn().mockResolvedValue({ ok: false, error: "invalid_auth" }) } } };
    const result = await runTestStrategy("slack_auth_test", { app: mockApp as any });
    expect(result).toMatchObject({ status: "failed", error: "auth_failed" });
  });

  it("returns failed timeout when auth.test exceeds 5s", async () => {
    vi.useFakeTimers();
    const mockApp = { client: { auth: { test: () => new Promise(() => {}) } } };
    const promise = runTestStrategy("slack_auth_test", { app: mockApp as any });
    vi.advanceTimersByTime(5100);
    const result = await promise;
    expect(result).toMatchObject({ status: "failed", error: "timeout" });
    vi.useRealTimers();
  });

  it("returns not_implemented for unknown strategy", async () => {
    const result = await runTestStrategy("nope_strategy", {} as any);
    expect(result).toMatchObject({ status: "failed", error: "not_implemented" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test channel-test-strategies`

- [ ] **Step 3: Implement strategy registry**

```ts
import type { App as SlackApp } from "@slack/bolt";

export interface TestResult {
  status: "passed" | "failed";
  latencyMs: number;
  error?: "auth_failed" | "timeout" | "not_implemented" | "network";
}

export interface TestContext {
  app?: SlackApp;
}

const STRATEGIES: Record<string, (ctx: TestContext) => Promise<Omit<TestResult, "latencyMs">>> = {
  slack_auth_test: async (ctx) => {
    if (!ctx.app) return { status: "failed", error: "not_implemented" };
    try {
      const res = await ctx.app.client.auth.test();
      return res.ok ? { status: "passed" } : { status: "failed", error: "auth_failed" };
    } catch (e: any) {
      return { status: "failed", error: e?.code === "ETIMEDOUT" ? "timeout" : "network" };
    }
  },
};

export async function runTestStrategy(strategy: string, ctx: TestContext): Promise<TestResult> {
  const handler = STRATEGIES[strategy];
  if (!handler) return { status: "failed", latencyMs: 0, error: "not_implemented" };
  const start = Date.now();
  const TIMEOUT_MS = 5000;
  const result = await Promise.race([
    handler(ctx),
    new Promise<Omit<TestResult, "latencyMs">>((resolve) =>
      setTimeout(() => resolve({ status: "failed", error: "timeout" }), TIMEOUT_MS),
    ),
  ]);
  return { ...result, latencyMs: Date.now() - start };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/api test channel-test-strategies`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/channel-test-strategies.ts apps/api/tests/lib/channel-test-strategies.test.ts
git commit -m "feat(api): add channel test-strategy registry with slack_auth_test"
```

### Task 11: Add `POST /api/channels/:slug/test` route

**Files:**
- Modify: `apps/api/src/routes/channels.ts` — append POST /:id/test
- Modify: `apps/api/tests/routes/channels.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("POST /:slug/test returns 403 without X-Zeno-Origin=cli when writes='cli'", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack/test", { method: "POST" });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: "mode_cli_only", action: "test" });
});

it("POST /:slug/test returns passed and updates lastVerifiedAt", async () => {
  const app = buildAppWithMode("cli");
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack/test", {
    method: "POST",
    headers: { "x-zeno-origin": "cli" },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: "passed", latencyMs: expect.any(Number) });
  const row = await selectConnectorRow("slack");
  expect(row.lastVerifiedAt).not.toBeNull();
});

it("POST /:slug/test writes lastError on failure", async () => {
  const app = buildAppWithMode("cli", { slackAuthStub: { ok: false, error: "invalid_auth" } });
  await installSlackFixture(app);
  const res = await app.request("/api/channels/slack/test", {
    method: "POST",
    headers: { "x-zeno-origin": "cli" },
  });
  const body = await res.json();
  expect(body).toMatchObject({ status: "failed", error: "auth_failed" });
  const row = await selectConnectorRow("slack");
  expect(row.lastError).toBe("auth_failed");
  expect(row.lastErrorAt).not.toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @zeno/api test -t "POST /:slug/test"`

- [ ] **Step 3: Implement route**

In `apps/api/src/routes/channels.ts` after the DELETE handler, add:

```ts
route.post(
  "/:id/test",
  blockIfCli({ writes: deps.writes, action: "test", cli: "zeno channel test <slug>" }),
  async (c) => {
    const id = c.req.param("id");
    const connector = await deps.connectors.resolveBySlugOrId(id, { kind: "channel" });
    if (!connector) return c.json({ error: "not_found" }, 404);
    const catalog = deps.channelsCatalog.entries.find((e) => e.id === connector.catalogId);
    if (!catalog) return c.json({ error: "catalog_entry_missing" }, 500);
    const ctx = await deps.buildTestContext(connector);
    const result = await runTestStrategy(catalog.testStrategy, ctx);
    if (result.status === "passed") {
      await deps.connectors.setLastVerified(connector.id, new Date().toISOString());
    } else {
      await deps.connectors.setLastError(connector.id, result.error ?? "unknown");
    }
    return c.json(result, 200);
  },
);
```

(`buildTestContext` is a dep injected from `server.ts`; for slack it instantiates an ephemeral `@slack/bolt` `App` with the stored tokens — does not call `app.start()`.)

- [ ] **Step 4: Wire `buildTestContext` in `server.ts`**

Pass an implementation that decrypts secrets and constructs the bolt App for `slack_auth_test`. Other strategies (future) take their own context shape.

- [ ] **Step 5: Run, expect PASS**

Run: `pnpm --filter @zeno/api test channels`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/channels.ts apps/api/src/server.ts apps/api/tests/routes/channels.test.ts
git commit -m "feat(api): POST /api/channels/:slug/test dispatches strategy + writes lastVerifiedAt/lastError"
```

### Task 12: Gate `POST /api/connectors` channel-branch install path

**Files:**
- Modify: `apps/api/src/routes/connectors.ts:932-1078` — set the `action: 'install'` and `cli: 'zeno channel install <type>'` when payload has `kind: 'channel'`
- Modify: `apps/api/tests/routes/connectors.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("POST /api/connectors with kind='channel' returns 403 mode_cli_only when no X-Zeno-Origin", async () => {
  const app = buildAppWithMode("cli");
  const res = await app.request("/api/connectors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "channel", catalogId: "slack", secrets: [...] }),
  });
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: "mode_cli_only", action: "install", cli: expect.stringContaining("zeno channel install") });
});
```

- [ ] **Step 2: Run, expect FAIL or wrong cli string**

- [ ] **Step 3: Branch the middleware dynamically**

Replace the existing top-level `blockIfCli(...)` middleware on `POST /` with a wrapper that inspects body kind:

```ts
route.post(
  "/",
  zValidator("json", createConnectorSchema),
  async (c, next) => {
    const body = c.req.valid("json");
    const cli = body.kind === "channel"
      ? "zeno channel install <type>"
      : "zeno connector install <type>";
    const gate = blockIfCli({ writes: deps.writes, action: "install", cli });
    return gate(c, next);
  },
  /* existing handler */
);
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm --filter @zeno/api test connectors`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/connectors.ts apps/api/tests/routes/connectors.test.ts
git commit -m "feat(api): emit zeno channel install CLI hint for channel-kind install on connectors POST"
```

---

## Phase 6 — `ChannelManager` class

### Task 13: Scaffold `ChannelManager` with `getActiveChannel()` + `NoopChannel` fallback

**Files:**
- Create: `apps/worker/src/channels/manager.ts`
- Create: `apps/worker/tests/channels/manager.test.ts`

- [ ] **Step 1: Failing tests — getActiveChannel returns NoopChannel when empty**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { ChannelManager } from "../../src/channels/manager";
import { NoopChannel } from "../../src/channels/noop";
import type { ConnectorRepo } from "@zeno/db/runtime";

const fakeRepo = (rows: any[] = []): ConnectorRepo => ({
  listByKind: async (_kind: string) => rows,
  // Other methods (create/replaceSecrets/etc.) are not exercised by the manager's reconcile loop;
  // cast to any to satisfy the structural type without supplying every member.
} as any);

describe("ChannelManager", () => {
  const noopBuildAdapter = () => ({ start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }) as any;
  const noopHandler = () => Promise.resolve();

  it("getActiveChannel returns NoopChannel when no channels installed", async () => {
    const mgr = new ChannelManager({ repo: fakeRepo([]), logger: console as any, pollIntervalMs: 0, buildAdapter: noopBuildAdapter, onMessage: noopHandler });
    await mgr.start();
    expect(mgr.getActiveChannel()).toBeInstanceOf(NoopChannel);
    await mgr.stop();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement scaffold**

```ts
import type { Logger } from "pino";
import type { ConnectorRepo } from "@zeno/db/runtime";
import type { Channel } from "./types";
import { NoopChannel } from "./noop";

import type { MessageHandler } from "./types";

export interface ChannelManagerDeps {
  repo: ConnectorRepo;
  logger: Logger;
  pollIntervalMs?: number; // default 2000
  buildAdapter: (row: ChannelRow) => Channel;
  onMessage: MessageHandler; // registered on every adapter.start()
}

interface ChannelRow {
  id: string;
  slug: string;
  catalogId: string;
  updatedAt: string;
  secretsMaxUpdatedAt: string;
}

interface RunningEntry {
  row: ChannelRow;
  adapter: Channel;
}

export class ChannelManager {
  private running = new Map<string, RunningEntry>();
  private noop: NoopChannel;
  private isReconciling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: ChannelManagerDeps) {
    this.noop = new NoopChannel(deps.logger);
  }

  async start(): Promise<void> {
    await this.reconcile();
    const interval = this.deps.pollIntervalMs ?? 2000;
    if (interval > 0) {
      this.pollTimer = setInterval(() => this.reconcile().catch(() => {}), interval);
    }
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const entry of this.running.values()) {
      await entry.adapter.stop();
      this.deps.logger.info({ slug: entry.row.slug }, "channel_adapter_stopped");
    }
    this.running.clear();
  }

  getActiveChannel(): Channel {
    const first = this.running.values().next().value;
    return first ? first.adapter : this.noop;
  }

  private async reconcile(): Promise<void> {
    if (this.isReconciling) return;
    this.isReconciling = true;
    try {
      const rows = (await this.deps.repo.listByKind("channel"))
        .filter((r) => r.status === "enabled")
        .map((r) => ({ id: r.id, slug: r.slug, catalogId: r.catalogId, updatedAt: r.updatedAt, secretsMaxUpdatedAt: r.secretsMaxUpdatedAt ?? "" }));
      // Stop adapters whose rows vanished
      for (const [id, entry] of this.running) {
        const fresh = rows.find((r) => r.id === id);
        if (!fresh) {
          await entry.adapter.stop();
          this.deps.logger.info({ slug: entry.row.slug }, "channel_adapter_stopped");
          this.running.delete(id);
        }
      }
      // Start/replace adapters whose rows are new or whose timestamps moved
      for (const row of rows) {
        const existing = this.running.get(row.id);
        const changed = !existing || existing.row.updatedAt !== row.updatedAt || existing.row.secretsMaxUpdatedAt !== row.secretsMaxUpdatedAt;
        if (changed) {
          if (existing) {
            await existing.adapter.stop();
            this.deps.logger.info({ slug: row.slug }, "channel_adapter_stopped");
          }
          const adapter = this.deps.buildAdapter(row);
          await adapter.start(this.deps.onMessage);
          this.running.set(row.id, { row, adapter });
          this.deps.logger.info({ slug: row.slug }, "channel_adapter_started");
        }
      }
    } finally {
      this.isReconciling = false;
    }
  }
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/channels/manager.ts apps/worker/tests/channels/manager.test.ts
git commit -m "feat(worker): ChannelManager scaffold with getActiveChannel + NoopChannel fallback"
```

### Task 14: Reconcile loop spawns adapter on install

**Files:** same as Task 13.

- [ ] **Step 1: Failing test**

```ts
it("reconcile spawns adapter when row appears", async () => {
  let buildCalls = 0;
  const builtAdapter = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) } as any;
  const mgr = new ChannelManager({
    repo: fakeRepo([{ id: "c1", slug: "slack", catalogId: "slack", status: "enabled", updatedAt: "t1", secretsMaxUpdatedAt: "t1" }]),
    logger: console as any, pollIntervalMs: 0,
    buildAdapter: () => { buildCalls++; return builtAdapter; },
    onMessage: noopHandler,
  });
  await mgr.start();
  expect(buildCalls).toBe(1);
  expect(builtAdapter.start).toHaveBeenCalled();
  expect(mgr.getActiveChannel()).toBe(builtAdapter);
});
```

- [ ] **Step 2: Run, expect PASS (existing impl already covers this)**

- [ ] **Step 3: Add idle-noop assertion**

```ts
it("idle reconcile does not re-spawn unchanged row", async () => {
  let buildCalls = 0;
  const builtAdapter = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) } as any;
  const repo = fakeRepo([{ id: "c1", slug: "slack", catalogId: "slack", status: "enabled", updatedAt: "t1", secretsMaxUpdatedAt: "t1" }]);
  const mgr = new ChannelManager({ repo, logger: console as any, pollIntervalMs: 0, buildAdapter: () => { buildCalls++; return builtAdapter; }, onMessage: noopHandler });
  await mgr.start();
  await (mgr as any).reconcile();
  await (mgr as any).reconcile();
  expect(buildCalls).toBe(1);
});
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/worker/tests/channels/manager.test.ts
git commit -m "test(worker): ChannelManager spawns adapter once + no idle re-spawn"
```

### Task 15: Reconcile loop restarts adapter on `secretsMaxUpdatedAt` change

**Files:** same.

- [ ] **Step 1: Failing test**

```ts
it("reconcile restarts adapter when secretsMaxUpdatedAt advances", async () => {
  const rows = [{ id: "c1", slug: "slack", catalogId: "slack", status: "enabled", updatedAt: "t1", secretsMaxUpdatedAt: "s1" }];
  const builtAdapters: any[] = [];
  const buildAdapter = () => { const a = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn().mockResolvedValue(undefined) }; builtAdapters.push(a); return a as any; };
  const mgr = new ChannelManager({
    repo: { listByKind: async () => rows } as any,
    logger: console as any, pollIntervalMs: 0, buildAdapter, onMessage: noopHandler,
  });
  await mgr.start();
  expect(builtAdapters).toHaveLength(1);
  rows[0].secretsMaxUpdatedAt = "s2";
  await (mgr as any).reconcile();
  expect(builtAdapters).toHaveLength(2);
  expect(builtAdapters[0].stop).toHaveBeenCalled();
  expect(builtAdapters[1].start).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, expect PASS (impl already covers)**

- [ ] **Step 3: Concurrent reconcile guard**

```ts
it("concurrent reconcile invocations are coalesced (isReconciling guard)", async () => {
  let listCalls = 0;
  const repo = { listByKind: async () => { listCalls++; await new Promise((r) => setTimeout(r, 20)); return []; } } as any;
  const mgr = new ChannelManager({ repo, logger: console as any, pollIntervalMs: 0, buildAdapter: () => null as any, onMessage: noopHandler });
  await Promise.all([(mgr as any).reconcile(), (mgr as any).reconcile(), (mgr as any).reconcile()]);
  expect(listCalls).toBe(1);
});
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/worker/tests/channels/manager.test.ts
git commit -m "test(worker): ChannelManager restart-on-secret-bump + concurrent reconcile guard"
```

### Task 16: Add repo helper `listByKind` returns `secretsMaxUpdatedAt`

**Files:**
- Modify: `packages/db/src/runtime/repos/connectors.ts` — `listByKind('channel')` aggregates `MAX(updated_at)` from `connector_secrets`
- Modify: `packages/db/tests/repos/connectors.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("listByKind('channel') returns secretsMaxUpdatedAt per row", async () => {
  const repo = makeRepo();
  await repo.create({ id: "c1", slug: "slack", kind: "channel", catalogId: "slack", displayName: "Slack" });
  await repo.replaceSecrets("c1", [{ key: "K1", value: "v1" }]);
  await new Promise((r) => setTimeout(r, 5));
  await repo.replaceSecrets("c1", [{ key: "K1", value: "v2" }]);
  const rows = await repo.listByKind("channel");
  expect(rows[0].secretsMaxUpdatedAt).toBeTruthy();
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Update `listByKind` SQL**

```sql
SELECT
  c.*,
  (SELECT MAX(s.updated_at) FROM connector_secrets s WHERE s.connector_id = c.id) AS secrets_max_updated_at
FROM connectors c
WHERE c.kind = ?
```

Add `secretsMaxUpdatedAt: string | null` to the row shape returned.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/runtime/repos/connectors.ts packages/db/tests/repos/connectors.test.ts
git commit -m "feat(db): listByKind returns secretsMaxUpdatedAt for hot-reload diffing"
```

---

## Phase 7 — Wire `ChannelManager` into worker boot

### Task 17: Replace `resolveSlackCredentials` block with `ChannelManager`

**Files:**
- Modify: `apps/worker/src/index.ts:490-502`
- Delete: `apps/worker/src/channels/slack/resolve-credentials.ts`
- Delete: `apps/worker/tests/channels/slack/resolve-credentials.test.ts` (if exists)

- [ ] **Step 1: Audit imports of `resolveSlackCredentials`**

Run: `grep -Rn "resolveSlackCredentials" apps/ packages/`
Expected: only `apps/worker/src/index.ts:495`.

- [ ] **Step 2: Replace the block**

In `apps/worker/src/index.ts`, replace lines 490–502 with:

```ts
const channelManager = new ChannelManager({
  repo: connectors,
  logger,
  onMessage: agentOnMessage, // same handler that was previously passed to SlackChannel.start()
  buildAdapter: (row) => {
    if (row.catalogId !== "slack") {
      throw new Error(`No adapter for catalog ${row.catalogId}`);
    }
    const secrets = connectors.getSecretsMap(row.id);
    return new SlackChannel({
      appToken: secrets.get("SLACK_APP_TOKEN")!,
      botToken: secrets.get("SLACK_BOT_TOKEN")!,
      dmOwnerUserId: secrets.get("dm_owner_user_id"),
      workspaceDir: config.workspaceDir,
    });
  },
});
await channelManager.start();
```

(`agentOnMessage` is the function previously passed to `slack.start(...)` at the old call site — the agent-core message dispatcher. The manager registers it on every adapter it spawns.)

Replace `slack` references below (line ~496) with `channelManager.getActiveChannel()` calls at use sites. For the cron-runner / agent-orchestrator deps, pass a getter:

```ts
const gatedDeps = {
  /* … */
  getChannel: () => channelManager.getActiveChannel(),
};
```

(Refactor downstream consumers to call `deps.getChannel().send(...)` instead of holding a `channel` reference.)

- [ ] **Step 3: Delete `resolve-credentials.ts`**

```bash
git rm apps/worker/src/channels/slack/resolve-credentials.ts
git rm -f apps/worker/tests/channels/slack/resolve-credentials.test.ts || true
```

- [ ] **Step 4: Type-check + unit test pass**

Run: `pnpm --filter @zeno/worker typecheck && pnpm --filter @zeno/worker test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/ packages/db/
git commit -m "feat(worker): replace one-shot slack resolver with ChannelManager hot-reload"
```

### Task 18: SIGTERM stops every adapter

**Files:**
- Modify: `apps/worker/src/index.ts` — hook `channelManager.stop()` into the shutdown sequence

- [ ] **Step 1: Failing test (integration)**

Add to `apps/worker/tests/boot.test.ts`:

```ts
it("SIGTERM stops every running channel adapter exactly once", async () => {
  const { manager, logger } = await bootWorkerWithSlackInstalled();
  const stopSpy = vi.spyOn(manager["running"].values().next().value.adapter, "stop");
  process.emit("SIGTERM");
  await new Promise((r) => setTimeout(r, 50));
  expect(stopSpy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Wire `channelManager.stop()` in shutdown**

In the existing `process.on('SIGTERM', …)` handler in `apps/worker/src/index.ts`, add:

```ts
await channelManager.stop();
```

before the final `process.exit(0)`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/index.ts apps/worker/tests/boot.test.ts
git commit -m "feat(worker): ChannelManager.stop() on SIGTERM"
```

---

## Phase 8 — CLI `zeno channel` subtree

### Task 19: Add JSON output types

**Files:**
- Modify: `apps/cli/src/types/json-output.ts`

- [ ] **Step 1: Append types**

```ts
export interface ChannelListItem {
  slug: string;
  catalogId: string;
  status: "enabled" | "disabled";
  lastEventAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface ChannelShowJson {
  id: string;
  slug: string;
  catalogId: string;
  status: "enabled" | "disabled";
  fields: Array<{ key: string; isPublic: boolean; value: string }>;
  lastEventAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

export interface ChannelCatalogJson {
  channels: Array<{
    id: string;
    slug: string;
    name: string;
    description: string;
    icon: string;
    docsUrl?: string;
    fields: Array<{ key: string; label: string; required: boolean; public: boolean; inputType?: string }>;
    installed: boolean;
  }>;
}

export interface ChannelTestJson {
  status: "passed" | "failed";
  latencyMs: number;
  error?: string;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @zeno/cli typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/cli/src/types/json-output.ts
git commit -m "feat(cli): json-output types for channel list/show/catalog/test"
```

### Task 20: `zeno channel` parent command + register in `index.ts`

**Files:**
- Create: `apps/cli/src/commands/channel.ts`
- Modify: `apps/cli/src/index.ts` — register `channel` in subCommands

- [ ] **Step 1: Create `channel.ts`**

```ts
import { defineCommand } from "citty";
import list from "./channel-list.js";
import show from "./channel-show.js";
import install from "./channel-install.js";
import configure from "./channel-configure.js";
import test from "./channel-test.js";
import rotate from "./channel-rotate.js";
import uninstall from "./channel-uninstall.js";

export default defineCommand({
  meta: { name: "channel", description: "Manage channels (slack, etc.) in this profile." },
  subCommands: { list, show, install, configure, test, rotate, uninstall },
});
```

- [ ] **Step 2: Register in `apps/cli/src/index.ts:22-35`**

Add `channel: () => import("./commands/channel.js").then((m) => m.default)` to the subCommands map.

- [ ] **Step 3: Run smoke**

Run: `pnpm --filter @zeno/cli build && node apps/cli/dist/index.js channel --help`
Expected: prints subcommand list (after Task 21+ lands; for now expect "Cannot find module ./channel-list" — that's fine, scaffold).

- [ ] **Step 4: Skip commit until Task 27 (verbs implemented)**

### Task 21: `zeno channel list`

**Files:**
- Create: `apps/cli/src/commands/channel-list.ts`
- Create: `apps/cli/tests/commands/channel-list.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("zeno channel list --json emits ChannelListItem[]", async () => {
  const { stdout, exitCode } = await runCli(["channel", "list", "--json", "--quiet"], { mockApi: { "/api/channels": [/* slack installed */] } });
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed[0]).toMatchObject({ slug: "slack", status: "enabled" });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement command**

```ts
import { defineCommand } from "citty";
import { ApiClientImpl } from "../lib/api-client.js";
import { resolveProfile, resolveProfileApiUrl } from "../lib/profile-resolver.js";
import { ok, info, setQuiet } from "../lib/output.js";

export default defineCommand({
  meta: { name: "list", description: "List installed channels in this profile." },
  args: {
    profile: { type: "string", description: "Profile name" },
    json: { type: "boolean", description: "Emit JSON to stdout" },
    quiet: { type: "boolean", description: "Strip ANSI + headers; errors still go to stderr" },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile);
    const api = new ApiClientImpl(await resolveProfileApiUrl(profile));
    const rows = await api.get<ChannelListItem[]>("/api/channels");
    if (args.json) { process.stdout.write(JSON.stringify(rows)); return; }
    // table render
    for (const r of rows) {
      info(`${r.slug.padEnd(12)} ${r.status.padEnd(10)} ${r.lastEventAt ?? "—"}`);
    }
    ok(`${rows.length} channel(s)`);
  },
});
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit (deferred to Task 27 — full subtree)**

### Task 22: `zeno channel show <slug>`

**Files:**
- Create: `apps/cli/src/commands/channel-show.ts`
- Create: `apps/cli/tests/commands/channel-show.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("zeno channel show slack masks isPublic=false fields", async () => {
  const { stdout } = await runCli(["channel", "show", "slack", "--json", "--quiet"], { mockApi: { "/api/channels/slack": SLACK_DETAIL_FIXTURE } });
  const parsed = JSON.parse(stdout);
  const appToken = parsed.fields.find((f: any) => f.key === "SLACK_APP_TOKEN");
  expect(appToken.value).toMatch(/…\w{4}$/);
  const dm = parsed.fields.find((f: any) => f.key === "dm_owner_user_id");
  expect(dm.value).toBe("U123"); // unmasked
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement command**

Mirror `connector-show.ts`. Positional `<slug>` is the channel slug. In TTY without positional, open a picker. The API response already projects masked vs unmasked correctly (Task 9).

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit deferred to Task 27**

### Task 23: `zeno channel install <type>`

**Files:**
- Create: `apps/cli/src/commands/channel-install.ts`
- Create: `apps/cli/tests/commands/channel-install.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("zeno channel install in TTY with no positional opens picker", async () => {
  const { stdout } = await runCliTTY(["channel", "install"], { mockApi: { "/api/channels/catalog": SLACK_CATALOG_FIXTURE }, keystrokes: ["\r"] });
  expect(stdout).toContain("? Select channel to install");
});

it("zeno channel install in non-TTY without positional exits 1", async () => {
  const { exitCode, stderr } = await runCli(["channel", "install"], { tty: false });
  expect(exitCode).toBe(1);
  expect(stderr).toContain("usage: zeno channel install <type>");
});

it("zeno channel install slack with --secret flags exits 0 without prompts", async () => {
  const { exitCode, stdout } = await runCli([
    "channel", "install", "slack",
    "--secret", "SLACK_APP_TOKEN=xapp-x",
    "--secret", "SLACK_BOT_TOKEN=xoxb-x",
    "--quiet",
  ], { mockApi: { "/api/channels/catalog": SLACK_CATALOG_FIXTURE, "/api/connectors": { id: "c1", slug: "slack" } } });
  expect(exitCode).toBe(0);
});

it("second install of same channel exits 0 with 'already installed' message", async () => {
  // mock returns 409 already_installed
  const { exitCode, stderr } = await runCli([
    "channel", "install", "slack",
    "--secret", "SLACK_APP_TOKEN=xapp-x",
    "--secret", "SLACK_BOT_TOKEN=xoxb-x",
  ], { mockApi: { "/api/channels/catalog": SLACK_CATALOG_FIXTURE, "/api/connectors": { status: 409, body: { error: "already_installed" } } } });
  expect(exitCode).toBe(0);
  expect(stderr).toContain("slack already installed");
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement command**

Skeleton:

```ts
export default defineCommand({
  meta: { name: "install", description: "Install a channel from the catalog." },
  args: {
    type: { type: "positional", required: false },
    profile: { type: "string" },
    secret: { type: "string", multiple: true, description: "KEY=VALUE pair; can repeat" },
    quiet: { type: "boolean" },
  },
  async run({ args }) {
    if (args.quiet) setQuiet(true);
    const profile = await resolveProfile(args.profile);
    const api = new ApiClientImpl(await resolveProfileApiUrl(profile));
    const catalog = await api.get<ChannelCatalogJson>("/api/channels/catalog");
    let type = args.type as string | undefined;
    if (!type) {
      if (!process.stdout.isTTY) { err("usage: zeno channel install <type>"); return process.exit(1); }
      type = await picker(catalog.channels.map((c) => ({ value: c.id, label: c.name })), "Select channel to install");
    }
    const entry = catalog.channels.find((c) => c.id === type);
    if (!entry) { err(`unknown channel type: ${type}`); return process.exit(1); }
    const provided = new Map<string,string>((args.secret as string[]|undefined ?? []).map((s) => { const [k,v] = s.split("="); return [k, v]; }));
    const secretsBody: { key: string; value: string }[] = [];
    for (const field of entry.fields) {
      let value = provided.get(field.key);
      if (!value && field.required) {
        if (!process.stdout.isTTY) { err(`missing required field: ${field.key}`); return process.exit(1); }
        value = field.public ? await promptVisible(field.label) : await promptHidden(field.label);
      }
      if (value) secretsBody.push({ key: field.key, value });
    }
    const res = await api.post("/api/connectors", { kind: "channel", catalogId: type, secrets: secretsBody });
    if (res.status === 409) { err(`${type} already installed`); return; }
    if (!res.ok) { err(`install failed: ${res.statusText}`); return process.exit(1); }
    ok(`${type} · installed`);
  },
});
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit deferred to Task 27**

### Task 24: `zeno channel configure <slug>`

**Files:**
- Create: `apps/cli/src/commands/channel-configure.ts`
- Create: `apps/cli/tests/commands/channel-configure.test.ts`

- [ ] **Step 1: Failing test**

```ts
it("zeno channel configure slack --dm-owner-user-id U123 sends merge PATCH", async () => {
  const requestSpy = vi.fn();
  await runCli(["channel", "configure", "slack", "--dm-owner-user-id", "U123", "--quiet"], { mockApi: { "/api/channels/catalog": SLACK_CATALOG, "/api/channels/slack/secrets": { spy: requestSpy, response: 204 } } });
  expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
    method: "PATCH",
    body: { mode: "merge", secrets: [{ key: "dm_owner_user_id", value: "U123" }] },
  }));
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement command**

Read catalog, find every `public: true` field, expose each as a kebab-cased citty flag (e.g. `dm_owner_user_id` → `--dm-owner-user-id`). Build the PATCH body from passed flags only. Submit with mode `merge`.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit deferred to Task 27**

### Task 25: `zeno channel test <slug>`

**Files:**
- Create: `apps/cli/src/commands/channel-test.ts`
- Create: `apps/cli/tests/commands/channel-test.test.ts`

- [ ] **Step 1: Failing tests**

```ts
it("zeno channel test slack passing prints 'passed · Xms' and exits 0", async () => {
  const { exitCode, stdout } = await runCli(["channel", "test", "slack", "--quiet"], { mockApi: { "/api/channels/slack/test": { status: "passed", latencyMs: 84 } } });
  expect(exitCode).toBe(0);
  expect(stdout).toMatch(/passed · 84ms/);
});

it("zeno channel test slack failing auth_failed exits 1", async () => {
  const { exitCode, stdout } = await runCli(["channel", "test", "slack", "--quiet"], { mockApi: { "/api/channels/slack/test": { status: "failed", latencyMs: 50, error: "auth_failed" } } });
  expect(exitCode).toBe(1);
  expect(stdout).toContain("failed · auth_failed");
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement command**

```ts
const res = await api.post<ChannelTestJson>(`/api/channels/${slug}/test`, {});
if (res.status === "passed") {
  ok(`passed · ${res.latencyMs}ms`);
  return;
}
err(`failed · ${res.error}`);
process.exit(1);
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit deferred to Task 27**

### Task 26: `zeno channel rotate <slug>` + `zeno channel uninstall <slug>`

**Files:**
- Create: `apps/cli/src/commands/channel-rotate.ts`
- Create: `apps/cli/src/commands/channel-uninstall.ts`
- Create: `apps/cli/tests/commands/channel-rotate.test.ts`
- Create: `apps/cli/tests/commands/channel-uninstall.test.ts`

- [ ] **Step 1: Failing tests for rotate**

```ts
it("zeno channel rotate slack prompts both required non-public fields then PATCH", async () => {
  const reqSpy = vi.fn();
  await runCliTTY(["channel", "rotate", "slack"], {
    mockApi: { "/api/channels/catalog": SLACK_CATALOG, "/api/channels/slack/secrets": { spy: reqSpy, response: 204 } },
    promptHiddenReplies: ["xapp-new", "xoxb-new"],
  });
  expect(reqSpy).toHaveBeenCalledWith(expect.objectContaining({
    method: "PATCH",
    body: { mode: "merge", secrets: [
      { key: "SLACK_APP_TOKEN", value: "xapp-new" },
      { key: "SLACK_BOT_TOKEN", value: "xoxb-new" },
    ]},
  }));
});

it("zeno channel rotate immediately calls /test after PATCH", async () => {
  const testSpy = vi.fn();
  await runCliTTY(["channel", "rotate", "slack"], {
    mockApi: { "/api/channels/catalog": SLACK_CATALOG, "/api/channels/slack/secrets": 204, "/api/channels/slack/test": { spy: testSpy, response: { status: "passed", latencyMs: 50 } } },
    promptHiddenReplies: ["xapp-new", "xoxb-new"],
  });
  expect(testSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Failing tests for uninstall**

```ts
it("zeno channel uninstall slack in non-TTY without --yes exits 1", async () => {
  const { exitCode, stderr } = await runCli(["channel", "uninstall", "slack"], { tty: false });
  expect(exitCode).toBe(1);
  expect(stderr).toContain("destructive operation requires --yes");
});

it("zeno channel uninstall slack --yes exits 0 + DELETE called", async () => {
  const reqSpy = vi.fn();
  const { exitCode } = await runCli(["channel", "uninstall", "slack", "--yes", "--quiet"], { mockApi: { "/api/channels/slack": { method: "DELETE", spy: reqSpy, response: 204 } } });
  expect(exitCode).toBe(0);
  expect(reqSpy).toHaveBeenCalledWith(expect.objectContaining({ method: "DELETE" }));
});

it("zeno channel uninstall in TTY answering 'n' exits 0 without DELETE", async () => {
  const reqSpy = vi.fn();
  const { exitCode } = await runCliTTY(["channel", "uninstall", "slack"], { confirmReply: "n", mockApi: { "/api/channels/slack": { method: "DELETE", spy: reqSpy } } });
  expect(exitCode).toBe(0);
  expect(reqSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run, expect FAIL**

- [ ] **Step 4: Implement rotate**

```ts
const catalog = await api.get<ChannelCatalogJson>("/api/channels/catalog");
const entry = catalog.channels.find((c) => c.slug === slug)!;
const secrets: {key:string,value:string}[] = [];
for (const field of entry.fields) {
  if (!field.required || field.public) continue;
  const value = await promptHidden(`${field.label} (${field.key})`);
  secrets.push({ key: field.key, value });
}
await api.patch(`/api/channels/${slug}/secrets`, { mode: "merge", secrets });
const test = await api.post<ChannelTestJson>(`/api/channels/${slug}/test`, {});
if (test.status === "passed") ok(`${slug} · rotated · ${test.latencyMs}ms`);
else err(`${slug} · rotated · test failed · ${test.error}`);
```

- [ ] **Step 5: Implement uninstall**

```ts
if (!args.yes) {
  if (!process.stdout.isTTY) { err("destructive operation requires --yes in non-interactive mode"); return process.exit(1); }
  const ans = await confirm(`uninstall channel '${slug}'? (y/N)`);
  if (!ans) return;
}
await api.delete(`/api/channels/${slug}`);
ok(`${slug} · uninstalled`);
```

- [ ] **Step 6: Run, expect PASS**

- [ ] **Step 7: Commit deferred to Task 27**

### Task 27: Wire all channel verbs + integration test + commit

**Files:**
- Verify all 8 files exist; run build + full CLI tests

- [ ] **Step 1: Run typecheck**

Run: `pnpm --filter @zeno/cli typecheck`
Expected: PASS.

- [ ] **Step 2: Run full CLI test suite**

Run: `pnpm --filter @zeno/cli test`
Expected: PASS.

- [ ] **Step 3: Smoke `zeno channel --help`**

Run: `pnpm --filter @zeno/cli build && node apps/cli/dist/index.js channel --help`
Expected: prints `list / show / install / configure / test / rotate / uninstall`.

- [ ] **Step 4: Commit the whole subtree**

```bash
git add apps/cli/src/commands/channel*.ts apps/cli/src/index.ts apps/cli/tests/commands/channel-*.test.ts
git commit -m "feat(cli): zeno channel subtree (list/show/install/configure/test/rotate/uninstall)"
```

---

## Phase 9 — Dashboard `/channels` read-only rewrite

### Task 28: Drop mutation hooks from `use-channels.ts`

**Files:**
- Modify: `apps/dashboard/src/lib/use-channels.ts:1-60`

- [ ] **Step 1: Audit usages of mutation hooks**

Run: `grep -Rn "useInstallChannel\|useConfigureChannel\|useRotateChannel\|useUninstallChannel" apps/dashboard/`
Note paths. Phase 9 deletes the channel form page — these hooks will have no consumers after Task 29.

- [ ] **Step 2: Remove mutation hooks**

Delete every mutation hook export. Keep:

```ts
export function useChannels(opts?: { poll?: "fast" | "normal" }) { /* refetchInterval: opts?.poll==="fast" ? 2000 : 30000 */ }
export function useChannelsCatalog() { /* one-shot */ }
export function useMode() { /* /api/mode */ }
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @zeno/dashboard typecheck`
Expected: PASS only after Task 29 lands. Skip commit; bundle with Task 29.

### Task 29: Rewrite `channels.index.tsx` as read-only

**Files:**
- Modify: `apps/dashboard/src/routes/_authed/channels.index.tsx:32-60`
- Create: `apps/dashboard/src/components/channels/channel-row.tsx`
- Create: `apps/dashboard/src/components/channels/channel-disconnected-banner.tsx`

- [ ] **Step 1: Replace route body**

Use the Paper artboards CH1/CH2/CH3 + `M-ch · CommandModal` variants. Pseudo:

```tsx
export const Route = createFileRoute("/_authed/channels/")({
  component: ChannelsPage,
});

function ChannelsPage() {
  const { data: mode } = useMode();
  const { data: catalog } = useChannelsCatalog();
  const { data: rows } = useChannels({ poll: "normal" });
  const slackError = rows?.find((r) => r.slug === "slack")?.lastError;
  return (
    <PageShell title="channels" eyebrow="CHANNELS">
      {slackError && <ChannelDisconnectedBanner error={slackError} />}
      <ChannelsTable>
        {catalog?.channels.map((cat) => (
          <ChannelRow key={cat.id} catalog={cat} installed={rows?.find((r) => r.slug === cat.slug)} mode={mode} />
        ))}
      </ChannelsTable>
      <CatalogFooter count={catalog?.channels.length ?? 0} />
    </PageShell>
  );
}
```

- [ ] **Step 2: Implement `ChannelRow`**

Render row per Paper CH1 row layout. Action chips open `<CommandModal>` with the appropriate command string. No `useMutation` calls.

- [ ] **Step 3: Implement `ChannelDisconnectedBanner`**

Render the red CH3 banner. Single `ROTATE TOKEN` chip → `<CommandModal>` with `zeno channel rotate slack`.

- [ ] **Step 4: Run typecheck + test**

Run: `pnpm --filter @zeno/dashboard typecheck && pnpm --filter @zeno/dashboard test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/
git commit -m "feat(dashboard): rewrite /channels as read-only Paper CH1/CH2/CH3"
```

### Task 30: Visual smoke

**Files:** none.

- [ ] **Step 1: Start a profile + visit**

```bash
zeno start personal
zeno open personal
# navigate to /channels
```

Verify:
- No submit buttons; every action chip opens CommandModal.
- Disconnected state renders red banner (manually corrupt Slack token first).
- Footer reads `catalog · agent/channels-catalog.json · 1 entry · pluggable surface`.

- [ ] **Step 2: Take screenshots, drop under `vault/specs/2026-05-11-channels-cli-first/artboards/exports/`**

- [ ] **Step 3: Commit screenshots**

```bash
git add vault/specs/2026-05-11-channels-cli-first/artboards/
git commit -m "docs(spec): add /channels read-only screenshots"
```

### Task 31: Delete obsolete dashboard channel-form code

**Files:**
- Delete any `apps/dashboard/src/components/channels/install-channel-form.tsx` / `edit-channel-secrets-form.tsx` if present
- Delete `apps/dashboard/src/routes/_authed/channels.$slug.tsx` if exists (channels do not have a detail page after rewrite)

- [ ] **Step 1: Audit**

Run: `git ls-files apps/dashboard | grep channels`
Identify any legacy form-driven UI; delete + adjust imports.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(dashboard): remove obsolete channel form components"
```

---

## Phase 10 — apps/docs Channels CLI section + concept page

### Task 32: Add `Channels` section to CLI reference

**Files:**
- Modify: `apps/docs/content/docs/cli.mdx`

- [ ] **Step 1: Add imports + section**

At the top with other imports, add:

```mdx
import ChannelFlags from '@/generated/cli-flags/channel.mdx';
import ChannelListFlags from '@/generated/cli-flags/channel-list.mdx';
import ChannelShowFlags from '@/generated/cli-flags/channel-show.mdx';
import ChannelInstallFlags from '@/generated/cli-flags/channel-install.mdx';
import ChannelConfigureFlags from '@/generated/cli-flags/channel-configure.mdx';
import ChannelTestFlags from '@/generated/cli-flags/channel-test.mdx';
import ChannelRotateFlags from '@/generated/cli-flags/channel-rotate.mdx';
import ChannelUninstallFlags from '@/generated/cli-flags/channel-uninstall.mdx';
```

Add a `## Channels` section after `## Connector management`, with one subsection per verb. Each subsection has a brief prose paragraph + a code-block example + the `<…Flags />` import.

- [ ] **Step 2: Run docs:generate**

Run: `pnpm --filter @zeno/docs docs:generate`
Expected: `apps/docs/src/generated/cli-flags/channel-*.mdx` files materialise.

- [ ] **Step 3: Build docs**

Run: `pnpm --filter @zeno/docs build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/docs/content/docs/cli.mdx
git commit -m "docs(cli): add Channels reference section (auto-generated flag tables)"
```

### Task 33: Update `channels.mdx` concept page

**Files:**
- Modify: `apps/docs/content/docs/channels.mdx`

- [ ] **Step 1: Rewrite concept page**

Cover:
- Channel vs Connector vs Backend (one paragraph each)
- Single-instance constraint (one paragraph)
- 7 verbs with one-line descriptions
- Hot-reload via `ChannelManager` (one paragraph, 2 s poll)
- `ZENO_API_WRITES=cli` gate (one paragraph; link to CLI section)
- Catalog file location + the `fields[]` shape

- [ ] **Step 2: Build docs, verify rendering**

Run: `pnpm --filter @zeno/docs dev`
Open `http://localhost:4242/channels`. Verify content + links.

- [ ] **Step 3: Commit**

```bash
git add apps/docs/content/docs/channels.mdx
git commit -m "docs(channels): rewrite concept page for CLI-first model"
```

---

## Phase 11 — Manual E2E rehearsal (real Slack)

### Task 34: Run S1–S4 against live profile container

**Files:** none (manual rehearsal).

- [ ] **Step 1: Fresh profile + container**

```bash
zeno profile create rehearsal --owner "Rehearsal"
zeno start rehearsal
```

- [ ] **Step 2: S1 — clean install**

```bash
zeno channel install   # picker shows slack → confirm
# prompt SLACK_APP_TOKEN: <paste xapp->
# prompt SLACK_BOT_TOKEN: <paste xoxb->
# prompt dm_owner_user_id (optional): <skip>
zeno channel list
zeno channel test slack
```

Expected: `passed · Xms`. Mention `@zeno` in Slack workspace, agent replies.

- [ ] **Step 3: S2 — rotate**

```bash
zeno channel rotate slack
# paste new tokens (regenerated in Slack admin)
```

Expected: `slack · rotated · passed · Yms`. Observe worker logs for `channel_adapter_stopped` then `channel_adapter_started` within 4 s.

- [ ] **Step 4: S3 — induce disconnect**

In Slack admin, revoke the bot token. Wait < 30 s. Visit `/channels` in dashboard. Expect red CH3 banner. Run `zeno channel rotate slack` with a freshly regenerated token. Expect recovery.

- [ ] **Step 5: S4 — dashboard read-only**

In dashboard, click action chips. Verify `<CommandModal>` opens with copy-able command; no XHR fired (DevTools network panel).

- [ ] **Step 6: Record outputs**

Append observed CLI stdout, worker log snippets, screenshots to `vault/specs/2026-05-11-channels-cli-first/artboards/exports/e2e-rehearsal.md`. Commit.

```bash
git add vault/specs/2026-05-11-channels-cli-first/artboards/exports/
git commit -m "docs(spec): channels E2E rehearsal outputs"
```

---

## Phase 12 — Quality gate + PR

### Task 35: Final quality gate + open PR

**Files:** none.

- [ ] **Step 1: Run full quality gate**

Run: `pnpm run quality-gate`
Expected: PASS on lint + typecheck + tests across every workspace.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feat/channels-cli-first
```

- [ ] **Step 3: Open PR via `/new-pr` slash command**

Hand off to the `/new-pr` skill. PR title: `feat(channels)!: CLI-only channel management + read-only /channels page (#57)`. Body lists the 12 phases as a TOC with anchors to commits, plus the acceptance-criteria checklist from the spec marked `[x]`.

- [ ] **Step 4: Confirm CI green**

Wait for GitHub Actions. Address any failures (likely flag-table generation or biome). Push fixes; do not amend the merged-out commits.
