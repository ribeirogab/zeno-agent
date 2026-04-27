---
status: approved
feature: connector-klaviyo
created: 2026-04-27
shipped: null
---
# Klaviyo Connector — Spec

**Status:** Draft
**Scope:** Add Klaviyo (email/SMS marketing — campaigns, lists, segments, profiles, events) as a catalog connector via Klaviyo's official local stdio MCP `klaviyo-mcp-server` (PyPI). Adds the `uv` Python toolchain to the Dockerfile (one-line change), unblocking any future Python-based MCP.

## Brainstorm Q&A

### Why Klaviyo, why now?

Flávia Nasser uses Klaviyo for email campaigns + transactional sends. The marketing operator doesn't have direct access to Zeno today. Adding Klaviyo as a connector means future skills can answer "how did the last campaign perform?" and "who's on the abandoned-cart segment right now?" without leaving Slack.

### Local stdio vs HTTP remote — which?

Klaviyo offers two MCPs:
- **Remote** at `https://mcp.klaviyo.com/mcp` — OAuth dynamic registration. Excellent UX, but requires Zeno's OAuth dance feature (deferred).
- **Local stdio** via PyPI's `klaviyo-mcp-server`, run with `uvx` — accepts a private API key directly via env var. Simpler now.

Going **local stdio**. The OAuth-dance feature (when built) will let us migrate to remote, but until then `uvx + API key` is the path of least resistance.

### What about adding `uv` to the Dockerfile?

`uv` is Astral's Python package manager — single binary, fast, no system Python pollution. Adding it now (one `RUN` line in the Dockerfile) unblocks **any future Python MCP**, not just Klaviyo. Same payoff for Swarmia (next spec). Cost: ~50MB image size, single dependency.

Alternative: copy the Klaviyo MCP source into the image and run with the existing Python. Rejected — `uv` is the official-recommended runner per Klaviyo's docs, and it makes Swarmia's "from-git" install clean too.

### Auth model

Klaviyo's local stdio MCP reads `PRIVATE_API_KEY` from env. Operator pastes their `pk_…` private API key once during install. The reserved secret keys (`__MCP_TYPE__`, `__MCP_AUTHORIZATION__`) don't apply for stdio with custom env var names — we use a plain catalog secret with `key: 'PRIVATE_API_KEY'` that maps directly to the spawned MCP's env (per `toStdioConfig` from spec 0033).

### Auth check tool

Klaviyo MCP exposes ~60 tools (per Klaviyo's docs). The cheapest no-args read tool is `get_account` (returns the operator's Klaviyo account info). Tested with the live API key during the credential probe (`pk_02dea0…` → account "Flavia Nasser" S7vmE2 BRL). `authCheckTool: 'get_account'` makes the dashboard's "Test connection" deterministic.

### Read-only mode

Klaviyo's MCP supports a `READ_ONLY=true` env var that hides write tools. Worth defaulting to read-only at install? Trade-off:
- Pro: defense-in-depth — even if the operator accidentally enables a write tool's permission, it doesn't exist on the MCP.
- Con: silent. Operator might wonder why "send email campaign" doesn't appear.

**Decision: do NOT default to read-only.** The connector exposes everything; the per-tool permission system (spec 0032) handles "ask for write tools" — that's how Sentry works too. If the operator wants belt-and-suspenders, they can edit the connector entry post-install to set the env var (out of scope for this spec; documented as a future polish in §Open Questions).

### Toolchain risk

Adding `uv` to the Dockerfile is a recurring failure mode (apt-get fails, install script changes URL, etc). Mitigation: pin the install URL to a specific tag (Astral publishes versioned releases). The Dockerfile stays a single-line change with a frozen version.

## Context

The connectors infrastructure (specs 0029, 0032, 0033, 0034, 0036, 0037, 0038) handles stdio transport with custom env vars cleanly (`toStdioConfig` in `mcp-discover/build-config.ts`). Sentry is a similar stdio install via `npx`. Klaviyo replaces `npx` with `uvx` — same pattern, different toolchain. The Dockerfile change is incremental and not risky.

## Problem Statement

Add Klaviyo as a catalog connector. Operator pastes API key, dashboard tests, install completes, agent can call Klaviyo tools.

## Non-Goals

1. **OAuth flow.** Deferred.
2. **Read-only-by-default.** Per-tool permission system handles this.
3. **HTTP remote variant.** Same OAuth dependency.
4. **Custom UI.** Standard install modal renders the API key field.
5. **Klaviyo skill.** No new skill — agent uses tools by name.

## Constraints

- **One catalog entry** in `agent/connectors-catalog.json`, transport `stdio`, command `uvx`, args `["klaviyo-mcp-server@latest"]`.
- **Dockerfile change**: one `RUN` line installing `uv` in the `base` stage (where root runs throughout; `runtime` inherits from `base` so the binary flows to runtime automatically). Pinned to version `0.11.7` (verified live; bumpable in a one-line follow-up PR).
- **Reuse existing stdio infra** — no code in `mcp-discover` / `build-config` changes.
- **`authCheckTool: 'get_account'`** — confirmed to fail cleanly on bad token (returns a Klaviyo auth error matching the broadened regex from spec 0038 F#2).
- **API key stored as `connector_secrets` row** with key `PRIVATE_API_KEY` (matches Klaviyo MCP's env-var name).
- **Hard prerequisite: spec 0039's regenerator patch.** Phase 3 (`--fetch-from-mcp`) requires the `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` patch landed by 0039 (throw → warn+continue on missing env var). Without that patch, running the script with only `PRIVATE_API_KEY` set will abort on the first non-Klaviyo entry with a missing token. Phase 1 of THIS spec includes a verification gate that the patch is present before proceeding.
- **Execution context for Phase 3**: the regenerator runs **on the host**, not inside the container — `agent/connectors-catalog.json` is bind-mounted read-only, and `apps/` is not mounted at all. The host therefore also needs `uv` installed (one-time, separate from the Dockerfile change). Task 3.0 covers the host install.

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| K1.1 | UI | `/connectors` shows Klaviyo card with brand icon, "stdio" pill, tool count |
| K1.2 | UI | Install modal: one secret field "Private API Key" (Klaviyo's `pk_…` format), help text links to settings/api-keys |
| K1.3 | API | `POST /api/connectors/catalog/klaviyo/test` with bad key → `{ok: false, errorKind: 'auth'}` (auth check via `get_account`) |
| K1.4 | API | Same with real key → `{ok: true, tools: [<60+>]}` |
| K1.5 | UI | Install completes; connector lands enabled |
| K1.6 | Build | `Dockerfile` adds `uv` install (pinned version); image rebuilds clean |
| K1.7 | Build | `docker compose up` starts; new container can run `uvx --version` |
| K1.8 | RT | Slack DM: "[smoke klaviyo] me dá um resumo da última campanha de e-mail" → agent calls a Klaviyo tool, returns structured data |

## Success Criteria

- Catalog entry committed; tools[] populated by regenerator.
- Dockerfile rebuilds clean.
- Manual smoke: API bad+real, UI install, Slack DM.
- `pnpm -w run quality-gate` green.
- Spec passes 3 review rounds.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `uv` install URL changes between Astral releases | Pin a specific version in the URL itself: `https://astral.sh/uv/0.11.7/install.sh`. Bumping the version is a one-line change to the Dockerfile (no env var indirection). |
| `klaviyo-mcp-server@latest` breaks API in a future minor | Pin a known-good version in the catalog `args` (e.g., `klaviyo-mcp-server@0.5.0`) — switch to `@latest` only if `uvx` caching makes pins moot |
| Image size grows | `uv` is ~50MB; acceptable. Installed in the `base` stage (decided approach), which propagates to all subsequent stages including `runtime` via Docker's `FROM base AS runtime` inheritance. |
| Klaviyo's MCP changes tool names | Refresh-tools button in detail page handles this |
| API key leaked via Bash + curl bypass | Same defense-in-depth as Sentry: token only in `connector_secrets` (spec 0036's integration-tokens-in-DB-only rule), no skill teaches curl-to-Klaviyo |

## Open Questions

- **(Resolved) `uv` vs system pip**: `uv` is canonical for Klaviyo per their docs. Pip would work but loses the version-pinned `uvx` ergonomics.
- **(Resolved) Pin a specific Klaviyo MCP version**: Phase 1 uses `@latest`; if churn hits, we pin in a follow-up.
- **(Open, separate spec) Read-only mode toggle**: a future polish — let the operator flip a connector entry's `env` to add `READ_ONLY=true` without re-installing. Out of scope here.
- **(Open, separate spec) Klaviyo-specific skill**: a skill that documents Klaviyo's data model + best practices for the agent. Not blocking.

## Coverage gaps (acknowledged)

- Same as Linear: non-owner runtime path for write tools unobservable in single-tenant `fn`.
- OAuth flow path unobservable.

## Review procedure

3 consecutive review rounds without findings.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews.
2. **Phase 1**: Verify spec 0039's regenerator patch is present (gate); add `uv` install in the Dockerfile `base` stage; `pnpm run docker:build` clean; `uvx --version` works under both root and node user contexts.
3. **Phase 2**: Catalog entry for `klaviyo` with empty `tools[]` (alphabetical position: between `linear` and `sentry` once 0039 lands).
4. **Phase 3**: Run regenerator with `--fetch-from-mcp` (env var `PRIVATE_API_KEY=pk_...`); populates `tools[]` + snapshot. Note: regen does NOT invoke `authCheckTool`; real credential validation happens in Phase 6.
5. **Phase 4**: Brand icon (download from Klaviyo's brand assets or use a generic placeholder).
6. **Phase 5**: Quality gate.
7. **Phase 6**: Manual smoke (API bad+real key, UI install, Slack DM in `D0EXAMPLE000`).
8. **Phase 7**: Spec status `shipped`; commit on a feature branch + open PR (per CLAUDE.md, no direct commits to main).
