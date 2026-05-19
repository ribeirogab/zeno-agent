# Catalog — connectors to be configured in future specs

Spec 0034 initially shipped only **Slack**, and on a second pass (same day, 2026-04-26) **Sentry** was added to the catalog. The 6 connectors below remain in the queue — each becomes a short catalog spec (entry in JSON + real SVG + smoke).

## High priority (already in the old `mcp.json`, real usage)

| Slug | Transport | Command / URL | Secrets | Notes |
|---|---|---|---|---|
| `linear` | remote | `https://mcp.linear.app/sse` | `__MCP_AUTHORIZATION__` (Bearer) | Catalog declares it as remote SSE — the operator's user.md mentions usage |
| `notion` | stdio | `npx -y @notionhq/notion-mcp-server` | `NOTION_API_KEY` | Stdio. Integration via shared page |
| `granola` | stdio | `npx -y granola-mcp` | `GRANOLA_API_KEY` | Meeting notes |

## Medium priority (popular, but the operator does not use them today)

| Slug | Transport | Command / URL | Secrets | Notes |
|---|---|---|---|---|
| `github` | stdio | `npx -y @modelcontextprotocol/server-github` | `GITHUB_PERSONAL_ACCESS_TOKEN` | `GH_TOKEN` already exists in env — possibly reuse. Note: complements the `acme`/`dev-workflow`/`code-review` skills (which use the `gh` CLI), does not replace them |
| `google-drive` | remote | `https://mcp.google.com/drive` (placeholder — to confirm) | OAuth Bearer | More complex, OAuth dance out of scope (spec 0029 §Non-Goal 9) |
| `cloudflare` | remote | `https://mcp.cloudflare.com/sse` | `__MCP_AUTHORIZATION__` (CLOUDFLARE_API_TOKEN) | Workers, KV, DNS |

## Pending architectural direction (decided on 2026-04-26)

**Channels become Connectors** with an extra category. Today `Slack` appears twice in the project: as a Channel adapter (input/output, in `apps/worker/src/channels/`) and as a Connector (tools, in the DB). The operator wants to unify: every external integration = a Connector, some with category `channel` indicating "also accepts user input". Details + migration plan in the learning [`channel-vs-connector.md`](../../learnings/channel-vs-connector.md) §Future direction. Proposed spec: `00XX-channels-as-connectors`.

## How to add (short spec template)

1. Branch `feat/catalog-<slug>`.
2. Edit `agent/connectors-catalog.json` adding the entry.
3. Monochrome SVG in `agent/assets/connectors/<slug>.svg` (~ 24×24, currentColor).
4. Test locally: install via `/connectors`, run a call via Slack, check the Activity feed.
5. Commit as `feat(catalog): add <name> connector`.

## About tools / categories

Each catalog entry declares `tools[]` with `category` (read/write/interactive) and `defaultPermission` (always_allow/ask/never). To minimize friction:
- **read** → `always_allow` (the operator rarely wants to interact with a listing)
- **write** → `ask` (every creation/edit goes through approval in the MVP)
- **known destructive** (delete) → `ask`, never `never` (the operator decides)

The `mcp-discover.ts` heuristic (`classifyToolCategory`) covers custom MCPs without a catalog. The curated catalog serves to provide better defaults for popular products.
