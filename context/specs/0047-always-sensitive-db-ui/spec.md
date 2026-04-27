---
status: shipped
feature: always-sensitive-db-ui
created: 2026-04-27
shipped: 2026-04-27
---
# Always-Sensitive Rules — DB + Dashboard Editor Spec

**Status:** Draft
**Scope:** Move `approvals.always_sensitive` from `profiles/<name>/config.yaml` to a new DB table `approval_rules`. Build a dashboard editor in the `/settings` page. Auto-cascade: when an installation is removed (e.g., via spec 0046's M10), the auto-generated rules referencing that installation's tool prefix are deleted; manual rules survive. Pattern syntax extended from suffix-wildcards-only to full globs (`*` at any position).

This spec is **independent** of 0046 (lifecycle UI) at the schema/UI level, but their cascade behavior is coupled: 0046's M10 calls into a function added here for orphan-rule cleanup. Either spec can ship first; if 0047 ships first, 0046's M10 wires the cascade call site. If 0046 ships first, M10's "always_sensitive entries auto-removed" copy is aspirational until 0047 ships.

## Brainstorm Q&A

User delegated decisions to AI for this spec onward. All decisions made with OSS-readiness lens (anyone configures via dashboard without touching yaml/code).

### Q1 — Schema for sensitivity rules

**Decision: New generic `approval_rules` table with `pattern` column.**

```sql
CREATE TABLE approval_rules (
  id          TEXT PRIMARY KEY,                  -- UUID
  pattern     TEXT NOT NULL,                     -- glob pattern, e.g. 'mcp__github-app-*__merge_pull_request'
  source      TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'yaml-migrated')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  notes       TEXT,                              -- optional human description ("auto-generated for github-app AcmeBooks")
  UNIQUE (pattern)                               -- can't double-add the same pattern
);
```

Rationale:
- Generic shape (not tied to github-app) — works for any future sensitive tool across any connector.
- Mirrors the yaml shape (array of strings) for trivial migration.
- `source` field distinguishes manual user-added from auto-generated rules; drives cascade behavior.
- `UNIQUE (pattern)` prevents duplicates (e.g., user manually adds the same pattern that auto-generation already added).

Alternative considered: extend `connector_tool_permissions.permission` with a `'sensitive'` value. Rejected — sensitivity is a cross-cutting concern (a single rule can match tools across multiple connectors), so per-tool storage doesn't fit naturally.

### Q2 — Pattern syntax

**Decision: Glob patterns with `*` at any position.**

The current `makeAlwaysSensitivePolicy` (`apps/worker/src/guardrails/policies/always-sensitive.ts`) supports:
- Literal exact match: `mcp__github__merge_pull_request`
- Suffix wildcard via `endsWith('*')` + `startsWith` match: `mcp__github__*` matches all github tools

This proved insufficient in spec 0042 (couldn't write a single rule for all `github-app-*` installations' `merge_pull_request`). 0042 worked around by listing 5 explicit entries.

This spec extends the matcher to full glob: `*` at any position. New matcher:
```ts
function matchGlob(pattern: string, toolName: string): boolean {
  const regex = new RegExp(
    '^' + pattern.split('*').map(escapeRegExp).join('.*') + '$'
  );
  return regex.test(toolName);
}
```

Examples:
- `mcp__github-app-*__merge_pull_request` matches `mcp__github-app-fnlivros__merge_pull_request`, `mcp__github-app-quickshoperp__merge_pull_request`, etc.
- `*delete*` matches anything containing `delete` (e.g., `mcp__sentry__delete_project`, `mcp__linear__delete_issue`).

Rationale:
- Matches the real need (mid-wildcards) without overshooting.
- Regex (Option C) is too powerful for a dashboard UI — users would author bad regex; sandbox/escape concerns.
- Literal-only (Option A) is what we have today; no improvement.

Backwards compat: existing patterns with no `*` work identically (literal match, regex is `^pattern$`). Existing suffix-wildcard patterns (`mcp__github__*`) work as expected.

### Q3 — Dashboard UI location

**Decision: New section in `/settings` page titled "Sensitive tools".**

Per the existing design system (artboard P6.1 default — `/settings`), the page already has sections for SOUL.md, USER.md, crons, MCP servers (now removed). A new "Sensitive tools" section fits naturally.

UI shape:
- Section header: "Sensitive tools" + count "5 rules" + button "+ ADD RULE"
- Table:
  - Column 1: pattern (mono font)
  - Column 2: source icon (🤖 auto / 👤 manual / 📋 migrated)
  - Column 3: created_at relative ("2 days ago")
  - Column 4: trash icon (only enabled for `manual` and `yaml-migrated` rows; `auto` rows show ⛓ "managed" instead, indicating cascade-managed)
- Empty state: "No sensitive tools configured · all tool calls go through the classifier without an early gate"

Add Rule modal:
- Input: pattern (placeholder example: `mcp__github__merge_pull_request`)
- Live preview: "matches X tools" — backend evaluates the pattern against the union of all installed connector tools
- Save button enabled only if pattern is valid AND matches at least 1 tool (warning if 0 matches: "no current tools match this pattern; will activate when a matching tool is installed")

Rationale:
- Discoverable in `/settings` where operators expect policy.
- Live "matches X tools" preview is the key OSS UX win — operator immediately sees the consequence.
- Per-connector page would force duplication (same rule pattern can match across connectors).

### Q4 — Migration of existing yaml rules

**Decision: 1-shot SQL migration at boot.**

New migration id `8` in `packages/storage/src/migrations.ts`:

1. `CREATE TABLE approval_rules (...)`
2. **Data migration** (run only if `approval_rules` is empty AND `profiles/<active-profile>/config.yaml`'s `approvals.always_sensitive` array is non-empty):
   - Read the active profile's yaml (worker has access via `loadProfileConfig`).
   - For each entry in the array, `INSERT INTO approval_rules (id, pattern, source, created_at) VALUES (?, ?, 'yaml-migrated', ?)`.
   - The migration runs in the worker's boot sequence (after the migration runner finishes schema migration; this is a separate "yaml-to-DB" step that's part of `loadGitHubAppConfig`'s sister function for approval rules).
3. After migration, the worker's `loadAlwaysSensitiveRules(...)` reads from `approval_rules` table; yaml is the fallback during the migration window only.

Yaml fallback removal: deferred to spec 0048 (along with the other yaml fallback cleanups). Until then, both DB and yaml are read; DB takes precedence.

Rationale: same pattern as spec 0044's migration (1-shot, idempotent via uniqueness constraint).

### Q5 — Cascade on connector removal

**Decision: Worker handler-based cascade. Not DB triggers.**

When `connector_uninstall` handler runs for a `github-app-*` connector slug:
- Compute the slug-derived prefix (e.g., `mcp__github-app-fnlivros__*`).
- `DELETE FROM approval_rules WHERE source = 'auto' AND (pattern = '<exact slug-derived literal>' OR pattern LIKE '<slug-prefix>%')`.
- `auto` source ensures user-added manual rules referencing the connector survive (operator may have a manual rule that intentionally still applies; warning logged if a manual rule references a now-removed connector).

Rationale:
- Explicit control flow in the handler is debuggable; DB triggers are opaque.
- `source='auto'` distinction prevents accidental loss of user intent.
- The dashboard surfaces orphan manual rules in the editor with a "removed connector — pattern no longer matches anything" warning (deferred to spec 0048 polish).

### Q6 — Editor UX: 1 pattern per rule

**Decision: 1 pattern per rule (1 DB row). Dashboard list editor with "Add rule" button.**

User flow:
- Settings → Sensitive tools section → click "+ ADD RULE" → modal with pattern input + live "matches X tools" preview → SAVE → row appears in list.
- Multiple rules → multiple add operations.

Alternative considered: bulk add (paste array of patterns). Rejected — adds complexity; users adding 10+ rules is rare, and bulk-import via JSON file can come later.

Rationale: aligns with the underlying schema (1 pattern = 1 row); simpler to test; clearer audit log.

### Q7 — Source tracking + auto-rule generation triggers

**Decision: 3-value enum `source: 'manual' | 'auto' | 'yaml-migrated'` with these creation paths:**

- `manual`: user clicks "Add rule" in dashboard and types a pattern.
- `auto`: triggered by spec 0046's add-installation flow. When a new `github-app-*` installation is added, the worker's `connector_create` handler ALSO inserts a default `approval_rules` row for that installation's `merge_pull_request` tool. Pattern: `mcp__github-app-<slug>__merge_pull_request`.
- `yaml-migrated`: created by the 1-shot boot migration in Q4.

Cascade rules (per Q5):
- `auto` rules: deleted when the matching connector is uninstalled (via worker handler).
- `manual` rules: survive uninstall; surfaced as "orphan" if pattern no longer matches any tool.
- `yaml-migrated` rules: survive uninstall (treated as legacy; user can manually delete if no longer needed).

Default auto-rules at spec ship: `merge_pull_request` is the only default. Future expansion (e.g., `delete_*` patterns auto-added) is deferred to operator preference.

Rationale: source tracking is the foundation for sane cascade behavior + future audit features. Without it, all rules look identical and operator has no way to distinguish "the system added this" from "I added this".

## Context

`makeAlwaysSensitivePolicy` reads patterns from `profiles/<name>/config.yaml`'s `approvals.always_sensitive` array at boot. Today's `fn` profile has 5 entries (after spec 0042's migration added per-installation github-app entries):
```yaml
always_sensitive:
  - mcp__github__merge_pull_request
  - mcp__github-app-fnlivros__merge_pull_request
  - mcp__github-app-quickshoperp__merge_pull_request
  - mcp__github-app-flavia-nasser-oms__merge_pull_request
  - mcp__github-app-chatdesk-brasil__merge_pull_request
```

For OSS users, this requires editing yaml manually after installing every github-app installation (and remembering to remove entries when uninstalling). Bad UX. This spec moves to DB-managed rules with auto-creation tied to installation lifecycle.

The pattern matcher gains glob support (`*` at any position) so a single rule like `mcp__github-app-*__merge_pull_request` covers all installations at once. Operators with simple needs can write 1 generic rule instead of N specific ones.

## Problem Statement

Three distinct issues, all resolved here:

1. **Yaml editing is mandatory for sensitivity rules** — bad OSS UX.
2. **Pattern matcher doesn't support mid-wildcards** — operators must list one rule per installation manually (5 entries in `fn` profile today instead of 1 generic rule).
3. **No cascade on installation removal** — yaml entries become stale after uninstall; operator must remember to clean up manually.

## Non-Goals

1. **Connector polish** (spec 0048): orphan-rule warnings in the dashboard, log noise reduction, dashboard refresh-failure surfacing.
2. **Bulk import via JSON/CSV file**: deferred until a real use case demands it.
3. **Per-connector rule scoping**: rules apply globally; if operator wants different rules per profile, they have separate Zeno installs.
4. **Regex pattern support**: glob is sufficient (and safer to author in dashboard).
5. **Approval audit log enhancements**: spec 0036 already has `approvals_log`; this spec adds entries via the existing path (no log shape change).

## Constraints

- **OSS readiness**: zero hardcoded operator-specific patterns. The 5 yaml entries in `fn` profile are migrated by data; the auto-rule template (`merge_pull_request`) is universal.
- **Schema additive**: new table only; no changes to `connector_tool_permissions` or `approvals_log`.
- **Glob matcher backwards compat**: existing literal/suffix-wildcard patterns continue to match identically.
- **Worker hot-reload**: when `approval_rules` is mutated via dashboard, worker re-reads on next agent turn (or via a new command type if turn-latency is too slow). For v1, refresh on next turn is acceptable (latency < 1s for most flows).
- **Test fixtures**: use generic patterns (`mcp__example__delete_*`), not `fn`-profile-specific.

## Schema Changes

### New table: `approval_rules`

(Full schema in Q1.)

### Migration in `packages/storage/src/migrations.ts`

The implementer claims the next available integer id at the time of writing the migration. Today the live array ends at id 5; specs 0044 and 0045 each add a migration before this spec is implemented (assuming sequential implementation order). If specs 0044/0045 don't ship before this one, the implementer assigns whichever id is next available — the migration body is independent of the assigned id.

For brevity, this document refers to the migration as "the rules-table migration" (no hardcoded id).

```sql
-- Schema part:
CREATE TABLE approval_rules (
  id          TEXT PRIMARY KEY,
  pattern     TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('manual', 'auto', 'yaml-migrated')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  notes       TEXT,
  UNIQUE (pattern)
);
```

Data migration (separate from schema migration; runs in worker boot AFTER migration runner completes):
- See Q4 logic.
- Implemented in `apps/worker/src/guardrails/migration-yaml-to-db.ts` — called from worker `main()` after `loadGitHubAppConfig()`.

## Files Created

- `apps/worker/src/guardrails/migration-yaml-to-db.ts` — 1-shot data migration helper. Idempotent (checks if `approval_rules` is empty before reading yaml).
- `apps/worker/src/guardrails/policies/always-sensitive-glob.ts` — new matcher with full glob support; replaces the suffix-only logic in `apps/worker/src/guardrails/policies/always-sensitive.ts`.
- `apps/worker/tests/guardrails/policies/always-sensitive-glob.test.ts` — unit tests for matchGlob (literal, suffix, prefix, mid, multi-`*`, edge cases).
- `apps/worker/tests/guardrails/migration-yaml-to-db.test.ts` — migration test.
- `apps/api/src/routes/approval-rules.ts` — new route file mounted at `/api/approval-rules`. CRUD + match-preview endpoint.
- `apps/api/tests/routes/approval-rules.test.ts` — integration tests.
- `apps/dashboard/src/components/settings/sensitive-tools-section.tsx` — settings section with list + Add Rule button.
- `apps/dashboard/src/components/settings/add-rule-modal.tsx` — modal with pattern input + live match preview.
- `apps/dashboard/src/lib/use-approval-rules.ts` — TanStack Query hook (list + mutations).
- `apps/dashboard/src/lib/use-rule-match-preview.ts` — hook for live preview ("matches X tools").
- `apps/dashboard/tests/components/settings/sensitive-tools-section.test.tsx` — UI test.
- `apps/dashboard/tests/components/settings/add-rule-modal.test.tsx` — UI test.

## Files Modified

- `apps/worker/src/guardrails/policies/always-sensitive.ts` — refactor `makeAlwaysSensitivePolicy` to accept a `getRules: () => string[]` getter (instead of static `patterns` array). Worker passes a getter that reads from DB on each invocation. Updates the matcher to call the new `matchGlob` from `always-sensitive-glob.ts`.
- `apps/worker/src/index.ts` — wire `loadAlwaysSensitiveRules(connectorRepo)` and pass `getRules` to `makeAlwaysSensitivePolicy`. Run `migrationYamlToDb(db, loadApprovalsConfig)` AFTER `runMigrations(db)` and AFTER `loadGitHubAppConfig()` in `main()`. **Boot logic for guardrails activation (v1 — pure-DB mode deferred)**:
  - Today: guardrails activate ONLY if `approvalsConfig != null` (i.e., yaml has `approvals:` section). Lines 304-356 of current `index.ts`.
  - **v1 of this spec keeps the same activation guard**: guardrails activate ONLY if `approvalsConfig != null`. The yaml `approvals:` section is still required for `owner_slack_user_id`, `approval_timeout_sec`, `classifier_model`, `dm_owner_only`. The ONLY change is that `approvalsConfig.always_sensitive` (the array of patterns) is no longer the source-of-truth at boot — the new `getRules` getter reads from DB.
  - Pure-DB mode (no yaml `approvals:` section at all, only DB rules) is **explicitly deferred to a future spec** that moves the rest of the approvals config (owner, timeout, classifier_model, dm_owner_only) to DB-managed settings. v1 ships with yaml-required for those fields.
  - Migration: yaml `approvals.always_sensitive` array → DB `approval_rules` table. After migration, the yaml field can be removed (deferred to spec 0048's polish). During the transition window, yaml's `always_sensitive` is read but logged as deprecated; DB takes precedence.
  - Result: an OSS user installing fresh sets up `approvals:` in yaml at install time (one time, with owner_slack_user_id), then manages rules entirely via dashboard. No yaml editing required for rule changes after that.
- `apps/worker/src/commands/handlers/connector-create.ts` — when slug starts with `github-app-`, INSERT default `approval_rules` row with pattern `mcp__github-app-<slug-suffix>__merge_pull_request`, source=`auto`.
- `apps/worker/src/commands/handlers/connector-uninstall.ts` — DELETE auto rules matching the slug pattern.
- `apps/worker/src/guardrails/config.ts` — `always_sensitive` field becomes a fallback only (read from yaml only if DB has no rules — first-boot pre-migration window). Remove in spec 0048.
- `apps/api/src/server.ts` — extend `AppDeps` with `approvalRulesRepo?: ApprovalRulesRepo` (optional, same pattern as the existing optional `connectorRepo`). Mount `/api/approval-rules` route under auth, conditionally on `approvalRulesRepo` being present (mirrors `/api/connectors` mounting at lines 90-95). Tests that don't exercise approval rules can omit the repo without crashing.
- `apps/dashboard/src/routes/_authed/settings.tsx` — render the new `SensitiveToolsSection` component.
- `agent/connectors-catalog.json` — no changes.

## API Endpoints (new)

All under `/api/approval-rules`:

| Method | Path | Purpose | Body | Returns |
|---|---|---|---|---|
| GET | `/` | List all rules | — | `Rule[]` |
| POST | `/` | Add manual rule | `{pattern, notes?}` | `Rule` |
| DELETE | `/:id` | Delete a rule (manual + yaml-migrated only) | — | `{ok}` (returns **403 Forbidden** with body `{error: 'auto_managed_rule', detail: 'this rule is system-managed and removed automatically when the related connector is uninstalled'}` if `rule.source = 'auto'`) |
| POST | `/preview` | Match preview: returns count + sample of matching tools | `{pattern}` | `{matchCount, samples: ['mcp__github__merge_pull_request', ...]}` |

`Rule` shape:
```ts
{
  id: string,
  pattern: string,
  source: 'manual' | 'auto' | 'yaml-migrated',
  createdAt: string,
  notes: string | null,
}
```

## User Stories / Scenarios

| ID | Surface | Description |
|---|---|---|
| AS1 | Migration | Worker boots. Migration runner creates `approval_rules` table. `migrationYamlToDb()` reads `fn/config.yaml`'s 5 entries → INSERTs 5 rows with `source='yaml-migrated'`. Yaml stays intact (fallback). |
| AS2 | Boot | Worker reads rules via `loadAlwaysSensitiveRules(connectorRepo)`. `makeAlwaysSensitivePolicy({getRules})` uses DB-sourced rules on every invocation. |
| AS3 | Dashboard list | Operator opens `/settings`. Sensitive tools section shows 5 rows — the 5 distinct patterns from the migrated yaml (`mcp__github__merge_pull_request`, `mcp__github-app-fnlivros__merge_pull_request`, `mcp__github-app-quickshoperp__merge_pull_request`, `mcp__github-app-flavia-nasser-oms__merge_pull_request`, `mcp__github-app-chatdesk-brasil__merge_pull_request`) — each with the 📋 migrated icon. Trash button enabled (yaml-migrated rules can be manually deleted). |
| AS4 | Add rule | Operator clicks "+ ADD RULE" → types `mcp__github-app-*__merge_pull_request`. Live preview shows "matches 4 tools" (the 4 installations). Click SAVE → rule added with source `manual`. Dashboard list refetches. |
| AS5 | Delete rule | Operator clicks trash on a yaml-migrated rule. Confirmation modal: "Delete rule? This will allow `mcp__github__merge_pull_request` to bypass the gate." Click DELETE → row removed. |
| AS6 | Auto-cascade on install | Operator adds new installation `DesignKitchen` via spec 0046's M7. `connector_create` handler INSERTs auto rule `mcp__github-app-designkitchen__merge_pull_request`, source=`auto`. Settings list shows new row with 🤖 auto icon. Trash disabled (managed). |
| AS7 | Auto-cascade on uninstall | Operator removes installation `AcmeBooks` via spec 0046's M10. `connector_uninstall` handler runs, DELETEs auto rules where pattern matches `mcp__github-app-fnlivros__*`. Settings list updates. Manual rules referencing AcmeBooks (if any) survive but get an "orphan" warning (deferred to 0048). |
| AS8 | Glob matcher | Tool call with name `mcp__github-app-fnlivros__merge_pull_request` → policy iterates rules → glob matches `mcp__github-app-*__merge_pull_request` → `policyThatGated: 'always_sensitive'` → approval requested. |

## Success Criteria

- All 7 brainstormed decisions implemented.
- The rules-table migration + yaml-to-DB migration runs cleanly on `fn` profile (5 entries migrated).
- Glob matcher unit tests cover literal, suffix, prefix, mid, multi-* cases.
- `/settings` page renders Sensitive tools section with 5 migrated entries.
- Add rule with `mcp__github-app-*__merge_pull_request` → preview shows 4 matches → save → applied to next agent turn.
- Adding installation auto-creates rule; removing installation auto-removes.
- 3 clean reviews.
- Quality gate green.
- OSS readiness verified: test fixtures use `mcp__example__*` patterns.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Glob matcher regex injection (e.g., user types `(?:.*)`) | `escapeRegExp` is applied to pattern segments BEFORE `*` substitution. Star-segments are the only thing converted to `.*`. Tested with adversarial inputs. |
| Auto-rule cascade deletes manual rule the user wanted to keep | Cascade only targets `source='auto'`. Manual + migrated rules are never auto-deleted. |
| Live match-preview endpoint is slow (iterates all installed tools) | Tools list is in-memory cache via `loadCatalog()` + `connectors.getEnabledTools()`. <100ms for typical 200-tool inventory. Acceptable. |
| Yaml + DB drift during the migration window (operator edits yaml after DB has rules) | DB takes precedence. Yaml changes are ignored once migration ran. Spec 0048 removes yaml fallback fully. |
| Rule pattern validation surface (empty string, unicode, very long) | Backend zod schema: `pattern: z.string().min(1).max(200).regex(/^[\w*-]+(__[\w*-]+)*$/)` matches the actual tool naming convention. **Note**: this regex doesn't accept patterns starting with `*` (e.g., `*delete*`). For v1 we accept this constraint — it requires patterns to start with at least one literal char. If this proves too restrictive, the regex can be loosened to `/^[\w*-]*(__[\w*-]+)*$/` in a polish phase (0048). Tested with adversarial inputs in unit tests. |
| Test data leaks operator-specific patterns | All test patterns use `mcp__example__*` or `mcp__github-app-acme*`. |

## Open Questions

All resolved by AI per delegation.

## Coverage gaps (acknowledged)

- Orphan manual rule warnings (UI surfacing) — spec 0048.
- Yaml fallback removal — spec 0048.
- Bulk import — future spec when needed.
- Multi-rule selection / bulk delete in editor — future polish; v1 has 1-by-1.

## Review procedure

3 consecutive review rounds.

## Implementation order

1. **Phase 0**: Spec docs + 3 reviews (this).
2. **Phase 1**: The rules-table migration schema + glob matcher unit tests.
3. **Phase 2**: `migration-yaml-to-db.ts` + test.
4. **Phase 3**: Refactor `always-sensitive.ts` to use getter + glob matcher.
5. **Phase 4**: API routes (`/api/approval-rules` CRUD + preview).
6. **Phase 5**: Worker handlers wire — `connector_create` adds auto rule, `connector_uninstall` cascades.
7. **Phase 6**: Dashboard `SensitiveToolsSection` + `AddRuleModal` + hooks.
8. **Phase 7**: Quality gate green. Smoke (manually add/delete rules; verify boot migration).
9. **Phase 8**: `status: shipped`, commit, PR.

## Definition of Done

- All 7 brainstormed decisions shipped.
- 5 yaml entries migrated to DB cleanly.
- Operator can add/delete rules via dashboard without touching yaml.
- 3 clean reviews.
- Quality gate green.
- OSS readiness: no operator-specific values in test fixtures or default rules.
