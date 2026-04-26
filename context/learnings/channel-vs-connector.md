---
created: 2026-04-26
tags: [architecture, ports-and-adapters]
related:
  - "[[../specs/0032-connectors-backend/spec|0032-connectors-backend]]"
  - "[[../specs/0029-connectors-ui/spec|0029-connectors-ui]]"
  - "[[../constitution|constitution]]"
---
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

## Referências

- Constitution §Why Zeno exists e §Architecture principles.
- Spec 0032 §Database — `connectors` table é só pro Connector lado; Channel não vive em DB.
- `apps/worker/src/channels/` (Channel adapters) vs `packages/mcp-discover/` (Connector helpers).
