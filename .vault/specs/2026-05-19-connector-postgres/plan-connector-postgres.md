# Postgres Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `postgres` to the curated connectors catalog as a stdio MCP wrapping `crystaldba/postgres-mcp` invoked via `uvx`, locked to `--access-mode=restricted` for read-only safety.

**Architecture:** Standard `mode: env` stdio connector — `DATABASE_URI` is read from `process.env` of the spawned subprocess. The catalog entry pins `--access-mode=restricted` in `transportConfig.args` so writes are server-rejected regardless of the role. `categoryPrefixMap` maps the 4 non-standard tool prefixes (`execute_sql`, `explain_`, `analyze_`) to `read`. The Dockerfile prefetches `postgres-mcp` deps so runtime first-install does not race the 10s discovery timeout. **No catalog-schema extension** — the original spec's `mode: argv` extension was dropped after Phase 0 swapped the upstream package to one that uses env.

**Tech Stack:** TypeScript (strict mode), Node.js 24 LTS, pnpm workspaces, vitest, biome, zod. Python ≥ 3.12 auto-provisioned by `uv` inside the worker container.

**For this spec:** `[[spec-connector-postgres]]`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` | Modify | Thread `authCheckTool` / `authCheckArgs` / `categoryPrefixMap` from the catalog entry into the `discoverTools(...)` call. |
| `infra/Dockerfile` | Modify | Add `RUN uvx postgres-mcp --help` after the existing `uv` install (line 24) so the image ships with `postgres-mcp` deps pre-materialized. |
| `agent/connectors-catalog.json` | Modify | Add the `postgres` entry: stdio via `uvx postgres-mcp --access-mode=restricted`, `DATABASE_URI` secret (env), `authCheckTool: 'list_schemas'`, explicit `categoryPrefixMap`, `tools: []` initially. |
| `agent/assets/connectors/postgres.svg` (or `.png`) | Create | Brand icon. |

No DB migration. No new package. No code change in `mcp-discover` or the API. **No new tests added** — the changes are catalog metadata + a one-line Dockerfile addition + a script options forwarding. The existing API catalog tests (`pnpm --filter @zeno/api test`) cover schema parsing of the new entry, and `pnpm run quality-gate` is the gate.

---

## Phase Ordering

1. **Phase 0** — Discovery (already done; see `phase-0-discovery.md`).
2. **Phase 1** — Regen script: pass options to `discoverTools(...)`.
3. **Phase 2** — Dockerfile prefetch.
4. **Phase 3** — Postgres icon.
5. **Phase 4** — Catalog entry.
6. **Phase 5** — Snapshot regen against a live Postgres → populate `tools[]`.
7. **Phase 6** — `pnpm run quality-gate` green.
8. **Phase 7** — Manual smoke (P1.* / P2.* / P3.* / P4.* per spec). Requires Docker + live Slack profile.
9. **Phase 8** — Reflection + spec `status: shipped` + PR.

Phases 1-4 can ship in any order; the snapshot regen (Phase 5) requires Phases 1 and 4 to be on disk. Phase 7 cannot run until the worker image is rebuilt with Phase 2's change (`zeno start --build`).

---

## Task 1: Regen script — forward options to `discoverTools`

**Files:**
- Modify: `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` (the `discoverTools(transient, secrets)` call inside `fetchToolsFromLiveMcp`).

The script today calls `discoverTools(transient, secrets)` with no options, so `categoryPrefixMap`, `authCheckTool`, and `authCheckArgs` never get applied. Klaviyo's `klaviyo_*` prefixes go unmapped (the snapshot probably has `interactive` classifications today). For Postgres we need `execute_sql` / `explain_*` / `analyze_*` to classify as `read`, which only happens with the prefix map threaded through.

- [ ] **Step 1: Locate the call site**

Run:
```bash
grep -n "discoverTools" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected: exactly one match — `const result = await discoverTools(transient, secrets);` inside the `fetchToolsFromLiveMcp` function.

- [ ] **Step 2: Patch the call site**

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

- [ ] **Step 3: Sanity-run in mirror-only mode**

Run:
```bash
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
```

Expected: prints `snapshot written: apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap`. Then:

```bash
git diff apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
```

Expected: zero diff (mirror mode doesn't fetch from live MCPs; only mirrors the catalog's `tools[]` into the snapshot file).

- [ ] **Step 4: Commit**

```bash
git add apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs
git commit -m "chore(worker): thread authCheckTool / authCheckArgs / categoryPrefixMap through regen script"
```

---

## Task 2: Dockerfile — prefetch `postgres-mcp` deps

**Files:**
- Modify: `infra/Dockerfile:24` (add a `RUN` step right after the existing `uv` install).

`crystaldba/postgres-mcp` pulls ~63 Python deps (including `psycopg-binary`, `pglast`) on first `uvx` invocation. On a slow network or cold cache this can exceed `DISCOVER_TIMEOUT_MS = 10s`, breaking the first `zeno connector install postgres ...` against verification. Prefetching at image-build time turns the runtime first-install into a warm-cache lookup.

- [ ] **Step 1: Read the surrounding context**

Open `infra/Dockerfile` and locate line 24 (the `uv` install via `astral.sh/uv/0.11.7/install.sh`). The line right after it (`RUN corepack enable ...`) is where the new `RUN uvx postgres-mcp --help` belongs.

- [ ] **Step 2: Add the prefetch step**

In `infra/Dockerfile`, insert AFTER the existing `RUN curl -LsSf https://astral.sh/uv/0.11.7/install.sh ...` line (which is currently line 24) and BEFORE `RUN corepack enable ...`:

```dockerfile
# Prefetch postgres-mcp deps so the runtime first-install does not race
# DISCOVER_TIMEOUT_MS (10s). Resolves ~63 deps including psycopg-binary +
# pglast. Spec 2026-05-19-connector-postgres.
RUN uvx postgres-mcp --help >/dev/null
```

- [ ] **Step 3: Confirm the change is in the right stage**

Run:
```bash
grep -n -A1 "postgres-mcp" infra/Dockerfile
```

Expected: the new `RUN uvx postgres-mcp --help` line appears in the `FROM node:24-slim AS base` block (i.e., before `Stage 2: deps`). It must be in the `base` stage so every downstream stage (deps, builder, runtime) inherits the cached `uv` data.

- [ ] **Step 4: Commit**

```bash
git add infra/Dockerfile
git commit -m "build(infra): prefetch postgres-mcp deps in worker image"
```

Note: the runtime won't have the new prefetched cache until the operator runs `zeno start --build`. Document this in the PR description.

---

## Task 3: Postgres brand icon

**Files:**
- Create: `agent/assets/connectors/postgres.svg` (or `.png` fallback).

The catalog loader's `resolveIconPath` handles either; the `/catalog/icons/:filename` route picks MIME from the extension.

- [ ] **Step 1: Download the simple-icons SVG (CC0)**

Run:
```bash
curl -fsSL "https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/postgresql.svg" -o agent/assets/connectors/postgres.svg
```

Expected: file ~1 KB, single-path elephant mark, opens cleanly in a browser.

If the URL 404s or the simple-icons fetch fails for any reason, fall back to:
```bash
curl -fsSL "https://www.postgresql.org/media/img/about/press/elephant.png" -o agent/assets/connectors/postgres.png
```

(Use whichever extension landed; Task 4's catalog entry's `icon` field needs to match.)

- [ ] **Step 2: Verify size and content**

Run:
```bash
ls -lh agent/assets/connectors/postgres.*
file agent/assets/connectors/postgres.*
```

Expected: a few kilobytes (SVG) or a few tens of kilobytes (PNG). `file` reports `SVG Scalable Vector Graphics image` or `PNG image data`.

- [ ] **Step 3: Commit**

```bash
git add agent/assets/connectors/postgres.*
git commit -m "feat(assets): postgres connector icon"
```

---

## Task 4: Catalog entry

**Files:**
- Modify: `agent/connectors-catalog.json` (insert the new entry in the `connectors[]` array).

- [ ] **Step 1: Pick the insertion point**

Run:
```bash
grep -n '"id":' agent/connectors-catalog.json
```

Expected: the entry order shown. Slot `postgres` alphabetically (after `linear`, before `sentry`); order is cosmetic but readability matters.

- [ ] **Step 2: Add the entry**

Insert the following object into the `connectors[]` array in `agent/connectors-catalog.json`. Match the icon extension to what landed in Task 3 (`postgres.svg` OR `postgres.png`):

```json
{
  "id": "postgres",
  "name": "Postgres",
  "description": "Read-only access to a Postgres database via the Postgres MCP server (crystaldba/postgres-mcp). One installation per database URL.",
  "icon": "postgres.svg",
  "docsUrl": "https://github.com/crystaldba/postgres-mcp",
  "transport": "stdio",
  "transportConfig": {
    "command": "uvx",
    "args": [
      "postgres-mcp",
      "--access-mode=restricted"
    ]
  },
  "authCheckTool": "list_schemas",
  "categoryPrefixMap": {
    "execute_sql": "read",
    "explain_": "read",
    "analyze_": "read"
  },
  "secrets": [
    {
      "key": "DATABASE_URI",
      "label": "Connection URL",
      "help": "postgres://user:pass@host:port/dbname. The connector is locked to --access-mode=restricted (read-only). Use a read-only role for defense-in-depth — Constitution §Read-only database (cf. global CLAUDE.md Rule 22).",
      "required": true
    }
  ],
  "tools": [],
  "terminology": { "instance": "Database" },
  "tags": ["database", "sql"]
}
```

- [ ] **Step 3: Verify the catalog parses**

Run:
```bash
pnpm --filter @zeno/api test
```

Expected: every API test green. Pay attention to any `catalog` / `connectors` test that exercises `loadCatalog()` against the real file — those fail if the JSON is malformed or violates `catalogFileSchema`.

- [ ] **Step 4: Commit**

```bash
git add agent/connectors-catalog.json
git commit -m "feat(connectors): add postgres catalog entry (crystaldba/postgres-mcp, restricted mode)"
```

---

## Task 5: Populate `tools[]` via snapshot regen

**Files:**
- Modify (in place): `agent/connectors-catalog.json` — the `postgres.tools[]` array.
- Touch: `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` (rewritten by the script).

Requires Tasks 1 + 4 on disk. No code change; only data refresh.

- [ ] **Step 1: Start a throwaway Postgres**

Run:
```bash
docker run --rm -d --name pg-regen -e POSTGRES_PASSWORD=t -p 5599:5432 postgres:16
sleep 3
```

Expected: container starts on port 5599.

- [ ] **Step 2: Run the regen script in fetch mode**

Run:
```bash
DATABASE_URI="postgres://postgres:t@localhost:5599/postgres" \
  node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
```

Expected console output:
```
fetching tools from live MCP for postgres...
  postgres: 9 tools updated
snapshot written: apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
```

(The count is 9 today per Phase 0; if upstream changes, it may differ.)

- [ ] **Step 3: Review the diff manually**

Run:
```bash
git diff agent/connectors-catalog.json
```

Expected: only the `postgres.tools[]` array changed. Every tool's `category` is `read`. Verify each name maps as expected:
- `list_schemas`, `list_objects`, `get_object_details`, `get_top_queries` → `read` (default classifier).
- `explain_query`, `analyze_workload_indexes`, `analyze_query_indexes`, `analyze_db_health` → `read` (via `categoryPrefixMap`).
- `execute_sql` → `read` (via `categoryPrefixMap`).

**If any tool's `category` is `interactive` or `write`, STOP.** Either (a) the prefix map didn't apply (revisit Task 1's patch), or (b) upstream added a new tool prefix → extend `categoryPrefixMap` in `agent/connectors-catalog.json`, re-run Step 2.

**If any tool's name starts with `write_` / `create_` / `update_` / `delete_`, STOP and escalate** — this would violate Constitution §Read-only database. The `--access-mode=restricted` server-side enforcement should prevent this, but the catalog must not lie about what tools are reachable.

- [ ] **Step 4: Sanity-test the skip-with-warning path**

Run the script again WITHOUT `DATABASE_URI`:
```bash
unset DATABASE_URI
node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp
git diff agent/connectors-catalog.json
```

Expected: warns `skip postgres: missing env var DATABASE_URI ...`; the on-disk `postgres.tools[]` from Step 2 stays as-is (zero diff).

- [ ] **Step 5: Stop the throwaway DB**

```bash
docker stop pg-regen
```

- [ ] **Step 6: Commit**

```bash
git add agent/connectors-catalog.json apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap
git commit -m "chore(catalog): populate postgres tools[] from live MCP"
```

---

## Task 6: `quality-gate` green

**Files:** No source edits expected. Fix in place if anything fails.

- [ ] **Step 1: Run the gate**

```bash
pnpm run quality-gate
```

Expected: zero failures across lint + typecheck + tests in every workspace. The change set:
- `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` — script patch.
- `infra/Dockerfile` — prefetch step.
- `agent/connectors-catalog.json` — new entry + populated tools[].
- `agent/assets/connectors/postgres.*` — icon.
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — refreshed.

- [ ] **Step 2: Fix any failures in place**

Common failure modes for this scope:
- **Biome formatting on JSON** — run `pnpm --filter @zeno/api lint:fix` (catalog file is JSON and biome formats it).
- **Snapshot mismatch in `connectors-e2e`** — re-run Task 5 Step 2 (the snapshot must reflect the committed catalog).
- **Catalog schema rejection** — re-check the JSON syntax of the new entry, especially commas + bracket matching.

- [ ] **Step 3: Commit any fix-ups separately**

```bash
git add -p   # stage only the fix-up changes
git commit -m "fix(...): post-quality-gate adjustments"
```

(Skip if the gate was green on first try.)

---

## Task 7: Manual smoke

**Files:** No code. Evidence captured under `tmp/postgres-smoke/` (gitignored — `.vault/rules/generated-files-location.md`).

**Pre-requisite:** the operator must rebuild the worker image to pick up Task 2's Dockerfile change:
```bash
zeno start --build
```

(Otherwise the Dockerfile prefetch never lands in the running container and the runtime first-install may hit the cold-start race.)

- [ ] **Step 1: Provision a smoke Postgres + read-only role**

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

URL to paste: `postgresql://ro_user:ro_pass@host.docker.internal:5599/smoke` (macOS/Windows). Linux uses `--add-host=host.docker.internal:host-gateway` on the worker container OR the host LAN IP — note in the PR if running on Linux.

- [ ] **Step 2: P1.1 — install with prompt**

```bash
zeno connector install postgres --label "smoke"
# at the prompt, paste: postgresql://ro_user:ro_pass@host.docker.internal:5599/smoke
```

Expected last 3 lines:
```
queued · correlationId=<uuid>
installed
verified · 9 tools
```

Capture to `tmp/postgres-smoke/p1.1.txt`.

- [ ] **Step 3: P1.2 — unreachable URL → auto-rollback**

```bash
zeno connector install postgres --label "p1-2" --secret DATABASE_URI=postgresql://nobody:bad@127.0.0.1:9999/x
echo "exit=$?"
zeno connector list | grep -i postgres-p1-2 || echo "absent"
```

Expected: `verification failed: network`, `rolling back...`, `uninstalled`, exit 1. Final grep prints `absent`.

- [ ] **Step 4: P1.3 — bad credentials → auto-rollback**

```bash
zeno connector install postgres --label "p1-3" --secret DATABASE_URI=postgresql://baduser:badpass@host.docker.internal:5599/smoke
echo "exit=$?"
zeno connector list | grep -i postgres-p1-3 || echo "absent"
```

Expected: `verification failed: auth`, auto-rollback, exit 1. Final grep prints `absent`.

- [ ] **Step 5: P1.4 — listing reflects install**

```bash
zeno connector list | grep -i postgres
```

Expected: `postgres-smoke` row, `enabled`, `lastVerifiedAt` populated.

- [ ] **Step 6: P1.5 — second instance**

Repeat Step 2 with `--label "smoke2"` and any URL. Both rows must coexist:
```bash
zeno connector list | grep postgres-
```

Expected: `postgres-smoke` and `postgres-smoke2` both present.

- [ ] **Step 7: P2.3 — confirm `args` carries `--access-mode=restricted`**

```bash
PROFILE_PORT=$(zeno profile show $(zeno profile list --json | jq -r '.[] | select(.default==true) | .name') --json | jq -r .port)
curl -s -H "x-zeno-origin: cli" "http://127.0.0.1:${PROFILE_PORT}/api/connectors/postgres-smoke" | jq .args
```

Expected: `["postgres-mcp", "--access-mode=restricted"]`. The `--access-mode=restricted` is part of the persisted connector identity.

- [ ] **Step 8: P2.2 — env isolation**

Trigger a tool call (Step 11 below or `zeno connector test postgres-smoke`) and during it:
```bash
docker exec $(zeno profile show smoke --json | jq -r .containerName) env | grep DATABASE_URI || echo "absent"
```

Expected: `absent`.

- [ ] **Step 9: P3.1 — SELECT-style Slack DM**

In Slack, DM the agent: "Show me the 10 most recent orders from the smoke postgres."

Expected: the agent calls `mcp__postgres-smoke__execute_sql` with a SELECT, returns rows. Screenshot to `tmp/postgres-smoke/p3.1.png`.

- [ ] **Step 10: P3.2 — schema introspection DM**

DM: "Show me the schema of the orders table in the smoke postgres."

Expected: the agent walks `list_schemas` → `list_objects` → `get_object_details`, returns schema. Screenshot to `tmp/postgres-smoke/p3.2.png`.

- [ ] **Step 11: P3.3 — DELETE-style DM, expect server-side refusal**

DM: "Delete all rows from the orders table in the smoke postgres."

Expected: the MCP server rejects under `--access-mode=restricted`; the agent reports failure. Verify:
```bash
docker exec pg-smoke psql -U postgres -d smoke -c "SELECT count(*) FROM orders;"
```

Expected: still 100. Screenshot the Slack response to `tmp/postgres-smoke/p3.3.png` and capture the count check.

- [ ] **Step 12: P4.1 — snapshot regen against smoke DB**

Already verified in Task 5 against `postgres:t@localhost:5599`. Re-running with the smoke role isn't necessary unless the operator wants a second sample point. Document this as "P4.1 covered by Task 5 Step 2 evidence".

- [ ] **Step 13: P4.2 — snapshot regen without env var**

Already verified in Task 5 Step 4. Document the same way.

- [ ] **Step 14: Teardown**

```bash
zeno connector uninstall postgres-smoke --yes
zeno connector uninstall postgres-smoke2 --yes
docker stop pg-smoke
```

- [ ] **Step 15: Evidence handoff**

`tmp/` is gitignored. Copy any artifact the PR description needs (screenshots, output snippets) OUT of `tmp/` and embed inline in the PR — do NOT commit `tmp/` files.

---

## Task 8: Reflection + ship

**Files:**
- Modify: `.vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md` frontmatter + acceptance criteria checkboxes.
- Possibly create: `.vault/learnings/<slug>.md`.
- Possibly update: `.vault/_index/learnings.md`.

- [ ] **Step 1: Reflection**

Ask: "What did I learn implementing this that wasn't obvious from the spec?" Concrete candidates:
- Did `uvx postgres-mcp` cold start exceed `DISCOVER_TIMEOUT_MS` even after the Dockerfile prefetch?
- Did the operator's role-level GRANTs ever override the server-side `--access-mode=restricted` reject? (Should never happen, but worth documenting if it does.)
- Did the upstream's `--access-mode` flag's semantics surprise — anything it permits that we'd consider mutation?
- Did the `categoryPrefixMap` need extension during Phase 5?

If at least one answer is non-obvious, write an atomic learning note (see Step 2). If nothing surprising came up, write that explicitly in the PR description ("No new learnings from this spec").

- [ ] **Step 2: Create a learning note (if applicable)**

```bash
cp .vault/templates/learning.md .vault/learnings/<slug>.md
# edit the file, link back with [[../specs/2026-05-19-connector-postgres/spec-connector-postgres|connector-postgres spec]]
# add a line under the right heading in .vault/_index/learnings.md
```

- [ ] **Step 3: Flip the spec to `shipped`**

Edit the frontmatter of `.vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md`:
```yaml
---
status: shipped
feature: connector-postgres
created: 2026-05-19
shipped: 2026-05-19   # actual ship date
issue: 75
---
```

- [ ] **Step 4: Tick verified acceptance criteria**

In the spec's `## Acceptance Criteria` section, change `- [ ]` to `- [x]` for every criterion the quality-gate (Task 6) and the smoke (Task 7) verified. Leave un-ticked any criterion that wasn't actually verified and explain in the PR description.

- [ ] **Step 5: Commit reflection + ship marker**

```bash
git add .vault/specs/2026-05-19-connector-postgres/spec-connector-postgres.md
# only if a learning note was added:
git add .vault/learnings/<slug>.md .vault/_index/learnings.md
git commit -m "docs(spec): connector-postgres shipped"
```

- [ ] **Step 6: Open the PR via `/new-pr`**

Per CLAUDE.md: use `/new-pr` — DO NOT run `gh pr create` directly. The PR description should:
- Reference issue #75.
- Note the Phase 0 pivot (canonical `@modelcontextprotocol/server-postgres` deprecated → switched to `crystaldba/postgres-mcp`).
- Embed smoke evidence (output snippets + screenshots).
- Flag the Dockerfile change → operator needs `zeno start --build` after merge.

---

## Risks / Open Decisions

- **`uvx` cold-start may still exceed 10s on first runtime install** despite the Dockerfile prefetch — for instance if the operator nukes their image cache. Mitigation: re-run `zeno connector install postgres` (the second time hits the per-host `uv` cache, not the in-image one).
- **`host.docker.internal` on Linux.** Smoke Step 1 assumes Docker Desktop. Linux needs `--add-host=host.docker.internal:host-gateway` on the worker container OR the host's LAN IP. Document the path used.
- **`--access-mode=restricted` is a trust contract with `crystaldba/postgres-mcp`.** A future release could regress; the snapshot review in Task 5 Step 3 is the canary. If a `write_*` / `create_*` / `update_*` / `delete_*` tool appears, halt and escalate.

---

## Self-review

**Spec coverage check.** Every section of the amended spec maps to a task:
- §"Brainstorm Q&A — which server" → resolved during Phase 0 (operator picked A); recorded in `phase-0-discovery.md`.
- §"Brainstorm Q&A — read-only enforcement" → Task 4 (catalog entry pins `--access-mode=restricted`).
- §"Brainstorm Q&A — instance model" → no code; existing multi-instance flow validates via smoke step P1.5.
- §"Brainstorm Q&A — tool categorization" → Task 1 (regen script pass-through) + Task 4 (`categoryPrefixMap` in entry) + Task 5 (live regen validates classifications).
- §"Constraints — CLI-only operator surface" → Task 7 (smoke uses only `zeno connector install/test/uninstall`).
- §"Constraints — `DATABASE_URI` env, encrypted, not `.env`" → no code; existing connector_secrets pipeline handles it. P2.2 + P2.3 validate.
- §"Constraints — `authCheckTool: 'list_schemas'`" → Task 4 entry.
- §"Constraints — `categoryPrefixMap`" → Task 4 entry + Task 1 script patch.
- §"Constraints — Docker prefetch" → Task 2.
- §"Constraints — smoke against real Postgres" → Task 7.
- §"Acceptance Criteria" — every bullet maps to either Task 4 (catalog), Task 1 (regen patch), Task 2 (Dockerfile), Task 5 (snapshot regen), Task 6 (quality-gate), or Task 7 (smoke).
- §"Risks and Mitigations" → echoed in this plan's Risks section.

**Placeholder scan.** No `TBD`, `TODO`, `<...>` (except `<live-url>` / `<slug>` style placeholders that are commands the operator fills in, not gaps), or "implement appropriately". Every code block is complete. Every command has expected output.

**Type / shape consistency.** The catalog entry's `args` is referenced consistently across Tasks 4, 5, and 7. The regen script's options object (Task 1) uses the same field names the catalog declares.

---

## Execution approach

**8 tasks; the heaviest is Task 7 (manual smoke) which requires operator presence (Docker + Slack DM screenshots).** Tasks 1-6 are mechanical and can run inline without subagent dispatch — every task is 1-3 files, with full code blocks in the plan. Execute inline; defer Task 7 + Task 8 for operator return.

Sub-skill: `superpowers:executing-plans` is sufficient given the focused scope.
