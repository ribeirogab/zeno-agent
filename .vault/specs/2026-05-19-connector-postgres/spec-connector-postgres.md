---
status: draft
feature: connector-postgres
created: 2026-05-19
shipped: null
issue: 75
---
# Postgres Connector — Spec

**Status:** Draft
**Scope:** Add Postgres to the curated connectors catalog as a stdio-based, read-only MCP using `@modelcontextprotocol/server-postgres`. Land a generic catalog-schema extension (`secrets[].mode: 'env' | 'argv'`) that lets secret values be interpolated into positional argv slots — required because the upstream server takes the connection URL as a positional argument, not env.

## Brainstorm Q&A

### Why Postgres, why now?

Zeno needs first-class read access to relational data sitting in Postgres (application DBs, analytics warehouses) so the agent can answer ad-hoc analytics questions and pull metrics from cron tasks. Today there's no path to query Postgres from a Slack DM — the agent has no shell, so a connector is the only option (per Architecture Principle "Capabilities come from connectors"). Postgres is the highest-frequency relational store across the operator's stacks, so it lands first; MySQL/SQLite are deferred to separate catalog entries.

Concrete uses:
- "What were the top 10 orders last week?" — ad-hoc analytics from chat.
- "Show me the schema of the `users` table." — schema spelunking in unfamiliar databases.
- Cron tasks that periodically pull metrics from a production read-replica.

### Which Postgres MCP server?

`@modelcontextprotocol/server-postgres` (the official `modelcontextprotocol/servers` entry). Read-only by design — exposes `SELECT` execution and schema introspection only. Single-database per process. Multi-instance per profile achieved by installing the connector N times (one connector per DB the operator wants to reach), matching the existing GitHub Personal pattern.

Alternatives considered and rejected for v1:
- **`crystaldba/postgres-mcp` (Postgres Pro)** — bigger surface (perf analysis, index advisor, safe-mode exec). Could land as a second `postgres-pro` catalog entry later; out of scope here.
- **Generic SQL connector** — too vague; each engine has different SDK and auth shape.

### What is the positional-argv problem?

`@modelcontextprotocol/server-postgres` reads the connection URL as a positional argument: `npx -y @modelcontextprotocol/server-postgres <URL>`. It does NOT read from env. Every existing catalog entry's secret pipeline (`toStdioConfig` in `packages/mcp-discover/src/build-config.ts`) goes through `env: Record<string, string>`. There is **no precedent in the catalog for interpolating secret values into argv**.

Three options were weighed:
1. **Extend the catalog with `mode: 'argv'` + `${KEY}` interpolation in args.** (Chosen.) Clean, reusable for future connectors that need positional secrets (Redis, SQLite, etc.). Cost: schema bump + build-config patch + tests. Risk: URL containing password appears in `ps aux` inside the container — accepted given Docker isolation (Constitution: Sandboxed execution).
2. Wrapper script `sh -c 'exec npx ... "$DATABASE_URL"'`. More fragile (escaping, shell dependency, URL still leaks in argv).
3. Find a fork/alternative MCP that reads `DATABASE_URL` from env. Departs from the upstream pointed to by the issue; future maintenance cost.

### Instance model

Multi-instance via slug + `instanceLabel`. The CLI already supports this end-to-end (`apps/api/src/routes/connectors.ts:1033-1035` derives `${catalogId}-${kebabLower(instanceLabel)}` and `resolveSlugCollision` adds `-2`, `-3`, … on collision). No `pattern: "app"`, no `appArgs`, no `customInstallComponent`. The catalog entry omits `multiInstance` to inherit the default `true`.

### Tool categorization

Postgres MCP exposes tools like `query`, `list_resources`, `read_resource`. The first does not match the default `READ_PREFIXES` (`read_/list_/get_/search_/find_`) and would fall through to `interactive`. The catalog uses `categoryPrefixMap` (spec 0048 Q1, used by Klaviyo) to override per-prefix mapping:

```json
"categoryPrefixMap": { "query": "read", "list_resources": "read", "read_resource": "read" }
```

The implementer audits the live tool list during snapshot regen and rejects the spec if any `write_*` / `create_*` / `delete_*` tool sneaks in (Constitution §Read-only database).

## Context

The connectors infrastructure (specs 0029, 0032, 0033, 0034) supports both stdio and remote MCPs. Existing stdio connectors (GitHub Personal, GitHub App, Sentry, Klaviyo, Swarmia) pass secrets exclusively via `env`. The Linear connector exercised the remote transport (spec 0040). Postgres is the **first catalog entry that needs a positional-argv secret**, requiring a small but generic schema extension that benefits all future MCPs with the same shape (Redis, SQLite, etc.).

The CLI install flow (`apps/cli/src/commands/connector-install.ts`, spec 2026-05-08-connectors-cli-first-design) is the single entry-point for operator-driven installs. The dashboard is read-only when `writes: 'cli'`; all mutations are gated behind the `x-zeno-origin: cli` header and respond with `403 mode_cli_only` plus the equivalent CLI command otherwise.

## Problem Statement

Add a `postgres` catalog entry that lets the operator install one or more Postgres database connections via `zeno connector install postgres --label "<name>" --secret DATABASE_URL=<url>`. Land the minimum schema extension (`secrets[].mode: 'env' | 'argv'` + `${KEY}` interpolation in `transportConfig.args`) needed to wire the upstream server, with backward compatibility for every existing connector.

## Non-Goals

1. **Postgres Pro / `crystaldba/postgres-mcp`** — separate future catalog entry.
2. **Generic SQL connector** — MySQL/SQLite ship as separate catalog entries when needed.
3. **Write queries / migrations** — the server is read-only by design; spec does not attempt to expose mutation paths (Constitution §Read-only database; cf. global CLAUDE.md Rule 22).
4. **Multi-DB inside a single connector instance** — one instance per database URL.
5. **Custom install component / `pattern: "app"`** — postgres uses the standard one-secret install flow.
6. **OAuth / IAM auth (e.g. RDS IAM)** — DATABASE_URL with username + password only.
7. **Argv interpolation for custom (non-catalog) connectors** — `mode: 'argv'` is catalog-only; custom connectors continue to manage their own `args[]` literally.
8. **Prefetching the npm package in the worker Dockerfile** — cold-start mitigation is future polish.

## Constraints

- **CLI-only operator surface.** All mutations go through `zeno connector install / test / uninstall`. The dashboard reads but does not mutate.
- **Catalog-schema extension is backward-compatible.** `secrets[].mode` is optional and defaults to `'env'`; every existing catalog entry is left untouched.
- **Argv interpolation runs at spawn time, not install time.** `connectors.args` (DB column) persists the literal `${DATABASE_URL}` placeholder; the substitution happens inside `toStdioConfig` when the MCP subprocess is spawned. Secrets remain in `connector_secrets` encrypted; they never enter the args column.
- **`mode: 'argv'` satisfies [[../../rules/integration-tokens-in-db-only]] strictly.** `DATABASE_URL` never enters worker `process.env` — only the subprocess's argv at spawn time. The "disable toggle is a strong promise" invariant from the 2026-04-26 Sentry incident is preserved end-to-end: disabling the connector strips the secret row, and the agent cannot recover the URL via `env | grep` (since it was never there).
- **Custom connectors throw on `${KEY}` in args.** Defense-in-depth: argv interpolation requires a catalog entry that declares `mode: 'argv'`. Custom connectors that include `${KEY}` literals get a clear error.
- **`authCheckTool: query` + `authCheckArgs: { sql: 'SELECT 1' }`** to validate credentials after `tools/list`.
- **`categoryPrefixMap`** maps `query` / `list_resources` / `read_resource` to `read`.
- **Phase 0 upstream check.** Implementer verifies `@modelcontextprotocol/server-postgres` is still maintained before proceeding. If the upstream is archived/deprecated, the spec is paused and escalated.
- **Smoke against a real Postgres** (read-only role recommended) is required for acceptance — same pattern as the Linear connector validation runbook.

## User Stories / Scenarios

### CLI install flow

| ID | Surface | Description |
|---|---|---|
| P1.1 | CLI | `zeno connector install postgres --label "Production analytics"` (no `--secret`) → `promptHidden` masks the URL, `queued · correlationId=…`, `installed`, `verified · N tools` |
| P1.2 | CLI | Same with `--secret DATABASE_URL=postgres://INVALID:bad@localhost:5432/x` (DB unreachable) → `verification failed: network`, auto-rollback, exit 1, no residual row in `connectors` |
| P1.3 | CLI | Same with `--secret DATABASE_URL=postgres://baduser:badpass@<real-host>/db` → `verification failed: auth`, auto-rollback |
| P1.4 | CLI | `zeno connector list` → `postgres-production-analytics` shows `enabled`, `lastVerifiedAt` set |
| P1.5 | CLI | Second install (`--label "Analytics warehouse"`) with a different URL → slug `postgres-analytics-warehouse`, both rows coexist |
| P1.6 | CLI | `zeno connector test postgres-production-analytics` re-runs discovery and updates `lastVerifiedAt` |

### Persistence + isolation

| ID | Surface | Description |
|---|---|---|
| P2.1 | API | `GET /api/connectors/<id>` → `args` returns the literal `["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]` (placeholder, not the URL) |
| P2.2 | DB | `SELECT value_encrypted FROM connector_secrets WHERE key='DATABASE_URL'` → encrypted bytes (not plaintext) |
| P2.3 | Runtime | `docker exec <worker> env` during a tool call → `DATABASE_URL` does NOT appear in the worker's process env |
| P2.4 | Runtime | `docker exec <worker> ps auxf` during a tool call → the URL appears in the `npx` subprocess argv (expected; documented tradeoff of `mode: 'argv'`) |

### Runtime (Slack DM → agent backend)

| ID | Surface | Description |
|---|---|---|
| P3.1 | DM | "What were the top 10 orders last week?" → agent calls `mcp__postgres-production-analytics__query` with SQL, replies with structured data |
| P3.2 | DM | "Show me the schema of the users table." → agent uses `list_resources` / `read_resource`, replies with schema |
| P3.3 | DM | "Delete from orders where id=1." → the MCP server returns an error (read-only by design); the agent reports the failure without having executed any mutation. Validates Constitution §Read-only database. |

### Snapshot regeneration

| ID | Surface | Description |
|---|---|---|
| P4.1 | Script | `DATABASE_URL=postgres://localhost/test node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `tools[]` in `agent/connectors-catalog.json`; diff reviewed, every tool has `category: read`. (Env-var convention: script derives the var name from the catalog entry's first required secret → `DATABASE_URL` matches.) |
| P4.2 | Script | Without `DATABASE_URL` env, the script skip-with-warning leaves the existing `tools[]` untouched (precedent: spec 0036 Finding #1, landed in `2026-04-26-connector-linear`). |

## Acceptance Criteria

- [ ] `agent/connectors-catalog.json` parses green against `catalogFileSchema` with the new `postgres` entry — verified by `pnpm --filter @zeno/api test` exiting 0 (the API test suite exercises `loadCatalog()` against the real catalog file).
- [ ] `catalogSecretSchema` accepts `mode: 'argv'` and `mode: 'env'`, defaults to `'env'` when omitted (zod unit test green).
- [ ] All existing catalog entries (`github`, `github-app`, `linear`, `klaviyo`, `swarmia`, `sentry`, plus the new `postgres`) parse green with no diff in observable behaviour for the pre-existing entries (snapshot test).
- [ ] `toStdioConfig` with one `mode: 'argv'` secret + matching `${KEY}` in args returns `args` with the substituted value and `env` WITHOUT that key (unit test).
- [ ] `toStdioConfig` with `mode: 'env'` secret returns `env` with the key set and `args` untouched (unit test — backward compat).
- [ ] `toStdioConfig` with mixed `mode: 'env' + 'argv'` secrets on the same connector handles each correctly (unit test).
- [ ] `toStdioConfig` throws `missing argv secret for KEY` when `args` contains `${KEY}` but no secret with `mode: 'argv'` and `key='KEY'` is supplied (unit test).
- [ ] `toStdioConfig` substitutes every occurrence when `${KEY}` appears in multiple slots of `args` (unit test).
- [ ] `toStdioConfig` throws when `connector.source === 'custom'` and `args` contains any `${KEY}` (unit test).
- [ ] `zeno connector install postgres --label "smoke" --secret DATABASE_URL=<live-url>` exits 0 with `verified · N tools` against a real Postgres instance.
- [ ] Same command with an unreachable URL exits 1 with `verification failed: network` and leaves zero `connectors` rows for that label (P1.2).
- [ ] Same command with valid host + invalid credentials exits 1 with `verification failed: auth` and zero residual rows (P1.3).
- [ ] After P1.1 succeeds, `GET /api/connectors/<id>` returns `args: ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]` — the literal placeholder, not the URL (P2.1).
- [ ] During a tool call against the installed connector, `docker exec <worker> env | grep DATABASE_URL` returns nothing (P2.3).
- [ ] During a tool call, `docker exec <worker> ps auxf` shows the URL in the `npx` subprocess argv (P2.4 — documented tradeoff).
- [ ] Installing a second instance with a distinct label produces a distinct slug; both connectors are usable concurrently (P1.5).
- [ ] In a Slack DM, the agent answers a SELECT-style question by calling `mcp__postgres-*__query` and returning structured data (P3.1).
- [ ] In a Slack DM, the agent attempting a DELETE-style instruction yields a server error and no mutation is performed (P3.3).
- [ ] `pnpm run quality-gate` exits 0 (lint + typecheck + tests).
- [ ] `DATABASE_URL=<test-url> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `tools[]` with every tool's `category` resolving to `read` via `categoryPrefixMap`; the diff contains no `write_*` / `create_*` / `delete_*` tool (P4.1).
- [ ] Same script invoked without `DATABASE_URL` env leaves the existing `postgres.tools[]` intact and emits a warning to stderr (P4.2).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `@modelcontextprotocol/server-postgres` archived/deprecated upstream | **Phase 0 gating check** before any code changes. If ✗, escalate; the spec is paused, with `crystaldba/postgres-mcp` as a future fallback. |
| URL with password visible in `ps aux` inside the container | Container worker is sandboxed (Constitution Sandboxed-execution). Operator instructed (secret `help` text) to use a read-only role. Documented tradeoff of `mode: 'argv'`. |
| `npx -y` cold start exceeds `DISCOVER_TIMEOUT_MS = 10s` on slow networks | Documented in the secret `help`. Retry via `zeno connector test <slug>`. Future polish: prefetch in worker Dockerfile (out of scope). |
| `categoryPrefixMap` doesn't cover an unexpected tool name (e.g. `execute_sql`) → classified as `interactive` | Phase 0 captures the live tool list. Snapshot regen reviewed before commit. If a `write_*` / `create_*` / `delete_*` tool appears, ad-hoc decision (likely reject under Constitution §Read-only database). |
| Custom connectors later need argv interpolation | Documented as out-of-scope in this spec. If real demand surfaces, a follow-up spec lifts the guard. |
| `mode: 'argv'` extension breaks an existing connector | Default `'env'` preserves 100 % backward compat. The snapshot test against the real catalog file is the canary. |
| Operator forgets `--label` on second install → collision | `resolveSlugCollision` appends `-2`, `-3`, …; install still succeeds. Documented in `--help` of `connector install`. |

## Open Questions

All resolved during brainstorming. Phase 0 will surface any new questions about the live tool surface.

- **(Resolved)** Positional-argv handling → catalog extension with `mode: 'argv'` + `${KEY}` interpolation.
- **(Resolved)** Instance model → single catalog entry, multi-install via slug + `instanceLabel` (default `multiInstance: true`).
- **(Resolved)** Tool categorization → `categoryPrefixMap` for `query` / `list_resources` / `read_resource`.

## Coverage gaps (acknowledged)

- **Non-owner runtime path** — Zeno is single-tenant; same gap as every other connector.
- **SQL-injection-style write attempt** (`SELECT ...; DELETE ...`) — the upstream server's SQL parser is the line of defense; P3.3 smoke validates the end-to-end behaviour but the spec does not deep-test the parser.
- **Snapshot regen against a Postgres that is unreachable** — the script already has skip-with-warning behaviour from spec 0036 Finding #1; no new test is added.

## Review procedure

3 consecutive review rounds without findings, same protocol as 0036 / 0037 / 0038 / 0040. R1 independent reviewer cold, R2 cross-check against catalog / `discoverTools` / `toStdioConfig` infra, R3 fresh independent.

## Implementation order

1. **Phase 0 — Discovery (gating).** Verify upstream `@modelcontextprotocol/server-postgres` is maintained. Run `npx -y @modelcontextprotocol/server-postgres postgres://localhost/test` locally; capture the live tool list. Confirm no `write_*` / `create_*` / `delete_*` tool is present. If the package is archived, halt and escalate.
2. **Phase 1 — Catalog schema extension.** Add `mode: z.enum(['env', 'argv']).optional().default('env')` to `catalogSecretSchema` in `apps/api/src/lib/catalog-loader.ts`. Unit tests for default + explicit values.
3. **Phase 2 — Build-config interpolation.** Extend `toStdioConfig` in `packages/mcp-discover/src/build-config.ts`: cross-reference the catalog entry's `secrets[].mode`, route `mode: 'argv'` secrets through `${KEY}` substitution in `args`, keep `mode: 'env'` secrets going into `env`. Defense-in-depth: `mode: 'argv'` secrets MUST NOT appear in `env`. Throw `missing argv secret for KEY` if a placeholder doesn't resolve. Throw on `source === 'custom'` + any `${KEY}` in `args`.
4. **Phase 3 — Catalog entry.** Add the `postgres` entry to `agent/connectors-catalog.json` with `transport: stdio`, `transportConfig.args: ["-y", "@modelcontextprotocol/server-postgres", "${DATABASE_URL}"]`, `secrets[0].mode: 'argv'`, `authCheckTool: 'query'`, `authCheckArgs: { sql: 'SELECT 1' }`, `categoryPrefixMap`, `tools: []`, `terminology.instance: "Database"`, `tags: ["database", "sql"]`.
5. **Phase 4 — Icon.** Save `agent/assets/connectors/postgres.svg` (or `.png` if the SVG isn't public-domain).
6. **Phase 5 — Snapshot regen.** `DATABASE_URL=<test-url> node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp` populates `tools[]`. Manual diff review confirms every tool's `category` is `read`.
7. **Phase 6 — `pnpm run quality-gate` green.**
8. **Phase 7 — Manual smoke.** P1.* + P2.* via CLI + `docker exec`; P3.* in a Slack DM; P4.* against the regen script. Evidence (CLI output, screenshots, diff) attached to the PR.
9. **Phase 8 — Ship.** Spec `status: shipped`. Reflection step: write any non-obvious learnings to `.vault/learnings/`.

Estimated effort: half a day, dominated by Phase 0 discovery + Phase 7 smoke. The code change is small (1 schema field, 1 function patch, 1 catalog entry, 1 icon).
