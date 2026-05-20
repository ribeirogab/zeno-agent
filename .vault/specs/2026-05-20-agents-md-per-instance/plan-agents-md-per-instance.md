---
feature: agents-md-per-instance
spec: "[[spec-agents-md-per-instance]]"
created: 2026-05-20
---
# AGENTS.md Per-Instance Operating Manual — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-profile `USER.md` with `AGENTS.md` as a multi-audience-neutral operating manual loaded deterministically into the cached system prompt via the existing `buildSystemPrompt` mechanism. `SOUL.md` (shared baseline identity) is preserved. Tracks issue [#86](https://github.com/ribeirogab/zeno-agent/issues/86).

**Architecture:** Single-mechanism change — `apps/worker/src/agent/system-prompt.ts` swaps the `userMdContent` parameter for `agentsMdContent`, drops the misleading `# About the user` heading, and renames `user_md_*` log events to `agents_md_*`. Every consumer of `USER.md` across the worker, API, dashboard, CLI, templates, docs, marketing site, repo-root AGENTS.md, agent SOUL.md language line, and constitution gets renamed. SDK auto-load semantics are NOT touched — `settingSources: ['user']` continues to serve only the skills directory. No `CLAUDE.md` symlink is produced; no `USER.md` backward compat survives.

**Tech Stack:** TypeScript (strict mode), Node.js 24 LTS, pnpm workspaces, vitest, biome, zod, `@anthropic-ai/claude-agent-sdk` (preset `claude_code`).

**For this spec:** [[spec-agents-md-per-instance]]

---

## Approach

The mechanism already exists. `buildSystemPrompt(soulMdContent, userMdContent)` reads `USER.md` from `/app/profile/USER.md`, prefixes a misleading `# About the user` heading, and concatenates with SOUL into the cached system prompt that the SDK preset receives via `systemPrompt.append`. The only structural change needed is renaming the file and dropping the framing — every other change in this plan is a downstream rename or label update.

The reframe ("operating manual", not "user bio") is communicated through three surfaces:

1. **Filename.** `USER.md` → `AGENTS.md` in the per-profile directory, the template that scaffolds new profiles, and the WRITABLE_FILES allowlist in the API.
2. **Code symbols.** Function `parseUserMd*` → `parseAgentsMd*`, hook `useUserMd` → `useAgentsMd`, component `UserMdEditor` → `AgentsMdEditor`, log events `user_md_*` → `agents_md_*`.
3. **Docs + constitution.** Repo root `AGENTS.md` line 3, `agent/SOUL.md` language line, `.vault/constitution.md` lines 13/28/47/48/88, `apps/docs/content/docs/*.mdx`, `apps/web/.../how-it-works-section.tsx`.

`SOUL.md` and the agent/profile split established by [[../2026-04-21-agent-profile-split/spec-agent-profile-split|spec 0021]] are NOT renegotiated. The agent/ directory stays read-only, the profile/ directory stays per-instance, and the bind-mount layout in `apps/cli/src/lib/orchestrator/docker.ts` is unchanged.

Migration of the single existing real profile (the maintainer's `fn` profile) is a manual `mv` + content rewrite inside the PR. There is no helper command, no fallback path, no deprecation warning — the codebase has zero production deployments depending on the old name.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/worker/src/agent/system-prompt.ts` | Modify | Replace `userMdContent` parameter with `agentsMdContent`. Drop `# About the user` heading. Drop `NO_USER_NOTE` fallback string. Rename log event constants from `user_md_*` to `agents_md_*`. Update JSDoc. |
| `apps/worker/tests/agent/system-prompt.test.ts` | Modify | Cover both-present, SOUL-missing, AGENTS-missing, both-missing combos. Assert no `# About the user` substring. Assert log events use `agents_md_*` names. |
| `apps/worker/src/index.ts` | Modify | Rename local var `userMd` → `agentsMd`. Swap `loadProfileFile('USER.md')` → `loadProfileFile('AGENTS.md')`. Update log event names. |
| `apps/worker/src/profile/watcher.ts` | Modify | Replace `'USER.md'` watched-file literal with `'AGENTS.md'` in the `classify` function. |
| `apps/worker/tests/profile/watcher.test.ts` | Modify | Fixture and assertion strings: `'USER.md'` → `'AGENTS.md'`. |
| `apps/api/src/routes/settings.ts` | Modify | `TRACKED_FILES` tuple: replace `'USER.md'` with `'AGENTS.md'`. `WRITABLE_FILES` Set: same swap. Update inline comments to reference `AGENTS.md`. |
| `apps/api/src/lib/parse-user-md.ts` | Rename → `parse-agents-md.ts` | Function `parseUserMdName` → `parseAgentsMdName`. JSDoc updated. Imports across the API updated. |
| `apps/api/src/lib/read-session-jsonl.ts` | Modify | Update any string references (likely only a JSDoc or comment). |
| `apps/api/src/server.ts` | Modify | JSDoc comment that mentions `USER.md` updated to `AGENTS.md`. |
| `apps/api/tests/routes/settings.test.ts` | Modify | Test fixture file names + assertions. |
| `apps/cli/src/commands/profile-create.ts` | Modify | Flag description for `--owner` (mentions `USER.md`): rewrite. Display path post-create: `USER.md` → `AGENTS.md`. Editor prompt: `USER.md` → `AGENTS.md`. |
| `apps/cli/src/commands/profile-show.ts` | Modify | The line printing `/app/profile`'s contents lists `USER.md`; replace with `AGENTS.md`. |
| `apps/cli/src/lib/templates.ts` | Modify | `readUserTemplate` → `readAgentsTemplate`. `renderUserMd` → `renderAgentsMd`. `materializeProfile` writes `AGENTS.md` (not `USER.md`). Drop `<your-name>` placeholder substitution (template is static). Keep `<auto-detected-tz>` substitution OUT of the template (static). |
| `apps/cli/src/lib/paths.ts` | Modify | Any `USER.md`-named helper renamed. |
| `apps/dashboard/src/components/settings/user-md-editor.tsx` | Rename → `agents-md-editor.tsx` | Component name `UserMdEditor` → `AgentsMdEditor`. Internal hook import points at the renamed hook file. Visible label "User profile" → "Operating manual" (or equivalent; final copy at implementer's discretion as long as no `USER.md` survives). |
| `apps/dashboard/src/lib/use-user-md.ts` | Rename → `use-agents-md.ts` | Hook name `useUserMd` → `useAgentsMd`. Endpoint URL: `/api/settings/profile-files/AGENTS.md`. |
| `apps/dashboard/src/lib/use-settings.ts` | Modify | Field/property that surfaces `userMd` → `agentsMd`. Endpoint references updated. |
| `apps/dashboard/src/lib/mutations.ts` | Modify | Mutation key / endpoint reference updated. |
| `apps/dashboard/src/routes/_authed/settings.tsx` | Modify | Import of renamed component + hook. UI label. |
| `apps/dashboard/src/routes/_authed/index.tsx` | Modify | Any badge/card text referencing `USER.md`. |
| `apps/dashboard/src/components/layout/dashboard-sidebar.tsx` | Modify | Sidebar item label + route key. |
| `apps/dashboard/src/components/crons/cron-form.tsx` | Modify | Help text or hint referencing `USER.md`. |
| `apps/dashboard/tests/components/sidebar.test.tsx` | Modify | Assertion strings. |
| `templates/profile/USER.md` | Rename → `AGENTS.md` | New static skeleton with section headings (`Operating rules`, `Skills`, `Channel conventions`, `Language defaults`, `What this file is NOT`) and HTML comments illustrating each section. No placeholders (no `<your-name>`, no `<auto-detected-tz>`). |
| `templates/profile/README.md` | Modify | References to `USER.md` → `AGENTS.md`. |
| `apps/docs/content/docs/cli.mdx` | Modify | Replace `USER.md` references with `AGENTS.md`. |
| `apps/docs/content/docs/profile.mdx` | Modify | Same. |
| `apps/docs/content/docs/profiles.mdx` | Modify | Same. |
| `apps/docs/src/generated/cli-flags/profile-create.mdx` | Regenerate | Auto-generated from CLI flag descriptions; regen after CLI task is done. |
| `apps/web/src/sections/how-it-works-section.tsx` | Modify | Landing copy: `USER.md` → `AGENTS.md` or strip the reference entirely if it doesn't add value. |
| `AGENTS.md` (repo root) | Modify | Line 3 reference to per-profile `USER.md` → `AGENTS.md`. (Repo-root `CLAUDE.md` is already a symlink to this file — no separate edit.) |
| `agent/SOUL.md` | Modify | Section "Language and tone": "If `USER.md` specifies a preferred language" → "If `AGENTS.md` specifies a preferred language". No other change. |
| `.vault/constitution.md` | Modify | Five lines: 13 (USER.md path → AGENTS.md), 28 (drop "Zeno is single-user"; reword to "single-operator, multi-audience-capable"), 47 ("USER.md read-only" → "AGENTS.md read-only"), 48 ("multiple people" → "multiple billed operators"), 88 ("who the user is (USER.md)" → "per-instance operating manual (AGENTS.md)"). No other constitution edit. No FN-specific content. |
| `~/.zeno/profiles/fn/USER.md` | Manual rename → `AGENTS.md` | Off-repo. Maintainer-only action inside the PR window. |
| `~/.zeno/profiles/fn/AGENTS.md` | Rewrite content | FN-specific operating manual (see spec section "User Stories / Scenarios" #4 and the FN draft below). Off-repo. |

---

## Phase Ordering

1. **Phase 1 — Worker runtime.** Foundation. Until this lands, the API/dashboard/CLI/templates can rename file paths but the worker still reads `USER.md`. Land worker changes first so the rest of the stack is renaming around a target that already exists.
2. **Phase 2 — API.** Settings route + parser + tests. Depends on Phase 1 only via shared mental model; the API does not import worker code.
3. **Phase 3 — CLI.** Profile scaffold + show command + template loader. Depends on the template rename which is Phase 5; sequence is intentional — CLI is edited first (it still reads the file by name), template is renamed in Phase 5.
4. **Phase 4 — Dashboard.** Hook + component renames + label/route updates. Depends on Phase 2 (API endpoints) being live.
5. **Phase 5 — Templates + docs.** Move `templates/profile/USER.md` → `AGENTS.md` (file rename + content rewrite). Edit public docs (`apps/docs`, `apps/web`). Regen the auto-generated CLI flags mdx.
6. **Phase 6 — Repo + agent identity + constitution.** Repo root `AGENTS.md`, `agent/SOUL.md` language line, `.vault/constitution.md` (5 lines).
7. **Phase 7 — Migration FN profile.** Manual `mv` + content rewrite for `~/.zeno/profiles/fn/`. Off-repo, but inside the PR window so the operator's running instance is consistent with the merged code.
8. **Phase 8 — Verification + ship.** Final `git grep` AC, `pnpm run quality-gate` green, restart FN, smoke-test logs, open PR via `/new-pr`.

Phases 2-6 can be reordered. Phase 1 must come first (worker is the foundation). Phase 7 must come last among the production changes (the FN profile rename can ONLY happen after the worker reads `AGENTS.md`, otherwise the running profile boots with no operating manual). Phase 8 is the gate.

---

## Risks / Open Decisions

| Risk | Mitigation |
|---|---|
| The implementer reads a task in isolation and uses a label like "AGENTS.md (User profile)" that perpetuates the old framing in dashboard copy. | Each dashboard task explicitly forbids "user profile" / "user bio" wording in visible labels. Acceptance criterion: `git grep -i 'user profile' apps/dashboard/src/` returns empty. |
| FN profile `AGENTS.md` rewrite accidentally leaks into the default template via copy-paste. | Phase 5 (template) is sequenced BEFORE Phase 7 (FN). The template task explicitly states "no FN-specific content". The FN task explicitly states "content lives only at `~/.zeno/profiles/fn/AGENTS.md`, never in `templates/profile/`". |
| Implementer edits a `.vault/specs/*` historical spec by mistake when grepping for `USER.md`. | Phase 6's constitution task is the only `.vault/` edit. Phase 8's final grep AC explicitly excludes `.vault/specs/` and `.vault/learnings/`. |
| Container is left running with stale `USER.md` watcher subscription, missing AGENTS.md edits. | Phase 7 ends with `zeno stop fn && zeno start fn`. Phase 8 verifies `agents_md_loaded` log on next boot. |
| One of the dashboard files in the file structure table is actually a transitive reference (e.g. `cron-form.tsx` only mentions `USER.md` in a comment) and a task spends time on a no-op. | Each Phase-4 task starts with `git grep -n 'USER\.md' <file>` to confirm the hit before editing. |

**No open decisions.** Spec is locked. Approach is locked. Tasks file decomposes phases into concrete steps.

---

## Default `templates/profile/AGENTS.md` (final content to write in Phase 5)

```markdown
# Agent Operating Manual

This file is the operating manual for this Zeno instance. SOUL.md
(loaded before this file in the system prompt) defines what Zeno is
across all profiles — mission, connectors, skill mechanics, safety
rules. This file defines what Zeno does **here**: which rules apply,
which skills to invoke, which channel conventions matter.

Zeno reads this file at boot and on every turn (it is part of the
cached system prompt).

## Operating rules

<!-- Inviolable rules for this instance. One per bullet. Apply on
every turn. Remove these example bullets before going live:
- Identify the interlocutor via the [slack_context] block before
  composing any reply.
- Always reply in the language of the incoming message.
- Never name a specific person when recommending escalation. -->

## Skills

<!-- Which installed skills to invoke, and when. One line per skill.
Remove this example before going live:
- `<skill-name>` — short description of when to invoke. -->

## Channel conventions

<!-- Per-channel notes if any. Default: free-form interaction.
Remove this example before going live:
- `<channel-id>` (channel name) — default_skill: `<skill>`. -->

## Language defaults

<!-- Default language posture. Remove this example before going live:
- Mirror the sender's language; fall back to English if ambiguous. -->

## What this file is NOT

- Not a user bio (Zeno can serve multiple people on the same channel).
- Not credentials (those live in `.env`).
- Not runtime config (ports, paths, log levels also in `.env`).
```

---

## FN profile `AGENTS.md` (final content to write in Phase 7, operator review on PR)

```markdown
# Agent Operating Manual

Zeno atende várias pessoas no Slack: diretor, comercial, marketing,
expedição, devs. Cada interação chega como uma mensagem do canal
Slack, e cada pessoa precisa de tom e autorização diferentes.

## Operating rules

- **Toda mensagem no Slack: invocar `fn-conduct` ANTES de compor a
  reply.** Inclui DMs, mentions, threads, perguntas que parecem
  técnicas. Sem exceção. A skill decide tier (dev / não-dev) e a
  autorização para agir.
- **Nunca nomear um desenvolvedor específico** ao recomendar
  escalação. O operador humano decide quem envolver.
- **Não implementar para um não-dev** sem confirmar intent na
  linguagem do produto primeiro.
- **Identificar o interlocutor via `[slack_context]`** antes de
  qualquer reply.

## Skills

- `fn-conduct` — política comportamental. Obrigatória em toda
  interação Slack (regra 1 acima). Decide vocabulário, profundidade
  de discovery, scope gate, e post-PR handoff.
- `fn-code-review` — auto-trigger no canal de code-review. Não
  invocar manualmente.
- `fn-sentry-fix` — auto-trigger no canal de bugs-sentry. Não
  invocar manualmente.

## Channel conventions

- Canal `code-review` → `fn-code-review` owns the reply.
- Canal `bugs-sentry` → `fn-sentry-fix` owns the reply.
- Outros canais e DMs → `fn-conduct` governa diretamente.

## Language defaults

Brazilian Portuguese por padrão. Trocar apenas se o usuário escrever
em outro idioma.
```

---

## Verification (Phase 8)

The final acceptance check is one command:

```bash
git grep -E 'USER\.md|user-md|use-user-md|UserMd|parse-user-md|user_md_' apps/ packages/ templates/ agent/ AGENTS.md CLAUDE.md
```

Expected output: empty (zero matches).

Followed by:

```bash
pnpm run quality-gate
```

Expected: green.

Followed by the operator-only smoke test (see spec "Manual verification" section).
