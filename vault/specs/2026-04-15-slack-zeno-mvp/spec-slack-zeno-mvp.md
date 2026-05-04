---
status: shipped
feature: slack-zeno-mvp
created: 2026-04-15
shipped: 2026-04-15
---
# Zeno MVP — Agente pessoal via Slack que consulta GitHub

**Status:** Shipped (2026-04-15)
**Scope:** Entregar um processo Docker que, ao receber uma menção ou DM no Slack do Operator, usa Claude Code (via OAuth do plano, não API key) pra responder perguntas sobre repos do GitHub — começando por "quais repos tem na org X?".

**Validação:** S1 (happy path: `@zeno-agent quais repos tem na octocat?` → resposta em PT-BR com 23 repos) validado fim-a-fim em smoke real no Slack + claude direto no container. Cenários S2 (DM), S3 (org sem acesso) e S5 (auth expirado) cobertos por código (mesmo path do S1 + unit tests do `classifyError`); validação manual no Slack opcional.

## Context

Este repositório (hoje `zeno-agent`, será renomeado pra `zeno-agent` como primeira tarefa da implementação) é o workspace de um agente pessoal do operador. O objetivo final é ter um agente conversacional acessível via canais de mensagem (Slack pra começar, potencialmente Discord/Telegram/WhatsApp depois) que consiga executar qualquer tarefa técnica que o operador peça — listar repos, clonar código, editar, abrir PRs, analisar bases, etc.

Este spec cobre **a primeira entrega útil**: a infraestrutura mínima pra provar que o loop Slack ↔ Claude Code ↔ GitHub funciona, usando um único caso concreto como vetor de validação (listar repos de uma org). Toda a arquitetura foi desenhada pra que as iterações seguintes (outras ferramentas, outros canais, outros modelos, sessões persistentes, etc.) sejam aditivas — sem reescrever o core.

Decisões fundantes tomadas no brainstorming (ver histórico da conversa, 2026-04-15):

- **Onde roda:** processo Node/TS em container Docker, na máquina local do Operator. Migração futura pra nuvem prevista mas não necessária agora.
- **Como o LLM é acessado:** `@anthropic-ai/claude-agent-sdk` chamado in-process. Autenticação via `CLAUDE_CODE_OAUTH_TOKEN` env var, gerada uma vez pelo comando `claude setup-token` — **não usa `ANTHROPIC_API_KEY`**. Custo previsível pelo plano, alinhado ao modelo "agente pessoal". O binário `claude` fica no container só pra rodar `setup-token` quando a OAuth expirar. Decisão validada durante Task 0 discovery; detalhes em `context/learnings/claude-agent-sdk-typescript.md` e `claude-code-oauth-token.md`.
- **Arquitetura:** ports & adapters. Duas abstrações plugáveis — `Channel` (fontes de mensagem) e `AgentBackend` (modelos/CLIs como Claude Code, Codex, Gemini). MVP implementa uma de cada: `SlackChannel` + `ClaudeCodeBackend`.
- **Ferramentas do agente:** toolset built-in do Claude Code (Bash, Read, Write, Edit, Grep, Glob). **Nenhuma ferramenta custom é escrita no MVP**. Tarefas de GitHub são resolvidas pelo Claude chamando `gh` CLI via Bash.
- **GitHub auth:** Personal Access Token (PAT classic) com escopo `repo` + `read:org`. GitHub App fica pra próxima iteração.
- **Slack integration:** Socket Mode (websocket outbound) — sem necessidade de URL pública ou tunnel.
- **Idioma das respostas:** PT-BR por padrão.

## Problem Statement

Hoje, pra consultar informações sobre repos, orgs e código, o o operador precisa alternar entre Slack (onde conversa), terminal (onde roda `gh`), e GitHub UI (onde explora). Pra tarefas de dev, também passa por IDE/Claude Code local.

O MVP resolve **um pedaço disso**: permitir que perguntas simples sobre repos — ex: "quais repos tem na octocat?" — sejam respondidas sem sair do Slack, em linguagem natural, com contexto correto. É um corte fino da visão maior ("qualquer tarefa técnica via Slack"), escolhido porque:

- Exercita o loop completo (Slack → Agent → Claude → shell → resposta).
- É de baixo risco (read-only, operação trivial no GitHub).
- Valida a escolha de Claude Code via OAuth como backend antes de investir em fluxos mais complexos.
- A generalização pra outras perguntas ("quais issues abertas têm em X?", "lista PRs do último mês") é quase gratuita — o mesmo código funciona, só muda o comando que o Claude escolhe rodar.

## Non-Goals

Explicitamente **fora do MVP** (não serão implementados nesta entrega):

1. **Allowlist de usuários no Slack.** O workspace do operador é solo; ninguém mais fala com o bot. Quando o workspace deixar de ser solo, allowlist vira bloqueador e entra imediatamente.
2. **GitHub App.** Fica como **primeira iteração pós-MVP**, conforme confirmado no brainstorm. PAT cobre 100% do MVP.
3. **Sessões persistentes / thread como contexto.** Cada mensagem é stateless — Zeno não lembra de turnos anteriores. Resposta na thread não continua conversa.
4. **File tools customizadas** (`read_file`, `write_file`, `edit_file` com diff). Só `Bash` e os outros built-ins do Claude Code são habilitados; file tools viram escopo quando o agente de dev (clonar/editar/PR) for implementado.
5. **Outros canais** (Discord, Telegram, WhatsApp). A interface `Channel` existe, mas só `SlackChannel` é implementada.
6. **Outros backends** (Codex, Gemini). A interface `AgentBackend` existe, mas só `ClaudeCodeBackend`.
7. **Aprovação humana de operações destrutivas via Slack.** No MVP o Zeno não faz operações destrutivas; o system prompt orienta pedir confirmação antes de executar comandos arriscados, mas a UX de aprovação via Slack (botões, reactions) fica pra depois.
8. **Feedback incremental / streaming de progresso no Slack.** Resposta final é uma mensagem só, sem "editando arquivo X..." intermediário.
9. **Múltiplos Slack workspaces.** Um workspace (o pessoal do operador). Escalar pra múltiplos é trabalho de adapter, não de core.
10. **CI/CD, métricas, dashboards, alerts.** Logs JSON em stdout (`docker compose logs`) são suficientes pra MVP.
11. **Multi-usuário do Claude Code.** Sessão OAuth é do operador; qualquer mensagem no Slack consome do plano dele.
12. **Testes E2E contra Slack/Claude reais.** Só unit tests pontuais. Validação final é smoke test manual.

## Constraints

**Técnicas:**

- Precisa rodar em Docker desde o início (portabilidade pra cloud no futuro).
- Precisa usar Claude Agent SDK com OAuth, não API key — implica instalar `claude` CLI no container (pra gerar token via `setup-token`) e manter `CLAUDE_CODE_OAUTH_TOKEN` no `.env`.
- Primeiro `setup-token` é manual e interativo (abre URL no browser do host, copia token pro `.env`). Precisa estar documentado.
- Socket Mode do Slack requer um **App-level token** (`xapp-...`) além do bot token — os dois vão em `.env`.
- PAT do GitHub deve ter escopo mínimo `repo` + `read:org`.
- Stack: TypeScript + Node 22 LTS (confirmar LTS vigente no Task 0 da implementação).
- Container deve ter `gh`, `git`, `node`, `claude` instalados. Nada além do necessário.

**Organizacionais:**

- O operador confirmou que usar Claude Code pessoal em repos do trabalho é tranquilo (política da empresa permite).
- Nenhum compromisso de SLA — é ferramenta pessoal, "quebrou? arrumo de noite".

**De arquitetura (para evitar débito técnico imediato):**

- `Agent Core` **não pode importar** nada específico de Slack, Discord, Claude Code, etc. Só conhece os tipos de `channels/types.ts` e `agent/types.ts`.
- Tools são built-ins do Claude Code; pasta `tools/` **não existe** no MVP. Adicionar uma tool custom no futuro será justificado por necessidade concreta.
- Segredos (tokens) nunca commitados. `.env` no `.gitignore`, `.env.example` versionado.

**De comunicação com o usuário:**

- Primeira linguagem de resposta: PT-BR.
- Tom: direto, humor sutil ok (Resident Evil é tema de graça). Respostas curtas.
- Formato: Slack markdown (blocos de código, negrito). Sem tabelas enormes.

## User Stories / Scenarios

**S1 — Caminho feliz (o vetor de validação):**

1. O operador menciona no canal `#agents`: `@zeno-agent quais repos tem na octocat?`
2. Zeno reage na mensagem original com `:eyes:` dentro de 2s (ack).
3. Zeno chama Claude Code, que chama `gh repo list octocat --json name,description --limit 100` via Bash.
4. Zeno posta resposta na mesma thread em PT-BR, listando repos com descrição resumida.
5. Zeno troca a reação pra `:white_check_mark:`.

**S2 — Usuário fala em DM:**

Mesma coisa que S1, mas a mensagem inicial é uma DM direta pro Zeno (sem `@`). `threadId` é `null`. Resposta vai na própria DM.

**S3 — Pergunta sobre org sem acesso:**

1. Operator: `@zeno-agent quais repos tem na anthropics?`
2. Claude chama `gh repo list anthropics`, que retorna erro de permissão.
3. Claude lê o stderr, traduz: "não tenho acesso à org `anthropics` — seu PAT precisaria ser membro ou ter acesso a ela."
4. Zeno posta essa explicação na thread. Não vaza conteúdo do erro bruto.

**S4 — Pergunta genérica / fora do escopo de repos:**

1. Operator: `@zeno-agent qual a capital do Peru?`
2. Claude responde naturalmente ("Lima"), sem invocar tool.
3. Zeno posta resposta. Não há erro, apenas uso do LLM sem Bash.

**S5 — Sessão Claude expirada:**

1. Operator: `@zeno-agent oi`
2. `ClaudeCodeBackend.query()` retorna erro indicando auth falhou.
3. Zeno posta: "meu token Claude expirou. Roda `docker compose run --rm zeno-agent claude setup-token`, cola o token novo em `.env` e `docker compose up -d --force-recreate`."
4. Logs registram `warn` com timestamp e correlationId.

**S6 — Boot do container:**

1. O operador configura `.env` (incluindo `CLAUDE_CODE_OAUTH_TOKEN` gerado por `claude setup-token`) e roda `docker compose up -d`.
2. Zeno conecta no Slack via Socket Mode (log `slack_connected`).
3. Zeno valida `gh auth status` (log `github_auth_ok`).
4. Zeno confirma `claude --version` (log `claude_cli_ok`) + presença do token (log `claude_oauth_token_present`).
5. Log final `zeno_online`. Container fica em `up`, pronto pra receber eventos.

## Success Criteria

Esta entrega está **pronta** quando todos os seguintes são observáveis:

1. Repositório foi renomeado de `zeno-agent` pra `zeno-agent`: `origin` já aponta pra `octocat/zeno-agent` (feito), todas as referências textuais em `README`, `AGENTS.md`, `context/constitution.md`, system prompt, package.json foram atualizadas. Nenhuma string "Zeno" ou "zeno-agent" resta no código/docs do projeto (exceto histórico git).
2. `docker compose up --build` sobe o container sem erros em máquina limpa (macOS + Docker Desktop).
3. `docker compose run --rm zeno-agent claude setup-token` conclui OAuth com sucesso e o token gerado, quando colado em `.env` como `CLAUDE_CODE_OAUTH_TOKEN`, é consumido pelo SDK em subsequentes `docker compose up`.
4. Após subir, o cenário S1 (caminho feliz) funciona fim-a-fim em menos de 30 segundos: menção → reação `:eyes:` → resposta correta em PT-BR na thread → reação `:white_check_mark:`.
5. Cenário S2 (DM) funciona — resposta na DM, sem thread.
6. Cenário S3 (org sem acesso) produz resposta explicativa em PT-BR, não expõe stderr bruto nem token.
7. Cenário S5 (sessão expirada) é detectado e comunicado claramente.
8. Logs estruturados JSON aparecem em `docker compose logs -f zeno-agent`, com os eventos-chave listados na Seção 4 do brainstorm (`message_received`, `backend_started`, `backend_tool_call`, `backend_completed`, `response_sent`), todos carregando um `correlationId` consistente por interação.
9. `npm run test` passa (tests unitários de `SlackAdapter.normalize`, `ClaudeCodeBackend` com spawn mockado, e `config` validation).
10. `.env.example` versionado cobre todas as variáveis necessárias (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`), sem placeholders de `ANTHROPIC_API_KEY`.
11. `README.md` documenta o setup completo: dependências, `setup-token`, `.env`, smoke test checklist.
12. `context/constitution.md` atualizada refletindo as decisões fundantes (nome Zeno, stack definida, Claude Code via OAuth).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Meu conhecimento (Claude) é de maio/2025 e estamos em abril/2026 — APIs de Claude Code, Agent SDK e Bolt podem ter mudado de forma relevante. | **Task 0 do plano de implementação é discovery obrigatório** — verificar docs oficiais atuais de cada dependência antes de codar. Se algo mudou materialmente, voltar pra spec e ajustar. Formalizar esse passo como convenção do projeto após o MVP entregar. |
| ~~Claude Code headless via subprocess pode ter output complexo difícil de parsear~~ | **Resolvido durante Task 0:** usamos `@anthropic-ai/claude-agent-sdk` in-process (`query()` async generator), não subprocess. Ver `context/learnings/claude-agent-sdk-typescript.md`. |
| Token OAuth do Claude Code expira sem aviso prévio claro. | Detectar erro de auth vindo do SDK no `ClaudeCodeBackend`, classificar como `kind: "auth_expired"`, traduzir em mensagem no Slack com instruções de `setup-token` (S5). |
| `gh` CLI autenticado por `GH_TOKEN` via env var pode se comportar diferente de `gh auth login` interativo em algumas edge cases (ex: 2FA, SSO orgs). | Documentar no README: PAT precisa ter SSO autorizado pras orgs que o operador quer consultar. Smoke test cobre isso. |
| Primeiro `setup-token` via Docker exige copiar URL do terminal pro browser do host e colar token de volta no `.env` — fluxo chato. | README documenta explicitamente. Aceitar UX pobre aqui; é setup único (e por-renovação). |
| Socket Mode do Slack Bolt pode ter padrões diferentes em 2026 (retry, reconnect, etc). | Discovery (Task 0). Fallback: usar os defaults do Bolt SDK atual, que são razoáveis. |
| `bash` como única tool é poderoso demais — usuário mal-intencionado pode fazer estragos. | Hoje mitigado por: (a) workspace solo = só o operador fala com o bot, (b) container = sandbox sem acesso ao host além dos volumes montados, (c) system prompt orienta pedir confirmação antes de comandos destrutivos. Allowlist ativa no momento que workspace deixar de ser solo. |
| Rate limit do plano Claude Code pode bater em uso intenso. | Detectar erro específico, avisar no Slack ("bati limite, tenta depois"). Não é bloqueador de MVP — é feedback claro. |
| Workspace volume pode crescer sem controle (repos clonados nunca limpos). | Fora do MVP (Non-Goal #3 implica que nada é clonado no MVP, já que não há file tools nem git ops). Voltar quando agente de dev for implementado. |

## Open Questions

Nenhuma bloqueante pro spec. Todas as decisões foram tomadas durante o brainstorming. Itens a serem confirmados durante Task 0 (discovery) podem re-abrir questões — nesse caso, voltar à spec antes de continuar o plano.

Possíveis surpresas do discovery (não são open questions agora, mas podem virar):

- Existe MCP server oficial do Slack que simplifica o SlackChannel? Se sim, reduz código do adapter drasticamente.
- Claude Code em 2026 já tem modo "servidor" nativo? Se sim, pode eliminar o subprocess-per-request.
- Node 22 ainda é LTS? Se Node 24 virou LTS, atualizar imagem base.
