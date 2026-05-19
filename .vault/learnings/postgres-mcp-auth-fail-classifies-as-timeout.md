---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-19-connector-postgres/spec-connector-postgres]]"
created: 2026-05-19
---
# `crystaldba/postgres-mcp` auth failures surface as `timeout`, not `auth`

When `postgres-mcp` is given valid host + invalid credentials (e.g. `postgresql://baduser:badpass@host:5432/db`), it does NOT propagate Postgres' `FATAL: password authentication failed` upward in time for `discoverTools`' 10s `DISCOVER_TIMEOUT_MS` to classify it. The MCP server's connection pool initializer either retries or buffers, and by the time the timeout fires the CLI sees `timeout (10000ms)` — `classifyError` puts that in the `timeout` bucket, not `auth`.

Functional behavior is correct: install fails, rollback fires, no row remains. Only the error CATEGORY differs from the natural expectation.

## Context

Discovered during the connector-postgres spec's smoke task (P1.3 retry with clean state). Acceptance criterion read "verification failed: auth"; observed "verification failed: timeout (10000ms)". The classifier in `packages/mcp-discover/src/discover.ts:54+` matches several auth phrasings (`password authentication failed`, `invalid_token`, `Authorization Expired`, …) but the postgres MCP doesn't emit any of them — it just hangs internally.

## How to Apply

- Treat `errorKind: 'timeout'` from postgres-mcp's `discoverTools` as plausibly an auth failure during install verification. The agent's retry / messaging UX should not assume "timeout = network" when the connector is postgres.
- If a future patch to `postgres-mcp` propagates the postgres error upstream, the classification will sharpen automatically (the regex already covers `password authentication failed`).
- DO NOT broaden `classifyError`'s `timeout` regex to retroactively capture this. Auth-vs-network ambiguity in `timeout` is upstream-specific; making it global would mis-classify legitimate network timeouts for other MCPs.

## See also

- `packages/mcp-discover/src/discover.ts:54-79` — `classifyError`.
- Smoke evidence: `.vault/specs/2026-05-19-connector-postgres/` (P1.3 retry result).
