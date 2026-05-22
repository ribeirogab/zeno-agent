---
tags:
  - moc
---
# Rules — Map of Content

Zeno-specific safety and workflow rules.

Rules are added when a project-specific safety or workflow constraint is discovered.

## `severity: critical`

- [[../rules/sanitization|Committed content must be fictitious]] — nothing committed may contain real, private, or non-consented identifiers (forbidden list of 11 categories). Canonical placeholder mapping table is the single source of truth. Editorial enforcement, no CI, no hooks.
- [[../rules/integration-tokens-in-db-only|Integration tokens live in the DB, not in `.env`]] — external integration credentials (Sentry, Linear, Notion, GitHub MCP, Slack, etc.) only in `connector_secrets`. Makes the connector "disable" toggle a strong promise: no credential reachable by the agent via Bash. Spec 0058 unified Slack under the same rule (`kind='channel'` connector, DB-only).

## `severity: important`

- [[../rules/generated-files-location|Generated / temporary files go under `tmp/`]] — screenshots, scratch scripts, dumps, browser output. Never at repo root.
- [[../rules/ui-in-paper|UI lives in Paper]] — every rendered `.tsx` must have an artboard inside the matching route container in the `zeno-agent` Paper file.
- [[../rules/design-md-canonical|DESIGN.md is canonical for design tokens]] — on any token change, edit `/DESIGN.md` first; `packages/ui/src/styles/tokens.css` and consumers follow in the same commit.
- [[../rules/cli-only-mutations|CLI is the only mutation surface]] — all state changes (profiles, connectors, crons, skills, capabilities, credentials) go through `zeno` CLI. Dashboard is read-only. New write features must not be added to dashboard; existing migrate incrementally.

## `severity: advisory`

_(none yet)_
