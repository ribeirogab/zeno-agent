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

Spec 0049 retired skills as a runtime concept and locked in the thesis "everything is a connector". Specs 0050 + 0051 deleted the old infrastructure (skill-registry, runtime loader, per-skill credentials, approvals chain). Spec 0049 itself left an opening: *"skills come back later, possibly via connector"*.

**Note on divergence from the constitution:** `context/constitution.md` line 21 says "Skills (deferred) — may be bundled with connectors". This spec implements skills as **independent entities** with an **optional** link to connectors (M:N), not as sub-objects of connectors. The constitution's intuition is preserved (skills *can* be linked to connectors via spec 0052), but the structure is more flexible (the `frontend-design` skill has nothing to do with a specific connector). Decision made during the brainstorm phase of this spec.

This spec reintroduces skills as **markdown playbooks** the agent reads when relevant — not as executable code, not as subagents, not with an approval chain. A skill is a `SKILL.md` file with minimal frontmatter (`name`, `description`) + a markdown body explaining *how* to do something (review frontend, debug AWS, triage Sentry).

The difference from the old regime:

- Old skills were **discovered from the profile filesystem** (`profiles/<name>/skills/`), with a shell-script bootstrap at the entrypoint.
- New skills are **CRUD'd in the dashboard**, stored in the DB, materialized into `~/.claude/skills/` at boot/hot-reload, and discovered natively by the Claude Agent SDK. No shell bootstrap.

The relationship with connectors also changes:

- Old skills *could* have their own credentials (anti-pattern documented in [[../../learnings/skill-scoped-credentials-pattern]] — superseded).
- New skills are **pure content** — credentials live on connectors. The skill describes *how to use* a connector or *how to perform a task*, not *how to authenticate*. Skills can optionally be **linked** to connectors: when the agent calls a tool from that connector, the body of the linked skill is injected into the context before the tool runs.

**Capability authorization is global, not per-skill.** Spec 0050 hardblocks non-MCP tools (Read/Edit/Write/Bash). The operator explicitly enables which capabilities the agent can use via an `Agent capabilities` section in `/settings`. Skills freely use whatever is enabled. Enabling a capability is a one-time operator decision, not something each skill requests separately. *Mental model: capabilities are a property of the agent; skills are content that takes advantage of what the agent can already do.*

## Problem Statement

Post specs 0049-0051, the operator has connectors (capabilities + credentials) and SOUL.md (general instructions). What is missing is a place for **contextual knowledge** — playbooks that say "when you do X, do it like this". Without skills, that knowledge either fits entirely into SOUL.md (bloating the context window every turn) or is lost (the operator repeats the same instructions on Slack).

Five concrete gaps:

1. There is no way to register a reusable playbook without editing files in the profile.
2. There is no way to give the agent Read/Edit/Write/Bash in a controlled way — the spec 0050 gate hardblocks everything non-MCP, so skills like `frontend-design` (which needs to edit files) would be impossible today.
3. There is no way for the agent to "learn" how the specific operator uses a connector. The Acme `sentry-flow` skill is different from operator X's.
4. There is no way to export/download the operator's skill set (backup, share, migrate).
5. There is no functional replacement for the "knowledge file" pattern that skills represented pre-spec-0050.

## Non-Goals

- **Out of scope: automatic installation of skills.sh.** v1 only accepts upload of a single `SKILL.md` file via the dashboard. Importing skills.sh + auto-update is left for v2 (today the operator can manually download the `.md` from skills.sh and upload it).
- **Out of scope: file tree per skill.** In v1 each skill is a single `SKILL.md`. Multi-file + assets is left for v2.
- **Out of scope: "always_loaded" skills.** Originally a requirement, cut from v1 — all skills in v1 are pick-mode (lazy-load). The operator writes a good `description` and the agent decides when to read it. Reintroducing it as a flag for prepending to the system prompt is left for v2 if there is demand.
- **Out of scope: pause skill (toggle enabled/disabled).** In v1 the lifecycle is install / edit / delete. Pausing without deleting is left for v2.
- **Out of scope: per-skill permission scoping.** In v1 capabilities are global — any installed skill can use any capability enabled in settings. Per-skill sandbox (skill A has Bash, skill B does not) is left for v2 if it becomes a security issue. Threat model is single-operator self-hosted; the operator is the gatekeeper.
- **Out of scope: re-importing old skills from the `<example>` profile.** The `<example>` profile had skills on the FS before spec 0050. We will not backfill them into the DB automatically — the operator manually uploads any they still want.
- **Out of scope: skill versioning, share/publish, ratings.** v1 is single-operator self-hosted. No social features.
- **Out of scope: parsing `allowed-tools` from the frontmatter of skills downloaded from skills.sh.** If the `.md` ships that field, we IGNORE it at runtime (we only validate `name` + `description`). We may optionally display it as an informational hint in the install modal — see Open Questions. The operator's decision still happens in `/settings/agent-capabilities`, not at install time.

## Constraints

- **Compile must stay green at every phase commit.** Phase A (DB + storage), Phase B (worker hot-reload + permission gate), Phase C (API + dashboard + Paper screens). Each commit ends with `pnpm run quality-gate` green.
- **Spec 0050 contract preserved + extended.** The only guardrail remains the `connector-permission` gate. The modification this spec introduces is a **new lookup at the gate**: non-MCP tools, instead of denying outright, consult `AgentCapabilityRepo.isEnabled(toolName)`. If enabled → ALLOW. If disabled → DENY. There is no new policy chain, no owner approval flow, no union of scopes per skill.
- **Paper-first workflow.** All screens (Skills list, Skill detail, Install modal, sections in the Connector page, Agent capabilities settings section) must be designed in the Paper file specified by the operator and **approved by the operator** before implementation begins. Direct implementation in `apps/dashboard`. The 3-clean-reviews rule applies.
- **Auto-discovery via `~/.claude/skills/` — verification is the first task of Phase B (gate-zero).** Before any other runtime work, empirically validate whether the Claude Agent SDK (not just the CLI) auto-discovers `SKILL.md` in `~/.claude/skills/<name>/`. How to verify: create a test SKILL.md with `description: "test skill, ignore"`, run a query whose prompt does NOT mention the skill, observe whether the agent lists the skill as a "known tool/skill" in context OR whether it appears in `tool_search`/listings naturally. Decision:
  - **Auto-discovery confirmed**: skills materialize at `${claudeHome}/skills/<name>/SKILL.md`, no custom MCP tool. Phase B proceeds normally.
  - **Auto-discovery does NOT work**: activate **plan B** — Zeno exposes two built-in tools via `agent/mcp.json` with a fixed contract:
    - `mcp__zeno__list_skills() → Array<{name: string, description: string}>` — lists available skills (reads from the DB).
    - `mcp__zeno__read_skill(name: string) → {body: string}` — returns the full markdown body of the skill.
  - The decision is **binary and made in the first commit of Phase B**, not mid-way through.
- **Constitution principles:** YAGNI (no per-skill scoping, no skills.sh in v1, no always_loaded), Reversibility (independent commits per phase), Single source of truth (the DB writes; the FS is derived).

## User Stories / Scenarios

1. **The operator uploads a new skill.** In the dashboard, opens `/skills`, clicks `+ Install skill`, uploads the `frontend-design.md` file. The modal parses the frontmatter (`name` + `description`) and shows a preview: *"Name: frontend-design — Description: UX standard and code review for React/Tailwind."*. The operator clicks Install → the skill is written to the DB, materialized at `~/.claude/skills/frontend-design/SKILL.md`, ProfileWatcher detects it, AgentCore reloads, the next agent query already sees it.

2. **The operator enables capabilities globally.** Goes to `/settings`, in the "Agent capabilities" section turns on `Read`, `Edit`, `Write`, `Bash`. Save → the DB is updated, the gate hot-reloads, the agent now has those tools available on any turn (regardless of skill). Single decision once.

3. **The operator links a skill to a connector.** Goes to `/connectors/<sentry-id>`, in the "Linked skills" section opens a multi-select, marks `sentry-flow`, saves. Next time the agent calls any `mcp__sentry__*`, before the tool runs the pre-tool-use hook injects the body of `sentry-flow` as context for the turn.

4. **The agent decides to use a skill.** On the turn where the operator asks "review this frontend PR", the agent sees `frontend-design` in the list of available skills (auto-discovered via `~/.claude/skills/`), reads the body, follows the playbook, runs `Read` + `Edit` (those tools are enabled in settings), and replies with the review.

5. **The operator edits the skill body.** At `/skills/<id>`, clicks `Edit`, adjusts the markdown, saves. No re-approve ritual — the body is just content, capabilities still live in `/settings`. The DB is updated, the FS regenerates, hot-reload.

6. **The operator deletes a skill.** In the list, clicks delete, confirms with type-to-confirm. The skill is removed from the DB, the `connector_skills` link cascade-deletes, the FS is cleaned up, hot-reload. Global capabilities are not touched (they are independent of skills).

7. **The operator exports skills.** A `Download all` button on the skills list downloads a zip with `<name>/SKILL.md` for each skill. A `Download` button on the skill detail page downloads the individual `.md`. Frontmatter preserved.

8. **A non-MCP tool is denied because the capability is not enabled.** The agent tries `Bash("ls")`. `AgentCapabilityRepo.isEnabled('Bash')` returns `false`. The gate denies. The operator gets an explanation in the log: *"tool 'Bash' denied — capability not enabled in /settings/agent-capabilities"*.

## Success Criteria

**Phase A — DB + storage layer:**
- [ ] Migration adds tables `skills`, `connector_skills`, `agent_capabilities`.
  - `skills(id, name UNIQUE, description, body, created_at, updated_at)` — no `allowed_tools`.
  - `connector_skills(connector_id, skill_id, PRIMARY KEY(both), ON DELETE CASCADE)`.
  - `agent_capabilities(tool_name PRIMARY KEY, enabled BOOLEAN DEFAULT 0, updated_at)` — seeded with a row for each known non-MCP tool (`Read`, `Edit`, `Write`, `Bash`, `WebFetch`, `Task`, etc.), all `enabled=0` by default. The exact tool list comes out of Phase B gate-zero (verified against the Claude Agent SDK).
- [ ] Repos `SkillRepo`, `ConnectorSkillRepo`, `AgentCapabilityRepo` in `@zeno/storage` with CRUD.
- [ ] Unit tests for all repos.

**Phase B — worker runtime:**
- [ ] At worker boot, `SkillRepo.list()` materializes each skill at `${claudeHome}/skills/<name>/SKILL.md` (frontmatter `name`+`description` + body recombined).
- [ ] `ProfileWatcher` gains a `'skills'` bucket: edits/creations/deletes under `${claudeHome}/skills/**` fire `onSkillsChanged` → AgentCore reload (same pattern as SOUL.md).
- [ ] Pre-tool-use hook (`ConnectorGatedBackend`) is updated:
  - **Non-MCP tools**: instead of denying outright, check `AgentCapabilityRepo.isEnabled(toolName)`. If enabled → ALLOW. If disabled → DENY (preserves spec 0050). There is no per-skill check — capabilities are global.
  - **MCP tools of a connector with linked skills**: existing logic from spec 0050 unchanged (per-tool permission). PLUS: the hook returns an `additionalContext` (or equivalent — exact field to be confirmed against the SDK at implementation time) carrying the bodies of the linked skills, which the SDK injects as a **synthetic `user` message prepended to the next turn** before the tool runs. Cache: bodies of skills linked to a connector are injected **once per turn per connector**, not per tool call (cache key: `turn_id + connector_slug`).
- [ ] **Phase B gate-zero (first commit): auto-discovery validation.** See Constraints. Binary decision resulting in "Path A: SDK auto-discovers" OR "Path B: custom MCP tools in `agent/mcp.json`". Document the result in the commit message + an inline note in `apps/worker/src/agent/mcp-build.ts`. Subsequent Phase B criteria assume the chosen path.
- [ ] Tests:
  - Hot-reload integration test (create a skill in the DB → FS materializes → watcher detects → reload fired).
  - Permission gate test: capability enabled in settings → non-MCP tool ALLOW; capability disabled → DENY.
  - Connector-skill injection test: tool `mcp__sentry__list_issues` called → the body of `sentry-flow` (linked to Sentry) is included in the hook input.

**Phase C — API + dashboard:**
- [ ] API endpoints (skills): `GET /api/skills`, `GET /api/skills/:id`, `POST /api/skills` (upload), `PATCH /api/skills/:id` (edit body — no re-approve), `DELETE /api/skills/:id`, `GET /api/skills/:id/download`, `GET /api/skills/download-all`.
- [ ] API endpoints for the M:N link: `PATCH /api/connectors/:id/skills` (replace whole list), `GET /api/connectors/:id/skills` (read).
- [ ] API endpoints (capabilities): `GET /api/agent-capabilities` (lists all with status), `PATCH /api/agent-capabilities` (toggle individually or in batch).
- [ ] Frontmatter parser: validates `name` (required, unique) + `description` (required). Rejects upload with a clear error if invalid. Does **not** validate `allowed_tools` (field ignored at runtime; may be displayed as an informational hint if present — see Open Questions).
- [ ] Dashboard pages:
  - `/skills` — list with columns SKILL · LINKED · UPDATED (no ALLOWED TOOLS), buttons `+ Install`, `Download all`.
  - `/skills/:id` — detail with the markdown body rendered fullwidth, linked connectors (read-only), buttons `Edit`, `Download`, `Delete`.
  - Install modal: file picker → frontmatter preview (`name`, `description`) → confirm. No "Permission Request" section — capabilities are global.
  - Edit modal: textarea with the current body (markdown), save. No re-approve.
  - Delete modal: type-to-confirm with the skill name. Cascade preview lists: skill row + FS file + connector_skills links (no mention of gate scope, which does not change).
  - `/connectors/:id` — new "Linked skills" section with multi-select.
  - **`/settings` — new "Agent capabilities" section.** Lists non-MCP tools with an on/off toggle each. Default OFF. Shows a visual warning for sensitive tools (`Bash`, `Write`).
- [ ] Paper artboards approved by the operator before implementation begins.
- [ ] `apps/design` implemented first with 3-clean-reviews; `apps/dashboard` mirrors.

**Phase D — Quality gate + Docker boot + reviews:**
- [ ] `pnpm run quality-gate` green (lint + typecheck + tests across all workspaces).
- [ ] Docker boot (`PROFILE=<example> pnpm run docker:up`) clean: log `skills_loaded count=N` appears, `agent_capabilities_loaded enabled=[...]` appears, no errors.
- [ ] E2E via Slack: the operator asks "use skill X to do Y" → the agent loads the skill body (mechanism per the path A/B chosen in Phase B gate-zero — native auto-discovery OR custom `read_skill` tool), executes the task with globally enabled tools, replies without permission errors.
- [ ] **3-rounds clean review per phase + final batch review.** Each phase ends with 3 consecutive reviews with no findings (any finding resets the counter). After Phase D, 3 more reviews on the complete batch. Same cadence applied in specs 0049-0051 — checks completeness vs spec, dead code, stale comments, scope discipline, runtime bugs.

**Net diff target:** pure additions (new feature). Estimate ~1300–2000 new lines — a **smaller** estimate than the previous version of the spec because the per-skill `allowed_tools` flow was dropped (no union scope, no re-approve modal, no allowed_tools schema/validation/JSON column).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The Claude Agent SDK does not auto-discover `~/.claude/skills/` when running via SDK (vs CLI). The implementation runs into a dead end. | Documented fallback: `mcp__zeno__list_skills` + `mcp__zeno__read_skill` tools in `agent/mcp.json`. Validate **at the start** of Phase B before committing to auto-discovery. |
| The operator enables `Bash` globally once and forgets — a malicious skill (future, via skills.sh) gains Bash without a recent warning. | (1) v1 only accepts manual upload (the operator chose the `.md`). (2) The settings page lists enabled capabilities prominently, and the agent capabilities section can have a banner *"Bash is enabled — agent can run shell commands. Disable if you don't trust a recently installed skill."* (3) Threat model is single-operator self-hosted; the operator is the gatekeeper. Per-skill sandbox runtime is a Non-Goal of v1. |
| The pre-tool-use hook injecting bodies of linked skills 5x's tokens in turns with many tool calls of the same connector. | (1) Inject **once per turn per connector** (cache in the hook context), not per tool call. (2) If a skill is large (>2k tokens), consider truncating with a "skill body truncated, read full via..." notice — defer to v2 if it becomes an issue. |
| Hot-reload with FS materialization can race-condition: an edit in the dashboard writes the DB, materializes the FS, the watcher fires, but AgentCore is mid-query. | Same pattern as SOUL.md today. AgentCore reload is graceful — finishes the current query before picking up the new config. ProfileWatcher already debounces 50ms (per `apps/worker/tests/profile/watcher.test.ts`). |
| The operator has 50+ installed skills, all in `~/.claude/skills/`, and the SDK auto-discovery injects context for all of them every turn. Token explosion. | Verify the SDK's actual behavior in Phase B gate-zero. If the SDK injects everything, activate Path B (custom `list_skills` + `read_skill` tools) — operates lazily by design. **Do not introduce an `always_loaded` or `active` flag in the DB to work around it** — that path is a Non-Goal of v1 (decision from the brainstorm phase). Path B already solves it. |
| The migration that adds `skills` + `connector_skills` + `agent_capabilities` to a legacy DB needs to be idempotent. | `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `INSERT OR IGNORE` for the seed of the capability rows. Pattern already in use across all of the project's migrations. |
| The operator had skills in the old `<example>/skills/` profile that were removed in spec 0050. May not have a backup. | Spec 0050 did not delete the physical files in the operator's profile directory (they were gitignored). The operator can re-upload manually. If they no longer have them, that is a trade-off of the cleanup arc — a re-import flow may land in v2 if relevant. |
| The list of non-MCP tools that `agent_capabilities` will seed may go out of sync with what the Claude Agent SDK actually exposes (future versions add new tools). | The list is finite and stable-enough in 2026 (Read/Edit/Write/Bash/WebFetch/Task/Glob/Grep/etc.). Phase B gate-zero confirms the exact list. A new tool that appears later without a migration: the gate denies by default (it is not in `agent_capabilities`), safe-by-default behavior. The operator can request a new migration to enable it. |

## Open Questions

[NEEDS VERIFICATION DURING IMPLEMENTATION]: Does the Claude Agent SDK auto-discover `~/.claude/skills/`? Confirm before committing to lazy-load via auto-discovery vs custom tools. Plan B (custom tools) is documented in Phase B.

[NEEDS DESIGN DURING PAPER PHASE]: exact layout of the `/skills`, `/skills/:id` screens, and the `Agent capabilities` section in `/settings`. The spec defines the content (fields, actions), but the visual layout comes from Paper. Iterate with the operator.

[NEEDS DECISION DURING PAPER REVIEW]: should the install modal show the skill's frontmatter `allowed-tools` (if it comes from a skills.sh export) as an informational hint? Pros: contextualizes the operator on which capabilities the skill author suggests turning on globally. Cons: may confuse ("approving" those tools? no, just info). Decide together with the modal v2 in Paper.

**Resolved (default lock-in):** name conflict behavior on upload. `POST /api/skills` rejects with `409 Conflict` when the frontmatter `name` already exists in the `skills` table. The dashboard shows the error: *"Skill `<name>` already exists. Open the detail page and click Edit to update."* No "overwrite via upload" flow in v1 — the operator is forced to use Edit. The operator can change this decision before the plan if they want an alternative flow.

**Resolved (during brainstorm v2):** Per-skill `allowed_tools` in the frontmatter was REMOVED from the design. Capabilities are now global (settings page). Skills can have `allowed_tools` in the `.md` but it is ignored at runtime — optionally displayed as a hint in the install modal. It is left out of the v1 contract.
