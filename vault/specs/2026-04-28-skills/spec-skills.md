---
status: draft
feature: skills
created: 2026-04-28
shipped: null
related:
  - "[[../../learnings/skill-scoped-credentials-pattern]]"
---
# Skills — Spec

**Status:** Draft
**Scope:** Reintroduce skills to Zeno's runtime as markdown playbooks the agent reads on demand, plus a global "agent capabilities" config that gates non-MCP tools (Read/Edit/Write/Bash/etc.) at the operator level. Skills carry only content; capability authorization is global.

## Context

Spec 0049 retired skills as a runtime concept and cravou a tese "tudo é connector". Specs 0050 + 0051 deletaram a infraestrutura antiga (skill-registry, runtime loader, per-skill credentials, approvals chain). A própria spec 0049 deixou aberto: *"skills voltam depois, possivelmente via connector"*.

**Nota sobre divergência da constitution:** `context/constitution.md` linha 21 diz "Skills (deferred) — may be bundled with connectors". Esta spec implementa skills como **entidades independentes** com link **opcional** a connectors (M:N), não como sub-objetos de connectors. A intuição da constitution se preserva (skills *podem* ser linkadas a connectors via spec 0052), mas a estrutura é mais flexível (skill `frontend-design` não tem nada a ver com connector específico). Decisão tomada na fase de brainstorm desta spec.

Esta spec reintroduz skills como **playbooks markdown** que o agente lê quando relevante — não como código executável, não como subagentes, não com chain de aprovação. Um skill é um arquivo `SKILL.md` com frontmatter mínima (`name`, `description`) + corpo markdown explicando *como* fazer alguma coisa (revisar frontend, debugar AWS, triagear Sentry).

A diferença do regime antigo:

- Skills antigas eram **descobertas a partir do filesystem do profile** (`profiles/<name>/skills/`), com bootstrap shell-script no entrypoint.
- Skills novas são **CRUD'd no dashboard**, gravadas no DB, materializadas em `~/.claude/skills/` no boot/hot-reload, e descobertas pelo Claude Agent SDK nativamente. Sem bootstrap shell.

A relação com connectors também muda:

- Skill antiga *poderia* ter credentials próprias (anti-pattern documentado em [[../../learnings/skill-scoped-credentials-pattern]] — superseded).
- Skill nova é **content puro** — credenciais ficam nos connectors. A skill descreve *como usar* um connector ou *como executar uma task*, não *como autenticar*. Skills podem opcionalmente ser **linkadas** a connectors: quando o agente chama uma tool desse connector, o body da skill linkada é injetado no contexto antes da tool rodar.

**Capability authorization é global, não por skill.** Spec 0050 hardblocka tools não-MCP (Read/Edit/Write/Bash). Operador habilita explicitamente quais capabilities o agente pode usar via uma seção `Agent capabilities` em `/settings`. Skills usam livremente o que tá habilitado. Habilitar uma capability é decisão do operador uma vez, não algo que cada skill pede separadamente. *Mental model: capabilities são propriedade do agente; skills são content que aproveita o que o agente já pode fazer.*

## Problem Statement

Pós spec 0049-0051, o operador tem connectors (capabilities + credentials) e SOUL.md (instruções gerais). Falta um lugar pra **knowledge contextual** — playbooks que dizem "quando você fizer X, faça assim". Sem skills, esse conhecimento ou cabe inteiro no SOUL.md (incha o context window de todo turno) ou se perde (operador repete as mesmas instruções no Slack).

Cinco lacunas concretas:

1. Não tem como cadastrar um playbook reutilizável sem editar arquivos no profile.
2. Não tem como dar ao agente Read/Edit/Write/Bash de forma controlada — o gate do spec 0050 hardblocka tudo não-MCP, então skills tipo `frontend-design` (que precisa editar arquivos) hoje seriam impossíveis.
3. Não tem como o agente "aprender" como o operador específico usa um connector. A skill `sentry-flow` da Acme é diferente da do operador X.
4. Não tem como exportar/baixar o conjunto de skills do operador (backup, share, migrate).
5. Não tem reposição funcional pro padrão de "knowledge file" que skills representavam pre-spec-0050.

## Non-Goals

- **Out of scope: instalação automática de skills.sh.** v1 só aceita upload de arquivo `SKILL.md` único pelo dashboard. Importação de skills.sh + auto-update fica pra v2 (operador hoje pode baixar manualmente o `.md` da skills.sh e fazer upload).
- **Out of scope: árvore de arquivos por skill.** Em v1 cada skill é um único `SKILL.md`. Multi-arquivo + assets fica pra v2.
- **Out of scope: skills "always_loaded".** Tinha como requisito originalmente, foi cortado de v1 — todas skills em v1 são pick-mode (lazy-load). Operador escreve `description` boa e o agente decide quando ler. Reintroduzir como flag de prepend ao system prompt fica pra v2 se houver demanda.
- **Out of scope: pausar skill (toggle enabled/disabled).** Em v1 lifecycle é install / edit / delete. Pausar sem deletar fica pra v2.
- **Out of scope: per-skill permission scoping.** Em v1 capabilities são globais — qualquer skill instalada pode usar qualquer capability habilitada nas settings. Sandbox por skill (skill A tem Bash, skill B não tem) fica pra v2 se virar issue de segurança. Threat model é single-operator self-hosted; operador é o gatekeeper.
- **Out of scope: re-importação de skills antigas do profile `<example>`.** O profile `<example>` tinha skills no FS antes do spec 0050. Não vamos backfillar pro DB automaticamente — operador faz upload manual das que ainda quiser.
- **Out of scope: skill versioning, share/publish, ratings.** v1 é single-operator self-hosted. Sem feature social.
- **Out of scope: parsear `allowed-tools` da frontmatter de skills baixadas de skills.sh.** Se o `.md` traz esse campo, a gente IGNORA em runtime (só valida `name` + `description`). Pode opcionalmente exibir como hint informativo na install modal — ver Open Questions. Decisão do operador continua sendo no `/settings/agent-capabilities`, não no install.

## Constraints

- **Compile must stay green at every phase commit.** Phase A (DB + storage), Phase B (worker hot-reload + permission gate), Phase C (API + dashboard + Paper telas). Cada commit termina com `pnpm run quality-gate` verde.
- **Spec 0050 contract preserved + extended.** O único guardrail continua sendo `connector-permission` gate. A modificação que esta spec introduz é uma **consulta nova ao gate**: tools não-MCP, ao invés de denegar fixed, consultam `AgentCapabilityRepo.isEnabled(toolName)`. Se enabled → ALLOW. Se disabled → DENY. Não há novo policy chain, não há owner approval flow, não há união de scopes por skill.
- **Paper-first workflow.** Todas as telas (Skills list, Skill detail, Install modal, sections em Connector page, Agent capabilities settings section) precisam ser desenhadas no Paper file que o operador especificou e **aprovadas pelo operador** antes da implementação começar. Implementação direta em `apps/dashboard`. Regra de 3-clean-reviews aplica.
- **Auto-discovery via `~/.claude/skills/` — verificação é o primeiro task de Phase B (gate-zero).** Antes de qualquer outro trabalho de runtime, validar empiricamente se o Claude Agent SDK (não só o CLI) auto-descobre `SKILL.md` em `~/.claude/skills/<name>/`. Como verificar: criar um SKILL.md de teste com `description: "test skill, ignore"`, rodar uma query com prompt que NÃO menciona a skill, observar se o agente lista a skill como "tool/skill conhecida" no contexto OU se ela aparece em `tool_search`/listings naturalmente. Decisão:
  - **Auto-discovery confirmada**: skills materializam em `${claudeHome}/skills/<name>/SKILL.md`, não há tool MCP custom. Phase B prossegue normal.
  - **Auto-discovery NÃO funciona**: ativa **plano B** — Zeno expõe duas tools built-in via `agent/mcp.json` com contrato fixo:
    - `mcp__zeno__list_skills() → Array<{name: string, description: string}>` — lista skills disponíveis (lê do DB).
    - `mcp__zeno__read_skill(name: string) → {body: string}` — retorna body markdown completo da skill.
  - Decisão é **binária e tomada no primeiro commit de Phase B**, não meio-do-caminho.
- **Constitution principles:** YAGNI (sem per-skill scoping, sem skills.sh em v1, sem always_loaded), Reversibility (commits independentes por phase), Single source of truth (DB grava; FS é derivado).

## User Stories / Scenarios

1. **Operador faz upload de uma skill nova.** No dashboard, abre `/skills`, clica `+ Install skill`, sobe o arquivo `frontend-design.md`. Modal parsea o frontmatter (`name` + `description`) e mostra preview: *"Nome: frontend-design — Description: Padrão de UX e revisão de código React/Tailwind."*. Operador clica Install → skill grava no DB, materializa em `~/.claude/skills/frontend-design/SKILL.md`, ProfileWatcher detecta, AgentCore reload, próxima query do agent já enxerga ela.

2. **Operador habilita capabilities globalmente.** Vai em `/settings`, na seção "Agent capabilities" liga `Read`, `Edit`, `Write`, `Bash`. Save → DB grava, hot-reload do gate, agente passa a ter essas tools disponíveis em qualquer turno (independente de skill). Single decision once.

3. **Operador linka uma skill a um connector.** Vai em `/connectors/<sentry-id>`, na seção "Linked skills" abre multi-select, marca `sentry-flow`, salva. Próxima vez que o agente chamar qualquer `mcp__sentry__*`, antes da tool rodar o pre-tool-use hook injeta o body de `sentry-flow` como contexto no turno.

4. **Agente decide usar uma skill.** No turno em que o operador pede "revisa esse PR de frontend", o agente vê `frontend-design` na lista de skills disponíveis (auto-discovered via `~/.claude/skills/`), lê o body, segue o playbook, faz `Read` + `Edit` (essas tools tão habilitadas em settings), responde com o review.

5. **Operador edita o body da skill.** Em `/skills/<id>`, clica `Edit`, ajusta o markdown, salva. Sem ritual de re-approve — body é só content, capabilities continuam no `/settings`. DB grava, FS regenera, hot-reload.

6. **Operador deleta uma skill.** Na lista, clica delete, confirma com type-to-confirm. Skill some do DB, link `connector_skills` cascade-deleta, FS limpa, hot-reload. Capabilities globais não mexem (são independentes de skills).

7. **Operador exporta skills.** Botão `Download all` na lista de skills baixa um zip com `<name>/SKILL.md` pra cada skill. Botão `Download` no detail page da skill baixa o `.md` individual. Frontmatter preservado.

8. **Tool não-MCP é negada porque a capability não tá habilitada.** Agente tenta `Bash("ls")`. `AgentCapabilityRepo.isEnabled('Bash')` retorna `false`. Gate denega. Operador recebe explicação no log: *"tool 'Bash' denied — capability not enabled in /settings/agent-capabilities"*.

## Success Criteria

**Phase A — DB + storage layer:**
- [ ] Migration adiciona tabelas `skills`, `connector_skills`, `agent_capabilities`.
  - `skills(id, name UNIQUE, description, body, created_at, updated_at)` — sem `allowed_tools`.
  - `connector_skills(connector_id, skill_id, PRIMARY KEY(both), ON DELETE CASCADE)`.
  - `agent_capabilities(tool_name PRIMARY KEY, enabled BOOLEAN DEFAULT 0, updated_at)` — seedada com row pra cada non-MCP tool conhecida (`Read`, `Edit`, `Write`, `Bash`, `WebFetch`, `Task`, etc.), todas `enabled=0` por default. Lista exata de tools sai durante Phase B gate-zero (verificada contra Claude Agent SDK).
- [ ] Repos `SkillRepo`, `ConnectorSkillRepo`, `AgentCapabilityRepo` em `@zeno/storage` com CRUD.
- [ ] Tests unit pra todos os repos.

**Phase B — worker runtime:**
- [ ] No boot do worker, `SkillRepo.list()` materializa cada skill em `${claudeHome}/skills/<name>/SKILL.md` (frontmatter `name`+`description` + body recompostos).
- [ ] `ProfileWatcher` ganha bucket `'skills'`: edição/criação/delete em `${claudeHome}/skills/**` dispara `onSkillsChanged` → AgentCore reload (mesmo padrão de SOUL.md).
- [ ] Pre-tool-use hook (`ConnectorGatedBackend`) atualiza:
  - **Tools não-MCP**: ao invés de denegar fixed, checa `AgentCapabilityRepo.isEnabled(toolName)`. Se enabled → ALLOW. Se disabled → DENY (preserva spec 0050). Não há checagem por skill — capabilities são globais.
  - **Tools MCP de connector com skills linkadas**: lógica existente do spec 0050 inalterada (per-tool permission). MAIS: o hook retorna um `additionalContext` (ou equivalente — exact field a ser confirmado contra a SDK no momento da implementação) com os bodies das skills linkadas, que a SDK injeta como **mensagem `user` sintética prepended ao próximo turno** antes da tool rodar. Cache: bodies de skills linkadas a um connector são injetados **uma vez por turno por connector**, não por tool call (chave de cache: `turn_id + connector_slug`).
- [ ] **Phase B gate-zero (primeiro commit): auto-discovery validation.** Ver Constraints. Decisão binária resultando em "Path A: SDK auto-descobre" OU "Path B: tools MCP custom em `agent/mcp.json`". Documentar resultado em commit message + nota inline em `apps/worker/src/agent/mcp-build.ts`. Demais critérios de Phase B presumem o path escolhido.
- [ ] Tests:
  - Hot-reload integration test (criar skill no DB → FS materializa → watcher detecta → reload fired).
  - Permission gate test: capability enabled em settings → tool não-MCP ALLOW; capability disabled → DENY.
  - Connector-skill injection test: tool `mcp__sentry__list_issues` chamada → body de `sentry-flow` (linkada ao Sentry) é incluído no input do hook.

**Phase C — API + dashboard:**
- [ ] API endpoints (skills): `GET /api/skills`, `GET /api/skills/:id`, `POST /api/skills` (upload), `PATCH /api/skills/:id` (edit body — sem re-approve), `DELETE /api/skills/:id`, `GET /api/skills/:id/download`, `GET /api/skills/download-all`.
- [ ] API endpoints pra link M:N: `PATCH /api/connectors/:id/skills` (replace whole list), `GET /api/connectors/:id/skills` (read).
- [ ] API endpoints (capabilities): `GET /api/agent-capabilities` (lista todas com status), `PATCH /api/agent-capabilities` (toggle individual ou batch).
- [ ] Frontmatter parser: validar `name` (obrigatório, único) + `description` (obrigatório). Rejeita upload com erro claro se inválido. **Não** valida `allowed_tools` (campo ignorado em runtime; pode ser exibido como hint informativo se presente — ver Open Questions).
- [ ] Dashboard pages:
  - `/skills` — lista com colunas SKILL · LINKED · UPDATED (sem ALLOWED TOOLS), botões `+ Install`, `Download all`.
  - `/skills/:id` — detail com body markdown rendered fullwidth, connectors linkadas (read-only), botões `Edit`, `Download`, `Delete`.
  - Install modal: file picker → preview frontmatter (`name`, `description`) → confirm. Sem seção "Permission Request" — capabilities são globais.
  - Edit modal: textarea com body atual (markdown), salvar. Sem re-approve.
  - Delete modal: type-to-confirm com nome da skill. Cascade preview lista: skill row + FS file + connector_skills links (sem mencionar gate scope, que não muda).
  - `/connectors/:id` — nova seção "Linked skills" com multi-select.
  - **`/settings` — seção nova "Agent capabilities".** Lista das tools não-MCP com toggle on/off cada. Default OFF. Mostra warning visual pra tools sensíveis (`Bash`, `Write`).
- [ ] Paper artboards aprovados pelo operador antes da implementação começar.
- [ ] `apps/design` implementado primeiro com 3-clean-reviews; `apps/dashboard` espelha.

**Phase D — Quality gate + Docker boot + reviews:**
- [ ] `pnpm run quality-gate` verde (lint + typecheck + tests em todos workspaces).
- [ ] Docker boot (`PROFILE=<example> pnpm run docker:up`) clean: log `skills_loaded count=N` aparece, `agent_capabilities_loaded enabled=[...]` aparece, sem erros.
- [ ] E2E via Slack: operador pede "use skill X pra fazer Y" → agente carrega o body da skill (mecanismo conforme path A/B definido em Phase B gate-zero — auto-discovery nativa OU tool `read_skill` custom), executa task com tools globalmente habilitadas, responde sem erros de permissão.
- [ ] **3-rounds clean review por phase + final batch review.** Cada phase termina com 3 reviews consecutivos sem findings (qualquer finding reseta o contador). Após Phase D, mais 3 reviews sobre o batch completo. Mesma cadência que foi aplicada em specs 0049-0051 — checa completeness vs spec, dead code, comments stale, scope discipline, bugs de runtime.

**Net diff target:** addições puras (nova feature). Estimativa ~1300–2000 linhas novas — estimativa **menor** do que a versão anterior do spec porque o per-skill `allowed_tools` flow saiu (sem union scope, sem re-approve modal, sem allowed_tools schema/validation/JSON column).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Claude Agent SDK não auto-descobre `~/.claude/skills/` quando rodando via SDK (vs CLI). Implementação cai num beco. | Fallback documentado: tools `mcp__zeno__list_skills` + `mcp__zeno__read_skill` em `agent/mcp.json`. Validar **no início** de Phase B antes de comprometer com auto-discovery. |
| Operador habilita `Bash` globalmente uma vez e esquece — skill maliciosa (futura, via skills.sh) ganha Bash sem aviso recente. | (1) v1 só aceita upload manual (operador escolheu o `.md`). (2) Settings page lista capabilities habilitadas em destaque, e o agent capabilities section pode ter um banner *"Bash is enabled — agent can run shell commands. Disable if you don't trust a recently installed skill."* (3) Threat model é single-operator self-hosted; operador é o gatekeeper. Per-skill sandbox runtime é Non-Goal de v1. |
| Pre-tool-use hook injetando bodies de skills linkadas quintuplica tokens em turnos com muitas tool calls do mesmo connector. | (1) Inject **uma vez por turno por connector** (cache no contexto do hook), não por tool call. (2) Se skill é grande (>2k tokens), considerar truncar com aviso "skill body truncated, read full via..." — defer pra v2 se virar issue. |
| Hot-reload com FS materialization pode race-condition: edit no dashboard escreve DB, materializa FS, watcher dispara, mas AgentCore tá no meio de uma query. | Mesmo padrão do SOUL.md hoje. AgentCore reload é graceful — termina query atual antes de pegar nova config. ProfileWatcher já tem debounce de 50ms (per `apps/worker/tests/profile/watcher.test.ts`). |
| Operador tem 50+ skills instaladas, todos no `~/.claude/skills/`, e o auto-discovery do SDK injeta contexto de todas em todo turno. Token explosion. | Verificar comportamento real do SDK em Phase B gate-zero. Se SDK injeta tudo, ativar Path B (tools custom `list_skills` + `read_skill`) — opera lazy por design. **Não introduzir flag `always_loaded` ou `active` no DB pra contornar isso** — esse caminho é Non-Goal de v1 (decisão da fase de brainstorm). Path B já resolve. |
| Migration de adicionar `skills` + `connector_skills` + `agent_capabilities` em DB legado precisa ser idempotente. | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `INSERT OR IGNORE` pra seed das capability rows. Padrão já em uso em todas migrations do projeto. |
| Operador tinha skills no profile `<example>/skills/` antigo que foram apagadas em spec 0050. Pode não ter backup. | Spec 0050 não apagou os arquivos físicos do profile dir do operador (eram gitignored). Operador pode re-uploadar manualmente. Se não tiver mais, é trade-off do cleanup arc — re-import flow pode entrar em v2 se for relevante. |
| Lista de tools não-MCP que `agent_capabilities` vai seedar pode ficar fora de sync com o que o Claude Agent SDK realmente expõe (futuras versões adicionam tools novas). | Lista é finita e estável-suficiente em 2026 (Read/Edit/Write/Bash/WebFetch/Task/Glob/Grep/etc.). Phase B gate-zero confirma a lista exata. Tool nova que aparece depois sem migration: gate denega por default (não está em `agent_capabilities`), comportamento safe-by-default. Operator pode requisitar migration nova pra liberar. |

## Open Questions

[NEEDS VERIFICATION DURING IMPLEMENTATION]: Claude Agent SDK auto-descobre `~/.claude/skills/`? Confirmar antes de comprometer com lazy-load via auto-discovery vs tools custom. Plano B (tools custom) está documentado em Phase B.

[NEEDS DESIGN DURING PAPER PHASE]: layout exato das telas `/skills`, `/skills/:id`, e da seção `Agent capabilities` em `/settings`. Spec define o conteúdo (campos, ações), mas o layout visual sai do Paper. Itera com operador.

[NEEDS DECISION DURING PAPER REVIEW]: install modal deve mostrar `allowed-tools` da frontmatter da skill (se vier de skills.sh export) como hint informativo? Pros: contextualiza o operador sobre quais capabilities a skill autor sugere ligar globalmente. Contras: pode confundir ("approving" essas tools? não, só info). Decidir junto da modal v2 no Paper.

**Resolvida (default lock-in):** comportamento de conflito de nome no upload. `POST /api/skills` rejeita com `409 Conflict` quando o frontmatter `name` já existe na tabela `skills`. Dashboard mostra erro: *"Skill `<name>` já existe. Abre o detail page e clica Edit pra atualizar."* Sem flow de "overwrite via upload" em v1 — operador é forçado a usar Edit. Operador pode mudar essa decisão antes do plan se quiser flow alternativo.

**Resolvida (durante brainstorm v2):** Per-skill `allowed_tools` na frontmatter foi REMOVIDO do design. Capabilities são globais agora (settings page). Skills podem ter `allowed_tools` no `.md` mas é ignorado em runtime — opcionalmente exibido como hint na install modal. Fica de fora do contrato de v1.
