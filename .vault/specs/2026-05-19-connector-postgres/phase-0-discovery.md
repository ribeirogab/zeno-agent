---
date: 2026-05-19
status: complete
spec: "[[spec-connector-postgres]]"
---
# Phase 0 — Discovery

Two rounds. Round 1 blocked the original spec (canonical `@modelcontextprotocol/server-postgres` is deprecated + source removed). Operator picked Option A → switched to `crystaldba/postgres-mcp`. Round 2 unblocked.

## Round 1 — `@modelcontextprotocol/server-postgres` (rejected)

| Check | Result |
|---|---|
| npm | `0.6.2`, **deprecated** (`Package no longer supported`) |
| `modelcontextprotocol/servers/src/` content | `postgres/` removed; only `everything fetch filesystem git memory sequentialthinking time` remain |
| Repo overall | `isArchived: false`, pushed 2026-05-17 — but no longer maintains postgres |

Verdict: cannot proceed with the package the issue named. Escalated to operator.

## Operator decision (2026-05-19)

> "A" — switch to `crystaldba/postgres-mcp` (Postgres Pro).

## Round 2 — `crystaldba/postgres-mcp` (accepted)

### Package facts (verified live)

| Field | Value |
|---|---|
| PyPI | `postgres-mcp@0.3.0` — `pip install postgres-mcp` |
| GitHub | `crystaldba/postgres-mcp` — MIT, not archived |
| Runtime | Python ≥ 3.12 |
| Invocation (uvx) | `uvx postgres-mcp --access-mode=restricted` |
| Invocation (docker) | `docker run --rm -i crystaldba/postgres-mcp --access-mode=restricted` |
| Secret | `DATABASE_URI` — read from **env** (not positional argv) |
| Read-only flag | `--access-mode=restricted` (default is `unrestricted`) |

`--help` output captured directly from `uvx postgres-mcp --help`:
```
usage: postgres-mcp [-h] [--access-mode {unrestricted,restricted}]
                    [--transport {stdio,sse}] [--sse-host SSE_HOST]
                    [--sse-port SSE_PORT]
                    [database_url]
```

### Live tool list (with `--access-mode=restricted` against postgres:16)

Captured via direct JSON-RPC stdio probe on `postgres://postgres:t@localhost:5599/postgres`:

| Tool | Default classifier | Needs prefix map? |
|---|---|---|
| `list_schemas` | `read` (matches `list_`) | no |
| `list_objects` | `read` (matches `list_`) | no |
| `get_object_details` | `read` (matches `get_`) | no |
| `explain_query` | `interactive` | **yes → read** |
| `analyze_workload_indexes` | `interactive` | **yes → read** |
| `analyze_query_indexes` | `interactive` | **yes → read** |
| `analyze_db_health` | `interactive` | **yes → read** |
| `get_top_queries` | `read` (matches `get_`) | no |
| `execute_sql` | `interactive` | **yes → read** (description: "Execute a read-only SQL query") |

**No `write_*` / `create_*` / `update_*` / `delete_*` tool present in restricted mode.** Constitution §Read-only database honored.

`categoryPrefixMap` needed (minimal):
```json
{
  "execute_sql": "read",
  "explain_": "read",
  "analyze_": "read"
}
```

### Implications for the spec

The schema extension (`secrets[].mode: 'env' | 'argv'` + `${KEY}` interpolation in `toStdioConfig`) **is no longer required** for Postgres — crystaldba's server reads `DATABASE_URI` from env, which fits the existing default path with zero schema change.

Spec scope shrinks substantially:
- **Drop:** catalog-schema `mode` field, zod refinement, `toStdioConfig` argv interpolation, custom-source guard.
- **Keep:** regen-script pass-through for `categoryPrefixMap` / `authCheckTool` / `authCheckArgs`.
- **Add:** `--access-mode=restricted` constraint (constitution rule 22 backstop), Dockerfile prefetch of `postgres-mcp` (cold-start ~5-10s, 63 deps including `psycopg-binary` + `pglast` parser), explicit `categoryPrefixMap`.

The schema extension can still ship as its own follow-up spec if a future connector genuinely needs argv-mode (Redis, SQLite). Out of scope here.

### Container considerations

| Concern | Mitigation |
|---|---|
| `python3` in `node:24-slim` is 3.11.x; `postgres-mcp` needs Python ≥ 3.12 | `uvx` auto-provisions a compatible Python on first run — no `apt install python3.12` needed. Klaviyo + Swarmia already use this path. |
| Cold-start downloads (~63 deps including `psycopg-binary`, `pglast`) | Add `RUN uvx postgres-mcp --help` to `infra/Dockerfile` after the existing `uv` install. Materializes deps at build time; runtime first-install becomes a warm-cache hit well inside `DISCOVER_TIMEOUT_MS = 10s`. |
| `uvx` already on PATH | Confirmed at `infra/Dockerfile:24` (spec 0040 landed it for Klaviyo/Swarmia). |

### Container cleanup

Throwaway DB used for probe: `pg-discover2` (postgres:16, port 5599 → 5432). Stopped via `docker stop pg-discover2` after capture.

## References

- `[[spec-connector-postgres]]` — amended to the v2 design after this discovery.
- Upstream README: https://github.com/crystaldba/postgres-mcp#readme
- PyPI: https://pypi.org/project/postgres-mcp/
- Constitution §Read-only database
- `[[../../rules/integration-tokens-in-db-only]]` — `DATABASE_URI` lives in `connector_secrets`, not `.env`.
