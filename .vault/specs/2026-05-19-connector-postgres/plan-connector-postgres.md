# Postgres Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Postgres to the curated connectors catalog as a read-only stdio MCP, landing a generic catalog-schema extension (`secrets[].mode: 'env' | 'argv'`) that interpolates secret values into positional argv slots — required because `@modelcontextprotocol/server-postgres` takes the connection URL as a positional argument, not an env var.

**Architecture:** Two-layer change. (1) The catalog loader's zod schema gets a new optional `mode` field on each secret, plus a refinement that cross-validates `${KEY}` placeholders in `transportConfig.args` against `mode: 'argv'` secrets. (2) `toStdioConfig` in `@zeno/mcp-discover` detects `${KEY}` tokens in args at spawn time, substitutes the matching secret value, and excludes that key from `env` (defense-in-depth). The new catalog entry exercises this path; every existing entry stays untouched (default `mode: 'env'`).

**Tech Stack:** TypeScript (strict mode), Node.js 24 LTS, pnpm workspaces, vitest, biome, zod, `@modelcontextprotocol/server-postgres` (run via `npx -y`).

**For this spec:** `[[spec-connector-postgres]]`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/lib/catalog-loader.ts` | Modify | Add `mode: 'env' \| 'argv'` to `catalogSecretSchema`. Add `catalogEntrySchema` superRefine: every `${KEY}` in `transportConfig.args` has a matching `mode: 'argv'` secret with `key === KEY`. |
| `apps/api/tests/lib/catalog-loader.test.ts` | Create | Unit tests for the new schema field and the refinement. |
| `packages/mcp-discover/src/build-config.ts` | Modify | Extend `toStdioConfig` to scan `args` for `${KEY}` tokens, substitute from secrets, exclude those keys from `env`. Throw on unresolved tokens or `source === 'custom'` + any `${KEY}`. |
| `packages/mcp-discover/tests/build-config.test.ts` | Modify | Add tests for argv interpolation, mixed modes, multi-occurrence, missing-secret throw, custom-source guard. |
| `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` | Modify | Pass `categoryPrefixMap` from the catalog entry into `discoverTools(...)` so `query` classifies as `read` during snapshot regen. |
| `agent/connectors-catalog.json` | Modify | Add the `postgres` entry: stdio, `npx -y @modelcontextprotocol/server-postgres ${DATABASE_URL}`, `secrets[0].mode: 'argv'`, `authCheckTool: 'query'`, `authCheckArgs: { sql: 'SELECT 1' }`, `categoryPrefixMap`, `tools: []` initially. |
| `agent/assets/connectors/postgres.svg` (or `.png`) | Create | Brand icon. |

No DB migration. No new package. No CLI command (the existing `zeno connector install/test/uninstall` already supports the install flow end-to-end — confirmed in spec §"Padrão CLI install").

---

## Phase Ordering

1. **Phase 0** — Discovery (gating): verify the upstream package is maintained and capture its live tool list.
2. **Phase 1** — Catalog schema extension (no behavior change yet).
3. **Phase 2** — `toStdioConfig` argv interpolation + custom-source guard.
4. **Phase 3** — Regen script `categoryPrefixMap` patch.
5. **Phase 4** — Catalog entry + icon.
6. **Phase 5** — Snapshot regen against a live Postgres → populates `tools[]`.
7. **Phase 6** — `pnpm run quality-gate` green.
8. **Phase 7** — Manual smoke (P1.* / P2.* / P3.* / P4.* per spec).
9. **Phase 8** — Reflection + spec `status: shipped`.

Phase 0 is gating: if upstream is archived/abandoned, stop and escalate to the operator. Phases 1-3 must land before Phase 4 (the catalog entry references `mode: 'argv'` + `${DATABASE_URL}`, which only the new schema + `toStdioConfig` understand).

---

## Task 1: Phase 0 — Upstream discovery (gating)

**Files:** No code changes. Output captured in `.vault/specs/2026-05-19-connector-postgres/phase-0-discovery.md` (created in this task).

- [ ] **Step 1: Check upstream status**

Run:
```bash
gh repo view modelcontextprotocol/servers --json description,isArchived,pushedAt,defaultBranchRef
```

Expected: `isArchived: false`, recent `pushedAt`. If `isArchived: true`, STOP — escalate to the operator. The spec is paused until a fallback (e.g. `crystaldba/postgres-mcp`) is approved.

- [ ] **Step 2: Confirm the npm package still resolves**

Run:
```bash
npm view @modelcontextprotocol/server-postgres version description deprecated 2>&1 | head -20
```

Expected: a version string + description; `deprecated` either absent or empty. If the package is marked deprecated, STOP and escalate.

- [ ] **Step 3: Start a throwaway Postgres**

Run:
```bash
docker run --rm -d --name pg-discovery -e POSTGRES_PASSWORD=t -p 5599:5432 postgres:16
sleep 3
```

Expected: container starts. Use port 5599 to avoid conflicts.

- [ ] **Step 4: Capture the live tool list via MCP inspector**

Run:
```bash
npx -y @modelcontextprotocol/inspector --cli npx -y @modelcontextprotocol/server-postgres "postgres://postgres:t@localhost:5599/postgres" --method tools/list 2>&1 | tee tmp/postgres-tools.json
```

Expected: a JSON array of tool definitions. Capture every `name`. Verify NO tool name starts with `create_`, `update_`, `delete_`, `send_`, `post_`, `put_`, or `write_`. If any does → STOP, escalate (would violate the read-only constraint).

If the inspector CLI is unavailable, fall back:
```bash
node -e "
import('@modelcontextprotocol/sdk/client/index.js').then(async ({Client}) => {
  const {StdioClientTransport} = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const c = new Client({name:'probe',version:'0'},{capabilities:{}});
  const t = new StdioClientTransport({
    command:'npx',
    args:['-y','@modelcontextprotocol/server-postgres','postgres://postgres:t@localhost:5599/postgres']
  });
  await c.connect(t);
  console.log(JSON.stringify((await c.listTools()).tools.map(x => x.name), null, 2));
  await c.close();
})
" | tee tmp/postgres-tools.json
```

- [ ] **Step 5: Write findings**

Create `.vault/specs/2026-05-19-connector-postgres/phase-0-discovery.md` with:
- Upstream status (archived ✗ / deprecated ✗ / version captured).
- Full list of tools returned by `tools/list`.
- A line per tool: `<name> → <expected category>` based on the `categoryPrefixMap` planned in Task 6.
- Any unexpected names that DON'T match `query` / `list_*` / `read_*` / `get_*` / `search_*` / `find_*` patterns. Note them — they may need an addition to `categoryPrefixMap` in Task 6.

- [ ] **Step 6: Stop the throwaway DB**

Run:
```bash
docker stop pg-discovery
```

Expected: container removed (`--rm` flag in step 3).

- [ ] **Step 7: Commit the discovery note**

```bash
git add .vault/specs/2026-05-19-connector-postgres/phase-0-discovery.md
git commit -m "docs(spec): phase 0 discovery for connector-postgres"
```

(Do NOT commit `tmp/postgres-tools.json` — `tmp/` is gitignored per `.vault/rules/generated-files-location.md`.)

---

## Task 2: Catalog schema — `mode` field + zod refinement

**Files:**
- Modify: `apps/api/src/lib/catalog-loader.ts:11-30` (add `mode` to `catalogSecretSchema`), `:45-126` (add superRefine to `catalogEntrySchema`).
- Create: `apps/api/tests/lib/catalog-loader.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/lib/catalog-loader.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogEntrySchema, catalogSecretSchema } from '../../src/lib/catalog-loader';

describe('catalogSecretSchema', () => {
  it('defaults mode to "env" when omitted', () => {
    const parsed = catalogSecretSchema.parse({
      key: 'API_KEY',
      label: 'API key',
      help: 'help',
      required: true,
    });
    expect(parsed.mode).toBe('env');
  });

  it('accepts mode: "argv"', () => {
    const parsed = catalogSecretSchema.parse({
      key: 'DATABASE_URL',
      label: 'DB URL',
      help: 'help',
      required: true,
      mode: 'argv',
    });
    expect(parsed.mode).toBe('argv');
  });

  it('rejects unknown mode values', () => {
    expect(() =>
      catalogSecretSchema.parse({
        key: 'X',
        label: 'X',
        help: 'h',
        required: true,
        mode: 'header',
      }),
    ).toThrow();
  });
});

describe('catalogEntrySchema argv refinement', () => {
  const base = {
    id: 'pg',
    name: 'Postgres',
    description: 'd',
    icon: 'pg.svg',
    docsUrl: 'https://example.com',
    transport: 'stdio' as const,
    tools: [],
  };

  it('accepts ${KEY} in args when a matching mode:argv secret exists', () => {
    expect(() =>
      catalogEntrySchema.parse({
        ...base,
        transportConfig: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL}'],
        },
        secrets: [
          {
            key: 'DATABASE_URL',
            label: 'DB URL',
            help: 'h',
            required: true,
            mode: 'argv',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects ${KEY} in args when no matching secret exists', () => {
    expect(() =>
      catalogEntrySchema.parse({
        ...base,
        transportConfig: {
          command: 'npx',
          args: ['-y', 'pkg', '${MISSING_KEY}'],
        },
        secrets: [],
      }),
    ).toThrow(/MISSING_KEY/);
  });

  it('rejects ${KEY} in args when the matching secret has mode:env', () => {
    expect(() =>
      catalogEntrySchema.parse({
        ...base,
        transportConfig: {
          command: 'npx',
          args: ['-y', 'pkg', '${DATABASE_URL}'],
        },
        secrets: [
          {
            key: 'DATABASE_URL',
            label: 'DB URL',
            help: 'h',
            required: true,
            // mode defaults to 'env'
          },
        ],
      }),
    ).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --filter @zeno/api test -- catalog-loader
```

Expected: FAIL — `mode` not defined on the schema, refinement absent.

- [ ] **Step 3: Add `mode` to `catalogSecretSchema`**

In `apps/api/src/lib/catalog-loader.ts`, modify `catalogSecretSchema` (around line 11-30):

```ts
export const catalogSecretSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string(),
  required: z.boolean(),
  inputType: z.enum(['text', 'password', 'pem']).optional(),
  prefix: z.string().optional(),
  /**
   * Spec 2026-05-19-connector-postgres: how the secret value is delivered to
   * the MCP subprocess. `env` (default) injects into `process.env` of the
   * spawned subprocess. `argv` interpolates into matching `${KEY}` slots of
   * `transportConfig.args` at spawn time and KEEPS THE KEY OUT OF `env`
   * (defense-in-depth — see `[[../../rules/integration-tokens-in-db-only]]`).
   */
  mode: z.enum(['env', 'argv']).optional().default('env'),
});
```

- [ ] **Step 4: Add the argv-consistency refinement to `catalogEntrySchema`**

In the same file, change the `catalogEntrySchema` definition (around line 45) from `z.object({...})` to wrap it with `.superRefine`:

```ts
const baseCatalogEntrySchema = z.object({
  // ... all the existing fields ...
});

export const catalogEntrySchema = baseCatalogEntrySchema.superRefine((entry, ctx) => {
  const args = entry.transportConfig.args ?? [];
  const tokenRegex = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  for (const slot of args) {
    const matches = slot.matchAll(tokenRegex);
    for (const match of matches) {
      const key = match[1];
      const secret = entry.secrets.find((s) => s.key === key);
      if (!secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transportConfig.args references \${${key}} but no matching secrets[] entry was declared`,
          path: ['transportConfig', 'args'],
        });
      } else if (secret.mode !== 'argv') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `transportConfig.args references \${${key}} but secrets[key=${key}].mode is "${secret.mode ?? 'env'}", expected "argv"`,
          path: ['secrets'],
        });
      }
    }
  }
});
```

Keep the rest of the file (including `catalogFileSchema`, `loadCatalog`, `findCatalogEntry`) referencing the new `catalogEntrySchema` symbol (no rename needed — it's the same export).

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm --filter @zeno/api test -- catalog-loader
```

Expected: PASS for all 6 cases above.

- [ ] **Step 6: Verify the existing catalog still parses**

Run:
```bash
pnpm --filter @zeno/api test
```

Expected: every existing API test stays green. The existing catalog file (`agent/connectors-catalog.json`) parses with no `mode` field on any secret → each defaults to `'env'` → no `${KEY}` tokens in any existing entry's args → refinement passes for every entry.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/catalog-loader.ts apps/api/tests/lib/catalog-loader.test.ts
git commit -m "feat(api): add secrets[].mode + argv-args refinement to catalog schema"
```

---

## Task 3: `toStdioConfig` — argv interpolation + defense-in-depth

**Files:**
- Modify: `packages/mcp-discover/src/build-config.ts:33-53` (`toStdioConfig` function).
- Modify: `packages/mcp-discover/tests/build-config.test.ts` (add new test cases).

- [ ] **Step 1: Write the failing tests**

Append to `packages/mcp-discover/tests/build-config.test.ts`, inside the `describe('toStdioConfig', ...)` block (alongside the existing cases):

```ts
describe('argv interpolation', () => {
  it('substitutes ${KEY} placeholders in args from secrets and excludes those keys from env', () => {
    const c = toStdioConfig(
      baseConnector({
        source: 'catalog',
        catalogId: 'postgres',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', '${DATABASE_URL}'],
      }),
      [{ connectorId: 'i', key: 'DATABASE_URL', value: 'postgres://u:p@h/db' }],
    );
    expect(c.args).toEqual([
      '-y',
      '@modelcontextprotocol/server-postgres',
      'postgres://u:p@h/db',
    ]);
    expect(c.env).toBeUndefined();
  });

  it('keeps non-argv secrets in env unchanged when args has no ${KEY}', () => {
    const c = toStdioConfig(
      baseConnector({
        source: 'catalog',
        catalogId: 'pg',
        command: 'node',
        args: ['x.js'],
      }),
      [{ connectorId: 'i', key: 'API_KEY', value: 'k' }],
    );
    expect(c.env).toEqual({ API_KEY: 'k' });
    expect(c.args).toEqual(['x.js']);
  });

  it('handles mixed argv + env secrets on the same connector', () => {
    const c = toStdioConfig(
      baseConnector({
        source: 'catalog',
        catalogId: 'pg',
        command: 'npx',
        args: ['-y', 'pkg', '${DATABASE_URL}'],
      }),
      [
        { connectorId: 'i', key: 'DATABASE_URL', value: 'postgres://u@h/db' },
        { connectorId: 'i', key: 'LOG_LEVEL', value: 'debug' },
      ],
    );
    expect(c.args).toEqual(['-y', 'pkg', 'postgres://u@h/db']);
    expect(c.env).toEqual({ LOG_LEVEL: 'debug' });
  });

  it('substitutes every occurrence when ${KEY} appears in multiple slots', () => {
    const c = toStdioConfig(
      baseConnector({
        source: 'catalog',
        catalogId: 'pg',
        command: 'cmd',
        args: ['--primary', '${URL}', '--replica', '${URL}'],
      }),
      [{ connectorId: 'i', key: 'URL', value: 'postgres://x' }],
    );
    expect(c.args).toEqual(['--primary', 'postgres://x', '--replica', 'postgres://x']);
  });

  it('throws when ${KEY} has no matching secret', () => {
    expect(() =>
      toStdioConfig(
        baseConnector({
          source: 'catalog',
          catalogId: 'pg',
          command: 'cmd',
          args: ['${MISSING}'],
        }),
        [],
      ),
    ).toThrow(/missing argv secret for MISSING/);
  });

  it('throws when source is custom and args contains any ${KEY}', () => {
    expect(() =>
      toStdioConfig(
        baseConnector({
          source: 'custom',
          command: 'cmd',
          args: ['${DATABASE_URL}'],
        }),
        [{ connectorId: 'i', key: 'DATABASE_URL', value: 'p' }],
      ),
    ).toThrow(/custom connector|catalog-only/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm --filter @zeno/mcp-discover test -- build-config
```

Expected: FAIL on every new case. The existing 3 cases (`builds env from secrets`, `omits env when no secrets`, `throws when no command`) still pass.

- [ ] **Step 3: Patch `toStdioConfig`**

In `packages/mcp-discover/src/build-config.ts`, replace the body of `toStdioConfig` (lines 33-53) with:

```ts
const ARGV_TOKEN = /\$\{([A-Z_][A-Z0-9_]*)\}/g;

export function toStdioConfig(connector: Connector, secrets: ConnectorSecret[]): McpServerConfig {
  if (!connector.command) {
    throw new Error(`connector ${connector.slug} has transport=stdio but no command`);
  }

  const rawArgs = connector.args ?? [];
  const argvKeys = new Set<string>();
  for (const slot of rawArgs) {
    for (const match of slot.matchAll(ARGV_TOKEN)) {
      argvKeys.add(match[1] as string);
    }
  }

  if (argvKeys.size > 0 && connector.source === 'custom') {
    throw new Error(
      `custom connector ${connector.slug} uses \${KEY} args placeholders; argv-interpolation is catalog-only`,
    );
  }

  const secretByKey = new Map<string, string>();
  for (const s of secrets) {
    secretByKey.set(s.key, s.value);
  }

  // Substitute ${KEY} tokens in args from secrets. Throw on unresolved tokens.
  const substitutedArgs = rawArgs.map((slot) =>
    slot.replace(ARGV_TOKEN, (_, key: string) => {
      const value = secretByKey.get(key);
      if (value === undefined) {
        throw new Error(`missing argv secret for ${key}`);
      }
      return value;
    }),
  );

  // Build env from secrets, EXCLUDING keys that were consumed by argv
  // (defense-in-depth: argv-mode secrets MUST NOT leak into process.env of
  // the spawned subprocess — see `[[../../.vault/rules/integration-tokens-in-db-only]]`).
  const env: Record<string, string> = {};
  for (const s of secrets) {
    if (s.key === RESERVED_MCP_TYPE_KEY) continue;
    if (GITHUB_APP_RESERVED_KEYS_SET.has(s.key)) continue;
    if (argvKeys.has(s.key)) continue;
    if (s.key === RESERVED_AUTHORIZATION_KEY) {
      env.AUTHORIZATION = s.value;
      continue;
    }
    env[s.key] = s.value;
  }

  return {
    type: 'stdio',
    command: connector.command,
    args: substitutedArgs,
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
pnpm --filter @zeno/mcp-discover test
```

Expected: PASS on every case (the 3 existing + the 6 new ones).

- [ ] **Step 5: Run the API tests too (sanity)**

Run:
```bash
pnpm --filter @zeno/api test
```

Expected: green. `toStdioConfig` is used indirectly by the API test endpoint; no behavior change for any existing connector.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-discover/src/build-config.ts packages/mcp-discover/tests/build-config.test.ts
git commit -m "feat(mcp-discover): interpolate \${KEY} from secrets into stdio args"
```

---

## Task 4: Regen script — pass `categoryPrefixMap`

**Files:**
- Modify: `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` (the `await discoverTools(transient, secrets)` call, currently lacking the third options argument).

The script today calls `discoverTools(transient, secrets)` with no options, so `categoryPrefixMap` never gets applied. Klaviyo gets away with it because its tools all start with `klaviyo_*` which the default classifier sees as `interactive` (and the catalog's `tools[]` is manually edited or sourced elsewhere). For Postgres we need `query` → `read`, so the script must thread the catalog entry's `categoryPrefixMap` through.

- [ ] **Step 1: Read the current call site**

Run:
```bash
grep -n "discoverTools" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected: one line — `const result = await discoverTools(transient, secrets);` inside `fetchToolsFromLiveMcp`.

- [ ] **Step 2: Patch the call to pass `categoryPrefixMap` (and `authCheckTool` / `authCheckArgs` for symmetry with the test endpoint)**

In `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`, replace:

```js
const result = await discoverTools(transient, secrets);
```

with:

```js
const options = {};
if (entry.authCheckTool) options.authCheckTool = entry.authCheckTool;
if (entry.authCheckArgs) options.authCheckArgs = entry.authCheckArgs;
if (entry.categoryPrefixMap) options.categoryPrefixMap = entry.categoryPrefixMap;
const result = await discoverTools(transient, secrets, options);
```

- [ ] **Step 3: Sanity-run the script in mirror-only mode**

Run:
```bash
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected: prints `snapshot written: apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap`. The snapshot file's content is unchanged from before (mirror mode doesn't fetch). `git diff` shows no change.

- [ ] **Step 4: Commit**

```bash
git add apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
git commit -m "chore(worker): thread authCheckTool / authCheckArgs / categoryPrefixMap through regen script"
```

---

## Task 5: Postgres brand icon

**Files:**
- Create: `agent/assets/connectors/postgres.svg` OR `agent/assets/connectors/postgres.png`.

The catalog loader's `resolveIconPath` resolves either; the `/catalog/icons/:filename` route emits the right MIME from the extension.

- [ ] **Step 1: Check the canonical Postgres mark license**

The official Postgres elephant mark is hosted at `https://wiki.postgresql.org/wiki/Logo`. The SVG is licensed under PostgreSQL's permissive license. Either:
- Pull a clean SVG (e.g. from the `simple-icons` package — `npx simple-icons download postgresql`), OR
- Use a PNG fallback if no public-domain SVG is available.

Run:
```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/postgresql.svg" -o agent/assets/connectors/postgres.svg
```

Expected: file ~1 KB, opens cleanly in a browser as a single-path elephant mark.

If the URL fails or the simple-icons license doesn't fit (Creative Commons Zero — should be fine for an SVG with no embedded text):
```bash
# fallback: use the elephant PNG from postgresql.org
curl -fsSL "https://www.postgresql.org/media/img/about/press/elephant.png" -o agent/assets/connectors/postgres.png
```

- [ ] **Step 2: Verify the asset is < 50 KB**

Run:
```bash
ls -lh agent/assets/connectors/postgres.*
```

Expected: file size in the tens of kilobytes max. Large brand assets bloat the dashboard.

- [ ] **Step 3: Commit**

```bash
git add agent/assets/connectors/postgres.*
git commit -m "feat(assets): postgres connector icon"
```

---

## Task 6: Catalog entry

**Files:**
- Modify: `agent/connectors-catalog.json` (insert the new entry; the file is alphabetized loosely — slot postgres in alphabetical position).

- [ ] **Step 1: Identify the insertion point**

Run:
```bash
grep -n '"id":' agent/connectors-catalog.json
```

Expected: a list of catalog ids in source order. Slot `postgres` alphabetically between `linear` and `sentry` (or wherever it lands — order doesn't matter for the loader, only readability).

- [ ] **Step 2: Add the entry**

Insert the following object into the `connectors[]` array in `agent/connectors-catalog.json` (use the icon extension that matches what landed in Task 5 — `postgres.svg` OR `postgres.png`):

```json
{
  "id": "postgres",
  "name": "Postgres",
  "description": "Read-only access to a Postgres database. One installation per database URL.",
  "icon": "postgres.svg",
  "docsUrl": "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
  "transport": "stdio",
  "transportConfig": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "${DATABASE_URL}"
    ]
  },
  "authCheckTool": "query",
  "authCheckArgs": { "sql": "SELECT 1" },
  "categoryPrefixMap": {
    "query": "read",
    "list_resources": "read",
    "read_resource": "read"
  },
  "secrets": [
    {
      "key": "DATABASE_URL",
      "label": "Connection URL",
      "help": "postgres://user:pass@host:port/dbname. Use a read-only role — Constitution §Read-only database (cf. global CLAUDE.md Rule 22).",
      "required": true,
      "mode": "argv"
    }
  ],
  "tools": [],
  "terminology": { "instance": "Database" },
  "tags": ["database", "sql"]
}
```

If Task 1 (Phase 0 discovery) surfaced extra tool names that don't fit the three keys in `categoryPrefixMap`, ADD them here BEFORE committing — `read_` / `list_` / `get_` / `search_` / `find_` prefixes are caught by the default classifier, but anything else (e.g. a hypothetical `describe_table` returning schema) needs an explicit entry in `categoryPrefixMap` mapping it to `read`.

- [ ] **Step 3: Verify the catalog parses**

Run:
```bash
pnpm --filter @zeno/api test -- catalog-loader
```

Expected: PASS. The new entry exercises the argv refinement from Task 2 — if Task 2 is wrong, this fails.

Run additionally:
```bash
pnpm --filter @zeno/api test -- catalog
```

Expected: every existing catalog-related API test (icons, listings, install) stays green.

- [ ] **Step 4: Commit**

```bash
git add agent/connectors-catalog.json
git commit -m "feat(connectors): add postgres catalog entry"
```

---

## Task 7: Populate `tools[]` via snapshot regen

**Files:**
- Modify: `agent/connectors-catalog.json` (in place — only the `tools[]` array of the postgres entry).
- Touch: `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (rewritten by the script).

This task can only run after the catalog entry exists (Task 6) AND `toStdioConfig` understands argv (Task 3).

- [ ] **Step 1: Start a throwaway Postgres**

Run:
```bash
docker run --rm -d --name pg-regen -e POSTGRES_PASSWORD=t -p 5599:5432 postgres:16
sleep 3
```

Expected: container running.

- [ ] **Step 2: Run the regen script in fetch mode**

Run:
```bash
DATABASE_URL="postgres://postgres:t@localhost:5599/postgres" \
  node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
```

Expected:
- Console: `fetching tools from live MCP for postgres...` followed by `postgres: N tools updated`.
- `agent/connectors-catalog.json` — the postgres entry's `tools[]` now lists every live tool with `category: "read"` and `defaultPermission: "always_allow"` (or `"ask"` for any unmapped tool).
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — refreshed.

- [ ] **Step 3: Review the diff manually**

Run:
```bash
git diff agent/connectors-catalog.json
```

Expected: only the postgres entry's `tools[]` changed. Every tool's `category` is `read`. No `write_*` / `create_*` / `delete_*` / `update_*` tool appears. If ANY non-read tool sneaks in, STOP — re-open the spec and decide whether to (a) extend `categoryPrefixMap`, (b) drop the tool via a future filtering mechanism (out of scope), or (c) reject this Postgres MCP entirely.

- [ ] **Step 4: Test the skip-with-warning path**

Run the script again WITHOUT the env var:
```bash
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
```

Expected: every other catalog entry warns `skip <id>: missing env var <KEY>...`. The postgres entry is the same — `skip postgres: missing env var DATABASE_URL...`. The on-disk `tools[]` for postgres stays as written in Step 2 (no overwrite, no error).

- [ ] **Step 5: Stop the throwaway DB**

Run:
```bash
docker stop pg-regen
```

- [ ] **Step 6: Commit**

```bash
git add agent/connectors-catalog.json apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
git commit -m "chore(catalog): populate postgres tools[] from live MCP"
```

---

## Task 8: `quality-gate` green

**Files:** No edits expected. If lint/typecheck/test fails, fix at the source.

- [ ] **Step 1: Run the gate**

Run:
```bash
pnpm run quality-gate
```

Expected: zero failures across lint + typecheck + tests in every workspace. The change set so far:
- `apps/api/src/lib/catalog-loader.ts` — schema patch.
- `apps/api/tests/lib/catalog-loader.test.ts` — new tests.
- `packages/mcp-discover/src/build-config.ts` — `toStdioConfig` patch.
- `packages/mcp-discover/tests/build-config.test.ts` — new cases.
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` — options forwarding.
- `agent/connectors-catalog.json` — new entry + populated tools[].
- `agent/assets/connectors/postgres.svg` (or `.png`).
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — refreshed.

- [ ] **Step 2: If anything fails, fix in place**

Common failure modes:
- Biome flags formatting on the new test file → run `pnpm --filter @zeno/api lint:fix` and `pnpm --filter @zeno/mcp-discover lint:fix`.
- Typecheck flags `Connector.source` lookup with no narrowing in the new `toStdioConfig` branch → add an explicit `if (connector.source === 'custom')` guard rather than relying on type-narrowing tricks.
- Snapshot mismatch in `connectors-e2e` → re-run Task 7 Step 2 (the snapshot must reflect the just-committed catalog).

- [ ] **Step 3: Commit any fix-ups separately**

```bash
git add -p   # selectively stage the fix-up changes
git commit -m "fix(...): post-quality-gate adjustments"
```

(Only if Step 2 surfaced anything. If the gate was green on first try, skip.)

---

## Task 9: Manual smoke (P1.* / P2.* / P3.* / P4.*)

**Files:** No code. Evidence captured under `tmp/postgres-smoke/` (gitignored).

This task assumes the worker container is built and running for the active profile. If not:
```bash
zeno start --build
```

- [ ] **Step 1: Provision a smoke Postgres + read-only role**

Run:
```bash
docker run --rm -d --name pg-smoke -e POSTGRES_PASSWORD=root -p 5599:5432 postgres:16
sleep 3
docker exec pg-smoke psql -U postgres -c "CREATE ROLE ro_user LOGIN PASSWORD 'ro_pass';"
docker exec pg-smoke psql -U postgres -c "CREATE DATABASE smoke;"
docker exec pg-smoke psql -U postgres -d smoke -c "GRANT CONNECT ON DATABASE smoke TO ro_user;"
docker exec pg-smoke psql -U postgres -d smoke -c "GRANT USAGE ON SCHEMA public TO ro_user;"
docker exec pg-smoke psql -U postgres -d smoke -c "CREATE TABLE orders (id serial primary key, total numeric);"
docker exec pg-smoke psql -U postgres -d smoke -c "GRANT SELECT ON ALL TABLES IN SCHEMA public TO ro_user;"
docker exec pg-smoke psql -U postgres -d smoke -c "INSERT INTO orders (total) SELECT random()*1000 FROM generate_series(1,100);"
```

Expected: DB up, `ro_user` can `SELECT` on `orders` but cannot `INSERT/UPDATE/DELETE`.

Smoke URL: `postgres://ro_user:ro_pass@host.docker.internal:5599/smoke` (host.docker.internal lets the worker container reach the host's published port).

- [ ] **Step 2: P1.1 — install with prompt**

In a terminal attached to the active profile:
```bash
zeno connector install postgres --label "smoke"
# at the prompt, paste: postgres://ro_user:ro_pass@host.docker.internal:5599/smoke
```

Expected CLI output (last 3 lines):
```
queued · correlationId=<uuid>
installed
verified · N tools
```

Capture the output to `tmp/postgres-smoke/p1.1.txt`.

- [ ] **Step 3: P1.2 — install with unreachable URL, expect auto-rollback**

Run:
```bash
zeno connector install postgres --label "p1-2" --secret DATABASE_URL=postgres://nobody:bad@127.0.0.1:9999/x
echo "exit=$?"
zeno connector list | grep -i postgres-p1-2  # must NOT appear
```

Expected: `verification failed: network`, `rolling back...`, `uninstalled`, exit 1. No `postgres-p1-2` row remains. Save the output to `tmp/postgres-smoke/p1.2.txt`.

- [ ] **Step 4: P1.3 — install with bad credentials, expect auto-rollback**

Run:
```bash
zeno connector install postgres --label "p1-3" --secret DATABASE_URL=postgres://baduser:badpass@host.docker.internal:5599/smoke
echo "exit=$?"
zeno connector list | grep -i postgres-p1-3  # must NOT appear
```

Expected: `verification failed: auth`, auto-rollback, exit 1. Save to `tmp/postgres-smoke/p1.3.txt`.

- [ ] **Step 5: P1.4 — list verifies install**

Run:
```bash
zeno connector list
```

Expected: `postgres-smoke` row, status `enabled`, `lastVerifiedAt` populated. Capture to `tmp/postgres-smoke/p1.4.txt`.

- [ ] **Step 6: P1.5 — second instance**

Repeat Step 2 with `--label "smoke2"` and the same URL (or a different one). Verify both rows coexist:
```bash
zeno connector list | grep postgres-
```

Expected: two rows — `postgres-smoke`, `postgres-smoke2`. Capture to `tmp/postgres-smoke/p1.5.txt`.

- [ ] **Step 7: P2.1 — verify argv placeholder persists literal**

Pick the smoke connector's UUID from `zeno connector list` and curl the API:
```bash
PROFILE_PORT=$(zeno profile show smoke --json | jq -r .port)  # or whatever profile is active
curl -s -H "x-zeno-origin: cli" "http://127.0.0.1:${PROFILE_PORT}/api/connectors/postgres-smoke" | jq .args
```

Expected: `["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]` — the literal placeholder, NOT the URL. Capture to `tmp/postgres-smoke/p2.1.txt`.

- [ ] **Step 8: P2.3 — env isolation in worker container**

Trigger a tool call (e.g. via Slack DM in Task 10) or `zeno connector test postgres-smoke`, then immediately:
```bash
docker exec $(zeno profile show smoke --json | jq -r .containerName) env | grep DATABASE_URL || echo "absent"
```

Expected: `absent`. The worker's `process.env` does NOT contain `DATABASE_URL`. Capture to `tmp/postgres-smoke/p2.3.txt`.

- [ ] **Step 9: P2.4 — URL appears in subprocess argv (documented tradeoff)**

While a tool call is in flight (run `zeno connector test postgres-smoke` in another shell), capture:
```bash
docker exec $(zeno profile show smoke --json | jq -r .containerName) ps auxf | grep -i postgres
```

Expected: a row like `npx -y @modelcontextprotocol/server-postgres postgres://ro_user:ro_pass@...`. The URL IS in argv — this is the documented tradeoff of `mode: 'argv'`. Capture to `tmp/postgres-smoke/p2.4.txt`.

- [ ] **Step 10: P3.1 — SELECT-style DM**

In Slack, DM the agent:
> "Show me the 10 most recent orders from the smoke postgres."

Expected: the agent calls `mcp__postgres-smoke__query` with a SELECT, returns 10 rows. Screenshot to `tmp/postgres-smoke/p3.1.png`.

- [ ] **Step 11: P3.3 — DELETE-style DM (expect refusal)**

In Slack, DM:
> "Delete all orders from the smoke postgres."

Expected: the agent attempts to call `query` with a DELETE; the server returns an error ("cannot execute DELETE in a read-only transaction" or similar); the agent reports the failure without having mutated data. Verify with:
```bash
docker exec pg-smoke psql -U postgres -d smoke -c "SELECT count(*) FROM orders;"
```

Expected: count is still 100. Screenshot the Slack response to `tmp/postgres-smoke/p3.3.png` and save the count check to `tmp/postgres-smoke/p3.3-count.txt`.

- [ ] **Step 12: P4.1 — snapshot regen against the smoke DB**

Run (same as Task 7 but pointing at the smoke DB):
```bash
DATABASE_URL=postgres://ro_user:ro_pass@127.0.0.1:5599/smoke \
  node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
git diff agent/connectors-catalog.json
```

Expected: zero diff (catalog already populated in Task 7). Confirms regen is idempotent against this DB.

- [ ] **Step 13: P4.2 — snapshot regen without env**

Run:
```bash
unset DATABASE_URL
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
git diff agent/connectors-catalog.json
```

Expected: `skip postgres: missing env var DATABASE_URL ...`, zero diff.

- [ ] **Step 14: Teardown smoke env**

```bash
zeno connector uninstall postgres-smoke --yes
zeno connector uninstall postgres-smoke2 --yes
docker stop pg-smoke
```

- [ ] **Step 15: Commit the smoke evidence (if applicable)**

The smoke artifacts live in `tmp/` which is gitignored. If any artifact needs to be preserved (e.g. screenshots for the PR description), copy it manually OUT of `tmp/` and into the PR description; do NOT commit `tmp/`.

---

## Task 10: Reflection + ship

**Files:**
- Modify: `.vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md` frontmatter.
- Possibly create: `.vault/learnings/<slug>.md` if Phase 0 or smoke surfaced anything non-obvious.
- Possibly update: `.vault/_index/learnings.md`.

- [ ] **Step 1: Reflection**

Ask: "What did I learn implementing this that wasn't obvious from the spec?" Consider:
- Did the upstream tool list differ from expectations? (Phase 0 captures this.)
- Did the `${KEY}` interpolation surface any edge case the spec missed (escaping, quoting, multi-line)?
- Was the `categoryPrefixMap` complete, or did snapshot regen reveal a tool name that doesn't fit?
- Did the cold-start (`npx -y` package download) actually exceed `DISCOVER_TIMEOUT_MS = 10s`?

If at least one of these has a non-obvious answer, create a learning note (see Step 2). If nothing surprising came up, write that explicitly in the PR description ("No new learnings from this spec").

- [ ] **Step 2: Create a learning note (if applicable)**

Use the template:
```bash
cp .vault/templates/learning.md .vault/learnings/<slug>.md
```

Edit the new file. Link it to the spec with `[[../specs/2026-05-19-connector-postgres/spec-connector-postgres|connector-postgres spec]]`. Add it to `.vault/_index/learnings.md` under the appropriate `#concept` / `#gotcha` / `#reference` heading.

- [ ] **Step 3: Flip the spec to `shipped`**

In `.vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md`, change the frontmatter:
```yaml
---
status: shipped
feature: connector-postgres
created: 2026-05-19
shipped: 2026-05-19   # or the actual ship date
issue: 75
---
```

- [ ] **Step 4: Tick every `[ ]` Acceptance Criteria bullet that the smoke verified**

In the spec's `## Acceptance Criteria` section, change `- [ ]` to `- [x]` for every criterion the smoke (Task 9) or quality-gate (Task 8) satisfied. If any criterion is NOT satisfied, leave it `- [ ]` and explain in the PR description why — but a shippable spec normally has every box ticked.

- [ ] **Step 5: Commit reflection + ship marker**

```bash
git add .vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md
# only if a learning note was added:
git add .vault/learnings/<slug>.md .vault/_index/learnings.md
git commit -m "docs(spec): connector-postgres shipped"
```

- [ ] **Step 6: Open the PR**

Per CLAUDE.md, use `/new-pr` — DO NOT run `gh pr create` directly. The PR description should:
- Reference issue #75.
- Link the spec.
- Include the smoke evidence (output snippets, screenshots) for P1.* / P2.* / P3.* / P4.*.
- Note the documented tradeoff: URL appears in subprocess argv (P2.4) — intentional given Docker isolation.

---

## Risks / Open Decisions

- **Phase 0 may surface tool names not covered by `categoryPrefixMap`.** Handling: extend the map in Task 6 BEFORE running Task 7. Any `write_*` / `create_*` / `delete_*` tool aborts the spec.
- **Icon licensing.** Task 5 prefers `simple-icons` (CC0). If the implementer can't reach simple-icons, the PostgreSQL.org elephant PNG is the fallback; license check is the implementer's call.
- **`host.docker.internal` on Linux hosts.** Smoke Step 1 assumes macOS / Windows Docker Desktop. On Linux, replace with `--add-host=host.docker.internal:host-gateway` on the worker container OR use the host's actual LAN IP. Note in the PR if the smoke was done on Linux.
- **Cold-start timeout.** If `npx -y` package download exceeds 10s during P1.1, the install verify fails. Mitigation: re-run `zeno connector install` (the second time `npx` hits the cache). Document in the learning note if this hits in practice.

---

## Self-review

**Spec coverage check.** Every section of the spec maps to a task:
- §"Brainstorm Q&A — positional-argv problem" → Task 3 (interpolation in `toStdioConfig`).
- §"Brainstorm Q&A — instance model" → no code task; the existing CLI/API stack supports multi-instance with zero change. P1.5 in Task 9 validates.
- §"Brainstorm Q&A — tool categorization" → Task 4 (regen pass-through) + Task 6 (`categoryPrefixMap` in entry).
- §"Constraints — CLI-only operator surface" → no code; Task 9 validates via `zeno connector install/test/uninstall`.
- §"Constraints — argv interpolation runs at spawn time" → Task 3 implementation + Task 9 P2.1.
- §"Constraints — custom connectors throw on `${KEY}`" → Task 3 step 1 test 6 + step 3 implementation.
- §"Constraints — authCheckTool / authCheckArgs" → Task 6 (entry) + Task 4 (regen plumbing).
- §"Constraints — Phase 0 upstream check" → Task 1.
- §"User Stories P1.*-P4.*" → Task 9 (all manual smoke steps).
- §"Acceptance Criteria" — 21 bullets, each maps to either a unit test (Tasks 2/3) or a smoke step (Task 9) or `pnpm run quality-gate` (Task 8).
- §"Risks and Mitigations — 6 rows" → Documented in Risks section above + Task 1 (upstream check) + smoke (P3.3 verifies read-only enforcement).
- §"Implementation order — 9 phases" → Tasks 1-10 cover all 9 phases (Task 1 = Phase 0, Task 2 = Phase 1, ..., Task 10 = Phase 8).

**Placeholder scan.** No `TBD`, `TODO`, `<...>`, or "implement appropriately" anywhere in this plan. Each code block is complete. Each command has expected output.

**Type consistency.** `toStdioConfig` signature unchanged (still `(connector: Connector, secrets: ConnectorSecret[]) => McpServerConfig`). `argvKeys` (local Set), `secretByKey` (local Map), `ARGV_TOKEN` (module-level const). Schema additions are additive only — `mode` on secrets, refinement on entry. Test files use `baseConnector(...)` helper consistent with the existing pattern in `build-config.test.ts`.

---

## Execution approach

**10 tasks, multi-package, two phases that gate (Phase 0 upstream, Phase 7 manual smoke against a live DB + Slack) → Subagent-Driven.**

Each task is self-contained enough to dispatch a fresh subagent with the task block as context. The brainstorming/spec/plan trio provides every reference an implementer needs. Use `superpowers:subagent-driven-development` between tasks; review the diff and commit before dispatching the next.
