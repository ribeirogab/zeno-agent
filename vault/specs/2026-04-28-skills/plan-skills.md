---
feature: skills
spec: "[[spec-skills]]"
created: 2026-04-28
---
# Skills — Plan

**For this spec:** `[[spec-skills]]`

## Approach

Quatro fases sequenciais, cada uma terminando em typecheck/test verde + commit independente. Phase ordering chosen pra desbloquear stack-de-baixo-pra-cima e isolar a discovery em Phase B (que é a única zona de incerteza técnica, atrelada ao comportamento do Claude Agent SDK):

- **Phase A — Storage layer** (DB migration + 3 repos + types). Schema é a interface entre worker e API; sai primeiro pra travar o contrato. Um único commit cobre `migrations.ts` + 3 repos + 3 test files. Sem risco — todas as decisões de schema já foram tomadas.
- **Phase B — Worker runtime**. Subdividido em 3 sub-phases:
  - **B.0 (gate-zero)**: validação empírica do auto-discovery do SDK. Decisão binária Path A (SDK auto-descobre `~/.claude/skills/`) vs Path B (tools custom `mcp__zeno__list_skills` + `read_skill`). Resultado em commit message + nota inline em `mcp-build.ts`.
  - **B.1**: SkillsMaterializer (DB → FS) + ProfileWatcher integration (`onSkillsChanged` → AgentCore reload).
  - **B.2**: Capabilities-aware gate. `connector-permission.ts` ganha consulta a `AgentCapabilityRepo.isEnabled(toolName)` no branch non-MCP (substitui o hardblock).
  - **B.3**: Pre-tool-use hook injection. Hook detecta `mcp__<slug>__*`, busca skills linkadas via `ConnectorSkillRepo.listForConnector(slug)`, injeta bodies como `additionalContext` (campo SDK exato a ser confirmado em sub-task explícita antes de codar).
- **Phase C — API + Dashboard** (Paper-first). Subdividido em:
  - **C.1**: API endpoints — `/api/skills` CRUD + `/api/skills/download[-all]` + `/api/connectors/:id/skills` + `/api/agent-capabilities` GET/PATCH.
  - **C.2**: Frontmatter parser — valida `name` + `description`. Ignora silenciosamente `allowed-tools` (campo legacy de skills.sh).
  - **C.3**: `apps/design` twin — implementa SET1, S1/S2/S3, modais, linked-skills section. Regra **3-clean-reviews por tela contra Paper** aplica.
  - **C.4**: `apps/dashboard` — espelha `apps/design`. Zero divergência visual.
- **Phase D — Quality gate + Docker boot + 3-round review por phase + final batch + push + PR**. Cada phase (A, B, C) já termina com 3-round review antes de avançar. Após Phase D, mais 3 rounds sobre o batch completo.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Phase A — Storage layer                                        │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Migration 11:                                              │ │
│ │   skills(id, name UNIQUE, description, body, ts)           │ │
│ │   connector_skills(connector_id, skill_id) ON DELETE       │ │
│ │   agent_capabilities(tool_name PRIMARY KEY, enabled, ts)   │ │
│ │     seeded: Read, Edit, Write, Bash, WebFetch, Task,       │ │
│ │             Glob, Grep, WebSearch — all enabled=0          │ │
│ │ SkillRepo · ConnectorSkillRepo · AgentCapabilityRepo       │ │
│ └────────────────────────────────────────────────────────────┘ │
│                              ▼                                 │
│ Phase B — Worker runtime                                       │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ B.0 gate-zero: SDK auto-discovery decision (Path A vs B)   │ │
│ │ B.1 SkillsMaterializer:                                    │ │
│ │       SkillRepo.list() → ${claudeHome}/skills/<n>/SKILL.md │ │
│ │       ProfileWatcher 'skills' bucket → onSkillsChanged     │ │
│ │       → AgentCore reload                                   │ │
│ │ B.2 Gate fork in connector-permission.ts:                  │ │
│ │       non-MCP → consult AgentCapabilityRepo.isEnabled()    │ │
│ │       → ALLOW if true, DENY if false (preserves spec 0050) │ │
│ │ B.3 ConnectorGatedBackend.buildPreToolUseHook:             │ │
│ │       detect mcp__<slug>__*                                │ │
│ │       → ConnectorSkillRepo.listForConnector(slug)          │ │
│ │       → return additionalContext with skill bodies         │ │
│ │       (cache: turn_id + slug → injected once per turn)     │ │
│ └────────────────────────────────────────────────────────────┘ │
│                              ▼                                 │
│ Phase C — API + Dashboard (Paper-first)                        │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ C.1 API:                                                   │ │
│ │   GET/POST/PATCH/DELETE /api/skills(/:id)                  │ │
│ │   GET /api/skills/:id/download · /api/skills/download-all  │ │
│ │   GET/PATCH /api/connectors/:id/skills                     │ │
│ │   GET/PATCH /api/agent-capabilities                        │ │
│ │ C.2 Frontmatter parser (yaml + validation)                 │ │
│ │ C.3 apps/design twin (SET1, S1/S2/S3, modals)              │ │
│ │ C.4 apps/dashboard (mirrors apps/design exactly)           │ │
│ └────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## File Structure

**Created:**

*Storage layer (Phase A):*
- `packages/storage/src/repos/skills.ts` — `SkillRepo` with CRUD, `list()`, `getByName()`.
- `packages/storage/src/repos/connector-skills.ts` — `ConnectorSkillRepo` with `listForConnector(connectorId)`, `listForSkill(skillId)`, `replaceForConnector(connectorId, skillIds[])`.
- `packages/storage/src/repos/agent-capabilities.ts` — `AgentCapabilityRepo` with `list()`, `isEnabled(toolName)`, `setEnabled(toolName, enabled)`, `setMany(updates)`.
- `packages/storage/tests/repos/skills.test.ts`
- `packages/storage/tests/repos/connector-skills.test.ts`
- `packages/storage/tests/repos/agent-capabilities.test.ts`

*Worker runtime (Phase B):*
- `apps/worker/src/skills/materialize.ts` — `materializeSkillsToFs(skillRepo, claudeHome)` writes each skill to `${claudeHome}/skills/<name>/SKILL.md` with frontmatter + body recombined.
- `apps/worker/src/skills/skill-context.ts` — helper that, given a turn id + connector slug, returns linked skill bodies (cache-keyed).
- `apps/worker/tests/skills/materialize.test.ts`
- `apps/worker/tests/skills/skill-context.test.ts`
- `apps/worker/tests/guardrails/agent-capabilities.test.ts` — gate test for non-MCP tool ALLOW/DENY based on capability enablement.
- `apps/worker/tests/skills/connector-skill-injection.test.ts` — hook injection test (asserts `additionalContext` carries linked skill bodies for `mcp__sentry__*` calls).

*API (Phase C):*
- `apps/api/src/routes/skills.ts` — REST routes for skills (CRUD, download, download-all) and agent-capabilities (GET/PATCH).
- `apps/api/src/routes/connector-skills.ts` — REST routes for connector ↔ skills M:N relationship.
- `apps/api/src/lib/parse-skill-frontmatter.ts` — `parseSkillFrontmatter(content: string): { ok: true, frontmatter, body } | { ok: false, errors }`. Uses `yaml` (already a dep via cron loader) or a lightweight parser. Validates `name` (required, kebab) + `description` (required). Ignores `allowed-tools` field (not validated, not stored — just dropped silently from the parsed frontmatter on the way to the DB).
- `apps/api/src/lib/zip-skills.ts` — `zipAllSkills(skillRepo): Buffer | Stream` for `download-all`.
- `apps/api/tests/routes/skills.test.ts`
- `apps/api/tests/routes/connector-skills.test.ts`
- `apps/api/tests/routes/agent-capabilities.test.ts`
- `apps/api/tests/lib/parse-skill-frontmatter.test.ts`

*Dashboard / design (Phase C):*
- `apps/design/src/routes/skills/index.tsx` (S1+S2 — populated + empty)
- `apps/design/src/routes/skills/[id].tsx` (S3 — detail)
- `apps/design/src/components/skills/skill-list-row.tsx`
- `apps/design/src/components/skills/install-skill-modal.tsx` (M-skill-1 + M-skill-1b states)
- `apps/design/src/components/skills/edit-skill-modal.tsx` (M-skill-2)
- `apps/design/src/components/skills/delete-skill-modal.tsx` (M-skill-4 — type-to-confirm)
- `apps/design/src/components/skills/link-skill-picker-modal.tsx` (M-skill-5)
- `apps/design/src/components/skills/linked-skills-section.tsx` (C-skill-1 — section embedded in connector page)
- `apps/design/src/components/settings/agent-capabilities-section.tsx` (SET1)
- *(then mirrored under `apps/dashboard/src/...`)*
- `apps/dashboard/src/routes/_authed/skills.tsx` (S1/S2)
- `apps/dashboard/src/routes/_authed/skills.$id.tsx` (S3)
- `apps/dashboard/src/components/skills/install-skill-modal.tsx`
- `apps/dashboard/src/components/skills/edit-skill-modal.tsx`
- `apps/dashboard/src/components/skills/delete-skill-modal.tsx`
- `apps/dashboard/src/components/skills/link-skill-picker-modal.tsx`
- `apps/dashboard/src/components/skills/linked-skills-section.tsx`
- `apps/dashboard/src/components/settings/agent-capabilities-section.tsx`
- `apps/dashboard/src/lib/use-skills.ts` (TanStack Query hooks: list, detail, install, edit, delete, link)
- `apps/dashboard/src/lib/use-agent-capabilities.ts`

**Modified:**

*Storage:*
- `packages/storage/src/migrations.ts` — add migration 11 (3 tables + capability seeds).
- `packages/storage/src/types.ts` — add `Skill`, `ConnectorSkill`, `AgentCapability` interfaces + create/update inputs.
- `packages/storage/src/index.ts` — export the 3 new repos + types.

*Worker:*
- `apps/worker/src/guardrails/policies/connector-permission.ts` — accept `agentCapabilityRepo` parameter; in the non-MCP branch, before returning DENY, consult `agentCapabilityRepo.isEnabled(toolName)`.
- `apps/worker/src/guardrails/connector-gated-backend.ts` — accept `agentCapabilityRepo` + `connectorSkillRepo` + `skillRepo` in deps. `buildPreToolUseHook` now: (a) calls updated `checkConnectorPermission(connectorRepo, agentCapabilityRepo, toolName)`; (b) for tools matching `mcp__<slug>__*` where the connector has linked skills, returns hook result with `additionalContext` carrying those skill bodies (cache-keyed by `turn_id + slug` to inject only once per turn per connector).
- `apps/worker/src/profile/watcher.ts` — `classify()` returns `'skills'` for paths under `${claudeHome}/skills/**`. Add `onSkillsChanged` callback to `ProfileWatcherOptions`. `start()` debounces + dispatches. Existing `'agent'` / `'profile'` / `'config'` buckets stay unchanged.
- `apps/worker/src/index.ts` — wire up: load `SkillRepo`, `ConnectorSkillRepo`, `AgentCapabilityRepo` from DB; call `materializeSkillsToFs(skillRepo, claudeHome)` during boot; pass repos into `ConnectorGatedBackend` deps; register `onSkillsChanged` handler with watcher to call `materializeSkillsToFs` + `agent.reload()`.
- `apps/worker/src/agent/mcp-build.ts` — only if Phase B gate-zero decides Path B: register the built-in `mcp__zeno__list_skills` + `mcp__zeno__read_skill` tools in the in-process MCP factory (`createSdkMcpServer`).

*API:*
- `apps/api/src/server.ts` — pass `skillRepo`, `connectorSkillRepo`, `agentCapabilityRepo` into `createApp` deps; register `/api/skills`, `/api/skills/download-all`, `/api/skills/:id/download`, `/api/connectors/:id/skills`, `/api/agent-capabilities` routes.
- `apps/api/tests/test-db.ts` (or wherever the test fixture wires up dependencies) — pass the 3 new repos.

*Dashboard:*
- `apps/dashboard/src/components/console/sidebar.tsx` — ensure `skills` link with `⌘K` shortcut + filled icon (matches Paper artboards). Verify it's already there from a prior spec; add if missing.
- `apps/dashboard/src/routes/_authed/connectors.$id.tsx` — embed `<LinkedSkillsSection connectorId={id} />` (Paper artboard C-skill-1). The existing connector detail page already has section slots; add the new one above tool permissions.
- `apps/dashboard/src/routes/_authed/settings.tsx` — embed `<AgentCapabilitiesSection />` (Paper artboard SET1) as a top-level section above existing `backend`/`mcp servers`/`profile files`.

**Untouched (out of scope):**
- Existing `connector_secrets` rows.
- Existing `commands` table data.
- `agent/mcp.json` (only modified if Phase B gate-zero picks Path B — separate Phase B sub-step decision).
- Connector-permission gate's MCP branch logic (only the non-MCP branch is forked).
- Any existing skills under `profiles/<name>/skills/` (gitignored, operator's responsibility to re-upload manually if desired).

## Phase Ordering

1. **Phase A — Storage layer** (1 commit). End: typecheck + tests green for `@zeno/storage`.
2. **Phase B — Worker runtime**:
   - **B.0** (1 commit): SDK auto-discovery decision documented inline + commit message. No production code change beyond the decision note.
   - **B.1** (1 commit): SkillsMaterializer + watcher integration. Tests green.
   - **B.2** (1 commit): Capabilities-aware gate. Tests green.
   - **B.3** (1 commit): Pre-tool-use hook injection of linked skill bodies. Tests green.
3. **Phase C — API + Dashboard**:
   - **C.1** (1 commit): API endpoints + tests.
   - **C.2** (1 commit): Frontmatter parser + tests.
   - **C.3** (N commits, 1 per Paper artboard, each with 3-clean-reviews per `feedback_screen_review_rule.md`): apps/design twin.
   - **C.4** (N commits): apps/dashboard mirroring. Wired to TanStack Query hooks + API.
4. **Phase D — Verification + delivery**:
   - **D.1**: `pnpm run quality-gate` — all turbo tasks green.
   - **D.2**: Docker boot test (`PROFILE=<example>`).
   - **D.3**: 3-round review by phase (already done per-phase) + final batch review (3 consecutive clean rounds against `git diff main..HEAD`).
   - **D.4**: Push branch + open PR.

Each commit ends in a green typecheck (`pnpm run typecheck`) for the affected workspace. Tests green by end of each sub-phase. Quality gate green by end of Phase D.

## Risks / Open Decisions

| Risk | Decision |
|---|---|
| Claude Agent SDK não auto-descobre `~/.claude/skills/`. Phase B fica em Path B (tools custom). | B.0 gate-zero é a primeira sub-phase — não passa pra B.1 sem a decisão fechada. Path B já tem contrato definido em `[[spec-skills]]` (tools `mcp__zeno__list_skills` + `read_skill`). Se cair em Path B, B.1+ assume esse path consistentemente. |
| `additionalContext` (ou nome equivalente) não existe na SDK do jeito que assumimos. Hook injection (B.3) trava. | B.3 começa com sub-task explícita: ler tipos do `@anthropic-ai/claude-agent-sdk` ou rodar smoke test do hook isolado pra descobrir o shape correto do return. Se o campo não existe, alternativas: retornar mensagem `user` sintética via outro mecanismo (ex: chamada do agent.send antes do tool), OU registrar a skill content como mensagem normal antes da query. Sub-task termina com **decisão documentada inline em `connector-gated-backend.ts`**. |
| Watcher race-condition: edit no dashboard escreve DB + materializa FS, watcher dispara, AgentCore tá no meio de query. | ProfileWatcher já tem debounce 50ms. AgentCore reload é graceful (espera turno terminar antes de pegar nova config). Padrão idêntico ao SOUL.md hoje. |
| Token explosion em turnos com muitos calls do mesmo connector. | Cache do hook é por turn_id + slug → injeta UMA vez por turno por connector, mesmo se a tool do connector é chamada 10 vezes. Per spec Risks. |
| Operator habilita Bash globalmente, esquece, instala skill maliciosa que usa Bash. | Aceitação: threat model é single-operator self-hosted. Banner pink "SHELL ACCESS ENABLED" no settings page (Paper artboard SET1) é o lembrete principal. Per-skill sandbox runtime é Non-Goal de v1. |
| Migration 11 em DB legado: skill table novas + capability seeds com tool list que pode mudar em SDKs futuras. | `INSERT OR IGNORE` para seeds preserva idempotência. Tool nova que aparece num SDK update sem migration: gate denega por default (não está em `agent_capabilities`) → comportamento safe. Operator pode requisitar nova migration pra liberar. |
| Paper-first workflow exige aprovação operador antes de implementação. | Já cumprido — 11 artboards aprovados em `2026-04-28` (S1, S2, S3, C-skill-1, SET1, M-skill-1, M-skill-1b, M-skill-2, M-skill-4, M-skill-5). Phase C.3 só inicia depois desse OK explícito. |
