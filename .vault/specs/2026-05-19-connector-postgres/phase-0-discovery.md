---
date: 2026-05-19
status: BLOCKED — escalation required
spec: "[[spec-connector-postgres]]"
---
# Phase 0 — Discovery (gating)

## Outcome

**🚨 BLOCKED.** The upstream package the spec was built around — `@modelcontextprotocol/server-postgres` — has been **deprecated on npm AND removed from the canonical reference-servers repo**. Implementation cannot proceed without operator approval to switch to an alternative.

## Findings

### 1. `@modelcontextprotocol/server-postgres` on npm

Captured via `npm view @modelcontextprotocol/server-postgres version description deprecated`:

```
version = '0.6.2'
description = 'MCP server for interacting with PostgreSQL databases'
deprecated = 'Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.'
```

The package is **DEPRECATED**. Installing it (`npx -y @modelcontextprotocol/server-postgres ...`) emits a deprecation warning to stderr but still runs at the v0.6.2 frozen behavior. No bug-fix backstop, no security patches, npm may pull it without notice.

### 2. Source removed from `modelcontextprotocol/servers`

Captured via `gh api repos/modelcontextprotocol/servers/contents/src`:

```
everything
fetch
filesystem
git
memory
sequentialthinking
time
```

`postgres/` is **gone**. The MCP project pruned reference servers; postgres was one of the pruned. The upstream repo itself is not archived (`isArchived: false`, recent commits in 2026-05) — only the postgres source was removed.

The implication: even if the npm package is un-deprecated tomorrow, the source code maintaining it isn't where the spec expected. Future patches are not coming from the canonical org.

### 3. Vetting community alternatives

| Candidate | Stars | Last push | License | Maintainers | Verdict |
|---|---|---|---|---|---|
| `postgres-mcp` (npm, `llm-graph/postgres-mcp` on GitHub) | 0 | 2025-04-20 (>13 months stale) | MIT | 1 (`alvamind`) | ❌ stale + unverified |
| `crystaldba/postgres-mcp` (Postgres Pro, Python via `uvx`) | n/a (not on npm) | live | — | crystaldba | ⚠ explicitly rejected by spec §Non-Goals item 1 (bigger surface, perf advisor) |
| Other matches via `gh search repos "postgres mcp"` | — | — | — | — | (search returned no usable result during discovery; can be re-run on escalation) |

### 4. What is NOT broken

- **The catalog-schema extension (`secrets[].mode: 'env' \| 'argv'`)** designed for this spec is still useful — it's generic, would land cleanly, and benefits any future MCP that takes positional argv (Redis, SQLite, future Postgres replacement, etc.). It can ship independently.
- **The `toStdioConfig` interpolation logic** in the plan is server-agnostic. Same point.
- **The `categoryPrefixMap` mechanism** already exists (spec 0048 Q1). The plan's only addition to it (Task 4 — threading it through the regen script) is also server-agnostic.

In other words: **everything except the catalog entry (Task 6) and the icon (Task 5) is reusable as-is.** Only the upstream-package decision blocks.

## Recommendation to operator

Three credible paths. Pick one:

### Option A — switch to `crystaldba/postgres-mcp` (Postgres Pro)

Spec § Non-Goals item 1 originally rejected this for "bigger surface". With the canonical server gone, that reasoning weakens — it becomes "the maintained Postgres MCP we know exists". Tradeoffs:

- ✅ Actively maintained.
- ✅ Read-only mode supported (`--access-mode unrestricted` is opt-in; default is restricted).
- ❌ Python (uvx), not Node — different runtime to vet inside the worker container. Klaviyo + Swarmia already use `uvx`, so the precedent exists.
- ❌ Bigger tool surface: in addition to `query`/`describe_*`, also exposes `explain_query`, `get_top_queries` (perf advisor), `analyze_db_health`, etc. Some of these stretch "read-only data" into "operate the DB" territory. `categoryPrefixMap` can still pin them to `read`/`interactive`, but the operator should review the full list.
- 🔁 Spec needs amendment: `transportConfig.command = "uvx"`, new args shape, expanded `categoryPrefixMap`, possibly extra `secrets` (e.g. `--access-mode` flag).

### Option B — pause indefinitely, no Postgres connector

Drop the spec until either (a) a canonical replacement appears upstream or (b) the operator builds a Zeno-maintained postgres MCP. Issue #75 stays open as backlog.

### Option C — proceed with deprecated package as-is

Document the deprecation; ship today; revisit when it breaks. **Not recommended** — the project's "verify before implementing" principle (constitution §Tooling and workflow principles) and the existence of `[[../../rules/integration-tokens-in-db-only]]`-level risk-aversion both push against shipping a deprecated upstream.

## What landed during Phase 0

Nothing in the working tree. No code changes, no commits beyond this discovery note.

The `feat/connector-postgres` branch is at the same commit as `main` (`d2ab8a6`) — no execution happened past gating.

## What needs operator decision

1. **Pick A / B / C above.** If A, the spec needs amendment (new package, new args shape, expanded `categoryPrefixMap`, possibly new `secrets`); if B, close issue #75 with a note; if C, accept the deprecation risk in writing.
2. **(Independent of above)** Should the schema extension (`mode: 'env' \| 'argv'`) ship in a separate, smaller spec? It is generic, useful for the future, and has no upstream dependency. Splitting it would let the catalog-schema work land while the operator decides the Postgres question.

## References

- Spec: `[[spec-connector-postgres]]` § Implementation order Phase 0 (gating definition).
- Issue: https://github.com/ribeirogab/zeno-agent/issues/75 (motivation + alternatives originally considered).
- Constitution: §Tooling and workflow principles ("Verify before implementing").
- Rule: `[[../../rules/integration-tokens-in-db-only]]` (defense-in-depth context that makes a deprecated upstream more uncomfortable than a normal dep).
