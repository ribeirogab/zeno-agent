---
created: 2026-04-26
severity: critical
---
# Integration tokens vivem na DB, não no `.env`

## Regra

Tokens de integração externa (Sentry, Linear, Notion, GitHub MCP, Cloudflare, etc.) **devem viver exclusivamente** em `connector_secrets` na DB, gerenciados pelo dashboard via connector. **Nunca** em `profile/<name>/.env`.

## Por quê

O agent tem acesso a `Bash` por padrão (constitution: "Zero custom tools by default. Capabilities come from Claude Code's built-in toolset"). Tudo que entra em `process.env` do worker é visível pelo agent via `env | grep` + chamável via `curl`.

Isso significa: se você deixou um `INTEGRATION_TOKEN` no `.env` ao mesmo tempo em que tem o connector instalado, **o toggle "disable" do connector vira mentira**. Disable corta a via MCP, mas o agent encontra o token no env, abre Bash, e bate direto na REST API. Foi exatamente o que aconteceu com Sentry no profile fn em 2026-04-26 (logs preservados — agent rodou `curl https://us.sentry.io/api/0/projects/flavia-nasser/worker/issues/ -H "Authorization: Bearer $SENTRY_AUTH_TOKEN"` mesmo com o connector OFF).

A toggle precisa ser uma **promessa forte**: clicou disable → Zeno perde a credencial → Zeno não consegue acessar a integração. Pra essa promessa segurar, a credencial **só pode existir em um lugar que a toggle controla**: a DB do connector.

## O que continua válido em `.env`

- **Slack tokens** (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`) — usados pelo Channel adapter ANTES do agent ser invocado. Não dá pra mover sem refatorar Channel-as-Connector. Documentado em [`learnings/channel-vs-connector.md`](../learnings/channel-vs-connector.md) §Direção futura. **Exceção temporária**.
- **Claude OAuth token** (`CLAUDE_CODE_OAUTH_TOKEN`) — credencial de boot do AgentBackend. Não é tool surface do agent.
- **Dashboard auth** (`DASHBOARD_PASSWORD`, `DASHBOARD_SESSION_SECRET`) — credenciais da própria dashboard, não do agent.
- **Runtime config** (`LOG_LEVEL`, `WORKSPACE_DIR`, `PROFILE`).
- **GitHub PAT pessoal** (`GH_TOKEN`) — usado por `dev-workflow`/`code-review` skills via `gh` CLI. Esses skills NÃO têm connector equivalente hoje. Quando virar connector (`@modelcontextprotocol/server-github`), aplicar a regra.
- **GitHub App tokens** (`ACME_GH_TOKEN`, `QS_GH_TOKEN`, etc.) — gerados em runtime pelo bootstrap do `github_app` (não vêm do `.env`); ficam em `process.env` durante o turn. Idealmente migram pra connector também, mas isso é spec própria.

## O que muda quando essa regra é violada

1. Toggle "disable" do connector vira teatro
2. O operador não tem como remover acesso a uma integração sem editar arquivo + restart
3. Auditoria fica incompleta — `connector_invocations` registra invocação MCP, mas se o agent foi via Bash+curl, a chamada some do log do connector

## Como aplicar

Quando adicionar nova integração via connector:

1. Token entra na DB via dashboard (catalog install fluxo)
2. **Não copiar pro `.env`**
3. Se houver skill associada à integração: skill deve ensinar **só a via MCP**, sem documentar `curl`/REST direto, sem referenciar env vars de credencial
4. Se a integração já estava no `.env` legado, **remover do `.env`** depois de instalar o connector

## Referências

- [`learnings/channel-vs-connector.md`](../learnings/channel-vs-connector.md) — distinção entre Channel (input/output, vive em `.env` por enquanto) e Connector (tool surface, vive em DB)
- [`specs/0034-connectors-dashboard/spec.md`](../specs/0034-connectors-dashboard/spec.md) — onde a infraestrutura DB-first do connector secrets vive
- Constitution §Architecture principles — "Zero custom tools by default" (justifica por que Bash sempre disponível ao agent)
