---
tags:
  - moc
---
# Rules — Map of Content

Zeno-specific safety and workflow rules.

Rules are added when a project-specific safety or workflow constraint is discovered.

## `severity: critical`

- [[../rules/integration-tokens-in-db-only|Integration tokens vivem na DB, não no `.env`]] — credenciais de integração externa (Sentry, Linear, Notion, GitHub MCP, Slack, etc.) só em `connector_secrets`. Garante que a toggle "disable" do connector seja uma promessa forte: sem credencial alcançável pelo agent via Bash. Spec 0058 unificou Slack na mesma regra (`kind='channel'` connector, DB-only).

## `severity: important`

- [[../rules/generated-files-location|Generated / temporary files go under `tmp/`]] — screenshots, scratch scripts, dumps, browser output. Never at repo root.
- [[../rules/ui-in-paper|UI lives in Paper]] — every rendered `.tsx` must have an artboard inside the matching route container in the `zeno-agent` Paper file.
- [[../rules/design-md-canonical|DESIGN.md is canonical for design tokens]] — on any token change, edit `/DESIGN.md` first; `packages/ui/src/styles/tokens.css` and consumers follow in the same commit.

## `severity: advisory`

_(none yet)_
