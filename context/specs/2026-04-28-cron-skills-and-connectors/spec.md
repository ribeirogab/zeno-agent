---
status: draft
feature: cron-skills-and-connectors
created: 2026-04-28
shipped: null
---
# Cron ↔ Skills and Connectors — Spec

**Status:** Draft
**Scope:** Add two M:N relationships — `cron_skills` and `cron_connectors` — so the operator can declare, at scheduling time, which skills + connectors a given cron run should use. Linked skills are force-injected into the cron's context; linked connectors appear in the system prompt as a hint while the existing connector-permission gate stays the single guardrail.

## Context

Cron runs today are plain prompts: the operator writes a sentence, the cron runner fires it on schedule via `backend.query()`. The agent then auto-discovers skills (via SDK description match) and uses any connector permitted by the gate. Two pain points emerged once spec 0052 + 0053 shipped skills as a managed concept:

1. **Skill auto-discovery is probabilistic in a headless setting.** A cron prompt is short, written once, never edited contextually — the SDK's intent matcher has weak signal compared to a fresh interactive Slack message. Operators want determinism: "every time this cron fires, use *this* playbook."

2. **There's no way to declare connector scope.** A cron meant for Linear can drift into Sentry or Slack just because the agent improvised. The operator has no place in the cron config to say "this run only touches these connectors."

This spec adds the two M:N tables + the runtime behavior that makes the links *actually do something* without fragmenting the connector-permission gate that spec 0050 made canonical.

## Problem Statement

The operator needs three things at scheduling time:

1. **Force-inject linked skills.** When a cron with linked skills fires, the skill body must reach the agent's context unconditionally — even on a cron that never calls a tool (e.g. "summarize my unread emails" might answer from prior context with zero tool calls). Spec 0052's `PreToolUse` hook injection fires only on tool calls and is therefore insufficient for cron force-injection.

2. **Hint-mode connectors with audit.** The connector-permission gate is the single guardrail (spec 0050). Adding a cron-scoped restrict mode would create a second allow-list and fragment the enforcement story. Instead: linked connectors are surfaced in the cron's prepended context as a preferred set; if the cron uses an unlinked connector that the gate happens to permit, audit-log it but allow it.

3. **Operator-side ergonomics.** A cron detail page where the operator can pick skills + connectors using the same picker pattern spec 0052 introduced for connector-skill linking.

## Non-Goals

- **No second guardrail.** The connector-permission gate from spec 0050 stays the single source of `allow|deny`. Cron-connector links influence the system prompt + audit log, not the gate's decision.
- **Not changing the cron data model otherwise.** No new fields on `crons`; the new relationships live in dedicated M:N tables.
- **Not changing connector-skill linking semantics.** Spec 0052's `connector_skills` continues to inject via `PreToolUse.additionalContext` for *interactive* turns. Cron force-injection is a separate path because the cron has no user message to anchor a tool call to.
- **No "always-loaded" skill concept.** Force-injection is per-cron, not global.
- **No re-architecting the cron runner.** The injection happens at the runner's existing `backend.query()` call site by mutating `userMessage`.
- **No change to the channel-adapter delivery path.** `notify_conversation_id` continues to route output via `channel.send()` (the channel adapter), which sidesteps the gate. Operators only need to link Slack-as-connector if the cron prompt itself uses `mcp__slack__*` tools.

## Constraints

- **Single guardrail (spec 0050).** The connector-permission gate is the only authority on `allow|deny`. Cron-connector links MUST NOT introduce a second decision path.
- **Empty-links = full capability.** A cron with zero linked connectors continues to use whatever the gate permits. Migration default for existing crons: empty links → no behavior change.
- **Force-inject must be unconditional.** Cron-linked skills enter the context regardless of whether the run fires any tool, because the cron may answer from training/SDK context alone.
- **Single backend interface.** `AgentBackend.query()` contract must NOT change. `MockBackend` test surface stays compatible. Injection happens before `query()` is called by mutating the `userMessage` argument.
- **Reuse spec 0052 patterns.** Repos, API routes, dashboard pickers mirror `connector_skills` / `LinkedSkillsSection` / `link-skill-picker-modal`.
- **Don't double-inject.** A skill linked to BOTH a cron AND a connector must NOT be injected twice in the same run. Mechanism: the runner cannot construct the SDK-assigned `sessionKey` ahead of `query()`, so it carries the pre-injected skill ids + audit context as **per-call state via `AsyncLocalStorage`** (Node 18+ stable API). `ConnectorGatedBackend` exposes `runInCronContext(opts, fn)` which sets up the ALS scope; the runner wraps `backend.query(...)` in this scope. The PreToolUse hook reads from ALS via `getStore()` and (a) populates `injectedSkillsCache` with `${sessionKey}:skill:${skillId}` keys for the pre-injected ids, and (b) emits `cron_used_unlinked_connector` when the slug is not in the audit context's `linkedSlugs` set. **Why ALS instead of instance fields (revised during implementation):** the cron MCP tool `cron_run_now` is fire-and-forget (`void runner.runOnce(...)` in `apps/worker/src/cron/tools.ts:189`); while a tick is mid-execute on cron A, a chat-side `cron_run_now(B)` runs cron B concurrently on the same backend instance. Instance-field state would race; ALS scopes per await chain. Wiring also uses a lazy hook ref so the hook is bound to the OUTER wrapper instance the runner calls (not a throwaway used to obtain the hook).
- **Bound the injected-skill bytes.** Cap total skill content per cron run at ~20 KB to avoid context bloat on chatty crons. Truncate + log `cron_skill_truncated` when exceeded.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Cron-skill semantics | **Force-inject** (no auto-discovery, no hint) | Crons are scheduled + headless; operator linkage = "this playbook always applies" contract. Auto-discovery has weak signal in this setting. |
| Cron-connector semantics | **Hint mode + audit log** | Spec 0050's "single guardrail" canon (connector-permission gate) remains the sole `allow|deny` authority. Restrict mode would fragment enforcement; doc-only wastes the table. Hint surfaces operator intent + visibility. |
| Skill injection mechanism | **Prepend `[zeno_context]` block to `userMessage`** | Mirrors `wrapWithSlackContext` (`core.ts:144-179`), preserves prompt-cache validity (a cron that re-runs identical context hits cache), zero `AgentBackend.query()` API change, deterministic delivery even when cron makes zero tool calls. |
| Block delimiter | `[zeno_context]...[/zeno_context]` (sentinel-style, NOT Markdown headers) | A cron prompt may start with `# Daily standup`; prepending `# Linked skills` would collide. Sentinel matches existing `[slack_context]` precedent. |
| Block contents | Linked skill bodies + linked connector slugs in one block | Single coherent context preamble; agent reads once at turn start. |
| Empty-link semantics | Empty cron_skills → no injection. Empty cron_connectors → no hint, gate behaves normally (full back-compat for existing crons) | Migration must not break existing crons. Zero links = today's behavior. |
| Anti-double-inject | The runner cannot construct the `sessionKey` cache key directly because `session_id` is SDK-assigned and only surfaces inside the `PreToolUse` hook. **Mechanism (revised during implementation, R2 finding):** (1) `ConnectorGatedBackend` exposes `runInCronContext(opts, fn)` which sets up an `AsyncLocalStorage` scope carrying `{ skillIds, audit?: { runId, linkedSlugs } }`. (2) Runner wraps `backend.query(...)` in this scope before calling. (3) On EVERY hook invocation, the gate calls `cronAls.getStore()` to read the per-call state; idempotently writes `${sessionKey}:skill:${skillId}` into `injectedSkillsCache` for each pre-injected id. (4) Inside `getInjectionContext`, BEFORE building the body, iterate `connectorSkillRepo.listForConnector(connector.id)` and check `injectedSkillsCache.has(\`${sessionKey}:skill:${skill.id}\`)`; if all linked skills for that connector are already cached, return null; if some are cached, build the body with only the non-cached ones. (5) Wiring uses a lazy hook ref pattern — the hook is bound to the OUTER wrapper (the one the runner calls), not a throwaway used to satisfy the inner ↔ wrapper circular dep. | ALS scopes per await chain, so concurrent cron firings (e.g. tick on cron A + chat-side `cron_run_now(B)`) do NOT race the dedup state. Replaces the original "instance-field + serial-tick" design which would have been racy because `cron_run_now` is fire-and-forget (`void runner.runOnce(...)`). |
| Bytes cap | Cron force-injection truncates to ~20 KB total skill bodies; emit `cron_skill_truncated` log | Prevents context bloat on chatty crons; surfaces the truncation so operators notice. |
| Telemetry | Two new structured logs: `cron_skill_injected {cronId, runId, skills:[...names], totalBytes}` and `cron_used_unlinked_connector {cronId, runId, connectorSlug, toolName}` | Force-injection bypasses the existing `skill_injected` event from `ConnectorGatedBackend`; need an explicit cron-side log. The unlinked-connector audit makes hint mode visible. |
| API shape | `/api/crons/:id/skills` (GET/PATCH) + `/api/crons/:id/connectors` (GET/PATCH); same payload shape as spec 0052's `/api/connectors/:id/skills` | Direct mirror of an existing pattern; minimum cognitive cost. |
| Dashboard placement | Cron detail page gains "Linked skills" + "Linked connectors" sections + pickers (multi-select with linked/unlinked split) | Same component pattern as `LinkedSkillsSection` from spec 0052. |
| Migration | Migration 16: `cron_skills` table; Migration 17: `cron_connectors` table; both M:N with FK CASCADE on cron + skill/connector delete | Two separate migrations match the per-relation pattern of spec 0052 (skills + connector_skills + agent_capabilities each got its own concern). |

## User Stories / Scenarios

### S1 — Operator links skill to a daily-standup cron

1. Operator goes to `/crons/<id>` for a cron `daily-standup` whose prompt is "post a Slack standup summary at 9am".
2. Page shows "Linked skills" section with a "+ link skill" button (zero linked initially).
3. Operator clicks → picker opens with all installed skills (zeno_default, profile, dashboard sources). Picks `fn-standup-flow`. Saves.
4. PATCH `/api/crons/<id>/skills` with `{skillIds: [...]}` succeeds. Detail re-renders with the linked skill row + "remove" button.
5. Next 9am tick → cron fires → runner reads `cron_skills.list_for_cron(id)` → prepends `[zeno_context]\nlinked_skills:\n## fn-standup-flow\n<body>\n[/zeno_context]\n\n<original prompt>` to `userMessage` → calls `backend.query()`. Agent executes the playbook deterministically.
6. Worker logs: `{ event: "cron_skill_injected", cronId: ..., runId: ..., skills: ["fn-standup-flow"], totalBytes: 1842 }`.

### S2 — Operator links connector hint to a Linear-only cron

1. Operator on `/crons/<id>` for cron `weekly-sprint-review` adds linked connector `linear` via picker. No other connectors linked.
2. Next tick → runner appends `linked_connectors: linear` to the same `[zeno_context]` block.
3. Cron run uses `mcp__linear__list_issues` and answers. No audit log fired.
4. (Sanity) cron prompt mentions GitHub by mistake; agent calls `mcp__github__get_pull_request` (gate allows because GitHub connector is `always_allow` for `get_pull_request`). Worker logs: `{ event: "cron_used_unlinked_connector", cronId: ..., runId: ..., connectorSlug: "github", toolName: "get_pull_request" }`. Cron run row shows a "1 unlinked use" badge in dashboard.

### S3 — Cron with no linked connectors keeps current behavior

1. Operator runs the schema migration on a DB with 12 existing crons (zero links).
2. Migration creates `cron_skills` + `cron_connectors` tables; existing crons have empty link sets.
3. Next tick → runner sees no skills / no connector hints → `userMessage` unchanged → cron behavior identical to pre-spec.

### S4 — Skill linked to both a connector AND a cron (anti-double-inject)

1. Skill `fn-code-review` is linked to connector `github-app-fnlivros` (spec 0052) AND to cron `nightly-pr-sweep` (spec 0054).
2. Cron fires → runner wraps `backend.query()` in `backend.runInCronContext({ skillIds: ["fn-code-review-uuid"], audit: {...} }, () => backend.query(input))`. The wrapper stores the call state in AsyncLocalStorage for the duration of the inner `query()`.
3. Runner builds the `[zeno_context]` block + prepends to `userMessage`, then calls `backend.query()`.
4. Cron prompt makes the agent call `mcp__github-app-fnlivros__list_pull_requests`.
5. Spec 0052 `PreToolUse` hook fires. The hook (a) populates `injectedSkillsCache.set(\`${sessionKey}:skill:fn-code-review-uuid\`, true)` from the pending list, then (b) inside `getInjectionContext` iterates `connectorSkillRepo.listForConnector(connector.id)` and for each skill checks `injectedSkillsCache.has(\`${sessionKey}:skill:${skill.id}\`)`. Since `fn-code-review` is already cached, no body is built — the hook returns null. No double-injection.
6. **Partial dedup variant.** If the connector had two linked skills `[fn-code-review, sentry-flow]` and only `fn-code-review` was pre-injected by the cron, `getInjectionContext` builds the `additionalContext` body with ONLY the non-cached skill (`sentry-flow`). `fn-code-review` is never duplicated.
7. `backend.query()` returns; the ALS scope unwinds automatically. Next cron tick starts from a clean slate.

### S5 — Cron run produces visible audit summary in dashboard

1. Cron `nightly-multi-connector-cron` has linked connectors `[linear]`. Cron prompt drives the agent to call tools from both Linear AND GitHub during the run.
2. Worker emits `cron_used_unlinked_connector` once per `(runId, connector_slug, tool_name)` the cron used outside the link list. The events surface in worker logs and the existing dashboard `/logs` page.
3. **(Deferred to a follow-up spec.)** A dedicated dashboard surface aggregating these events per cron-run row (e.g. "1 success · 3 unlinked uses (github)" badge with a per-tool drill-down) is intentionally out of scope here — see Out-of-scope follow-ups. v1 ships only the worker logs.

### S6 — Bytes-cap truncation on chatty cron

1. Operator links 4 skills × 8 KB each (32 KB total) to a cron.
2. Runner detects > 20 KB and truncates to first 20 KB, dropping the tail. Emits `cron_skill_truncated { cronId, runId, requestedBytes: 32768, truncatedBytes: 20480, droppedSkills: [...] }`.
3. Cron fires with the partial context. Operator sees the truncation log + can revise links.

### S7 — Linked skill deleted from DB while cron has the link

1. Operator links skill `S1` to cron `C1`. Saves.
2. Operator deletes `S1` via dashboard or CLI.
3. FK CASCADE on `cron_skills` removes the link automatically. No orphan rows.
4. Next cron tick → `cron_skills.list_for_cron(C1)` returns `[]` → no injection. Cron continues normally.

## Success Criteria

- [ ] **Migration 16** creates `cron_skills (cron_id, skill_id, created_at)` with FK CASCADE on both sides, PRIMARY KEY `(cron_id, skill_id)`. Test asserts table + cascade behavior on `DELETE FROM crons WHERE id = ?` and `DELETE FROM skills WHERE id = ?`.
- [ ] **Migration 17** creates `cron_connectors (cron_id, connector_id, created_at)` with FK CASCADE on both sides, same shape. Test asserts cascade on both directions.
- [ ] **`CronSkillRepo`** with methods: `list_for_cron(cronId): Skill[]`, `replace_for_cron(cronId, skillIds: string[])` (atomic transaction), `add(cronId, skillId)`, `remove(cronId, skillId)`. Mirrors `ConnectorSkillRepo`. Tests cover happy path + atomic-replace failure rollback.
- [ ] **`CronConnectorRepo`** with the same shape as `CronSkillRepo` but for connectors. Tests parallel.
- [ ] **Cron runner** prepends a `[zeno_context]` block to `userMessage` containing all linked skill bodies + the linked connector slug list, BEFORE calling `backend.query()`. Block format:
  ```
  [zeno_context]
  linked_skills:
  ## <skill-1-name>

  <skill-1-body>

  ---

  ## <skill-2-name>

  <skill-2-body>

  linked_connectors: <slug-a>, <slug-b>
  [/zeno_context]

  <original cron prompt>
  ```
  When zero skills + zero connectors, NO block is prepended. Test covers all four shape combinations (skills+connectors, skills only, connectors only, none).
- [ ] **Bytes cap.** Runner truncates skill content to ≤ 20 KB total. Truncation emits `cron_skill_truncated` log with `{cronId, runId, requestedBytes, truncatedBytes, droppedSkills}`. Test asserts truncation kicks in at the boundary.
- [ ] **Anti-double-inject mechanism.** `ConnectorGatedBackend` exposes `runInCronContext(opts, fn)` which sets up an `AsyncLocalStorage` scope carrying `{ skillIds, audit?: { runId, linkedSlugs } }`. The runner wraps `backend.query(...)` in this scope before calling. **Implementer note: the existing `getInjectionContext` (`connector-gated-backend.ts:62-84`) cached at the connector-slug level (`${sessionKey}:${slug}` key, mark-and-skip whole connector). This spec REWRITES the caching strategy from slug-level to skill-level + ALS-based per-call state.** Inside the rewritten `getInjectionContext`, BEFORE building the body, iterate `connectorSkillRepo.listForConnector(connector.id)` and check `injectedSkillsCache.has(\`${sessionKey}:skill:${skill.id}\`)` for every skill; if ALL are already cached, return null; if SOME are cached, build the body with ONLY the non-cached ones. Tests: (a) skill linked to BOTH a connector AND a cron is injected exactly once across the run. (b) Partial dedup — `getInjectionContext` finds 1 of 2 skills cached and builds the body with only the non-cached one. (c) Two concurrent `runInCronContext` calls do not race (ALS isolates state per await chain). (d) Wiring uses a lazy hook ref so the hook is bound to the OUTER wrapper (not a throwaway).
- [ ] **Hint mode for connectors.** When the cron has linked connectors, the agent sees the `linked_connectors:` field in the prepended block. The connector-permission gate (`checkConnectorPermission`) is NOT modified — its decision tree stays identical for cron runs and interactive runs.
- [ ] **Audit log `cron_used_unlinked_connector`.** Emitted once per `(runId, connector_slug, tool_name)` triplet when the cron uses a connector that isn't in its link list AND the gate allows the call. Dedup is per-run, in-memory; no DB persistence in this spec. Tests: (a) cron with linked `[linear]` calls `mcp__github__get_x` → log fires with `connector_slug: "github"`. (b) The same cron calls `mcp__github__get_x` THREE times in the same run → log fires exactly ONCE for that triplet (dedup invariant).
- [ ] **Logs `cron_skill_injected`.** Emitted from the runner (NOT the gate) when force-injection happens, with `{cronId, runId, skills: [<names>], totalBytes}`. Test asserts the log fires before `backend.query()` is called.
- [ ] **`/api/crons/:id/skills`** GET returns the linked skills (metadata only); PATCH replaces the link list atomically. 403 if cron not found. Tests cover GET/PATCH/atomic-replace/missing-cron.
- [ ] **`/api/crons/:id/connectors`** GET returns the linked connector slugs + display names; PATCH replaces atomically. Tests parallel.
- [ ] **Dashboard cron detail page** gains "Linked skills" + "Linked connectors" sections, each with a "+ link" button that opens a multi-select picker (linked-set vs unlinked-set split, like `link-skill-picker-modal` from spec 0052). Each section also lists current links with "remove" affordance.
- [ ] **(Deferred to follow-up spec)** A dashboard surface that aggregates `cron_used_unlinked_connector` audit events per run is intentionally out of scope here. v1 ships only the worker log; operators use the dashboard `/logs` page (existing) or `docker logs` to inspect. A future spec persists per-run audit counts to `cron_runs` and adds the badge.
- [ ] **Quality gate** passes 30/30 (existing tests stay green; new tests cover migrations, repos, runner injection, gate dedup, API routes, badge UI).
- [ ] **Docker boot test** clean — migrations 16 + 17 apply without error on a fresh DB and on a DB with existing crons.
- [ ] **E2E via Slack** (or via cron tick on the fn profile): create a cron, link a skill, link a connector, wait for tick, observe `cron_skill_injected` log, observe agent following the linked skill's playbook, observe the agent NOT trying to call unlinked connectors (or audit log if it did).
- [ ] **Final 3-round review** with zero findings.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Force-injection pushes context past the model's window on multi-skill crons | 20 KB cap + truncation log. If still problematic in practice, future spec adds smarter truncation (per-skill priority, summarization). |
| `[zeno_context]` block conflicts with operator's prompt that literally contains the substring | Document that the sentinel is reserved. Sentinel choice mirrors `[slack_context]` precedent which has been stable since spec 0001. Tests assert the block is parseable / not collided. |
| Operator forgets to link a connector the cron needs → silent failure (cron uses connector but loses observability) | The audit log `cron_used_unlinked_connector` + dashboard surface make this visible. Operator gets a signal in the cron-run row to either link or revise the cron. |
| Anti-double-inject pre-population happens before any tool call → if the agent never calls a tool from the connector, the dedup set has noise. Acceptable. | The dedup set is per-session; cleared at the next session. No persistent leakage. |
| Migration 16 + 17 run sequentially; if 16 succeeds and 17 fails, DB has half the spec | Each migration is wrapped in a transaction by `runMigrations`. If 17 fails, runner aborts; operator fixes + reruns. Matches the pattern from spec 0052 migrations 11/13/14/15. |
| The hint-mode `linked_connectors:` line in the block could be ignored by the agent (model sometimes ignores prose hints) | Hint mode is intentionally not a guardrail — the audit log catches drift. If observed drift is high in E2E, future spec can promote to a softer enforcement (e.g. system-prompt-level injection of the list). |
| `CronSkillRepo.list_for_cron` query during a tick races with `replaceForCron` from the dashboard | Use `INNER JOIN skills` (or `INNER JOIN connectors`) so a deleted-but-link-still-pointing-at-it row is silently skipped, mirroring `connector-skills.ts:55-62`. |
| Existing crons get no behavior change after migration → operator might think the link feature isn't working | Empty link is correct semantics. Documentation + the dashboard's "Linked skills/connectors" sections (visible on every cron detail) make the feature discoverable. |
| The `notify_conversation_id` delivery path uses the channel adapter, not a tool call → operators may expect linking Slack to control delivery | Document explicitly: linking the Slack connector to a cron only matters if the cron prompt itself uses `mcp__slack__*` tools. Notification delivery via `notify_conversation_id` always uses the channel adapter. |

## Open Questions

None blocking. Owner closed every strategic question via brainstorm with 2 parallel subagents per question (Rule 3 of the cleanup contract). Edge cases captured in Decisions + Risks tables.

## Out-of-scope follow-ups (for future specs)

- **Capability lockdown for crons.** A cron-scoped capability override (e.g. "this cron can never use Bash even if the global capability is on"). This would intentionally fragment the gate and is deferred until observed need.
- **Smarter truncation when bytes-cap kicks in.** Today: drop the tail of the concatenated skills. Future: per-skill priority, summarization, or "load on demand" for long skills.
- **Pre-run dry-run UI.** "Show me what context this cron would build right now" page — useful for debugging skill drift but not strictly required.
- **`cron_used_unlinked_connector` rollups + dashboard badge.** Today: emit one log per `(runId, connectorSlug, toolName)`, no persistence. Future: persist counts on the `cron_runs` row + render an "unlinked uses" badge on the cron-run card; click expands to a per-(connector, tool) breakdown.
- **Cron-run-scope audit table** for the unlinked-connector events. Today they only land in logs.
- **Hint mode strengthening.** If E2E shows the agent regularly ignores `linked_connectors:` and reaches for unlinked tools, promote the hint to a stronger system-prompt-level constraint. Not now.
