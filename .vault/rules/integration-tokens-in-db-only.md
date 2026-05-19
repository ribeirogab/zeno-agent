---
tags:
  - rule
  - safety
severity: critical
applies-to:
  - apps/
  - packages/
  - profiles/*/.env
  - agent/connectors-catalog.json
created: 2026-04-26
---
# Integration tokens live in the DB, not in `.env`

Tokens for external integrations (Sentry, Linear, Notion, GitHub MCP, Cloudflare, etc.) **must live exclusively** in `connector_secrets` in the DB, managed by the dashboard via the connector. **Never** in `profile/<name>/.env`.

## Why

The agent has access to `Bash` by default (constitution: "Zero custom tools by default. Capabilities come from Claude Code's built-in toolset"). Anything that lands in the worker's `process.env` is visible to the agent via `env | grep` and reachable via `curl`.

That means: if you leave an `INTEGRATION_TOKEN` in `.env` while the connector for the same integration is also installed, **the connector's "disable" toggle becomes a lie**. Disable cuts the MCP path, but the agent finds the token in the env, opens Bash, and hits the REST API directly. That is exactly what happened with Sentry in production on 2026-04-26 (logs preserved — the agent ran `curl https://us.sentry.io/api/0/projects/<org>/worker/issues/ -H "Authorization: Bearer $SENTRY_AUTH_TOKEN"` even with the connector OFF).

The toggle has to be a **strong promise**: click disable → Zeno loses the credential → Zeno cannot reach the integration. For that promise to hold, the credential **can only exist in a place the toggle controls**: the connector's DB row.

## How to Apply

When adding a new integration via a connector:

1. The token enters the DB through the dashboard (catalog install flow).
2. **Do not copy it to `.env`.**
3. If a skill is associated with the integration: the skill must teach **only the MCP path**, with no documented `curl`/REST shortcut and no references to credential env vars.
4. If the integration was previously in legacy `.env`, **remove it from `.env`** after the connector is installed.

## What still belongs in `.env`

- ~~**Claude OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN`) — boot credential for the AgentBackend. Not part of the agent's tool surface.~~ **Spec 0071** retired this exception — the Claude OAuth token now lives encrypted in `backend_credentials`, and the dashboard onboarding flow collects it. The runtime never sets `process.env.CLAUDE_CODE_OAUTH_TOKEN` (the SDK gets the token via per-call `env` opt + `~/.claude/.credentials.json`); a Bash-shell prompt-injection attack can no longer `env | grep CLAUDE`.
- **Dashboard auth** (`DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`) — credentials for the dashboard itself, not for the agent.
- **`ZENO_MASTER_KEY`** (spec 0071) — 32-byte master key for envelope encryption of every DB credential. It must itself be env-only because it has to bootstrap before any DB read.
- **Runtime config** (`LOG_LEVEL`, `WORKSPACE_DIR`, `PROFILE`).
- **Personal GitHub PAT** (`GH_TOKEN`) — used by the `dev-workflow` / `code-review` skills via the `gh` CLI. Those skills do NOT have a connector equivalent today. When that becomes a connector (`@modelcontextprotocol/server-github`), the rule applies.
- **GitHub App tokens** (per-installation, e.g. `<ORG>_GH_TOKEN`) — generated at runtime by the `github_app` bootstrap (they do not come from `.env`); they live in `process.env` only during the active turn. Ideally they migrate to a connector too, but that is a spec of its own.

## What breaks when this rule is violated

1. The connector's "disable" toggle becomes theatre.
2. The operator has no way to remove access to an integration without editing a file and restarting.
3. Auditing is incomplete — `connector_invocations` records the MCP call, but if the agent went via Bash + curl, the call disappears from the connector log.

## References

- [`learnings/channel-vs-connector.md`](../learnings/channel-vs-connector.md) — original Channel (transport) vs Connector (tool surface) distinction. Note: spec 0058 unified Slack as a `kind='channel'` connector in the same DB; future Telegram/WhatsApp adapters follow the same pattern.
- [`learnings/channel-as-connector-cutover.md`](../learnings/channel-as-connector-cutover.md) — playbook + observations from the migration that removed the "Slack exception" from this rule.
- [`specs/2026-04-29-slack-channel/spec-slack-channel.md`](../specs/2026-04-29-slack-channel/spec-slack-channel.md) — the code that made the migration possible.
- [`specs/2026-04-26-connectors-dashboard/spec-connectors-dashboard.md`](../specs/2026-04-26-connectors-dashboard/spec-connectors-dashboard.md) — where the DB-first connector secrets infrastructure lives.
- Constitution §Architecture principles — "Zero custom tools by default" (the reason Bash is always available to the agent).
