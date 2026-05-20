---
date: 2026-05-19
status: complete
spec: "[[spec-connector-mysql]]"
---
# Phase 0 — Discovery (MySQL connector)

All six probes (M0.1 → M0.6) executed against `@benborla29/mcp-server-mysql@2.0.8` and the current `claude/zealous-jang-cf234c` worktree on 2026-05-19. No blockers, no pivot triggered. Single-tool surface confirmed (`mysql_query`); write-rejection contract honored by the upstream as advertised.

## M0.1 — Upstream package vetting

```
$ npm view @benborla29/mcp-server-mysql version time.modified deprecated
version = '2.0.8'
time.modified = '2026-01-27T14:31:10.195Z'
```

- Version: `2.0.8`.
- Last published: 2026-01-27 — within the 12-month freshness window.
- `deprecated` field absent.

Conclusion: **proceed**. No pivot needed.

## M0.2 — Cold-start timing

```
$ rm -rf ~/.npm/_npx
$ time npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1
real  0m7.812s
user  0m2.80s
sys   0m1.61s
```

- Cold cache: 7.81s. **Within** `DISCOVER_TIMEOUT_MS = 10s` on this host, but tight.
- Dockerfile prefetch (Task 1) still applies — operator workstations may be slower than this host; the prefetch makes the runtime first-install a no-op cache hit.

## M0.3 — Live tools/list

Probe script: `tmp/mysql-discover/probe.mjs`. Spawned `npx -y @benborla29/mcp-server-mysql` with `MYSQL_*` env pointing at a `mysql:8` Docker container (`mysql-discover`, port `3399`, db `smoke`). Captured `initialize` and `tools/list` responses.

`initialize` advertises one tool. `tools/list` confirms:

```json
{
  "result": {
    "tools": [
      {
        "name": "mysql_query",
        "description": "[MySQL MCP Server [v2026.5.19-2]] Run SQL queries against MySQL database (READ-ONLY)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sql": { "type": "string", "description": "The SQL query to execute" }
          },
          "required": ["sql"]
        },
        "annotations": {
          "readOnlyHint": true,
          "idempotentHint": true,
          "destructiveHint": false,
          "openWorldHint": false,
          "title": "MySQL Query"
        }
      }
    ]
  }
}
```

Observations:
- One tool total — matches the issue's expectation.
- Upstream self-describes as `(READ-ONLY)` in the tool description.
- MCP `annotations` declare `readOnlyHint: true, destructiveHint: false` — defensive metadata the agent can also reason about.
- `serverInfo.version` reads `2026.5.19-2` — appears to be the package's own internal version label, not Zeno's release tag. Cosmetic, no action.

`categoryPrefixMap` decision: `{ "mysql_query": "read" }` — single entry, exact-match on the tool name. The default `list_*` / `get_*` classifier does not catch `mysql_query`, so the explicit map is required.

## M0.4 — Write rejection probe

Seeded `smoke.smoke_table` with 1 row via root credentials in the container. Probe script (`tmp/mysql-discover/write-probe.mjs`) issued `mysql_query` with `INSERT INTO smoke_table (col) VALUES (99)` followed by a `SELECT 1 AS sentinel` to confirm the connection remained healthy.

Response:
```json
{
  "result": {
    "content": [{"type":"text","text":"Error: INSERT operations are not allowed for schema 'smoke'. Ask the administrator to update SCHEMA_INSERT_PERMISSIONS."}],
    "isError": true
  },
  "jsonrpc": "2.0",
  "id": 3
}
```

Follow-up SELECT returned `[{"sentinel": 1}]` with `isError: false` — proving the connection survives a rejected write.

Container-side row count:
```
$ docker exec mysql-discover mysql -uroot -proot smoke -e "SELECT COUNT(*) FROM smoke_table;"
COUNT(*)
1
```

Still 1 — write **was not applied**. Upstream contract honored. The error message specifically names `SCHEMA_INSERT_PERMISSIONS`, which is the per-schema variant of `ALLOW_INSERT_OPERATION` upstream now supports — verbatim phrase captured here for runtime smoke comparison (M3.3).

## M0.5 — `authCheckArgs` propagation (already wired)

### Install/test path

`apps/api/src/routes/connectors.ts:754-758`:
```ts
    const result = await discoverTools(transient, secrets, {
      ...(entry.authCheckTool ? { authCheckTool: entry.authCheckTool } : {}),
      ...(entry.authCheckArgs ? { authCheckArgs: entry.authCheckArgs } : {}),
      ...(entry.categoryPrefixMap ? { categoryPrefixMap: entry.categoryPrefixMap } : {}),
    });
```

Comments at lines 750-753 attribute the wiring to specs 0038 / 0040 / 0048. `authCheckArgs` flows through.

### Regen script path

`apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-123`:
```js
    const options = {};
    if (entry.authCheckTool) options.authCheckTool = entry.authCheckTool;
    if (entry.authCheckArgs) options.authCheckArgs = entry.authCheckArgs;
    if (entry.categoryPrefixMap) options.categoryPrefixMap = entry.categoryPrefixMap;
    const result = await discoverTools(transient, secrets, options);
```

Both call sites read `authCheckArgs` from the catalog entry and pass it to `discoverTools`. **No patch needed.** Spec's M0.5 ✓ satisfied as cite-and-confirm.

## M0.6 — Regen script single-secret gap

`apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:80-95`:
```js
  for (const entry of catalog.connectors) {
    const required = (entry.secrets ?? []).find((s) => s.required);
    if (!required) {
      console.error(
        `skip ${entry.id}: no required secret (cannot derive env var name)`,
      );
      continue;
    }
    const envName = required.key;
    const value = process.env[envName];
    if (!value) {
      console.warn(
        `skip ${entry.id}: missing env var ${envName} (set it to fetch tools for this entry)`,
      );
      continue;
    }
```

Line 117:
```js
    const secrets = [{ connectorId: 'transient', key: envName, value }];
```

`find((s) => s.required)` picks the **first** required secret only. For MySQL's 5-secret entry, only `MYSQL_HOST` would be forwarded; the MCP would fail to connect because `MYSQL_USER` / `MYSQL_PASS` / `MYSQL_DB` are absent on the subprocess env. Task 4 patches this to iterate all required secrets.

Postgres' single-required-secret model (one `DATABASE_URI` entry) is unaffected by the upcoming patch — `requiredSecrets.length === 1` reduces to the previous behavior.

## Container cleanup

```
$ docker stop mysql-discover
mysql-discover
```

`tmp/mysql-discover/` artifacts (`probe.mjs`, `write-probe.mjs`, `tools-list.json`, `write-probe.json`, `cold-start.log`) remain on disk for PR-description reference; gitignored per `[[../../rules/generated-files-location]]`.

## Summary table

| Probe | Outcome |
|---|---|
| M0.1 — upstream alive | ✓ `@benborla29/mcp-server-mysql@2.0.8`, 2026-01-27, not deprecated |
| M0.2 — cold-start time | ✓ 7.81s on host; prefetch still recommended |
| M0.3 — tool list | ✓ single tool `mysql_query`, advertises READ-ONLY, MCP annotations confirm |
| M0.4 — write rejection | ✓ INSERT rejected verbatim "INSERT operations are not allowed for schema 'smoke'. Ask the administrator to update SCHEMA_INSERT_PERMISSIONS."; row count unchanged |
| M0.5 — authCheckArgs wired | ✓ `apps/api/src/routes/connectors.ts:754-758`, `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-123` |
| M0.6 — regen single-secret gap | ✓ confirmed at `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-95` + `:117`; Task 4 patches |

## References

- `[[spec-connector-mysql]]`
- Upstream repo: <https://github.com/benborla/mcp-server-mysql>
- npm: <https://www.npmjs.com/package/@benborla29/mcp-server-mysql>
- `[[../../constitution|Constitution §Read-only database]]`
- `[[../../rules/integration-tokens-in-db-only]]`
- `[[../2026-05-19-connector-postgres/phase-0-discovery|postgres Phase 0 — precedent]]`
