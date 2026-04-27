---
tags:
  - moc
---
# Rules — Map of Content

Zeno-specific safety and workflow rules.

Rules are added when a project-specific safety or workflow constraint is discovered.

## `severity: critical`

- [[../rules/integration-tokens-in-db-only|Integration tokens vivem na DB, não no `.env`]] — credenciais de integração externa (Sentry, Linear, Notion, GitHub MCP, etc.) só em `connector_secrets`. Garante que a toggle "disable" do connector seja uma promessa forte: sem credencial alcançável pelo agent via Bash. Slack tokens são exceção temporária (Channel adapter).

## `severity: important`

- [[../rules/generated-files-location|Generated / temporary files go under `tmp/`]] — screenshots, scratch scripts, dumps, browser output. Never at repo root.
- [[../rules/ui-in-paper|UI lives in Paper]] — every rendered `.tsx` must have a Paper frame registered in `packages/ui/DESIGN.md`.

## `severity: advisory`

_(none yet)_
