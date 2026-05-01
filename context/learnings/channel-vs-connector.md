---
created: 2026-04-26
updated: 2026-04-29
tags: [architecture, ports-and-adapters]
related:
  - "[[../specs/2026-04-26-connectors-backend/spec|2026-04-26-connectors-backend]]"
  - "[[../specs/2026-04-25-connectors-ui/spec|2026-04-25-connectors-ui]]"
  - "[[../specs/2026-04-29-slack-channel/spec|2026-04-29-slack-channel]]"
  - "[[../specs/2026-04-29-fn-cutover-channel/spec|2026-04-29-fn-cutover-channel]]"
  - "[[2026-04-29-channel-as-connector-cutover|cutover playbook]]"
  - "[[../constitution|constitution]]"
---

> **2026-04-29 update:** spec 0058 unified Slack into the `connectors` table with `kind='channel'`. The "Slack tokens vivem em `.env`" sections below are HISTORICAL — Slack tokens now live in DB `connector_secrets` like every other integration. The Channel/Connector conceptual distinction (transport-the-agent-runs-inside vs tool-the-agent-calls) still holds; only the storage divergence is gone. See [[2026-04-29-channel-as-connector-cutover|cutover playbook]] for the migration narrative + observations.

# Channel vs Connector — duas integrações externas, dois papéis

## The shape

Toda integração externa do Zeno cai em **uma de duas categorias** (ou nas duas, como o Slack):

### Channel — input/output adapter

Como o usuário fala com o Zeno e como o Zeno responde. Implementa a interface `Channel` em `apps/worker/src/channels/<name>/adapter.ts`. Responsabilidades:

- Receber mensagens (mentions, DMs) e entregar pro `AgentCore`
- Postar respostas
- Reagir / atualizar mensagens
- Solicitar aprovações (via reactions, em modos worker)

**Slack** é o único Channel hoje. Telegram, WhatsApp, email, Discord — todos viram Channels novos no futuro, sem alterar o core (constitution §Architecture: "Channels and backends are plugs").

Tokens vivem em `profile/<name>/.env`. Configuração de boot, não de runtime.

### Connector — MCP server callable as a tool

Capacidade externa que o **agente** chama em runtime. Implementa o MCP protocol (stdio ou HTTP/SSE). Responsabilidades:

- Expor tools (`tools/list`)
- Executar tool calls (`tools/call`)

Connectors são gerenciados pela dashboard a partir da spec 0034 — DB-first, hot-reload sem restart, com permissões 3-state por tool. Tokens vivem na tabela `connector_secrets`. Configuração de runtime, mutável.

## Quando uma plataforma é os dois

**Slack é o caso paradigmático**: mesmo bot, mesmo workspace, mas dois papéis distintos.

| Aspecto | Slack como Channel | Slack como Connector |
|---|---|---|
| Quem aciona | usuário (mentiona @zeno) | agente (decide chamar tool) |
| Direção | recebe + responde | chama tool, pega resposta |
| Tokens | `.env` (boot) | `connector_secrets` (DB, gerenciado pela UI) |
| Reload | restart do worker | próximo agent turn |
| Pode existir sem o outro? | sim (Channel sem Connector = bot que escuta mas não tem tool surface) | sim (Connector sem Channel = agente posta em outro workspace que não escuta nada) |

Outros exemplos potenciais (futuro):

- **Telegram**: quase certo que vira Channel (input). Connector Telegram só se o agente precisar chamar coisas em outras conversas além de responder no thread.
- **GitHub**: Channel não faz sentido (Zeno não é um bot do GitHub). Mas Connector sim — Linear/PRs/issues são tool surface.
- **Email**: pode virar Channel (responde DMs por email), pode virar Connector (agente envia email para terceiros).

## Princípio

> **Toda integração externa do Zeno se encaixa em Channel, Connector, ou ambos. Pense primeiro em qual papel a integração ocupa antes de implementar.**

Channel = input ↔ output do operador. Connector = tool surface do agente. Confundir os dois leva a APIs estranhas (ex.: tentar postar mensagem como tool quando o Channel já tem `reply()`).

## O que isso muda na prática

- **Adicionar uma plataforma de chat nova** (Telegram, etc.): comece pelo Channel. Connector vem se houver razão concreta.
- **Adicionar uma SaaS de produtividade** (Linear, Notion, Granola): só Connector. Não tem input do usuário ali.
- **Slack-shaped** plataformas (Discord futuramente): provavelmente vai ser ambos.

## Direção futura — unificação (decisão do operador, 2026-04-26)

O operador quer **fundir Channel e Connector** num único conceito. A ideia: toda integração externa é um Connector; alguns Connectors têm uma "category" extra que diz se também aceitam input do usuário (tipo `channel`). Isso permite gerenciar Slack, Telegram, WhatsApp, email — tudo pelo mesmo dashboard, com a mesma UX de install/secrets/tools.

Por que ainda não foi feito:
- A interface `Channel` hoje é richer que MCP (postar mensagem, reagir, atualizar mensagem, esperar reaction como aprovação). Mapear isso pra MCP tools é viável mas não é trivial — algumas dessas operações precisam acontecer fora de uma turn do agente (ex.: aprovação durante uma turn em andamento).
- O input loop (Slack Socket Mode → AgentCore) tem uma série de hooks (slack_context preamble, correlation id, thread state) que estão hardcoded ao Channel hoje.
- Os tokens do Slack hoje carregam dois papéis: app-level (Socket Mode WebSocket) e bot (REST API). Connector só precisa do bot. O dashboard precisaria aceitar os dois.

Quando puxar:
- Spec proposta: `00XX-channels-as-connectors`. Adiciona uma coluna `category: 'channel' | 'tool'` (ou `is_channel: bool`) na tabela `connectors`. UI ganha um filtro/agrupamento "Channels" vs "Tools".
- Bonus: cada Channel-connector também ganha as tools do MCP server correspondente (Slack post_message etc.) sem ser configurado duas vezes.
- Pré-requisito: extrair a interface `Channel` pra um shape que possa ser instanciada a partir de um connector row + secrets.

Deixar nesta nota: o operador disse "não precisa ser feito agora, deixe anotado em algum lugar pra gente puxar logo em seguida".

## Referências

- Constitution §Why Zeno exists e §Architecture principles.
- Spec 0032 §Database — `connectors` table é só pro Connector lado; Channel não vive em DB.
- `apps/worker/src/channels/` (Channel adapters) vs `packages/mcp-discover/` (Connector helpers).
