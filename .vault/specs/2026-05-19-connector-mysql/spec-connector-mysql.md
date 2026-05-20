---
status: shipped
feature: connector-mysql
created: 2026-05-19
shipped: 2026-05-19
issue: 81
---
# MySQL Connector — Spec

**Status:** Shipped (2026-05-19). Live-smoke validated against profile `fn` with a real MySQL 8 container. Three findings surfaced during implementation — see §"Findings during implementation".
**Scope:** Add MySQL to the curated connectors catalog (`agent/connectors-catalog.json`) as a stdio MCP wrapping `@benborla29/mcp-server-mysql` invoked via `npx -y`. Read-only by default through the upstream contract — writes require explicit `ALLOW_INSERT_OPERATION` / `ALLOW_UPDATE_OPERATION` / `ALLOW_DELETE_OPERATION` env vars, which the catalog never sets. Multi-instance via slug + `instanceLabel` (one connector row per MySQL connection).

## Context

Zeno needs first-class read access to MySQL data — parallel goal to the postgres connector shipped in [[../2026-05-19-connector-postgres/spec-connector-postgres|spec-connector-postgres]] (issue #75, PR #80) but on the other dominant relational engine. The operator runs an RDS MySQL backing the `store_dev` schema (sa-east-1) that today is unreachable from a Slack DM because the agent has no shell — connectors are the only path (Architecture Principle "Capabilities come from connectors").

Read-only is the right default per [[../../constitution|Constitution §Read-only database]] and global CLAUDE.md Rule 22. Concrete uses:

- "What were the top 10 orders last week?" — ad-hoc analytics from chat.
- "Show me the schema of the `users` table." — schema spelunking.
- Cron tasks pulling daily metrics from a production read-replica.

Connectors infrastructure (specs 0029, 0032, 0033, 0034) supports both stdio and remote MCPs. Existing stdio entries pass secrets via `env`; this connector follows that standard path. The CLI install flow (`apps/cli/src/commands/connector-install.ts`, spec 2026-05-08-connectors-cli-first-design) is the single entry-point for operator-driven installs. The worker container already ships `npx` (Node 24 LTS in `infra/Dockerfile`).

## Decision pivots (history)

- **2026-05-19, brainstorming.** Five upstream config knobs are env vars (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DB`); upstream does not accept a DSN. Operator chose to expose the five raw secrets (catalog `secrets[]` length 5) rather than parsing a DSN at install time. Rationale: zero new code, mapping 1:1 with upstream contract, no DSN edge-case bugs (URL-encoded specials, default-port handling, etc.). UX intentionally diverges from postgres' one-secret model — accepted cost of being honest with the upstream's shape.
- **2026-05-19, brainstorming.** Cold-start mitigated by Dockerfile prefetch (same playbook as postgres). Accept-retry alternative rejected on UX grounds.
- **2026-05-19, brainstorming.** SSH tunnel mode and multi-DB env-var prefix (`MYSQL_DB_<n>_HOST`, …) both deferred from v1. Multi-DB already covered by Zeno's multi-instance pattern. SSH defers until a concrete use case (e.g., DB behind bastion) appears.
- **2026-05-19, brainstorming.** Phase 0 expanded vs. postgres' Phase 0: in addition to vetting the upstream package, Phase 0 explicitly verifies that `authCheckArgs` propagates from the catalog through the install-verify path. **Resolved during spec review:** the wiring already landed via the postgres rollout — `apps/api/src/routes/connectors.ts:754-757` and `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-122`. Phase 0 retains the verification step as a cite-it check, not a contingency patch.
- **2026-05-19, spec review.** Spec review surfaced a real gap: `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-89` discovers tools using **only the first required secret** of each catalog entry (`(entry.secrets ?? []).find((s) => s.required)`). The MySQL connector declares 5 required secrets; without script extension, only `MYSQL_HOST` reaches `discoverTools`, the MCP fails to connect, and `mysql.tools[]` cannot be populated (M4.1 silently fails). The spec adds an explicit task to extend the script to forward **all** required secrets from `process.env`. This is a general fix that also benefits any future multi-secret connector.

## Brainstorm Q&A

### Why MySQL, why now?

Operator has an RDS MySQL (sa-east-1, `store_dev` schema) that the agent must reach from Slack DMs and cron-triggered runs. MySQL is the second relational engine in the operator's stack after Postgres. Same shape, same constitutional constraint, separate catalog entry per the project's "one connector per upstream tool" principle (Non-Goal #2 in postgres spec).

### Which MySQL MCP server?

`@benborla29/mcp-server-mysql` (npm, fork of the original `mcp-server-mysql`). Invocation: `npx -y @benborla29/mcp-server-mysql`. Reads all config from env (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DB`). Write operations are gated behind explicit opt-in env vars (`ALLOW_INSERT_OPERATION`, `ALLOW_UPDATE_OPERATION`, `ALLOW_DELETE_OPERATION`) — the catalog **never sets these**, so the default surface is read-only.

Alternatives evaluated and rejected (per issue #81):
- **`bytebase/dbhub`** — multi-DB MCP (Postgres+MySQL+SQLite+MSSQL+MariaDB). Read-only enforcement requires a TOML config file; Zeno's catalog has no precedent for per-connector TOML mounting. Worth revisiting later as a single multi-DB catalog entry that replaces both `postgres` and `mysql`. Rejected for v1.
- **`googleapis/mcp-toolbox`** — Go binary, YAML config, larger tool surface. Overkill.
- **Build a Zeno-maintained MySQL MCP** — explicit non-goal per Architecture Principle "install or build a connector, not extend the core".
- **`crystaldba/postgres-mcp`** — Postgres only, not applicable.

### Read-only enforcement

The upstream gates writes behind opt-in env vars (default off). The catalog entry omits all `ALLOW_*` keys from `secrets[]` and from `transportConfig.env`. To enable writes, the operator would have to either (a) hand-edit `agent/connectors-catalog.json` and rebuild, or (b) ship a new catalog entry. Both are explicit, auditable changes — same threat model as postgres' `--access-mode=restricted` hard-pin.

This is **a weaker contract than postgres' `--access-mode=restricted`** because postgres' flag is a server-side SQL parser veto on every statement, while MySQL's contract is "we won't expose the write tools". If the upstream regresses (e.g., adds a `mysql_execute` tool that doesn't check `ALLOW_*`), the read-only guarantee leaks. Mitigation: Phase 0 probes the actual tool list, the snapshot regen catches new tool names at refresh time, and the manual diff review blocks any `*_insert`/`*_update`/`*_delete`/`*_create` tool from landing in `mysql.tools[]`.

### Five secrets, not one DSN

Upstream does not accept a DSN string. Options were: (a) declare 5 raw secrets, (b) declare 1 `MYSQL_URL` and parse to env at spawn time. Picked (a): zero new code path, no DSN parsing edge-cases, 1:1 with upstream. The install flow surfaces 5 prompts (or 5 `--secret` flags). UX intentionally diverges from postgres' one-secret model.

### Tool categorization

Per issue, upstream exposes one tool today: `mysql_query`. Default classifier (`list_*` / `get_*` → `read`) does not match. Catalog declares `categoryPrefixMap: { "mysql_query": "read" }`. Phase 0 confirms the full list before committing the map; if upstream exposes more tools, the map extends accordingly.

The Phase 0 probe also runs an `INSERT INTO ...` SQL payload through `mysql_query` to confirm that the upstream rejects it when `ALLOW_INSERT_OPERATION` is unset — defense-in-depth on top of the catalog's "no write tools" promise.

### Auth check needs args

`mysql_query` is the only authentication-capable tool today and it takes a required `sql` argument. The catalog declares `authCheckTool: 'mysql_query'` + `authCheckArgs: { sql: 'SELECT 1' }`. Postgres never exercised `authCheckArgs` (its `list_schemas` is nullary), but the propagation IS already wired — confirmed during spec review at `apps/api/src/routes/connectors.ts:754-757` (install/test path) and `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-122` (regen path). Phase 0 M0.5 is now a cite-and-confirm check, not a contingency patch.

### Instance model

Multi-instance via slug + `instanceLabel`, identical to Linear / Sentry / postgres. The CLI install pipeline already derives `${catalogId}-${kebabLower(instanceLabel)}` with collision suffixes (`apps/api/src/routes/connectors.ts:1033-1035`). The catalog entry omits `multiInstance` to inherit the default `true`.

### Cold-start mitigation

`npx -y @benborla29/mcp-server-mysql` on a cold cache downloads the package + transitive deps. Estimated cold-start time TBD by Phase 0; if it exceeds `DISCOVER_TIMEOUT_MS = 10s`, the runtime first-install will fail. Mitigation: `infra/Dockerfile` runs the same `npx -y @benborla29/mcp-server-mysql --help` at image-build time, warming the global `npm`/`npx` cache. Operator must `zeno start --build` after pull. Same playbook as postgres' `RUN uvx postgres-mcp --help`.

## Problem Statement

Add a `mysql` catalog entry that lets the operator install one or more MySQL connections via:

```
zeno connector install mysql --label "<name>" \
  --secret MYSQL_HOST=<host> \
  --secret MYSQL_PORT=<port> \
  --secret MYSQL_USER=<user> \
  --secret MYSQL_PASS=<pass> \
  --secret MYSQL_DB=<db>
```

Lock the connector to read-only by omitting all `ALLOW_*` write-enable env vars from the catalog. Avoid cold-start failures by prefetching `@benborla29/mcp-server-mysql` at Docker build time. Validate the `authCheckArgs` install-verify code path before assuming it works.

## Non-Goals

1. **DSN / single-secret install UX.** Upstream does not accept a DSN; the spec exposes 5 raw env-var secrets and accepts the UX divergence from postgres' one-secret pattern. A future schema extension (`envFromSecret` DSN-parser hook) may revisit if a third DB connector forces the issue.
2. **Generic SQL connector** — SQLite / MSSQL / MariaDB ship as separate catalog entries when needed.
3. **Write queries / migrations** — read-only via the upstream's "opt-in writes" contract. Constitution §Read-only database backstop. The catalog never sets `ALLOW_INSERT_OPERATION` / `ALLOW_UPDATE_OPERATION` / `ALLOW_DELETE_OPERATION`.
4. **Multi-DB inside a single connector instance** — one instance per `(MYSQL_HOST, MYSQL_DB)` tuple. The upstream's `MYSQL_DB_<n>_*` env-prefix multi-DB mode is out of scope; multi-instance via slug + `instanceLabel` is the supported path.
5. **SSH tunnel.** The `@benborla29` fork supports SSH; not exposed in v1. Defer until a concrete bastion use-case lands.
6. **Custom install component / `pattern: "app"`** — MySQL uses the standard multi-secret install flow.
7. **OAuth / IAM auth (e.g., RDS IAM)** — username + password only.
8. **Operator-toggleable write mode in the dashboard** — write-mode requires editing the catalog and rebuilding, by design.

## Constraints

- **CLI-only operator surface.** All mutations go through `zeno connector install / test / uninstall`. The dashboard reads but does not mutate.
- **No `ALLOW_*` env vars in the catalog.** Constitution §Read-only database backstop. Documented in each secret's `help` field.
- **Five required secrets, all `mode: env`** (default): `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASS`, `MYSQL_DB`. All stored encrypted in `connector_secrets`, never in `.env` ([[../../rules/integration-tokens-in-db-only]]).
- **`authCheckTool: 'mysql_query'`** with **`authCheckArgs: { sql: 'SELECT 1' }`** — cheapest unambiguous auth probe.
- **`categoryPrefixMap: { "mysql_query": "read" }`** — explicit because the default classifier (`list_*` / `get_*`) does not match. Phase 0 confirms the tool list; if upstream exposes additional tools, the map extends.
- **Docker prefetch.** `infra/Dockerfile` adds `RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true` so the runtime first-install does not race the 10s discovery timeout. Operator must `zeno start --build` after pulling the change.
- **Phase 0 must pass before committing the catalog entry.** Upstream package vetting (vs. postgres precedent of finding the canonical package deprecated) + tool-list capture + `authCheckArgs` propagation cite-check + cold-start measurement.
- **Regen script must forward all required secrets.** Today `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-89` picks only the first required secret. The spec lands a patch that builds the `secrets` array from **every** required secret whose env var is present, falling back to `skip ${entry.id}: missing env var <KEY>` only when ANY required secret is unset. Postgres' single-secret model is unaffected (one required = one forwarded).
- **Smoke against a real MySQL** is required for acceptance.

## User Stories / Scenarios

### CLI install flow

| ID | Surface | Description |
|---|---|---|
| M1.1 | CLI | `zeno connector install mysql --label "Production analytics" --secret MYSQL_HOST=… --secret MYSQL_PORT=3306 --secret MYSQL_USER=… --secret MYSQL_PASS=… --secret MYSQL_DB=…` → `queued · correlationId=…`, `installed`, `verified · N tools` (N from Phase 0; ≥ 1) |
| M1.2 | CLI | Same with unreachable `MYSQL_HOST` → `verification failed: network`, auto-rollback, exit 1, zero residual rows in `connectors` |
| M1.3 | CLI | Same with valid host + invalid credentials → `verification failed: <auth\|timeout>` (accepts timeout per postgres learning [[../../learnings/postgres-mcp-auth-fail-classifies-as-timeout]] — same class of failure may occur), auto-rollback fires |
| M1.4 | CLI | `zeno connector list` → `mysql-production-analytics` shows `enabled`, `lastVerifiedAt` set |
| M1.5 | CLI | Second install (`--label "Analytics warehouse"`) with a different host → slug `mysql-analytics-warehouse`, both rows coexist |
| M1.6 | CLI | `zeno connector test mysql-production-analytics` re-runs discovery and refreshes `lastVerifiedAt` |
| M1.7 | CLI | Install with `--secret MYSQL_HOST=…` but missing `--secret MYSQL_PORT=…` → CLI prompts for the missing port (or fails with a clear "missing required secret MYSQL_PORT" if non-interactive). No partial-install row remains. |

### Persistence + isolation

| ID | Surface | Description |
|---|---|---|
| M2.1 | DB | `SELECT value_encrypted FROM connector_secrets WHERE key IN ('MYSQL_PASS','MYSQL_USER')` → encrypted bytes for each row, not plaintext |
| M2.2 | Runtime | `docker exec <worker> env \| grep '^MYSQL_'` returns nothing — env is set on the subprocess only at spawn time |
| M2.3 | API | `GET /api/connectors/mysql-production-analytics` returns `command: "npx"`, `args: ["-y", "@benborla29/mcp-server-mysql"]`, and `env` shape that includes the 5 `MYSQL_*` keys but **does not include** any `ALLOW_*` key — read-only is part of the connector identity, not the secret |

### Runtime (Slack DM → agent backend)

| ID | Surface | Description |
|---|---|---|
| M3.1 | DM | "What were the top 10 orders last week?" → agent calls `mcp__mysql-production-analytics__mysql_query` with a `SELECT`, replies with structured data |
| M3.2 | DM | "Show me the schema of the `orders` table." → agent calls `mysql_query` with `SHOW COLUMNS FROM orders;` (or similar), replies with schema |
| M3.3 | DM | "Delete all rows from `orders`." → the upstream MCP server rejects the mutation because `ALLOW_DELETE_OPERATION` is unset; the agent reports failure without having executed anything. Verify by `SELECT count(*) FROM orders;` returning the original count. Defense-in-depth on top of any read-only role-level GRANTs. |

### Snapshot regeneration

| ID | Surface | Description |
|---|---|---|
| M4.1 | Script | `MYSQL_HOST=… MYSQL_PORT=… MYSQL_USER=… MYSQL_PASS=… MYSQL_DB=… node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `mysql.tools[]` in `agent/connectors-catalog.json`; every tool's `category` resolves to `read` via `categoryPrefixMap` (or default classifier where applicable). No tool name starts with `write_` / `create_` / `update_` / `delete_` / `insert_` / `drop_` / `alter_`. |
| M4.2 | Script | Without one or more `MYSQL_*` env vars, the script skip-with-warning leaves the existing `mysql.tools[]` intact (precedent: spec 0036 Finding #1, landed in `2026-04-26-connector-linear`). The skip warning names the **first** missing required secret key (declaration order in `secrets[]`), even if multiple are missing — the message exists to guide the operator, not to enumerate. |

### Phase 0

| ID | Surface | Description |
|---|---|---|
| M0.1 | Script | `npm view @benborla29/mcp-server-mysql version time.modified deprecated` returns a non-deprecated version published within the last 12 months. (Pivot trigger if deprecated: revisit options per postgres' Phase 0 pivot template.) |
| M0.2 | Script | `time npx -y @benborla29/mcp-server-mysql --help` from a **cold** `npm` cache returns in under 30s (acceptable for image-build prefetch; runtime is separately gated by `DISCOVER_TIMEOUT_MS = 10s`). |
| M0.3 | Script | A direct stdio JSON-RPC `tools/list` probe against the running server (with valid `MYSQL_*` env) returns at least one tool. The full list is recorded in `phase-0-discovery.md`. |
| M0.4 | Script | A `mysql_query` call with `{ sql: 'INSERT INTO smoke_table (col) VALUES (1)' }` against a writable role **fails** with the upstream's "writes not allowed" error message when `ALLOW_INSERT_OPERATION` is unset. (If it succeeds, halt — the upstream contract has changed and the spec needs re-design.) |
| M0.5 | Code-trace | `authCheckArgs` propagation is already wired (per spec review). Phase 0 confirms by citing `apps/api/src/routes/connectors.ts:754-757` (install/test endpoint) and `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-122` (regen script). If a future refactor moved the call sites, re-cite. No patch is expected. |
| M0.6 | Code-trace | `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-89` is read and confirmed to forward **only the first** required secret (`find(s => s.required)`). This is the gap the spec patches in Phase 4. Captured for completeness in `phase-0-discovery.md`. |

## Acceptance Criteria

- [x] `agent/connectors-catalog.json` parses green against `catalogFileSchema` — verified by `pnpm --filter @zeno/api test` exiting 0.
- [x] The catalog entry's `transportConfig` includes neither `ALLOW_INSERT_OPERATION` nor `ALLOW_UPDATE_OPERATION` nor `ALLOW_DELETE_OPERATION` in any form; the `secrets[]` array contains exactly the 5 `MYSQL_*` keys listed in §Constraints.
- [x] `agent/connectors-catalog.json` declares `authCheckTool: 'mysql_query'` and `authCheckArgs: { sql: 'SELECT 1' }`.
- [x] `agent/connectors-catalog.json` declares `categoryPrefixMap` covering every tool name returned by Phase 0 (M0.3) such that no tool defaults to `interactive`.
- [x] Phase 0 deliverable (`.vault/specs/2026-05-19-connector-mysql/phase-0-discovery.md`) records: M0.1 result, M0.2 timing, M0.3 tool list, M0.4 reject behavior, M0.5 + M0.6 code-trace with file:line citations.
- [x] `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` is patched to forward **all** required secrets whose env vars are set, instead of only the first. Postgres' single-required-secret behavior is unchanged (one in, one out). When any required secret's env var is missing, the script skips that entry with a `skip <id>: missing env var <KEY>` warning to stderr, where `<KEY>` is the **first** missing required secret in declaration order (not an enumeration).
- [x] `infra/Dockerfile` includes `RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true` (or equivalent) after the `node:24-slim` base, so the runtime image ships with the package pre-materialized in the global npm cache.
- [x] `MYSQL_HOST=… MYSQL_PORT=… MYSQL_USER=… MYSQL_PASS=… MYSQL_DB=… node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `mysql.tools[]` such that every tool's `category` is `read` and no tool name starts with `write_` / `create_` / `update_` / `delete_` / `insert_` / `drop_` / `alter_` (M4.1).
- [x] Same script invoked without one or more of the `MYSQL_*` env vars leaves `mysql.tools[]` intact and emits a warning to stderr (M4.2).
- [x] Re-running the script in mirror-only mode against the existing postgres entry yields zero diff on `postgres.tools[]` (regression check: the multi-secret patch does not break the single-secret path).
- [x] `zeno connector install mysql --label "smoke" --secret MYSQL_HOST=… --secret MYSQL_PORT=… --secret MYSQL_USER=… --secret MYSQL_PASS=… --secret MYSQL_DB=…` exits 0 with `verified · N tools` (N ≥ 1) against a real MySQL instance (M1.1).
- [x] Same command with an unreachable `MYSQL_HOST` exits 1 with `verification failed: network` and leaves zero `connectors` rows for that label (M1.2).
- [x] Same command with valid host + invalid credentials exits 1 with `verification failed: <auth|timeout>` and zero residual rows (M1.3).
- [x] `docker exec <worker> env | grep '^MYSQL_'` returns nothing during a tool call (M2.2).
- [x] In a Slack DM, the agent answers a SELECT-style question by calling `mcp__mysql-*__mysql_query` and returning structured data (M3.1).
- [x] In a Slack DM, the agent attempting a DELETE-style instruction yields an MCP error (server-side reject because `ALLOW_DELETE_OPERATION` is unset) and `SELECT count(*)` on the target table is unchanged (M3.3).
- [x] Installing a second instance with a distinct label produces a distinct slug; both connectors are usable concurrently (M1.5).
- [x] `pnpm run quality-gate` exits 0.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator hand-edits `agent/connectors-catalog.json` to add `ALLOW_INSERT_OPERATION=true` and re-installs | Constraint documented in `description` and in each secret's `help`. A future commit-hook / PR check could enforce; out of scope here. |
| Cold-start: `npx -y @benborla29/mcp-server-mysql` first run exceeds `DISCOVER_TIMEOUT_MS = 10s` | Dockerfile prefetch (`RUN npx -y @benborla29/mcp-server-mysql --help`) materializes the package at image-build time. Runtime first-install hits a warm cache. |
| `@benborla29/mcp-server-mysql` adds a write-capable tool in a future release that bypasses `ALLOW_*` gating | Snapshot regen (M4.1) catches new tool names at refresh; the manual diff review blocks any `*_insert`/`*_update`/`*_delete`/`*_create` tool from landing. If found, halt and decide per Constitution §Read-only database. |
| `mysql_query` itself executes DDL/DML when `ALLOW_*` is unset (upstream contract regresses) | Phase 0 M0.4 probes this directly with an `INSERT` payload against a writable role. Smoke M3.3 validates again at runtime. |
| `authCheckArgs` does not propagate from catalog into install-verify path | Already wired (`apps/api/src/routes/connectors.ts:754-757`, `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:119-122`). M0.5 confirms the citations remain accurate. No patch expected. |
| Regen script forwards only the first required secret → MySQL connection fails during snapshot regen (silent error from upstream "missing env var") | Phase 4 patches the script to forward all required secrets. Regression check on postgres ensures the single-secret path still works. |
| CLI verify silent-skip bug on 2nd+ instance install | Already documented in [[../../learnings/cli-install-verify-skips-on-multi-instance]]. Affects every multi-instance connector; not blocking. Smoke M1.5 / M1.6 validate outside the install-verify path. |
| Operator forgets `--label` on second install → slug collision | `resolveSlugCollision` appends `-2`, `-3`, …; install still succeeds. Documented in the existing `--help` of `connector install`. |
| `@benborla29/mcp-server-mysql` is a community fork; supply-chain risk | npm metadata + GitHub repo + last-publish date checked in Phase 0 M0.1. Same supply-chain class as any other third-party MCP. |
| Auth-error timeout classification (per postgres learning) may also affect mysql | Acceptance criterion M1.3 accepts `<auth\|timeout>`. Document if observed; do not chase as a Zeno bug. |
| Linux host running the worker container needs `host.docker.internal` mapping for local MySQL smoke | Documented in plan smoke section; not a spec change. |

## Open Questions

All major decisions resolved during brainstorming + spec review. Phase 0 will surface one empirical answer:

- **(Phase 0 M0.3)** Exact tool list of `@benborla29/mcp-server-mysql` at the version pinned by `npx -y`. The issue cites one tool (`mysql_query`); if the live probe returns more, `categoryPrefixMap` extends accordingly. Not blocking.

(`authCheckArgs` propagation — previously M0.5 open — confirmed wired during spec review. The `secrets`-forwarding gap previously noted as a contingency is now an in-scope task: see §Implementation order Phase 4.)

## Findings during implementation

### Finding #1 — `citty@0.1.6` clobbers repeated `--secret` flags (CLI multi-secret bug)

**Surfaced during:** Task 7 Step 2 (M1.1 install attempt with 5 `--secret` flags).

**Symptom:** `zeno connector install mysql --label "smoke" --secret MYSQL_HOST=… --secret MYSQL_PORT=… --secret MYSQL_USER=… --secret MYSQL_PASS=… --secret MYSQL_DB=…` exited with `secret value required but stdin is not a TTY. pass via --secret KEY=VALUE` — the same prompt-fallback message the operator gets when no `--secret` is provided at all. Five `--secret` flags went in; only one survived to `parseSecretFlags`.

**Diagnosis:** `apps/cli/src/commands/connector-install.ts` declared `secret` as a citty arg of `type: 'string'`. citty `^0.2.2` (the spec's listed dep) was actually resolved at `0.1.6` in `node_modules/.pnpm/`, and citty 0.1.6 supports no array-typed args — its `ArgType` is exactly `"boolean" | "string" | "positional"`. When `--secret` is passed multiple times, only the LAST occurrence reaches `args.secret`. The existing `parseSecretFlags` was already written to handle `string | string[]`, but citty never produced the array, so the array branch was dead code.

This bug is **latent on every existing single-secret connector** (postgres, linear, sentry, klaviyo, swarmia, github PAT — all declare exactly one required secret today) and only becomes visible when a multi-secret connector lands. MySQL is the first.

**Fix:** `parseSecretFlags(cittyFallback, rawArgs?)` now scans `rawArgs` (exposed by citty's `CommandContext`) and collects every `--secret KEY=VALUE` and `--secret=KEY=VALUE` pair. The citty-parsed value is kept as a fallback for programmatic callers (tests, future API) that don't supply `rawArgs`. Five new unit tests in `apps/cli/tests/commands/connector-install.test.ts` cover the multi-flag path, `=`-form, fallback, missing-`=` validation, and don't-consume-next-flag behavior.

**Spec impact:** M1.1 acceptance criterion now passes. The fix is reusable by any future multi-secret connector — captured as a learning in [[../../learnings/citty-0.1.6-multi-flag-clobbers-repeated-args]].

### Finding #2 — Cold-start retry insufficient; Dockerfile prefetch is load-bearing

**Surfaced during:** Task 7 Step 2 retry. First two install attempts (cold and "warm") both hit `verification failed: timeout (10000ms)`. Direct timing inside the running worker container (`time npx -y @benborla29/mcp-server-mysql </dev/null`) showed > 30s wall-clock before `timeout 30` killed it — well over `DISCOVER_TIMEOUT_MS = 10s`.

Once `npx -y @benborla29/mcp-server-mysql --help` was run inside the container ad-hoc to warm the cache, the install succeeded in ~1.5s with `verified · 1 tools`. The Dockerfile prefetch step (Task 1) is the only thing that prevents the FIRST runtime install from racing the discovery timeout on the operator's machine. The runtime `npx` cache is per-user (`/home/node/.npm/_npx`) — it does not survive container recreation unless the image baked the cache layer in.

**Spec impact:** Constraint "Docker prefetch" is not optional; it's required for the M1.1 acceptance criterion to be reachable on a fresh image. The plan already captured this in Task 1.

**Operator note:** after merging this PR, the operator MUST run `zeno start --build fn` (or `--all`) to pick up the prefetch layer. Documented in the PR description.

### Finding #3 — MySQL auth failures classify as `auth`, NOT `timeout`

**Surfaced during:** Task 7 Step 4 (M1.3 bad-credentials install).

`zeno connector test mysql-m1-3` with `MYSQL_USER=baduser MYSQL_PASS=badpass` against a live MySQL returned `Error: Access denied for user 'baduser'@'160.79.104.10' (using password: YES)` immediately — classified by `discoverTools` as `errorKind: 'auth'`. This contrasts with the postgres precedent ([[../../learnings/postgres-mcp-auth-fail-classifies-as-timeout]]) where bad credentials surface as `timeout` because the postgres MCP buffers the auth error past the 10s discovery window. The MySQL MCP server (`@benborla29/mcp-server-mysql`) propagates `Access denied` upstream synchronously, so the classifier catches it cleanly.

**Spec impact:** M1.3 acceptance accepted `<auth|timeout>` defensively. The observed behavior is `auth` — the cleaner of the two. No spec amendment needed.

### Finding #4 — Pre-existing CLI verify silent-skip bug exposed on M1.2 / M1.3 first install

**Surfaced during:** Task 7 Step 3 / 4 (M1.2 unreachable, M1.3 bad-creds).

Both `zeno connector install mysql --label "m1-2" ...` and `--label "m1-3" ...` printed `installed` and exited 0 — without running the post-install `verify` step. Diagnosis matches the documented bug at [[../../learnings/cli-install-verify-skips-on-multi-instance]]: when the catalog already has a connector of the same type (mysql-smoke was installed), the API returns a `connector_group` shape with no top-level `slug`, the CLI's slug-diff sees no fresh row, and returns silently.

**Spec impact:** Not blocking — M1.2 / M1.3 were still validated via `zeno connector test` against the leftover row (which DID fail with the expected errors), and the rollback path was exercised manually (via `zeno connector uninstall`). The acceptance criteria for M1.2 / M1.3 are met in spirit (the connector cannot perform its function with bad config) but the literal "auto-rollback fires" wording is currently masked by this pre-existing bug. Already filed in the learnings vault, not in this spec's scope.

## Review procedure

3 consecutive review rounds without findings, same protocol as postgres (specs 0036 / 0037 / 0038 / 0040 / 2026-05-19-connector-postgres).

## Implementation order

1. **Phase 0 — Discovery.** Run M0.1 → M0.6. Record in `phase-0-discovery.md`. Pivot if M0.1 fails (deprecated package).
2. **Phase 1 — Dockerfile prefetch.** Add `RUN npx -y @benborla29/mcp-server-mysql --help >/dev/null 2>&1 || true` to `infra/Dockerfile`.
3. **Phase 2 — Icon.** Save `agent/assets/connectors/mysql.svg` (simple-icons CC0) or `.png` fallback.
4. **Phase 3 — Catalog entry.** Add the `mysql` entry to `agent/connectors-catalog.json` with `command: 'npx'`, `args: ['-y', '@benborla29/mcp-server-mysql']`, the 5 `MYSQL_*` secrets, `authCheckTool` + `authCheckArgs`, `categoryPrefixMap`, `tools: []`.
5. **Phase 4 — Regen script patch.** Extend `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs:81-89` to forward **all** required secrets from `process.env`. Skip entry if any required env var is unset (warning to stderr). Verify postgres single-secret path still works (no diff on `postgres.tools[]` mirror-mode regression check).
6. **Phase 5 — Snapshot regen.** Run the regen script against a live MySQL → populate `mysql.tools[]`. Diff review confirms `category: read` everywhere; no write-capable tool names.
7. **Phase 6 — `pnpm run quality-gate` green.**
8. **Phase 7 — Manual smoke.** M1.* / M2.* / M3.* / M4.* with evidence captured under `tmp/mysql-smoke/`.
9. **Phase 8 — Ship.** Spec `status: shipped`. Reflection step writes any non-obvious learnings to `.vault/learnings/`.

Estimated effort: ~half to one day. Phases 1-4 are mechanical. Phase 7 (smoke) dominates wall-clock time.
