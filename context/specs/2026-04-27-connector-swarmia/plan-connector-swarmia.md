---
feature: connector-swarmia
spec: "[[spec-connector-swarmia]]"
created: 2026-04-27
---
# Swarmia Connector — Plan

**For this spec:** `[[spec-connector-swarmia]]`

## Approach

Catalog-only addition, riding on the `uv` toolchain that spec 0040 (Klaviyo) added to the Dockerfile. Same install pattern as Klaviyo, just `uvx --from git+URL pkg` instead of `uvx pkg@version`.

## File Structure

Files **created**:

- `agent/assets/connectors/swarmia.svg` — brand icon.

Files **modified**:

- `agent/connectors-catalog.json` — append `swarmia` entry.
- `apps/worker/tests/connectors-e2e/__snapshots__/catalog-tools.snap` — regenerated.

## Phase ordering

### Phase 0 — Spec finalization (3-review)

### Phase 1 — Hard prerequisite gate (0040 + 0039)

- **Gate A (0040)**: Confirm `uv` is installed in the image. `docker run --rm zeno-agent:dev uvx --version` and `docker run --rm --user node zeno-agent:dev uvx --version` both print a `0.11.x` version. If not, spec 0040 has not shipped — STOP.
- **Gate B (0039)**: Confirm the regenerator has the warn+continue patch. `grep "skip.*: missing env var" apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` should match a `console.warn(...)` line. If not, spec 0039 has not shipped — STOP.
- Both gates must pass before any work in Phase 2 onward.

### Phase 2 — Catalog entry

```json
{
  "id": "swarmia",
  "name": "Swarmia",
  "description": "Engineering metrics — DORA, throughput, code review.",
  "icon": "swarmia.svg",
  "docsUrl": "https://help.swarmia.com/settings/integrations/data-export/export-api",
  "transport": "stdio",
  "transportConfig": {
    "command": "uvx",
    "args": ["--from", "git+https://github.com/mattjegan/swarmia-mcp", "swarmia-mcp"]
  },
  "authCheckTool": "dora_metrics",
  "secrets": [{
    "key": "SWARMIA_API_TOKEN",
    "label": "API Token",
    "help": "Personal API token from your Swarmia profile (Profile → API tokens). Read-only access to Export API.",
    "required": true
  }],
  "tools": [],
  "tags": ["engineering", "metrics", "dora"]
}
```

### Phase 3 — Tool list regeneration

**Execution context**: runs on the host. Host needs `uv` installed locally (one-time setup, see Task 3.0). The catalog file is bind-mounted read-only into the container, and `apps/` is not mounted, so running inside the container is not viable.

On the host: `SWARMIA_API_TOKEN=... node apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs --fetch-from-mcp`. The script's first git+URL install will be slow (~30-60s); subsequent runs reuse the cache.

If first-run timeout exceeds the script's tolerance, run `uvx --from git+https://github.com/mattjegan/swarmia-mcp swarmia-mcp --help` manually once on the host to warm the cache, then re-run the regenerator.

**Note**: regen does NOT call `authCheckTool` (only `tools/list`). Real auth validation happens in Phase 6 via `POST /catalog/swarmia/test`. A bad-but-syntactically-valid token may pass regen with a partial tool list — recover by running the API smoke separately, then re-running regen with a known-good token.

### Phase 4 — Brand icon

Download Swarmia's SVG (their brand assets — `https://www.swarmia.com/favicon.svg` if available, or a public asset). Save as `agent/assets/connectors/swarmia.svg`.

### Phase 5 — Quality gate

`pnpm -w run quality-gate` green.

### Phase 6 — Manual smoke (live profile)

1. **API smoke**: `POST /api/connectors/catalog/swarmia/test` — bad token → `{ok: false, errorKind: 'auth'}`; real token → `{ok: true, tools: [...]}`.
2. **UI smoke** (`localhost:3001/connectors`): card → modal → paste real token → Test → ✓ → Add. Click card to navigate to detail page; verify tools listed.
3. **Slack DM** (`D0EXAMPLE000`): `[smoke swarmia] qual a deploy frequency da última semana?` — agent calls `mcp__swarmia__dora_metrics` (or similar), replies with structured DORA data within 90s. Verify `connector_invocations` row.

### Phase 7 — Close

- Spec status `shipped`.
- Commit on a feature branch (e.g., `feat/connector-swarmia`); open a PR via `/open-pr`. Do NOT commit/push to main directly (CLAUDE.md global rule).

## Risks / Open Decisions

- **Decision: floating `main`**. Pin to a commit if we hit churn.
- **Risk: first uvx clone is slow** — mitigation: prewarm by running uvx once during Phase 1 verification.
- **Open: official Swarmia MCP migration** — separate spec when docs are public.
