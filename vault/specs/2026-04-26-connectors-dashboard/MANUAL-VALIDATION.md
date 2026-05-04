# Connectors — guia de validação manual

A spec 0035 (suite e2e automatizada com 22 cenários + regra das 4 runs limpas) foi **deferred**. No lugar, este guia descreve a validação manual que o operador roda pra confirmar que tudo funciona ponta-a-ponta. Cobre os 7 user stories do spec 0029.

## Pré-requisitos

- `pnpm install` (lockfile já tem `@zeno/mcp-discover` + `@modelcontextprotocol/sdk`)
- `pnpm run docker:build` rodou com sucesso (multi-stage build novo, ~30s no segundo run)
- Profile com `.env` válido (Slack tokens, Claude OAuth, dashboard password)
- Token Slack Bot (`xoxb-…`) com escopos: `channels:read`, `channels:history`, `chat:write`, `users:read`, `search:read` — pra testar o connector Slack do catálogo
- Team ID Slack (`T…` — pega no workspace URL)

## 1. Boot smoke

```bash
PROFILE=acme pnpm run docker:up
PROFILE=acme pnpm run docker:logs | grep -E "mcp_json_ignored|mcp_loaded|zeno_online|guardrails_enabled" | head -10
```

Esperado nos logs:

```
event=mcp_json_ignored, servers=["linear","notion",...]   ← cutover funcionando
event=mcp_loaded, count=1, servers=["playwright"]         ← só built-ins (esperado em DB vazio)
event=guardrails_enabled                                  ← pipeline com connector_permission policy
event=zeno_online                                         ← worker pronto
```

`profile/mcp.json` continua intacto no disco (cutover renomeia nada — só ignora).

## 2. Login + verificar API

```bash
# .env: DASHBOARD_PASSWORD=<value>
curl -s -c /tmp/cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"<DASHBOARD_PASSWORD>"}'

# Catálogo (deve retornar Slack):
curl -s -b /tmp/cookies.txt http://localhost:3001/api/connectors/catalog | jq '.[].name'
# → "Slack"

# Lista (vazia até instalar):
curl -s -b /tmp/cookies.txt http://localhost:3001/api/connectors
# → []
```

Atenção: porta 3001 do host → 3000 do container (mapping do docker-compose).

## 3. UI smoke — sidebar + navegação

1. Abrir `http://localhost:3001/` → tela de login → cole `DASHBOARD_PASSWORD`
2. Sidebar deve ter o item **connectors** entre Sessions e Logs (ícone de plug)
3. ⌘N (ou Cmd+N) abre command palette → Enter no item connectors → navega
4. `/connectors` mostra:
   - Empty state com hero "Connect Zeno to external tools"
   - Catalog grid com 1 card: **Slack** com transport "stdio"

## 4. Install Slack via catálogo

1. Click no card Slack → abre modal "Add Slack"
2. Preencher:
   - **Bot Token (xoxb-…)**: cole seu xoxb-…
   - **Team ID (T…)**: cole seu T…
3. Click **Test connection**:
   - Esperado: ✓ verde + "8 tools detected · 5 read · 3 write/delete · 0 interactive · ~500ms"
4. Click **Add**
5. Modal fecha → toast "connector adicionado"
6. Após ~1.5s a lista refetcha → **Slack** aparece em **installed** com:
   - Status pill: **active** (verde)
   - "8 tools · catalog"
   - last verified: "Xs ago"

## 5. Test from detail screen

1. Click na linha do Slack → vai pra `/connectors/<id>`
2. Header mostra ícone Slack + nome + transport pill (stdio) + status pill (active) + toggle (enabled) + ⋯
3. Connection section mostra:
   - **command**: `npx -y @modelcontextprotocol/server-slack`
   - **environment**: 2 secrets (`SLACK_BOT_TOKEN`, `SLACK_TEAM_ID`) com valores `••••••••<last4>`
4. Click no olho de `SLACK_BOT_TOKEN` → reveal por 10s → re-mascara
5. Click denovo dentro de 60s → toast "aguarde alguns segundos pra revelar de novo (rate_limited)"
6. Click ⋯ → dropdown com **test connection** / **refresh tools** / **uninstall**
7. Click **test connection** → toast "Slack · 8 tools · ~500ms"

## 6. Tool permissions

Tool Permissions section:
- **Read-only tools (5)**: `slack_list_channels`, `slack_get_channel_history`, `slack_get_thread_replies`, `slack_get_users`, `slack_get_user_profile` — todas com **always allow** ativo
- **Write/delete tools (3)**: `slack_post_message`, `slack_reply_to_thread`, `slack_add_reaction` — todas com **ask** ativo

1. Click **always allow** em `slack_post_message` → optimistic update (instantâneo); chamada PATCH no backend
2. F5 → permissão persistida
3. Bulk dropdown em Write/delete → **never** → todas as 3 viram red "never"

## 7. Agente usa o connector

No Slack, mande pro Zeno: `@zeno me lista os 5 últimos mensagens do canal #general`

Esperado:
- Agente decide chamar `mcp__slack__slack_list_channels` ou `slack_get_channel_history`
- Pipeline: `connector_permission` policy retorna `connector_allow` (read tool) → executa direto, sem aprovação
- Resposta volta com a lista
- No dashboard, Activity feed do Slack mostra a invocation: `slack_get_channel_history · ✓ · ~800ms · view turn ↗`
- `last_verified_at` foi atualizado

## 8. Toggle off → on

1. Detail screen → click no toggle (enabled → disabled)
2. Status pill muda pra **off**
3. No Slack, mande nova msg pro Zeno pedindo info do Slack → ele responde "não tenho ferramentas do Slack"
4. Toggle on → próxima msg funciona de novo (sem restart)

## 9. Refresh tools

1. ⋯ → **refresh tools**
2. Confirm dialog: "This will reset tool permissions to defaults. Continue?"
3. OK → toast "tools atualizando…"
4. Após ~2s, tool permissions section re-renderiza com defaults (write voltam pra `ask`)

## 10. Uninstall

1. ⋯ → **uninstall**
2. Confirm dialog: "Uninstall Slack? This removes all secrets and tools."
3. OK → toast "connector removido"
4. Volta pra `/connectors` → Slack sumiu da lista
5. Catálogo mostra Slack disponível pra instalar de novo (sem badge "installed")
6. DB: secrets, tools, invocations cascade-deleted (verifica via `pnpm run docker:sh && sqlite3 /workspace/zeno.db "SELECT count(*) FROM connector_secrets"` → 0)

## 11. Custom remote (post-MVP — caminho experimental)

Spec 0034 declara API endpoints + worker handler para custom remote/stdio, mas a UI do dashboard inicial só ship o fluxo de catálogo. Para testar custom via API direta:

```bash
curl -s -b /tmp/cookies.txt -X POST http://localhost:3001/api/connectors/test \
  -H 'Content-Type: application/json' \
  -d '{"transport":"remote","url":"https://your-mcp/sse","secrets":[{"key":"__MCP_AUTHORIZATION__","value":"Bearer xxx"}]}'
```

Se o test passar → POST `/api/connectors` com `source: 'custom'`. Quando o operador quiser, abrir spec 0034b pra portar o modal "Add custom" do `apps/design`.

## Validação completa = ✓

Quando os passos 1–10 passam, o feature está validado pra produção (single-user). Suíte automatizada (spec 0035) volta quando vier multi-tenant ou um redesign maior.
