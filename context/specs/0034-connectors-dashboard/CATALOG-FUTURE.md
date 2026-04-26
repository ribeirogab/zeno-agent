# Catalog — connectors a configurar em specs futuras

A spec 0034 entregou inicialmente só **Slack**, e numa segunda rodada (mesmo dia, 2026-04-26) o **Sentry** foi adicionado ao catálogo. Os 6 connectors abaixo seguem na fila — cada um vira uma spec curta de catálogo (entry no JSON + SVG real + smoke).

## Prioridade alta (já estavam no `mcp.json` antigo, uso real)

| Slug | Transport | Comando / URL | Secrets | Notas |
|---|---|---|---|---|
| `linear` | remote | `https://mcp.linear.app/sse` | `__MCP_AUTHORIZATION__` (Bearer) | Catálogo declara como remote SSE — o user.md do operador menciona o uso |
| `notion` | stdio | `npx -y @notionhq/notion-mcp-server` | `NOTION_API_KEY` | Stdio. Integração via página compartilhada |
| `granola` | stdio | `npx -y granola-mcp` | `GRANOLA_API_KEY` | Meeting notes |

## Prioridade média (populares, mas o operador não usa hoje)

| Slug | Transport | Comando / URL | Secrets | Notas |
|---|---|---|---|---|
| `github` | stdio | `npx -y @modelcontextprotocol/server-github` | `GITHUB_PERSONAL_ACCESS_TOKEN` | Já existe `GH_TOKEN` no env — talvez reusar. Atenção: complementa as skills `acme`/`dev-workflow`/`code-review` (que usam `gh` CLI), não substitui |
| `google-drive` | remote | `https://mcp.google.com/drive` (placeholder — confirmar) | OAuth Bearer | Mais complexo, OAuth dance fora de escopo (spec 0029 §Non-Goal 9) |
| `cloudflare` | remote | `https://mcp.cloudflare.com/sse` | `__MCP_AUTHORIZATION__` (CLOUDFLARE_API_TOKEN) | Workers, KV, DNS |

## Direção arquitetural pendente (decidida em 2026-04-26)

**Channels viram Connectors** com uma category extra. Hoje `Slack` aparece duas vezes no projeto: como Channel adapter (input/output, em `apps/worker/src/channels/`) e como Connector (tools, na DB). O operador quer unificar: toda integração externa = um Connector, alguns com category `channel` que indica "também aceita input do usuário". Detalhamento + plano de migração na learning [`channel-vs-connector.md`](../../learnings/channel-vs-connector.md) §Direção futura. Spec proposta: `00XX-channels-as-connectors`.

## Como adicionar (template de spec curta)

1. Branch `feat/catalog-<slug>`.
2. Editar `agent/connectors-catalog.json` adicionando a entry.
3. SVG monochromático em `agent/assets/connectors/<slug>.svg` (~ 24×24, currentColor).
4. Testar localmente: instalar via `/connectors`, rodar uma chamada via Slack, verificar Activity feed.
5. Commitar como `feat(catalog): add <name> connector`.

## Sobre os tools / categorias

Cada entry no catálogo declara `tools[]` com `category` (read/write/interactive) e `defaultPermission` (always_allow/ask/never). Para minimizar fricção:
- **read** → `always_allow` (operador raramente quer interagir com listagem)
- **write** → `ask` (toda criação/edição passa por aprovação na MVP)
- **destrutivo conhecido** (delete) → `ask`, nunca `never` (operador decide)

A heurística do `mcp-discover.ts` (`classifyToolCategory`) cobre custom MCPs sem catálogo. Catálogo curado serve pra dar defaults melhores em produtos populares.
