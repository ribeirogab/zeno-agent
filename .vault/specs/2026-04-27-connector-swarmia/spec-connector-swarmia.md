---
status: shipped
feature: connector-swarmia
created: 2026-04-27
shipped: 2026-04-27
---
# Swarmia Connector — Spec

**Status:** Draft
**Scope:** Add Swarmia (engineering metrics — DORA, throughput, working agreements) as a catalog connector. Uses the **community** `mattjegan/swarmia-mcp` (Python, stdio, MIT, single maintainer) installed via `uvx --from git+...`. Migrates to Swarmia's official MCP (announced 2026-04-21) when documentation is publicly available. Depends on spec 0040's Dockerfile change (adds `uv`).

## Brainstorm Q&A

### Why Swarmia, why now?

Engineering visibility — DORA metrics (deploy frequency, lead time, change-failure rate, MTTR), team throughput, code review metrics. Live token validation already pulled real data: 4.4 deploys/day, 31 deploys in the last 7 days for the operator's org. Adding the connector lets ops questions like "how's our lead time this week?" land in Slack.

### Official vs community MCP

Swarmia announced an official MCP on 2026-04-21 (see chat-thread research). Their docs at the time of this spec are incomplete — no public package URL or install instructions are documented. The community `mattjegan/swarmia-mcp` is the only currently-installable MCP:

- Python, stdio transport.
- Wraps the Swarmia Export API (the same `/api/v0/...` endpoints we tested during token validation).
- Read-only (no write methods on Swarmia's Export API).
- Single maintainer; MIT license; modest commit history.

**Decision: use the community MCP for now**, with a documented commitment to migrate to the official one when it ships docs. The catalog entry is a one-line change (different `transportConfig.args`).

### Auth model

Bearer token via env var `SWARMIA_API_TOKEN`. Token comes from Swarmia's Profile → API tokens. We tested the live token successfully against `app.swarmia.com/api/v0/reports/dora`.

### Auth check tool

The community MCP exposes a few tools (per its README: `dora_metrics`, `team_metrics`, `repository_metrics`). The cheapest no-args read tool is `dora_metrics` (returns the same DORA endpoint we tested with the token). Setting `authCheckTool: 'dora_metrics'`. Bad token → Swarmia returns 401 → `classifyError` (broadened in spec 0038) buckets as `auth`.

### Why uvx-from-git

`mattjegan/swarmia-mcp` doesn't publish to PyPI (yet). `uvx` supports installing from a git URL on the fly:

```
uvx --from git+https://github.com/mattjegan/swarmia-mcp swarmia-mcp
```

This works because spec 0040 added `uv` to the Dockerfile. Swarmia is the second beneficiary of that toolchain.

### Git pin vs floating

Pinning to a commit SHA avoids surprise breaks. Floating to `main` keeps us current. Going **with `main`** initially (community project, low traffic, the `--from` URL doesn't break easily). If churn becomes a problem, we pin to a commit.

## Context

Klaviyo (spec 0040) just landed `uv` in the Dockerfile and proved that Python-MCP-via-uvx works with the existing stdio transport infra. Swarmia is a clean second consumer of that toolchain.

## Problem Statement

Add Swarmia as a catalog connector. Operator pastes API token, dashboard tests, install completes, agent can pull DORA / throughput metrics on demand.

## Non-Goals

1. **Building a custom Swarmia MCP wrapper** — we use mattjegan's. If it dies or breaks, we either pin to a working commit or migrate to Swarmia's official MCP.
2. **Migrating to the official MCP this spec.** Tracked separately.
3. **Swarmia-specific skill.** Future polish.
4. **Write operations.** Swarmia Export API is read-only by nature; no write tools exist.

## Constraints

- **One catalog entry**, transport `stdio`, command `uvx`, args `["--from", "git+https://github.com/mattjegan/swarmia-mcp", "swarmia-mcp"]`.
- **Hard prerequisite: spec 0040** must have shipped its Dockerfile change adding `uv` to the `base` stage. Phase 1 of this spec includes a verification gate (`docker run --rm zeno-agent:dev uvx --version` must succeed) before any other work.
- **Hard prerequisite: spec 0039's regenerator patch** (throw → warn+continue on missing env). Phase 3 (`--fetch-from-mcp`) requires this patch; without it, running with only `SWARMIA_API_TOKEN` set will abort on the first non-Swarmia entry. The Phase 1 gate verifies this too.
- **Execution context for Phase 3**: the regenerator runs **on the host**, not inside the container — `agent/connectors-catalog.json` is bind-mounted read-only, and `apps/` is not mounted. The host therefore also needs `uv` installed (separate from the in-image install of spec 0040). Task 3.0 covers the host install (or a reuse of an existing host `uv`).
- **`authCheckTool: 'dora_metrics'`**.
- **API token stored as `connector_secrets`** with key `SWARMIA_API_TOKEN` (mattjegan's MCP reads this exact var).
- **No new code** in worker / api / dashboard.

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| S1.1 | UI | `/connectors` shows Swarmia card |
| S1.2 | UI | Install modal: one secret field "API Token", help text links to Swarmia profile |
| S1.3 | API | Catalog test bad token → `{ok: false, errorKind: 'auth'}` |
| S1.4 | API | Catalog test real token → `{ok: true, tools: [<3-5>]}` (mattjegan exposes a small set) |
| S1.5 | UI | Install completes → enabled |
| S1.6 | RT | Slack DM: "[smoke swarmia] qual nossa lead time da última semana?" → agent calls `mcp__swarmia__dora_metrics`, returns numbers |

## Success Criteria

- Catalog entry committed.
- Tool list populated (regenerator).
- Quality gate green.
- Manual smoke green (API + UI + Slack).
- Spec passes 3 review rounds.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `mattjegan/swarmia-mcp` repo deleted or moved | Pin to a specific commit SHA in `args` |
| Silent behavior change from floating `main` | `uvx` resolves the git URL to a SHA at first install and caches the result inside the running container; churn only hits on cache miss or container rebuild. If a rebuild surfaces a regression, pin to the last-known-good SHA. |
| Maintainer breaks the MCP | Refresh-tools button + spec for migration to official MCP |
| Swarmia rate-limits during install regen | Single-call probe; well under any reasonable limit |
| `uvx --from git+...` is slow (clone + install on every spawn) | uvx caches; first call ~10s, subsequent ~1s. Acceptable for the install-modal Test step (timeout 30s) |
| Official Swarmia MCP ships and we miss the migration | Tracked as a follow-up spec — non-blocking |

## Open Questions

- **(Open, separate spec) Migrate to official Swarmia MCP** when their docs ship. Watch their changelog.

## Coverage gaps

- Same as Linear / Klaviyo: non-owner runtime path unobservable.
- Swarmia's MCP is community-maintained; less stability guarantee than Sentry/Linear. Documented.

## Findings during implementation

- **Finding #1: Pivoted upstream variant**. Original `mattjegan/swarmia-mcp` is a single Python script with no `pyproject.toml`, so `uvx --from git+...` can't install it. Switched to `smattila/mcp-swarmia` which has `pyproject.toml`. The catalog command becomes `uvx --from git+https://github.com/smattila/mcp-swarmia python -m server` (uvx installs the package then invokes the `server` module as `__main__`). Tools are renamed: `dora_metrics` → `get_dora_metrics`, `team_metrics` → (n/a; smattila exposes pull request, DORA, investment, capex, fte). 6 tools total, all with `get_` prefix → classify as `read`. Updated `authCheckTool` to `get_dora_metrics`.

- **Finding #2: smattila MCP returns auth errors with `isError: false`**. The MCP wraps HTTP failures in success-shaped responses with the error text in `content`. `discoverTools`'s auth-check probe only fired on `isError: true`. Fix landed in this spec: when `isError` is unset/false but `content` text matches the auth regex, classify as `auth`. Benefits any MCP that returns errors-as-content (community MCPs frequently do).

- **Finding #3: `authCheckArgs` plumbing**. Klaviyo (spec 0040) had similar issue and led to `authCheckArgs` field in `catalogEntrySchema`. Swarmia's `get_dora_metrics` works with empty args, so doesn't use `authCheckArgs`.

## Review procedure

3 consecutive review rounds without findings.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews.
2. **Phase 1**: Verify hard prereqs:
   - Spec 0040 has shipped: `uvx --version` works inside the running image.
   - Spec 0039's regenerator patch is present (`grep "skip.*: missing env var"` on the script matches a `console.warn(...)` line).
3. **Phase 2**: Catalog entry for `swarmia` with empty `tools[]`.
4. **Phase 3**: Run regenerator (env `SWARMIA_API_TOKEN=...`); populates `tools[]` + snapshot. Note: regen does NOT call `authCheckTool`; real validation happens in Phase 6.
5. **Phase 4**: Brand icon.
6. **Phase 5**: Quality gate.
7. **Phase 6**: Manual smoke (API bad+real key, UI install, Slack DM in `D0EXAMPLE000`).
8. **Phase 7**: Spec status `shipped`; commit on a feature branch + open PR (per CLAUDE.md).
