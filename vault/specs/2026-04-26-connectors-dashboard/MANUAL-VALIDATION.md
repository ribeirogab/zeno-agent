# Connectors — manual validation guide

Spec 0035 (automated e2e suite with 22 scenarios + the 4-clean-runs rule) was **deferred**. In its place, this guide describes the manual validation the operator runs to confirm everything works end-to-end. Covers the 7 user stories of spec 0029.

## Prerequisites

- `pnpm install` (lockfile already has `@zeno/mcp-discover` + `@modelcontextprotocol/sdk`)
- `pnpm run docker:build` ran successfully (new multi-stage build, ~30s on the second run)
- Profile with valid `.env` (Slack tokens, Claude OAuth, dashboard password)
- Slack Bot token (`xoxb-…`) with scopes: `channels:read`, `channels:history`, `chat:write`, `users:read`, `search:read` — for testing the catalog's Slack connector
- Slack Team ID (`T…` — grab it from the workspace URL)

## 1. Boot smoke

```bash
PROFILE=acme pnpm run docker:up
PROFILE=acme pnpm run docker:logs | grep -E "mcp_json_ignored|mcp_loaded|zeno_online|guardrails_enabled" | head -10
```

Expected in the logs:

```
event=mcp_json_ignored, servers=["linear","notion",...]   ← cutover working
event=mcp_loaded, count=1, servers=["playwright"]         ← only built-ins (expected on empty DB)
event=guardrails_enabled                                  ← pipeline with connector_permission policy
event=zeno_online                                         ← worker ready
```

`profile/mcp.json` remains intact on disk (cutover renames nothing — just ignores).

## 2. Login + verify API

```bash
# .env: DASHBOARD_PASSWORD=<value>
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"<DASHBOARD_PASSWORD>"}'

# Catalog (should return Slack):
curl -s -b /tmp/cookies.txt http://localhost:3001/api/connectors/catalog | jq '.[].name'
# → "Slack"

# List (empty until installed):
curl -s -b /tmp/cookies.txt http://localhost:3001/api/connectors
# → []
```

Note: host port 3001 → container port 3000 (docker-compose mapping).

## 3. UI smoke — sidebar + navigation

1. Open `http://localhost:3001/` → login screen → paste `DASHBOARD_PASSWORD`
2. Sidebar should have the **connectors** item between Sessions and Logs (plug icon)
3. ⌘N (or Cmd+N) opens command palette → Enter on the connectors item → navigates
4. `/connectors` shows:
   - Empty state with hero "Connect Zeno to external tools"
   - Catalog grid with 1 card: **Slack** with transport "stdio"

## 4. Install Slack via catalog

1. Click on the Slack card → opens the "Add Slack" modal
2. Fill in:
   - **Bot Token (xoxb-…)**: paste your xoxb-…
   - **Team ID (T…)**: paste your T…
3. Click **Test connection**:
   - Expected: ✓ green + "8 tools detected · 5 read · 3 write/delete · 0 interactive · ~500ms"
4. Click **Add**
5. Modal closes → toast "connector adicionado"
6. After ~1.5s the list refetches → **Slack** appears under **installed** with:
   - Status pill: **active** (green)
   - "8 tools · catalog"
   - last verified: "Xs ago"

## 5. Test from detail screen

1. Click on the Slack row → goes to `/connectors/<id>`
2. Header shows the Slack icon + name + transport pill (stdio) + status pill (active) + toggle (enabled) + ⋯
3. Connection section shows:
   - **command**: `npx -y @modelcontextprotocol/server-slack`
   - **environment**: 2 secrets (`SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`) with values `••••••••<last4>`
4. Click the eye on `SLACK_BOT_TOKEN` → reveal for 10s → re-masks
5. Click again within 60s → toast "aguarde alguns segundos pra revelar de novo (rate_limited)"
6. Click ⋯ → dropdown with **test connection** / **refresh tools** / **uninstall**
7. Click **test connection** → toast "Slack · 8 tools · ~500ms"

## 6. Tool permissions

Tool Permissions section:
- **Read-only tools (5)**: `slack_list_channels`, `slack_get_channel_history`, `slack_get_thread_replies`, `slack_get_users`, `slack_get_user_profile` — all with **always allow** active
- **Write/delete tools (3)**: `slack_post_message`, `slack_reply_to_thread`, `slack_add_reaction` — all with **ask** active

1. Click **always allow** on `slack_post_message` → optimistic update (instant); PATCH call on the backend
2. F5 → permission persisted
3. Bulk dropdown on Write/delete → **never** → all 3 turn red "never"

## 7. Agent uses the connector

In Slack, send to Zeno: `@zeno me lista os 5 últimos mensagens do canal #general`

Expected:
- Agent decides to call `mcp__slack__slack_list_channels` or `slack_get_channel_history`
- Pipeline: `connector_permission` policy returns `connector_allow` (read tool) → executes directly, without approval
- Response comes back with the list
- In the dashboard, the Slack Activity feed shows the invocation: `slack_get_channel_history · ✓ · ~800ms · view turn ↗`
- `last_verified_at` was updated

## 8. Toggle off → on

1. Detail screen → click the toggle (enabled → disabled)
2. Status pill changes to **off**
3. In Slack, send a new message to Zeno asking for Slack info → it replies "não tenho ferramentas do Slack"
4. Toggle on → next message works again (no restart)

## 9. Refresh tools

1. ⋯ → **refresh tools**
2. Confirm dialog: "This will reset tool permissions to defaults. Continue?"
3. OK → toast "tools atualizando…"
4. After ~2s, tool permissions section re-renders with defaults (write goes back to `ask`)

## 10. Uninstall

1. ⋯ → **uninstall**
2. Confirm dialog: "Uninstall Slack? This removes all secrets and tools."
3. OK → toast "connector removido"
4. Returns to `/connectors` → Slack disappeared from the list
5. Catalog shows Slack available to install again (no "installed" badge)
6. DB: secrets, tools, invocations cascade-deleted (verify via `pnpm run docker:sh && sqlite3 /workspace/zeno.db "SELECT count(*) FROM connector_secrets"` → 0)

## 11. Custom remote (post-MVP — experimental path)

Spec 0034 declares API endpoints + worker handler for custom remote/stdio, but the initial dashboard UI ships only the catalog flow. To test custom via direct API:

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3001/api/connectors/test \
  -H 'Content-Type: application/json' \
  -d '{"transport":"remote","url":"https://your-mcp/sse","secrets":[{"key":"__MCP_AUTHORIZATION__","value":"Bearer xxx"}]}'
```

If the test passes → POST `/api/connectors` with `source: 'custom'`. When the operator wants, open spec 0034b to port the "Add custom" modal from `apps/design`.

## Full validation = ✓

When steps 1–10 pass, the feature is validated for production (single-user). Automated suite (spec 0035) returns when multi-tenant or a larger redesign comes.
