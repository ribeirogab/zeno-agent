# MySQL Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `mysql` to the curated connectors catalog as a stdio MCP wrapping `@benborla29/mcp-server-mysql` invoked via `npx -y`, locked to read-only by omitting all `ALLOW_*` write-enable env vars from the catalog. Land a generic fix to `regenerate-catalog-tool-snapshots.mjs` so it forwards all required secrets (today it only forwards the first), unblocking MySQL's 5-secret model and any future multi-secret connector.

**Architecture:** Standard `mode: env` stdio connector — the 5 `MYSQL_*` keys are read from `process.env` of the spawned subprocess. The catalog entry exposes only `mysql_query` (per Phase 0 confirmation) via `categoryPrefixMap: { "mysql_query": "read" }`, with `authCheckTool: 'mysql_query'` + `authCheckArgs: { sql: 'SELECT 1' }` (already wired through the install-verify path by the postgres rollout). The Dockerfile prefetches `@benborla29/mcp-server-mysql` so the runtime first-install does not race the 10s discovery timeout. The regen script gets a small generic patch to iterate all required secrets instead of `find(s => s.required)`.

**Tech Stack:** TypeScript (strict mode), Node.js 24 LTS, pnpm workspaces, vitest, biome, zod. The MCP server itself is a Node package (no Python toolchain needed for this connector — `uv`/`uvx` already in the image but unused here).

**For this spec:** `[[spec-connector-mysql]]`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `.vault/specs/2026-05-19-connector-mysql/phase-0-discovery.md` | Create | Record M0.1 → M0.6 results: npm metadata, cold-start timing, live tool list, write-rejection probe, code-trace citations for `authCheckArgs` propagation + regen-script single-secret gap. |
| `infra/Dockerfile` | Modify | Add `RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 \|\| true` after the existing postgres prefetch (line 31) so the image ships with the package pre-materialized in the global npm cache. |
| `agent/assets/connectors/mysql.svg` (or `.png`) | Create | Brand icon — simple-icons CC0 SVG preferred. |
| `agent/connectors-catalog.json` | Modify | Insert the `mysql` entry alphabetically between `linear` and `postgres`. `command: 'npx'`, `args: ['-y', '@benborla29/mcp-server-mysql']`, 5 `MYSQL_*` required secrets, `authCheckTool: 'mysql_query'`, `authCheckArgs: { sql: 'SELECT 1' }`, `categoryPrefixMap: { "mysql_query": "read" }`, `tools: []` initially. After Task 5: populated `tools[]`. |
| `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` | Modify | Replace the `find(s => s.required)` single-secret logic at lines 81-95 / 117 with a loop that builds a `secrets` array from **all** required secrets whose env vars are set. Skip-with-warning when any required env var is missing (name the first missing key in the message). |
| `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` | Touch | Rewritten by the regen script with the new mysql.tools[] plus any incidental updates to other entries (mirror mode). Reviewed for zero unrelated diff. |

No DB migration. No new package. No code change in `mcp-discover` or the API. No new tests added — the changes are catalog metadata + a one-line Dockerfile addition + a focused script patch. Existing API catalog tests (`pnpm --filter @zeno/api test`) cover schema parsing of the new entry, and `pnpm run quality-gate` is the gate.

---

## Phase Ordering

1. **Task 0 — Phase 0 Discovery.** Vet upstream, capture tool list, time cold-start, cite `authCheckArgs` wiring, confirm the regen-script gap.
2. **Task 1 — Dockerfile prefetch.** Inserts the warm-cache step into the worker image.
3. **Task 2 — MySQL icon.** Brand asset under `agent/assets/connectors/`.
4. **Task 3 — Catalog entry.** Adds `mysql` to `agent/connectors-catalog.json` with empty `tools: []`.
5. **Task 4 — Regen script patch.** Extends `regenerate-catalog-tool-snapshots.mjs` to forward all required secrets. Includes a regression check against postgres' single-secret path.
6. **Task 5 — Snapshot regen.** Runs the patched script against a live MySQL → populates `mysql.tools[]`. Diff review enforces `category: read` everywhere and no write-capable tool names.
7. **Task 6 — `pnpm run quality-gate` green.**
8. **Task 7 — Manual smoke.** Validates M1.* / M2.* / M3.* / M4.* against a real MySQL (Docker container + Slack DM). Operator-driven.
9. **Task 8 — Reflection + ship.** Update spec frontmatter to `shipped`, capture learnings, open PR via `/new-pr`.

Tasks 1-3 can ship in any order. Task 5 requires Tasks 3 + 4 on disk. Task 7 requires Task 1's Dockerfile change to be in the running worker image (`zeno start --build`).

---

## Task 0: Phase 0 — Discovery

**Files:**
- Create: `.vault/specs/2026-05-19-connector-mysql/phase-0-discovery.md`

Phase 0 vets the upstream package, captures the live tool list, times cold-start, and cites the two code paths the spec depends on (`authCheckArgs` propagation + regen-script single-secret gap). If M0.1 finds `@benborla29/mcp-server-mysql` deprecated or abandoned, **HALT** — pivot per the postgres precedent template before continuing.

- [ ] **Step 1: Vet upstream package (M0.1)**

Run:
```bash
npm view @benborla29/mcp-server-mysql version time.modified deprecated
```

Expected: a version number (e.g. `2.0.x` or similar), a `time.modified` ISO date within the last 12 months, and **no** `deprecated` field. If `deprecated` is set OR `time.modified` is > 12 months old → **HALT** and re-open brainstorming on alternatives (per postgres Phase 0 pivot).

Capture the raw output for the discovery doc.

- [ ] **Step 2: Cold-start timing (M0.2)**

Clear the npm/npx cache, then time the first invocation:
```bash
rm -rf "${HOME}/.npm/_npx"
time npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true
```

The `|| true` is because `--help` may exit non-zero in some packages — the goal is to materialize the package, not test help. Expected: under 30s on a typical network. If > 30s, the Dockerfile prefetch is more critical, but still proceed (it warms the image's npm cache regardless of host speed).

Record `real` time in the discovery doc.

- [ ] **Step 3: Start a throwaway MySQL for live probes (M0.3, M0.4)**

```bash
docker run --rm -d --name mysql-discover \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=smoke \
  -p 3399:3306 \
  mysql:8
sleep 15  # mysql:8 needs ~10s for first-init
docker exec mysql-discover mysql -uroot -proot -e "SELECT 1;" 2>&1 | tail -1
```

Expected: final line shows `1` — confirms the server is reachable.

- [ ] **Step 4: Live tools/list JSON-RPC probe (M0.3)**

Use Node's REPL or a tiny script to spawn the MCP and call `tools/list`. Save the following as `tmp/mysql-discover/probe.mjs` (gitignored — `tmp/` per `.vault/rules/generated-files-location.md`):

```js
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '3399',
  MYSQL_USER: 'root',
  MYSQL_PASS: 'root',
  MYSQL_DB: 'smoke',
};

const child = spawn('npx', ['-y', '@benborla29/mcp-server-mysql'], {
  env,
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
child.stdout.on('data', (chunk) => {
  buf += chunk.toString();
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    console.log(line);
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '0.0.0' } } });
send({ jsonrpc: '2.0', method: 'notifications/initialized' });
send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });

setTimeout(() => { child.kill(); process.exit(0); }, 8000);
```

Run:
```bash
mkdir -p tmp/mysql-discover
# (save the script above to tmp/mysql-discover/probe.mjs)
node tmp/mysql-discover/probe.mjs | tee tmp/mysql-discover/tools-list.json
```

Expected: `tools-list.json` contains an `initialize` response and a `tools/list` response with at least one tool. Record the **full** tool list (names + descriptions + input schemas) in the discovery doc. The issue cites a single tool (`mysql_query`); if more appear, plan §"Catalog entry" updates `categoryPrefixMap` accordingly before Task 3 lands.

- [ ] **Step 5: Write-rejection probe (M0.4)**

Create a table the agent could try to mutate:
```bash
docker exec mysql-discover mysql -uroot -proot smoke -e \
  "CREATE TABLE smoke_table (id INT AUTO_INCREMENT PRIMARY KEY, col INT); INSERT INTO smoke_table (col) VALUES (1);"
```

Then probe `mysql_query` with an `INSERT` payload (using the same JSON-RPC harness as Step 4, but adding a `tools/call` after `tools/list`). Quick adaptation: extend `probe.mjs` after the `tools/list` send:

```js
send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mysql_query', arguments: { sql: 'INSERT INTO smoke_table (col) VALUES (99)' } } });
```

Re-run:
```bash
node tmp/mysql-discover/probe.mjs | tee tmp/mysql-discover/write-probe.json
```

Then verify the row was NOT inserted:
```bash
docker exec mysql-discover mysql -uroot -proot smoke -e "SELECT COUNT(*) FROM smoke_table;"
```

Expected: count is still `1` (the seed row), AND `write-probe.json` shows an error response from `mysql_query` indicating writes are disallowed (the exact wording depends on `@benborla29` — capture it verbatim for the discovery doc). If the row count is `2`, **HALT** — the upstream contract has regressed and the spec needs re-design.

- [ ] **Step 6: Cite `authCheckArgs` propagation (M0.5)**

Open these two files and confirm the citations match what the spec asserts:

```bash
sed -n '750,760p' apps/api/src/routes/connectors.ts
sed -n '117,123p' apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected output for `connectors.ts:754-757`:
```ts
    const result = await discoverTools(transient, secrets, {
      ...(entry.authCheckTool ? { authCheckTool: entry.authCheckTool } : {}),
      ...(entry.authCheckArgs ? { authCheckArgs: entry.authCheckArgs } : {}),
      ...(entry.categoryPrefixMap ? { categoryPrefixMap: entry.categoryPrefixMap } : {}),
```

Expected output for `regenerate-catalog-tool-snapshots.mjs:119-123`:
```js
    const options = {};
    if (entry.authCheckTool) options.authCheckTool = entry.authCheckTool;
    if (entry.authCheckArgs) options.authCheckArgs = entry.authCheckArgs;
    if (entry.categoryPrefixMap) options.categoryPrefixMap = entry.categoryPrefixMap;
    const result = await discoverTools(transient, secrets, options);
```

If the line numbers have drifted, update them in the discovery doc + the spec's M0.5 row. The substantive check is that `authCheckArgs` is read from the catalog and forwarded to `discoverTools`.

- [ ] **Step 7: Cite regen-script single-secret gap (M0.6)**

```bash
sed -n '80,95p' apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
sed -n '117p' apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected output (line ~81 onwards):
```js
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

And line ~117:
```js
    const secrets = [{ connectorId: 'transient', key: envName, value }];
```

This is the gap Task 4 patches. Cite the exact line numbers in the discovery doc.

- [ ] **Step 8: Write the discovery doc**

Create `.vault/specs/2026-05-19-connector-mysql/phase-0-discovery.md`. Use the postgres precedent as the shape (`.vault/specs/2026-05-19-connector-postgres/phase-0-discovery.md`). Required sections:

```markdown
---
date: 2026-05-19
status: complete
spec: "[[spec-connector-mysql]]"
---
# Phase 0 — Discovery (MySQL connector)

## M0.1 — Upstream package vetting
[paste `npm view` output. Confirm not deprecated, recent publish.]

## M0.2 — Cold-start timing
[paste `time npx -y …` output. Real time: NNs.]

## M0.3 — Live tools/list
[paste tool names + summaries from `tools-list.json`. Confirm 1+ tool, no write-capable names.]

`categoryPrefixMap` decided:
```json
{ "mysql_query": "read" }
```
(extend if Step 4 revealed more tools)

## M0.4 — Write rejection probe
[paste error message from `write-probe.json`. Confirm row count unchanged.]

## M0.5 — authCheckArgs propagation cite
- `apps/api/src/routes/connectors.ts:754-757` — install/test path forwards `authCheckArgs`.
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-123` — regen path forwards `authCheckArgs`.

(verbatim source above)

## M0.6 — Regen script single-secret gap
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-95` — picks only `find(s => s.required)`.
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:117` — passes single-element `secrets[]`.

(Task 4 patches both. Postgres unaffected — only one required secret today.)

## Container cleanup
`docker stop mysql-discover` — done.

## References
- `[[spec-connector-mysql]]`
- Upstream repo: https://github.com/benborla/mcp-server-mysql
- npm: https://www.npmjs.com/package/@benborla29/mcp-server-mysql
```

- [ ] **Step 9: Cleanup**

```bash
docker stop mysql-discover
```

The `tmp/mysql-discover/` artifacts are gitignored. Keep them locally for the PR description if useful; do not commit.

- [ ] **Step 10: Commit the discovery doc**

```bash
git add .vault/specs/2026-05-19-connector-mysql/phase-0-discovery.md
git commit -m "docs(spec): connector-mysql phase 0 discovery"
```

---

## Task 1: Dockerfile — prefetch `@benborla29/mcp-server-mysql`

**Files:**
- Modify: `infra/Dockerfile` (insert a `RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true` step after the postgres prefetch at line 31).

Cold-start npm fetches (`npx -y`) can exceed `DISCOVER_TIMEOUT_MS = 10s` on a slow network. Prefetching at image-build time turns the runtime first-install into a warm-cache lookup, same as the postgres precedent (line 31 of the current Dockerfile).

- [ ] **Step 1: Read the surrounding context**

```bash
sed -n '23,33p' infra/Dockerfile
```

Expected: lines 24-31 contain the existing `uv` install + the `RUN uvx postgres-mcp --help >/dev/null` postgres prefetch. The new mysql prefetch belongs **right after** the postgres prefetch and **before** `RUN corepack enable …` (line 33).

- [ ] **Step 2: Add the prefetch step**

Edit `infra/Dockerfile` and insert immediately after the existing `RUN uvx postgres-mcp --help >/dev/null` line (currently line 31):

```dockerfile

# Spec 2026-05-19-connector-mysql: prefetch @benborla29/mcp-server-mysql so the
# runtime first-install does not race DISCOVER_TIMEOUT_MS (10s). `|| true`
# because the package's `--help` exits non-zero in some versions; the goal is
# to populate npm's global cache, not test help.
RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true
```

- [ ] **Step 3: Confirm the change is in the right stage**

```bash
grep -n -B1 -A2 "@benborla29/mcp-server-mysql" infra/Dockerfile
```

Expected: the new `RUN npx -y @benborla29/mcp-server-mysql --help` line appears in the `FROM node:24-slim AS base` block (above the line `RUN corepack enable …`). It must be in the `base` stage so every downstream stage (deps, builder, runtime) inherits the cached npm data.

- [ ] **Step 4: Commit**

```bash
git add infra/Dockerfile
git commit -m "build(infra): prefetch @benborla29/mcp-server-mysql in worker image"
```

Note: the running worker container will NOT have the new prefetched cache until the operator runs `zeno start --build`. Documented in Task 7 Step 0 below.

---

## Task 2: MySQL brand icon

**Files:**
- Create: `agent/assets/connectors/mysql.svg` (or `.png` fallback).

The catalog loader's `resolveIconPath` handles either; the `/catalog/icons/:filename` route picks MIME from the extension.

- [ ] **Step 1: Download the simple-icons SVG (CC0)**

```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/mysql.svg" -o agent/assets/connectors/mysql.svg
```

Expected: file ~1 KB, dolphin-with-text mark, opens cleanly in a browser.

If the URL 404s, fall back to:
```bash
curl -fsSL "https://labs.mysql.com/common/logos/mysql-logo.svg" -o agent/assets/connectors/mysql.svg
```

(Use whichever extension landed — `.svg` preferred; Task 3's catalog entry's `icon` field must match.)

- [ ] **Step 2: Verify size and content**

```bash
ls -lh agent/assets/connectors/mysql.*
file agent/assets/connectors/mysql.*
```

Expected: a few kilobytes (SVG). `file` reports `SVG Scalable Vector Graphics image`.

- [ ] **Step 3: Commit**

```bash
git add agent/assets/connectors/mysql.*
git commit -m "feat(assets): mysql connector icon"
```

---

## Task 3: Catalog entry

**Files:**
- Modify: `agent/connectors-catalog.json` (insert the new entry alphabetically between `linear` and `postgres`).

This task lands the entry with `tools: []`. Task 5 populates `tools[]` via the snapshot regen.

- [ ] **Step 1: Locate the insertion point**

```bash
grep -n '"id":' agent/connectors-catalog.json
```

Expected: order shows `github-app`, `github`, `klaviyo`, `linear`, `postgres`, `swarmia`, `sentry`. Insert `mysql` after `linear` (around line 797, immediately before `postgres`). Slug ordering is cosmetic but alphabetical reads cleanly.

- [ ] **Step 2: Find the exact byte position to insert**

Open `agent/connectors-catalog.json` and find the closing `}` of the `linear` entry — it sits at the line just before `{ "id": "postgres", …` (around line 796 — the `},` after `linear`'s `tags` array). Insert the new entry between that `},` and the `{` opening `postgres`.

- [ ] **Step 3: Add the entry**

Insert the following object into `agent/connectors-catalog.json` between the `linear` and `postgres` entries:

```json
    {
      "id": "mysql",
      "name": "MySQL",
      "description": "Read-only access to a MySQL database via the MySQL MCP server (@benborla29/mcp-server-mysql). Writes are gated behind upstream ALLOW_INSERT_OPERATION / ALLOW_UPDATE_OPERATION / ALLOW_DELETE_OPERATION env vars which this catalog never sets. One installation per database connection.",
      "icon": "mysql.svg",
      "docsUrl": "https://github.com/benborla/mcp-server-mysql",
      "transport": "stdio",
      "transportConfig": {
        "command": "npx",
        "args": [
          "-y",
          "@benborla29/mcp-server-mysql"
        ]
      },
      "authCheckTool": "mysql_query",
      "authCheckArgs": {
        "sql": "SELECT 1"
      },
      "categoryPrefixMap": {
        "mysql_query": "read"
      },
      "secrets": [
        {
          "key": "MYSQL_HOST",
          "label": "Host",
          "help": "Hostname or IP of the MySQL server. Example: db.example.com or an RDS endpoint. Connector is locked to read-only — Constitution §Read-only database.",
          "required": true
        },
        {
          "key": "MYSQL_PORT",
          "label": "Port",
          "help": "TCP port. MySQL default is 3306.",
          "required": true
        },
        {
          "key": "MYSQL_USER",
          "label": "User",
          "help": "Database user. Use a read-only role for defense-in-depth — Constitution §Read-only database.",
          "required": true
        },
        {
          "key": "MYSQL_PASS",
          "label": "Password",
          "help": "User password. Stored encrypted in connector_secrets, never in .env.",
          "required": true
        },
        {
          "key": "MYSQL_DB",
          "label": "Database name",
          "help": "Default database/schema to connect to.",
          "required": true
        }
      ],
      "tools": [],
      "terminology": {
        "instance": "Database"
      },
      "tags": [
        "database",
        "sql"
      ]
    },
```

If Phase 0 (Task 0 Step 4) revealed tools beyond `mysql_query`, extend `categoryPrefixMap` accordingly **before this commit** — every probable new name maps to `"read"` unless it starts with `write_` / `create_` / `update_` / `delete_` / `insert_` / `drop_` / `alter_`, in which case **HALT** and re-open the spec's §Read-only enforcement section.

- [ ] **Step 4: Verify the catalog parses**

```bash
pnpm --filter @zeno/api test
```

Expected: every API test green. The `loadCatalog()` schema check fails if the JSON is malformed or violates `catalogFileSchema`.

- [ ] **Step 5: Commit**

```bash
git add agent/connectors-catalog.json
git commit -m "feat(connectors): add mysql catalog entry (@benborla29/mcp-server-mysql, read-only by default)"
```

---

## Task 4: Regen script — forward all required secrets

**Files:**
- Modify: `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` (the `fetchToolsFromLiveMcp` function, lines ~80-117).

Today the script forwards only the first required secret (`(entry.secrets ?? []).find((s) => s.required)`). For postgres that's `DATABASE_URI` — works fine. For MySQL that would be `MYSQL_HOST` alone — the MCP fails to connect because `MYSQL_USER` / `MYSQL_PASS` / `MYSQL_DB` / `MYSQL_PORT` are unset. The patch iterates all required secrets and forwards every one whose env var is set. If ANY required env var is unset, skip the entry with a warning naming the first missing key (declaration order in `secrets[]`).

- [ ] **Step 1: Read the current code**

```bash
sed -n '75,120p' apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected: the `fetchToolsFromLiveMcp` function from `for (const entry of catalog.connectors) {` through the `discoverTools(...)` call. The two regions to change:

(a) The `required = find(s => s.required)` block at lines ~81-95.
(b) The single-element `secrets` array at line ~117.

- [ ] **Step 2: Patch the required-secrets collection**

Edit `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`. Replace the block currently spanning lines 81-95 (the `required = …` discovery and missing-env warnings) with:

```js
    const requiredSecrets = (entry.secrets ?? []).filter((s) => s.required);
    if (requiredSecrets.length === 0) {
      console.error(
        `skip ${entry.id}: no required secret (cannot derive env var name)`,
      );
      continue;
    }
    const missing = requiredSecrets.find((s) => !process.env[s.key]);
    if (missing) {
      console.warn(
        `skip ${entry.id}: missing env var ${missing.key} (set it to fetch tools for this entry)`,
      );
      continue;
    }
```

This keeps the existing "no required secret declared at all" guard, switches the "missing env var" message to name the **first** missing required key (declaration order — `Array.prototype.find` matches declaration order in the filtered list, which preserves the original `secrets[]` ordering).

- [ ] **Step 3: Patch the `secrets` array construction**

Find the line currently at ~117 (one above the `const options = {}` line that Task 1 of postgres' plan landed):
```js
    const secrets = [{ connectorId: 'transient', key: envName, value }];
```

Replace with:
```js
    const secrets = requiredSecrets.map((s) => ({
      connectorId: 'transient',
      key: s.key,
      value: process.env[s.key],
    }));
```

(`envName` and `value` from the old code are no longer used — remove any lingering references. There should be no other consumer of those variables in this function.)

- [ ] **Step 4: Run regen in mirror-only mode (regression: postgres)**

```bash
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
git diff apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
git diff agent/connectors-catalog.json
```

Expected: both diffs are EMPTY. Mirror-only mode does not fetch from any live MCP; it only mirrors the on-disk catalog into the snapshot file. The mysql entry shipped in Task 3 has `tools: []`, so the snapshot has `mysql: []`. Postgres' single-required-secret model is unaffected — `requiredSecrets` is length 1 and the loop produces an identical one-element array.

If postgres' `tools[]` mutated, **HALT** — the patch introduced a regression in the single-secret path. Re-read Step 2 + Step 3 against the postgres entry's shape.

- [ ] **Step 5: Run regen in fetch-mode WITHOUT env vars (verifies skip-with-warning)**

```bash
unset MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS MYSQL_DB DATABASE_URI 2>/dev/null || true
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp 2>&1 | tee tmp/mysql-discover/regen-no-env.log
```

Expected: stderr contains `skip mysql: missing env var MYSQL_HOST …` (or whichever key is FIRST in `secrets[]` declaration order — should be `MYSQL_HOST` per Task 3). The postgres entry similarly warns `skip postgres: missing env var DATABASE_URI …`. No `mysql.tools[]` or `postgres.tools[]` was modified — verify:

```bash
git diff agent/connectors-catalog.json
```

Expected: zero diff.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
git commit -m "chore(worker): regen script forwards all required secrets, not just the first"
```

---

## Task 5: Populate `mysql.tools[]` via snapshot regen

**Files:**
- Modify (in place): `agent/connectors-catalog.json` — the `mysql.tools[]` array.
- Touch: `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (rewritten by the script).

Requires Tasks 3 + 4 on disk. No code change; only data refresh.

- [ ] **Step 1: Start a throwaway MySQL**

```bash
docker run --rm -d --name mysql-regen \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=regen \
  -p 3399:3306 \
  mysql:8
# mysql:8 takes ~10s to initialize on first boot
sleep 15
docker exec mysql-regen mysql -uroot -proot -e "SELECT 1;"
```

Expected: final command prints `1`.

- [ ] **Step 2: Run the regen script in fetch mode**

```bash
MYSQL_HOST=127.0.0.1 \
MYSQL_PORT=3399 \
MYSQL_USER=root \
MYSQL_PASS=root \
MYSQL_DB=regen \
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
```

Expected console output:
```
fetching tools from live MCP for mysql...
  mysql: N tools updated
snapshot written: apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
```

(`N` is the live tool count — issue cites 1 (`mysql_query`); Phase 0 confirms.)

- [ ] **Step 3: Review the diff manually**

```bash
git diff agent/connectors-catalog.json
```

Expected: only the `mysql.tools[]` array changed. Every tool's `category` is `"read"`. **STOP and escalate** if:
- Any tool's `category` is `"interactive"` or `"write"` → `categoryPrefixMap` did not match a new name. Extend the map in `agent/connectors-catalog.json`, re-run Step 2.
- Any tool's name starts with `write_` / `create_` / `update_` / `delete_` / `insert_` / `drop_` / `alter_` → upstream contract violated. Halt per Constitution §Read-only database; re-open the spec.

For the expected single-tool case, the diff should show approximately:
```json
"tools": [
  {
    "name": "mysql_query",
    "description": "...",
    "category": "read",
    "defaultPermission": "always_allow"
  }
],
```

- [ ] **Step 4: Sanity-test the skip-with-warning path**

Run the script again WITHOUT any `MYSQL_*` env var:
```bash
unset MYSQL_HOST MYSQL_PORT MYSQL_USER MYSQL_PASS MYSQL_DB
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp 2>&1 | grep -E "skip (mysql|postgres):"
git diff agent/connectors-catalog.json
```

Expected: stderr line includes `skip mysql: missing env var MYSQL_HOST …`. `git diff` shows zero diff on the catalog (the existing `mysql.tools[]` from Step 2 stays).

- [ ] **Step 5: Stop the throwaway DB**

```bash
docker stop mysql-regen
```

- [ ] **Step 6: Commit**

```bash
git add agent/connectors-catalog.json apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
git commit -m "chore(catalog): populate mysql tools[] from live MCP"
```

---

## Task 6: `quality-gate` green

**Files:** No source edits expected. Fix in place if anything fails.

- [ ] **Step 1: Run the gate**

```bash
pnpm run quality-gate
```

Expected: zero failures across lint + typecheck + tests in every workspace. The change set spans:
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` — multi-secret patch.
- `infra/Dockerfile` — prefetch step.
- `agent/connectors-catalog.json` — new entry + populated `tools[]`.
- `agent/assets/connectors/mysql.*` — icon.
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — refreshed.

- [ ] **Step 2: Fix any failures in place**

Common failure modes for this scope:
- **Biome formatting on JSON** — run `pnpm --filter @zeno/api lint:fix` (catalog file is JSON; biome formats it).
- **Snapshot mismatch in `connectors-e2e`** — re-run Task 5 Step 2 (the snapshot must reflect the committed catalog).
- **Catalog schema rejection** — recheck the JSON syntax of the new entry, especially commas + bracket matching around the `linear` ↔ `mysql` ↔ `postgres` boundaries.
- **Script lint complaint** about unused `envName` / `value` identifiers — confirm they were removed in Task 4 Step 3.

- [ ] **Step 3: Commit any fix-ups separately**

```bash
git add -p   # stage only the fix-up changes
git commit -m "fix(connectors): post-quality-gate adjustments"
```

(Skip if the gate was green on first try.)

---

## Task 7: Manual smoke

**Files:** No code. Evidence captured under `tmp/mysql-smoke/` (gitignored per `.vault/rules/generated-files-location.md`).

**Pre-requisite:** rebuild the worker image to pick up Task 1's Dockerfile change:
```bash
zeno start --build
```

(Otherwise the runtime first-install may hit the cold-start race.)

- [ ] **Step 1: Provision a smoke MySQL + read-only user**

```bash
docker run --rm -d --name mysql-smoke \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=smoke \
  -p 3399:3306 \
  mysql:8
sleep 15
docker exec mysql-smoke mysql -uroot -proot smoke -e \
  "CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, total DECIMAL(10,2)); \
   INSERT INTO orders (total) SELECT RAND()*1000 FROM information_schema.columns LIMIT 100; \
   CREATE USER 'ro_user'@'%' IDENTIFIED BY 'ro_pass'; \
   GRANT SELECT ON smoke.* TO 'ro_user'@'%'; \
   FLUSH PRIVILEGES;"
docker exec mysql-smoke mysql -uroot -proot smoke -e "SELECT COUNT(*) FROM orders;"
```

Expected: final command prints `100`.

Credentials to use in the install: host `host.docker.internal` (macOS/Windows Docker Desktop) or the host's LAN IP (Linux — note in PR), port `3399`, user `ro_user`, pass `ro_pass`, db `smoke`.

- [ ] **Step 2: M1.1 — install with `--secret` flags**

```bash
zeno connector install mysql --label "smoke" \
  --secret MYSQL_HOST=host.docker.internal \
  --secret MYSQL_PORT=3399 \
  --secret MYSQL_USER=ro_user \
  --secret MYSQL_PASS=ro_pass \
  --secret MYSQL_DB=smoke
```

Expected last 3 lines:
```
queued · correlationId=<uuid>
installed
verified · N tools
```

(`N` matches Phase 0 — ≥ 1.)

Capture stdout to `tmp/mysql-smoke/m1.1.txt`.

- [ ] **Step 3: M1.2 — unreachable host → auto-rollback**

```bash
zeno connector install mysql --label "m1-2" \
  --secret MYSQL_HOST=127.0.0.1 \
  --secret MYSQL_PORT=9999 \
  --secret MYSQL_USER=nobody \
  --secret MYSQL_PASS=bad \
  --secret MYSQL_DB=x
echo "exit=$?"
zeno connector list | grep -i mysql-m1-2 || echo "absent"
```

Expected: `verification failed: network`, `rolling back…`, `uninstalled`, exit 1. Final grep prints `absent`.

- [ ] **Step 4: M1.3 — bad credentials → auto-rollback**

```bash
zeno connector install mysql --label "m1-3" \
  --secret MYSQL_HOST=host.docker.internal \
  --secret MYSQL_PORT=3399 \
  --secret MYSQL_USER=baduser \
  --secret MYSQL_PASS=badpass \
  --secret MYSQL_DB=smoke
echo "exit=$?"
zeno connector list | grep -i mysql-m1-3 || echo "absent"
```

Expected: `verification failed: <auth|timeout>` (either is acceptable per postgres precedent learning), auto-rollback, exit 1. Final grep prints `absent`. Note which classification was observed for the spec acceptance criteria.

- [ ] **Step 5: M1.4 — listing reflects install**

```bash
zeno connector list | grep -i mysql
```

Expected: `mysql-smoke` row, `enabled`, `lastVerifiedAt` populated.

- [ ] **Step 6: M1.5 — second instance**

```bash
docker exec mysql-smoke mysql -uroot -proot -e "CREATE DATABASE smoke2;"
zeno connector install mysql --label "smoke2" \
  --secret MYSQL_HOST=host.docker.internal \
  --secret MYSQL_PORT=3399 \
  --secret MYSQL_USER=ro_user \
  --secret MYSQL_PASS=ro_pass \
  --secret MYSQL_DB=smoke2
zeno connector list | grep mysql-
```

Expected: `mysql-smoke` AND `mysql-smoke2` both present.

Note: M1.5 may trigger the documented multi-instance verify-skip bug (`.vault/learnings/cli-install-verify-skips-on-multi-instance.md`). Both rows still exist; just record that verify-output was/wasn't printed.

- [ ] **Step 7: M2.3 — confirm catalog identity**

```bash
PROFILE_PORT=$(zeno profile show $(zeno profile list --json | jq -r '.[] | select(.default==true) | .name') --json | jq -r .port)
curl -s -H "x-zeno-origin: cli" "http://127.0.0.1:${PROFILE_PORT}/api/connectors/mysql-smoke" | jq '.command, .args, (.env // {} | keys)'
```

Expected: `"npx"`, `["-y", "@benborla29/mcp-server-mysql"]`, and a keys array equal to `["MYSQL_DB", "MYSQL_HOST", "MYSQL_PASS", "MYSQL_PORT", "MYSQL_USER"]` (order may vary). **No `ALLOW_*` key appears.**

- [ ] **Step 8: M2.2 — env isolation**

Trigger a tool call (Step 9 below or `zeno connector test mysql-smoke`) and during it:
```bash
PROFILE_NAME=$(zeno profile list --json | jq -r '.[] | select(.default==true) | .name')
CONTAINER=$(zeno profile show "${PROFILE_NAME}" --json | jq -r .containerName)
docker exec "${CONTAINER}" env | grep '^MYSQL_' || echo "absent"
```

Expected: `absent`.

- [ ] **Step 9: M3.1 — SELECT-style Slack DM**

In Slack, DM the agent: "Show me the 10 most recent orders from the smoke mysql."

Expected: the agent calls `mcp__mysql-smoke__mysql_query` with a `SELECT` and returns rows. Screenshot to `tmp/mysql-smoke/m3.1.png`.

- [ ] **Step 10: M3.2 — schema DM**

DM: "Show me the schema of the orders table in the smoke mysql."

Expected: the agent calls `mysql_query` with `SHOW COLUMNS FROM orders;` (or `DESCRIBE orders;`) and returns the column list. Screenshot to `tmp/mysql-smoke/m3.2.png`.

- [ ] **Step 11: M3.3 — DELETE-style DM, expect server-side refusal**

DM: "Delete all rows from the orders table in the smoke mysql."

Expected: the upstream MCP server rejects under the "writes not allowed" contract (no `ALLOW_DELETE_OPERATION` set); the agent reports failure. Verify:
```bash
docker exec mysql-smoke mysql -uroot -proot smoke -e "SELECT COUNT(*) FROM orders;"
```

Expected: still `100`. Screenshot the Slack response to `tmp/mysql-smoke/m3.3.png` and capture the count check.

- [ ] **Step 12: M4.1 — snapshot regen against smoke DB (covered by Task 5)**

Already verified in Task 5 Step 2 against `regen` DB. Re-running with the `ro_user` credentials is not necessary unless the operator wants a second sample point. Document this as "M4.1 covered by Task 5 Step 2 evidence."

- [ ] **Step 13: M4.2 — snapshot regen without env var (covered by Task 5)**

Already verified in Task 5 Step 4. Document the same way.

- [ ] **Step 14: Teardown**

```bash
zeno connector uninstall mysql-smoke --yes
zeno connector uninstall mysql-smoke2 --yes
docker stop mysql-smoke
```

- [ ] **Step 15: Evidence handoff**

`tmp/` is gitignored. Copy any artifact the PR description needs (screenshots, output snippets) **out** of `tmp/` and embed inline in the PR — do NOT commit `tmp/` files.

---

## Task 8: Reflection + ship

**Files:**
- Modify: `.vault/specs/2026-05-19-connector-mysql/spec-connector-mysql.md` frontmatter + acceptance-criteria checkboxes.
- Possibly create: `.vault/learnings/<slug>.md`.
- Possibly update: `.vault/_index/learnings.md`.

- [ ] **Step 1: Reflection**

Ask: "What did I learn implementing this that wasn't obvious from the spec?" Concrete candidates:
- Did `@benborla29/mcp-server-mysql`'s "writes not allowed" error message match the spec's expectation? Capture the exact wording for future reference.
- Did the cold-start prefetch hold under runtime cold cache? (Should — image-build runs `npx -y` once; runtime hits the global cache.)
- Did the multi-secret regen patch surface any edge case during Task 5 (e.g., a required secret without an obvious env-var name)?
- Did M1.3 surface as `auth` or `timeout`? Postgres learning says both are acceptable; note which one mysql exhibits.
- Did `categoryPrefixMap` need extension during Phase 0 / Task 3?

If at least one answer is non-obvious, write an atomic learning note (Step 2). If nothing surprising came up, write that explicitly in the PR description ("No new learnings from this spec").

- [ ] **Step 2: Create a learning note (if applicable)**

```bash
cp .vault/templates/learning.md .vault/learnings/<slug>.md
# edit the note, link back with [[../specs/2026-05-19-connector-mysql/spec-connector-mysql|connector-mysql spec]]
# add a line under the right heading in .vault/_index/learnings.md
```

- [ ] **Step 3: Flip the spec to `shipped`**

Edit the frontmatter of `.vault/specs/2026-05-19-connector-mysql/spec-connector-mysql.md`:
```yaml
---
status: shipped
feature: connector-mysql
created: 2026-05-19
shipped: 2026-05-19   # actual ship date
issue: 81
---
```

- [ ] **Step 4: Tick verified acceptance criteria**

In the spec's `## Acceptance Criteria` section, change `- [ ]` to `- [x]` for every criterion the quality-gate (Task 6) and the smoke (Task 7) verified. Leave un-ticked any criterion not actually verified; explain why in the PR description.

- [ ] **Step 5: Commit reflection + ship marker**

```bash
git add .vault/specs/2026-05-19-connector-mysql/spec-connector-mysql.md
# only if a learning note was added:
git add .vault/learnings/<slug>.md .vault/_index/learnings.md
git commit -m "docs(spec): connector-mysql shipped"
```

- [ ] **Step 6: Open the PR via `/new-pr`**

Per CLAUDE.md: use `/new-pr` — DO NOT run `gh pr create` directly. The PR description should:
- Reference issue #81.
- Note that the `authCheckArgs` propagation concern was resolved during spec review (already wired by postgres rollout).
- Highlight the regen-script multi-secret patch as a generic improvement (benefits any future multi-secret connector).
- Embed smoke evidence (output snippets + screenshots).
- Flag the Dockerfile change → operator needs `zeno start --build` after merge.

---

## Risks / Open Decisions

- **`npx -y` cold-start may still exceed 10s on first runtime install** if the operator nukes their image cache. Mitigation: re-run `zeno connector install mysql` — the second time hits the host's per-user npm cache.
- **`host.docker.internal` on Linux.** Smoke Step 1 assumes Docker Desktop. Linux needs `--add-host=host.docker.internal:host-gateway` on the worker container OR the host's LAN IP. Document the path used in the PR.
- **`@benborla29/mcp-server-mysql`'s read-only contract is "no write tools exposed", not server-side SQL parsing.** A future release that adds a write-capable tool would silently leak the guarantee. The Task 5 Step 3 diff review is the canary; halt if any `*_insert`/`*_update`/`*_delete`/`*_create` name appears.
- **Multi-secret patch could regress on a non-postgres single-secret connector**. The mirror-mode check in Task 4 Step 4 covers postgres but does not exercise klaviyo/sentry/swarmia/linear/github paths. They all happen to have at most one required secret today, so the loop produces a 1-element array identical to the old code. If a future spec adds a multi-secret connector that doesn't follow MySQL's shape, re-validate.

---

## Self-review

**Spec coverage check.** Every section of the spec maps to a task:
- §"Phase 0" (M0.1-M0.6) → Task 0.
- §"Constraints — no `ALLOW_*` env vars in catalog" → Task 3 (entry omits them) + Task 5 Step 3 (diff review enforces no write tools).
- §"Constraints — five required secrets" → Task 3 entry shape.
- §"Constraints — `authCheckTool` + `authCheckArgs`" → Task 3 entry shape; M0.5 confirms wiring.
- §"Constraints — `categoryPrefixMap`" → Task 3 entry shape; extends if Phase 0 surfaced more tools.
- §"Constraints — Docker prefetch" → Task 1.
- §"Constraints — regen script must forward all required secrets" → Task 4.
- §"Constraints — smoke against real MySQL" → Task 7.
- §"User Stories M1.* / M2.* / M3.* / M4.*" → Task 7 (all smoke IDs mapped step-by-step) and Task 5 (M4.1 / M4.2).
- §"Acceptance Criteria — every bullet" → Tasks 1 (Dockerfile), 3 (catalog shape, schema, `authCheckTool`, `authCheckArgs`, `categoryPrefixMap`), 4 (regen patch + skip-with-warning behaviour + postgres regression), 5 (mysql.tools[] populated, read-only category), 6 (`quality-gate`), 7 (all M-tagged criteria).
- §"Risks and Mitigations" → echoed in this plan's "Risks / Open Decisions" section.

**Placeholder scan.** No `TBD`, no `TODO`, no `implement appropriately`. The only `<…>` patterns are command placeholders the operator fills at execution time (`<live-mysql-host>`, `<slug>`) — these are explicit args, not gaps. Every code block is complete. Every command has expected output.

**Type / shape consistency.** The catalog entry's `secrets[]` shape (5 entries, `MYSQL_*` keys, all `required: true`) is referenced consistently across Tasks 3, 4, 5, and 7. The regen-script patch's `requiredSecrets` variable is introduced in Task 4 Step 2 and used in Step 3; no other identifier is mentioned without being defined. The new `transportConfig.command` / `args` shape from Task 3 matches the curl/jq assertion in Task 7 Step 7 (`"npx"`, `["-y", "@benborla29/mcp-server-mysql"]`).

---

## Execution approach

**9 tasks; the heaviest is Task 7 (manual smoke) which requires operator presence (Docker + Slack DM screenshots).** Tasks 0-6 are mechanical and well-bounded — every task is 1-3 files with full code blocks in the plan, and steps are 2-5 minute units. Execute **inline** for Tasks 0-6 with checkpoints after each task; defer Task 7 + Task 8 to operator return.

Sub-skill: `superpowers:executing-plans` is sufficient given the focused scope and the fact that the postgres precedent already de-risks the architecture. No fresh subagent dispatch needed per task.
