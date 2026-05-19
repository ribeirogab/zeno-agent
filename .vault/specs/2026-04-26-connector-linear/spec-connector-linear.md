---
status: shipped
feature: connector-linear
created: 2026-04-26
shipped: 2026-04-27
---
# Linear Connector — Spec

**Status:** Draft
**Scope:** Add Linear (issues / projects / cycles / docs) as a catalog connector, using Linear's official remote MCP at `https://mcp.linear.app/mcp` with Bearer-token authentication. Single catalog entry; no new infrastructure.

## Brainstorm Q&A

### Why Linear, why now?

Linear is the issue tracker for the operator's engineering team. Today there's no Zeno path to query/update Linear from Slack DMs — anything Linear-related requires a human in the Linear UI. Adding the connector unlocks read-paths immediately (status checks, sprint summaries, "what am I assigned to?") and write-paths once permissions allow.

### What does the live MCP expose?

Probed `https://mcp.linear.app/mcp` (2026-04-26): server name "Linear MCP" v1.0.0, capabilities `{tools: {listChanged: true}}`, **30+ tools** including (truncated list):

```
get/create/delete_attachment, list/save/delete_comment, list_cycles,
get/list/save_document, extract_images, get/list/save_issue,
list/get_issue_status, list/create_issue_label, list/get/save_project,
list_project_labels, list/get/save_milestone, list/get_team, list/get_user,
search_documentation
```

Naming pattern: `list_*` / `get_*` (read), `save_*` / `create_*` / `delete_*` (write). No `interactive_*`. The `mcp-discover/classifyToolCategory` prefix matcher handles all of these correctly: `read_/list_/get_/search_/find_` → read; `create_/update_/delete_/send_/post_/put_` → write; rest → interactive. **Note:** `save_*` is not in either prefix list, so `save_issue`, `save_project`, etc. fall through to **interactive**. That's a Linear-specific naming choice; we accept it.

### Auth model

Linear MCP supports two auth flows on the same endpoint:

1. **OAuth 2.1** with dynamic client registration (per `/.well-known/oauth-authorization-server`). End-user goes through Linear's consent screen. Best UX, but requires Zeno's OAuth dance feature (deferred — see spec 0036 §Coverage gaps and the `[Google Calendar discussion in chat]`).
2. **Bearer API key** via `Authorization: Bearer <lin_api_xxxx>` header — works against the same MCP endpoint. Probed and confirmed.

This spec uses **API key** because (a) OAuth dance isn't built yet and (b) Zeno is single-tenant today (one operator pastes their Linear API key once).

### Reusing existing transport infrastructure

Spec 0033 added `transport: 'remote'` with HTTP/SSE support, `toRemoteConfig()` in `mcp-discover/build-config.ts`, and the reserved secret key `__MCP_AUTHORIZATION__` (sets the `Authorization` header on remote requests). Linear is the **first real-world catalog use** of this code path — Sentry uses stdio.

User pastes: `Bearer lin_api_xxxxxxxx` (with the `Bearer ` prefix) into the `__MCP_AUTHORIZATION__` field. Help text spells this out. Future quality-of-life: dashboard could auto-prepend `Bearer ` if missing — out of scope for this spec.

### Auth check tool (Finding #2 plumbing)

Spec 0038 added `authCheckTool` to the catalog schema. For Linear, the cheapest no-args read tool is `list_teams`. Tested with the real API key: returns the workspace's teams (organization "acme", confirmed during token validation). Setting `authCheckTool: 'list_teams'` makes the dashboard's "Test connection" button real.

### What about the legacy `linear` entry that was in `profile/mcp.json`?

That file was removed entirely in commit `3510cef`. The legacy entry pointed at `npx -y mcp-linear` (community stdio package) and was never wired to the runtime since spec 0032's cutover. The new connector replaces it cleanly — different package (official remote vs community stdio), different transport, new code path.

## Context

Connectors infrastructure (specs 0029, 0032, 0033, 0034) supports remote HTTP transport with Authorization-header secret. Sentry shipped first as a stdio-based catalog connector (specs 0036, 0038). Linear is the first remote-transport catalog connector — it exercises code paths that were specced in 0033 but have not been validated against a real third-party MCP.

## Problem Statement

Add Linear as a single-click catalog install in `/connectors`, using the live `mcp.linear.app/mcp` MCP, with API-key auth and the Finding #2 auth-check plumbing. Confirm the remote-transport code path works end-to-end against a real third-party MCP.

## Non-Goals

1. **OAuth flow.** Deferred until generic OAuth dance lands; see chat thread on Google Calendar.
2. **Custom UI.** Standard catalog install modal works (`__MCP_AUTHORIZATION__` is just a string field).
3. **Test infrastructure changes.** Spec 0037 Phase A scaffolding is sufficient; no new fixtures.
4. **Tool subset selection.** The MCP exposes 30+ tools; we accept all of them, with default permissions per category.
5. **Linear-specific skill.** No new skill — the agent uses tools directly via name. A skill might be added later if discovery costs become real.
6. **Custom error messages.** Linear's auth errors should fall through `classifyError`'s existing regex (`unauthorized|forbidden|...`) — verified with a synthetic bad-token probe during smoke.

## Constraints

- **Single catalog entry** in `agent/connectors-catalog.json`. No new connector types/categories.
- **Use existing remote transport infrastructure.** No code changes to `mcp-discover` or `build-config.ts`.
- **`authCheckTool: 'list_teams'`** to enable Finding #2 auth check.
- **No new env vars in the runtime.** API key stored in `connector_secrets` only.
- **Bearer prefix is the user's responsibility.** Help text in the secret field instructs the user to include `Bearer ` (e.g., `Bearer lin_api_xxx`). Standard catalog install modal renders the field as a password input — the user pastes the full header value.
- **Smoke against the live MCP** is part of acceptance — same pattern as spec 0036's connector validation runbook. Acceptance includes BOTH the API-level smoke (`POST /api/connectors/catalog/linear/test` with bad + real key → `errorKind: 'auth'` vs `ok: true` with 30+ tools) AND a runtime Slack DM smoke (L3.2 — operator sends a Linear question in DM `D0EXAMPLE000`, agent calls a Linear read tool, replies with structured data). The Slack-DM step is what proves the runtime path (worker → mcp-discover → toRemoteConfig → live Linear MCP) end-to-end with the agent loop in scope, not just the test endpoint.
- **Regenerator script patch (in scope).** `apps/worker/scripts/regenerate-catalog-tool-snapshots.mjs` currently throws on the FIRST catalog entry whose env var is missing (lines 90–94). Today only Sentry is in the catalog and `SENTRY_ACCESS_TOKEN` is always set during regen. From this spec onward the catalog has multiple entries with different env-var conventions, and an implementer adding one connector at a time won't necessarily have every other connector's token available. Change the throw to a skip-with-warning so the script processes only the entries whose env vars are present, leaving the others' existing `tools[]` untouched. This patch is shared infrastructure that benefits specs 0040, 0041, 0042 — landing it here, in the first new-connector spec, is the right place. The behavior change is strictly less surprising: missing env now means "skip this entry" instead of "abort everything".

## User Stories / Scenarios

### Catalog install flow (UI)

| ID | Surface | Description |
|---|---|---|
| L1.1 | UI | Operator opens `/connectors`, sees Linear card in catalog with brand icon, "remote" pill, "30+ tools" hint |
| L1.2 | UI | Click → install modal with one secret field `__MCP_AUTHORIZATION__` labeled "Authorization (Bearer …)", help text guides user to paste `Bearer <Linear API key>` |
| L1.3 | UI | Test → spinner → ✓ green strip with "30+ tools detected · X read · Y write · Z interactive · ~1500ms" (numbers from live MCP) |
| L1.4 | UI | Add → connector lands `enabled` in installed section, redirects to detail page showing all live tools at catalog default permissions |

### API behavior (covered by existing test infrastructure from 0037)

| ID | Surface | Description |
|---|---|---|
| L2.1 | API | `POST /api/connectors/catalog/linear/test` with body `{secrets:[{key:'__MCP_AUTHORIZATION__', value:'Bearer <real key>'}]}` returns `{ok: true, tools: [...], durationMs: <int>}` |
| L2.2 | API | Same with bad key (`Bearer lin_api_INVALID`) returns `{ok: false, errorKind: 'auth', error: <Linear's error string>}` (auth-check tool `list_teams` fires after `tools/list` succeeds, hits Linear's auth wall) |
| L2.3 | API | `POST /api/connectors` with valid catalog payload → 204 → connector row appears with `status='enabled'`, all tools at category defaults |

### Runtime behavior (covered indirectly via existing 0037 P3/P4 + manual smoke)

| ID | Surface | Description |
|---|---|---|
| L3.1 | RT | After install, the `connector_permission` policy for `mcp__linear__*` tools resolves: `read`-prefix tools → `connector_allow`, `save_*` (interactive) → `auto_allow` for owner via classifier_gate, `create_*` / `delete_*` → `auto_allow` for owner; non-owner would route to approver |
| L3.2 | RT | Slack DM "what's the latest issue assigned to me in Linear?" — agent calls `mcp__linear__list_issues` with appropriate filters; returns issue list (smoke check) |

## Success Criteria

- Catalog entry committed with `authCheckTool: 'list_teams'`.
- Catalog regenerator script confirms tool list matches a snapshot taken at spec time. (Snapshot at install time can drift; this is a one-time check.)
- Manual smoke (against live profile after deploy):
  - L2.1 via `POST /api/connectors/catalog/linear/test` with the live key → `ok: true`, ≥25 tools.
  - L2.2 same with `Bearer lin_api_INVALID` → `ok: false, errorKind: 'auth'`.
  - L1.3 in browser → success strip in install modal.
  - L1.4 install → connector appears, can browse tool permissions, test from detail page → ✓.
  - L3.2 Slack DM: agent successfully calls a Linear read tool and replies with structured data.
- Spec passes 3 review rounds without findings.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| User forgets `Bearer ` prefix | Help text explicit; install modal's "Test" returns `errorKind: 'unknown'` (raw error from Linear) — operator sees the error and re-tests with prefix |
| Linear changes their auth-check tool name (`list_teams` removed/renamed) | Catalog regen script (spec 0038 F#1's `--fetch-from-mcp`) flags the missing tool; we update `authCheckTool` |
| Linear MCP's tool list changes after install (server says `capabilities.tools.listChanged: true`) | Refresh-tools button in detail page handles this; user clicks when needed |
| Bearer prefix idea: dashboard auto-prepends if missing | Out of scope this spec; tracked as polish for the install modal — would help every Bearer-style connector |
| Linear API rate limits during smoke | Single test calls per scenario, well under any reasonable limit |

## Open Questions

All resolved during drafting.

- **(Resolved) OAuth vs API key**: API key for now (simpler, works); OAuth dance deferred.
- **(Resolved) `save_*` tool category**: classifies as `interactive`. Default permission `ask` (which auto-allows for owner via classifier_gate). Acceptable.
- **(Resolved) Subset of tools**: all 30+. No filtering.
- **(Resolved) Naming for catalog id**: `linear`. Same as the legacy `profile/mcp.json` entry that was removed; no collision since that file is gone.

## Coverage gaps (acknowledged)

- **Non-owner runtime path** for write tools: `save_*` / `create_*` / `delete_*` route to classifier → approver for non-owners. Not exercised here (Zeno is single-tenant; the operator is owner). Same gap as 0036 G10.4.
- **OAuth flow** unobservable.
- **Live tool list churn** between spec time and install time. Mitigated by `refresh-tools` post-install.

## Findings during implementation

- **Finding #1: `classifyError` regex didn't match Linear's bad-token phrasing**. Smoke step Task 5.2 (bad token → `errorKind: 'auth'`) initially returned `errorKind: 'unknown'` because Linear emits `{"error":"invalid_token","error_description":"Invalid access token"}` and the existing regex from spec 0038 F#2 matched `invalid (token|credentials)` with no words between, but Linear says `Invalid access token` (word `access` in the middle). **Fix landed in this spec**: broadened the regex in `packages/mcp-discover/src/discover.ts:classifyError` to also match `invalid (token|credentials|access token|api key)` and the OAuth standard error code `invalid_token`. Documented in commit message; benefits future connectors that emit similar phrasings.

## Review procedure

3 consecutive review rounds without findings, same protocol as 0036/0037/0038. R1 independent reviewer cold, R2 cross-check vs catalog/discoverTools/transport infra, R3 fresh independent.

## Implementation order

1. **Phase 1**: Add `linear` entry to `agent/connectors-catalog.json` with `transport: 'remote'`, `transportConfig: { url: 'https://mcp.linear.app/mcp' }`, `secrets: [__MCP_AUTHORIZATION__]`, `authCheckTool: 'list_teams'`, `tools: <empty initially>`.
2. **Phase 2**: Run regenerator with `--fetch-from-mcp` (spec 0038 script) using the captured Linear API key → populates `tools[]` with the live 30+ tools. **Updates the snapshot file at the same time** (spec 0037 P1.5 stays green).
3. **Phase 3**: Brand icon: download Linear's official SVG (already available at `https://static.linear.app/integrations/mcp/icon.svg` per the MCP's `serverInfo.icons`) → save as `agent/assets/connectors/linear.svg`.
4. **Phase 4**: `pnpm run quality-gate` green.
5. **Phase 5**: Manual smoke (L2.1 / L2.2 via curl; L1.3 / L1.4 via browser; L3.2 via Slack DM). Capture screenshots/SQL evidence.
6. **Phase 6**: Spec status `shipped`. Optional learning note if anything non-obvious surfaced.

Estimated effort: half a day. No new code; just catalog + icon + smoke.
