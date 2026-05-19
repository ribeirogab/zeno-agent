---
status: shipped
feature: connector-postgres
created: 2026-05-19
shipped: 2026-05-19
issue: 75
---
# Postgres Connector — Spec

**Status:** Shipped (2026-05-19). Live-smoke validated against profile `fn`. Two non-blocking findings surfaced — see §"Findings during implementation".
**Scope:** Add Postgres to the curated connectors catalog as a stdio-based, read-only MCP using `crystaldba/postgres-mcp` (Postgres Pro) invoked via `uvx`. The server reads `DATABASE_URI` from env and is locked to `--access-mode=restricted` at the catalog level so the agent cannot execute mutations regardless of the role the operator pastes.

## Decision pivots (history)

- **2026-05-19, original draft:** Spec was built around `@modelcontextprotocol/server-postgres` (positional argv) and required a generic catalog-schema extension (`secrets[].mode: 'env' | 'argv'` + `${KEY}` interpolation in `toStdioConfig`).
- **2026-05-19, Phase 0 found the package deprecated** and its source removed from the canonical reference-servers repo. See `[[phase-0-discovery]]`.
- **Operator picked Option A — switch to `crystaldba/postgres-mcp`.** That server reads `DATABASE_URI` from env (not argv), so the schema extension is **no longer needed** for this connector. Scope shrinks: drop the extension, keep the rest. The extension may ship as its own follow-up spec when a future server actually needs argv (Redis, SQLite, etc.).

## Brainstorm Q&A

### Why Postgres, why now?

Zeno needs first-class read access to relational data sitting in Postgres (application DBs, analytics warehouses) so the agent can answer ad-hoc analytics questions and pull metrics from cron tasks. Today there is no path to query Postgres from a Slack DM — the agent has no shell, so a connector is the only option (Architecture Principle "Capabilities come from connectors"). Postgres is the highest-frequency relational store across the operator's stacks; MySQL/SQLite are deferred to separate catalog entries.

Concrete uses:
- "What were the top 10 orders last week?" — ad-hoc analytics from chat.
- "Show me the schema of the `users` table." — schema spelunking in unfamiliar databases.
- Cron tasks that periodically pull metrics from a production read-replica.

### Which Postgres MCP server?

`crystaldba/postgres-mcp` (Postgres Pro), MIT-licensed, actively maintained, on PyPI as `postgres-mcp` (currently `0.3.0`).

Alternatives evaluated and rejected:
- **`@modelcontextprotocol/server-postgres`** — the package the issue originally pointed at. **Deprecated on npm; source removed from `modelcontextprotocol/servers`.** No longer viable.
- **`postgres-mcp` (npm, `llm-graph/postgres-mcp`)** — community npm package, single maintainer, 0 stars, 13+ months stale. Supply-chain risk; rejected.
- **Building a Zeno-maintained postgres MCP** — explicit non-goal; the project's principle is "install or build a connector, not extend the core", and writing/maintaining an MCP is a separate scope.

`crystaldba/postgres-mcp` exposes more tools than the deprecated upstream (index advisor, health checks, query plan inspector) — strictly a superset of "read this DB" capabilities, all locked to read-only via `--access-mode=restricted`. The wider surface is a net positive for diagnostic queries from Slack.

### Read-only enforcement

`postgres-mcp` defaults to `--access-mode=unrestricted`. The catalog entry MUST pass `--access-mode=restricted` in `transportConfig.args` so the operator cannot accidentally ship a writable connector by re-using a credentials-pasting step. The flag is wired statically — there is no DB column, no install-time toggle, no dashboard switch. To enable writes, the operator must edit `agent/connectors-catalog.json` and rebuild — an explicit, auditable change.

This satisfies Constitution §Read-only database (cf. global CLAUDE.md Rule 22) defensively: even if the operator pastes a read/write role, the server-side `restricted` access mode blocks mutations.

### Instance model

Multi-instance via slug + `instanceLabel`, exactly as for Linear / Sentry. The CLI install pipeline already derives `${catalogId}-${kebabLower(instanceLabel)}` with collision suffixes in `apps/api/src/routes/connectors.ts:1033-1035`. The catalog entry omits `multiInstance` to inherit the default `true`.

### Tool categorization

Phase 0 live probe captured 9 tools in restricted mode (`[[phase-0-discovery]]` Round 2 §"Live tool list"). The default classifier handles `list_*` and `get_*` correctly; the rest need an explicit `categoryPrefixMap`:

```json
{
  "execute_sql": "read",
  "explain_": "read",
  "analyze_": "read"
}
```

This pins `execute_sql`, `explain_query`, `analyze_workload_indexes`, `analyze_query_indexes`, `analyze_db_health` to `category: read`. No `write_*` / `create_*` / `update_*` / `delete_*` tool is present in restricted mode — verified at probe time.

If a future `postgres-mcp` release adds a tool with a prefix outside the map, the snapshot regen (Task 6) will classify it as `interactive` and the implementer will catch it during diff review. Any such tool also has to clear the read-only access-mode check, so the worst case is "a new read tool defaults to `interactive` until we update the map" — not a safety issue.

## Context

Connectors infrastructure (specs 0029, 0032, 0033, 0034) supports both stdio and remote MCPs. Existing stdio entries pass secrets via `env`; remote entries via `Authorization` header. Postgres lines up with the standard `mode: env` stdio path — no schema change needed.

The CLI install flow (`apps/cli/src/commands/connector-install.ts`, spec 2026-05-08-connectors-cli-first-design) is the single entry-point for operator-driven installs. Dashboard is read-only when `writes: 'cli'`; mutations gated behind the `x-zeno-origin: cli` header.

The worker container already ships `uv` (`infra/Dockerfile:24`, landed by spec 0040 for Klaviyo/Swarmia). `uvx` is on PATH. Python ≥ 3.12 is auto-provisioned by `uv` on first run; no system Python upgrade required.

## Problem Statement

Add a `postgres` catalog entry that lets the operator install one or more Postgres database connections via `zeno connector install postgres --label "<name>" --secret DATABASE_URI=<url>`. Lock the connector to read-only via `--access-mode=restricted`. Avoid cold-start failures by prefetching the `postgres-mcp` deps at Docker build time.

## Non-Goals

1. **Catalog-schema extension (`secrets[].mode: 'env' | 'argv'` + `${KEY}` interpolation).** Originally in scope; dropped because `crystaldba/postgres-mcp` reads `DATABASE_URI` from env. May land as its own future spec when another connector actually needs argv.
2. **Generic SQL connector** — MySQL/SQLite ship as separate catalog entries when needed.
3. **Write queries / migrations** — `--access-mode=restricted` is the line of defense; spec does not expose mutation paths (Constitution §Read-only database).
4. **Multi-DB inside a single connector instance** — one instance per `DATABASE_URI`.
5. **Custom install component / `pattern: "app"`** — postgres uses the standard one-secret install flow.
6. **OAuth / IAM auth (e.g. RDS IAM)** — `DATABASE_URI` with username + password only.
7. **Operator-toggleable access mode in the dashboard** — `--access-mode=restricted` is hard-coded in `transportConfig.args`. Writable mode requires editing the catalog and rebuilding, by design.
8. **`@modelcontextprotocol/server-postgres`** — the package the issue named; deprecated, see `[[phase-0-discovery]]`.

## Constraints

- **CLI-only operator surface.** All mutations go through `zeno connector install / test / uninstall`. The dashboard reads but does not mutate.
- **`--access-mode=restricted` is non-negotiable in the catalog entry.** Constitution §Read-only database backstop.
- **`DATABASE_URI` is the env-var name** (not `DATABASE_URL`). Matches the upstream's documented contract. Storage path: `connector_secrets`, encrypted, never in `.env` (`[[../../rules/integration-tokens-in-db-only]]`).
- **`authCheckTool: 'list_schemas'`** — cheapest no-arg read tool that authenticates the connection. (`execute_sql` needs a `sql` argument; `list_schemas` doesn't.)
- **`categoryPrefixMap` from Phase 0** — see §"Tool categorization".
- **Docker prefetch.** `infra/Dockerfile` adds `RUN uvx postgres-mcp --help` so the runtime first-install does not race the 10s discovery timeout. This rebuilds the image; the operator must `zeno start --build` after pulling the change.
- **Worker container Python.** No `apt install python3.12` needed — `uv` auto-provisions. Documented for traceability only.
- **Smoke against a real Postgres** (read-only role recommended on top of the access-mode lock; defense-in-depth) is required for acceptance.

## User Stories / Scenarios

### CLI install flow

| ID | Surface | Description |
|---|---|---|
| P1.1 | CLI | `zeno connector install postgres --label "Production analytics"` (no `--secret`) → `promptHidden` masks the URL, `queued · correlationId=…`, `installed`, `verified · 9 tools` (the live count from Phase 0; may shift up if upstream adds tools) |
| P1.2 | CLI | Same with `--secret DATABASE_URI=postgres://INVALID:bad@localhost:5432/x` (DB unreachable) → `verification failed: network`, auto-rollback, exit 1, no residual row in `connectors` |
| P1.3 | CLI | Same with `--secret DATABASE_URI=postgres://baduser:badpass@<real-host>/db` → `verification failed: timeout (10000ms)` (postgres-mcp doesn't surface PG's auth error inside the discovery window — see `[[../../learnings/postgres-mcp-auth-fail-classifies-as-timeout]]`), auto-rollback fires |
| P1.4 | CLI | `zeno connector list` → `postgres-production-analytics` shows `enabled`, `lastVerifiedAt` set |
| P1.5 | CLI | Second install (`--label "Analytics warehouse"`) with a different URL → slug `postgres-analytics-warehouse`, both rows coexist |
| P1.6 | CLI | `zeno connector test postgres-production-analytics` re-runs discovery and refreshes `lastVerifiedAt` |

### Persistence + isolation

| ID | Surface | Description |
|---|---|---|
| P2.1 | DB | `SELECT value_encrypted FROM connector_secrets WHERE key='DATABASE_URI'` → encrypted bytes, not plaintext |
| P2.2 | Runtime | `docker exec <worker> env` does NOT contain `DATABASE_URI` — env is set on the subprocess only at spawn time |
| P2.3 | API | `GET /api/connectors/<id>` returns `command: "uvx"`, `args: ["postgres-mcp", "--access-mode=restricted"]` — read-only mode is part of the connector identity, not the secret |

### Runtime (Slack DM → agent backend)

| ID | Surface | Description |
|---|---|---|
| P3.1 | DM | "What were the top 10 orders last week?" → agent calls `mcp__postgres-production-analytics__execute_sql` with a SELECT, replies with structured data |
| P3.2 | DM | "Show me the schema of the users table." → agent uses `list_schemas` → `list_objects` → `get_object_details`, replies with schema |
| P3.3 | DM | "Delete from orders where id=1." → the MCP server rejects the mutation under `--access-mode=restricted`; the agent reports the failure without having executed anything. Validates Constitution §Read-only database with belt+suspenders (server-side rejection on top of any role-level GRANTs the operator may have configured). |

### Snapshot regeneration

| ID | Surface | Description |
|---|---|---|
| P4.1 | Script | `DATABASE_URI=postgres://localhost/test node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `tools[]` in `agent/connectors-catalog.json`; every tool's `category` resolves to `read` via `categoryPrefixMap`. (Env-var convention: the script derives the var name from the catalog entry's first required secret key → `DATABASE_URI` matches.) |
| P4.2 | Script | Without `DATABASE_URI` env, the script skip-with-warning leaves the existing `postgres.tools[]` intact (precedent: spec 0036 Finding #1, landed in `2026-04-26-connector-linear`). |

## Acceptance Criteria

- [x] `agent/connectors-catalog.json` parses green against `catalogFileSchema` — verified by `pnpm --filter @zeno/api test` exiting 0 (the API test suite exercises `loadCatalog()` against the real catalog file).
- [x] The catalog entry's `transportConfig.args` includes `--access-mode=restricted` exactly once; no other entry mode value is permitted in the committed catalog.
- [x] `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` passes `categoryPrefixMap`, `authCheckTool`, and `authCheckArgs` from the catalog entry into `discoverTools(...)`. Unit smoke (mirror mode): `node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` exits 0 and produces no `git diff` on the snapshot file when the catalog hasn't changed.
- [x] `DATABASE_URI=<test-url> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `postgres.tools[]` such that every tool's `category` is `read` and no `write_*` / `create_*` / `update_*` / `delete_*` tool appears in the diff (P4.1).
- [x] Same script invoked without `DATABASE_URI` leaves `postgres.tools[]` intact and emits a warning to stderr (P4.2).
- [x] `infra/Dockerfile` includes a `RUN uvx postgres-mcp --help` step after the `uv` install, so the runtime image ships with `postgres-mcp` deps pre-materialized.
- [x] `zeno connector install postgres --label "smoke" --secret DATABASE_URI=<live-url>` exits 0 with `verified · N tools` (N ≥ 9) against a real Postgres instance.
- [x] Same command with an unreachable URL exits 1 with `verification failed: network` and leaves zero `connectors` rows for that label (P1.2).
- [x] Same command with valid host + invalid credentials exits 1 with `verification failed: <auth|timeout>` and zero residual rows (P1.3). Observed `timeout (10000ms)` — see `[[../../learnings/postgres-mcp-auth-fail-classifies-as-timeout]]`.
- [x] `docker exec <worker> env | grep DATABASE_URI` returns nothing during a tool call (P2.2).
- [x] In a Slack DM, the agent answers a SELECT-style question by calling `mcp__postgres-*__execute_sql` and returning structured data (P3.1).
- [x] In a Slack DM, the agent attempting a DELETE-style instruction yields an MCP error (server-side reject under `--access-mode=restricted`) and `SELECT count(*)` on the target table is unchanged (P3.3).
- [x] Installing a second instance with a distinct label produces a distinct slug; both connectors are usable concurrently (P1.5).
- [x] `pnpm run quality-gate` exits 0.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator hand-edits `agent/connectors-catalog.json` to remove `--access-mode=restricted` and re-installs with a write-capable role | The constraint is documented in the catalog `help` field of `DATABASE_URI` and in the `description`. A future commit hook / PR check could enforce it, but is out of scope for this spec. |
| Cold-start: `uvx postgres-mcp` first run downloads ~63 deps and exceeds `DISCOVER_TIMEOUT_MS = 10s` | Dockerfile prefetch (`RUN uvx postgres-mcp --help`) materializes deps at image-build time. Runtime first-install hits a warm cache. |
| `uvx` not on PATH inside container | Already there since spec 0040 (Klaviyo). Smoke step P1.1 confirms. |
| `categoryPrefixMap` misses a future tool name → classified as `interactive` | Snapshot regen reviewed before commit; harmless mis-classification (tool just defaults to `ask`). No safety implication because access-mode is still restricted. |
| `crystaldba/postgres-mcp` adds a tool that violates read-only intent in a future release (e.g. an admin operation that bypasses `--access-mode`) | Snapshot regen + manual diff review on every catalog refresh catches new tool names. If a tool with `write_*` semantics ever appears, the implementer halts and decides per Constitution §Read-only database. |
| Operator forgets `--label` on second install → slug collision with first install | `resolveSlugCollision` appends `-2`, `-3`, …; install still succeeds. Documented in the existing `--help` of `connector install`. |
| Postgres MCP Pro license changes | MIT today; license-change risk is generic to all third-party deps and not specific to this spec. |

## Open Questions

All resolved during brainstorming and Phase 0.

- **(Resolved)** Which package → `crystaldba/postgres-mcp` (operator picked Option A).
- **(Resolved)** Access-mode default → hard-coded `--access-mode=restricted` in the catalog entry.
- **(Resolved)** Tool categorization → explicit `categoryPrefixMap` for `execute_sql`, `explain_`, `analyze_`; default classifier handles the rest.
- **(Resolved)** Schema extension (`mode: argv`) → DROPPED from this spec; possibly a future spec.

## Findings during implementation

### Finding #1 — `crystaldba/postgres-mcp` auth failures classify as `timeout`

Acceptance criterion P1.3 originally read "`verification failed: auth`". Live smoke against `postgres://baduser:badpass@host:5432/smoke` returned `verification failed: timeout (10000ms)` because postgres-mcp doesn't surface Postgres' `FATAL: password authentication failed` upstream within the 10s discovery window — the MCP's connection pool either retries or buffers, and the CLI hits `DISCOVER_TIMEOUT_MS` first.

**Functional behavior is correct** — install fails, rollback fires, no row remains. Only the error CATEGORY differs from the natural expectation. Spec text amended to accept `<auth|timeout>` for P1.3. Captured in `[[../../learnings/postgres-mcp-auth-fail-classifies-as-timeout]]` so future operators don't chase the discrepancy as a Zeno bug.

### Finding #2 — pre-existing CLI bug: `--verify` silently skipped on multi-instance installs

Live smoke against `zeno-fn`'s already-installed first postgres instance showed that `zeno connector install` printed `installed` and exited 0 **without printing `verifying...`** when the catalog already had a row. Diagnosis: the CLI's post-install slug-diff (`runConnectorInstall` in `apps/cli/src/commands/connector-install.ts:120-128`) walks the top-level listing only. With 2+ rows of the same catalog, the API returns a `connector_group` shape with no top-level `slug`, so the `fresh` lookup is `undefined` and the function returns silently per its "should not happen on a well-behaved API" branch.

This is **not a postgres-specific bug** — it affects every multi-instance catalog (Linear, GitHub Personal, Klaviyo, etc.). Not in scope of this spec; captured as `[[../../learnings/cli-install-verify-skips-on-multi-instance]]` and surfaced as a follow-up task. Smoke for P1.5 / P1.6 still validated installation + connector-test outside the install-verify path.

## Coverage gaps (acknowledged)

- **Non-owner runtime path** — Zeno is single-tenant; same gap as every other connector.
- **Server-side restricted-mode bypass** — we trust `postgres-mcp` to enforce its own access-mode flag. P3.3 smoke validates the end-to-end behaviour but the spec does not audit `postgres-mcp`'s SQL parser.
- **`uv` Python interpreter download timing** — the FIRST time `uvx` runs (including from the Dockerfile prefetch), it may also download a compatible Python interpreter. This is one-time-per-image and lands in the build phase, not at runtime.

## Review procedure

3 consecutive review rounds without findings, same protocol as 0036 / 0037 / 0038 / 0040.

## Implementation order

1. **Phase 0 — Discovery (complete).** See `[[phase-0-discovery]]`. Live tool list captured against `--access-mode=restricted`.
2. **Phase 1 — Regen script patch.** `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs`: thread `authCheckTool` / `authCheckArgs` / `categoryPrefixMap` from the catalog entry into the `discoverTools(...)` call (the script today calls it with no options).
3. **Phase 2 — Dockerfile prefetch.** Add `RUN uvx postgres-mcp --help` after the existing `uv` install (line 24 in `infra/Dockerfile`).
4. **Phase 3 — Icon.** Save `agent/assets/connectors/postgres.svg` (simple-icons CC0) or `.png` fallback.
5. **Phase 4 — Catalog entry.** Add the `postgres` entry to `agent/connectors-catalog.json` with `command: 'uvx'`, `args: ['postgres-mcp', '--access-mode=restricted']`, `secrets: [DATABASE_URI mode: env-default]`, `authCheckTool: 'list_schemas'`, `categoryPrefixMap`, `tools: []`.
6. **Phase 5 — Snapshot regen.** `DATABASE_URI=<test-url> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `tools[]`. Diff review confirms `category: read` everywhere.
7. **Phase 6 — `pnpm run quality-gate` green.**
8. **Phase 7 — Manual smoke.** P1.* / P2.* / P3.* / P4.* with evidence captured.
9. **Phase 8 — Ship.** Spec `status: shipped`. Reflection step writes any non-obvious learnings to `.vault/learnings/`.

Estimated effort: ~half a day. Phase 2 (Dockerfile) + Phase 4 (catalog) are mechanical. Phase 7 (smoke) dominates wall-clock time.
