---
feature: skills-and-capability-defaults
spec: "[[spec-skills-and-capability-defaults]]"
created: 2026-04-28
---
# Skills and Capability Defaults — Plan

**For this spec:** `[[spec-skills-and-capability-defaults]]`

## Approach

The work breaks into three concerns layered on top of the existing spec 0052 mechanism:

1. **Schema changes (storage layer).** Two migrations: (13) flip default-OFF dev capabilities (`Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`) to default-ON; (14) add a `source` enum column on `skills` with a CHECK constraint and backfill of existing rows to `'dashboard'`. The `Skill` type and `SkillRepo` are extended in lockstep so the API and dashboard get the field automatically.

2. **Boot reconciliation (worker).** A new `bootSkillsReconcile()` runs once at worker start, ordered before the materializer:
   - Reads every `SKILL.md` under `agent/skills/<name>/` → UPSERTs as `source='zeno_default'`.
   - Reads every `SKILL.md` under `profiles/<active-profile>/skills/<name>/` → INSERT OR IGNORE as `source='profile'`.
   - Orphan cleanup: deletes any `source='zeno_default'` row whose name no longer exists in `agent/skills/`. Profile orphans are NOT deleted (operator may have customized).
   - Emits `skills_seeded {zenoDefault, profile, orphansRemoved}` and (when applicable) `skills_orphan_cleanup_complete {removed, cascadeAffected}`.
   The existing materializer (`apps/worker/src/skills/materialize.ts`) consumes whatever the seeder leaves in the DB. Order: seed → materialize → start watcher.

3. **API + UI immutability lock.** The skills API rejects `PATCH /api/skills/:id` and `DELETE /api/skills/:id` with HTTP 403 + `error: "zeno_default_immutable"` when the row's `source` is `'zeno_default'`. The dashboard hides the edit/delete buttons for those skills and shows a `default · zeno` badge instead; profile-source rows show `profile · <name>` and remain editable.

The two skill files (`zeno-development`, `fn-code-review`) are content-only deliverables — adapted from the backups under `tmp/profile-fn-backup-2026-04-27/skills/`. Playwright joins the catalog as a regular entry; Chrome is installed at Docker build time so the first call doesn't fail. The detail-nav bug is investigated last (likely a stale `route-tree.gen.ts`); a single fix unblocks E2E.

## Architecture

### Data flow at boot

```
┌──────────────────────────────────┐
│  agent/skills/<name>/SKILL.md    │ ─┐
└──────────────────────────────────┘  │
                                       ├─→  bootSkillsReconcile()
┌──────────────────────────────────┐  │      ├─ UPSERT zeno_default
│  profiles/<p>/skills/<name>/...  │ ─┘      ├─ INSERT OR IGNORE profile
└──────────────────────────────────┘         └─ orphan cleanup (zeno_default only)
                                                          ↓
                                              ┌─────────────────────┐
                                              │  skills table (DB)  │
                                              └─────────────────────┘
                                                          ↓
                                              materializeSkillsToFs()
                                                          ↓
                                              ~/.claude/skills/<name>/SKILL.md
                                                          ↓
                                              SDK auto-discovery on next query
```

### Component breakdown

| Component | New / Modified | Responsibility |
|---|---|---|
| `packages/storage/src/migrations.ts` | Modified | Adds migrations 13 (capability flip) + 14 (source column). |
| `packages/storage/src/types.ts` | Modified | `Skill` type gains `source: SkillSource`. |
| `packages/storage/src/repos/skills.ts` | Modified | `SkillRepo.create` accepts optional `source` (default `'dashboard'`); list/get return `source`; new `upsertBySource()` for the seeder. |
| `apps/worker/src/skills/seed.ts` | New | `bootSkillsReconcile()` — file scan, upsert, IOI, orphan cleanup. Pure logic; exported for unit test. |
| `apps/worker/src/skills/materialize.ts` | Unchanged behavior | Still reads DB, writes FS — unaware of `source`. |
| `apps/worker/src/index.ts` | Modified | Wire `bootSkillsReconcile()` before `materializeSkillsToFs()`. |
| `apps/api/src/routes/skills.ts` | Modified | List + detail include `source`; PATCH/DELETE return 403 if `source='zeno_default'`. |
| `apps/dashboard/src/lib/use-skills.ts` | Modified | `SkillListItem` and `SkillDetail` types include `source`. |
| `apps/dashboard/src/routes/_authed/skills.tsx` | Modified | Badge in row when `source !== 'dashboard'`. |
| `apps/dashboard/src/routes/_authed/skills.$id.tsx` | Modified | Hide edit/delete buttons when `source === 'zeno_default'`; show "managed by Zeno" notice. Investigate why the route renders nothing today and fix. |
| `agent/skills/zeno-development/SKILL.md` | New | Adapted dev workflow playbook; description tuned for auto-discovery on dev intents. |
| `profiles/fn/skills/fn-code-review/SKILL.md` | New | Adapted code review playbook; description tuned for PR review intents. |
| `agent/connectors-catalog.json` | Modified | Add `playwright` entry: slug `playwright`, transport `stdio`, command `npx -y @playwright/mcp@latest`, default tools list. |
| `infra/Dockerfile` | Modified | Runtime stage runs `npx -y playwright install chrome` after deps install. |
| Test files | New / Modified | `migrations.test.ts`, `db.test.ts`, `skills.test.ts` (storage); `seed.test.ts` (worker); `skills.test.ts` route (api); plus dashboard typecheck propagation. |

## File Structure

### New
- `apps/worker/src/skills/seed.ts`
- `apps/worker/tests/skills/seed.test.ts`
- `agent/skills/zeno-development/SKILL.md`
- `profiles/fn/skills/fn-code-review/SKILL.md`

### Modified
- `packages/storage/src/migrations.ts` — append migrations 13, 14
- `packages/storage/src/types.ts` — `SkillSource` type, `Skill.source`
- `packages/storage/src/repos/skills.ts` — return `source`; new `upsertBySource()` and `deleteOrphans(source, allowedNames)`
- `packages/storage/tests/agent-capabilities.test.ts` — assert default-on capabilities
- `packages/storage/tests/migrations.test.ts` — assert new migrations
- `packages/storage/tests/db.test.ts` — bump migration count to 14
- `packages/storage/tests/skills.test.ts` — cover `source` field
- `apps/worker/src/skills/materialize.ts` — leave behavior unchanged; verify no `source` coupling
- `apps/worker/src/index.ts` — wire seeder
- `apps/worker/tests/skills/materialize.test.ts` — verify still green with `source` rows
- `apps/api/src/routes/skills.ts` — include `source`, gate PATCH/DELETE
- `apps/api/tests/routes/skills.test.ts` — add tests for 403 path + `source` in responses
- `apps/dashboard/src/lib/use-skills.ts` — add `source` to types
- `apps/dashboard/src/routes/_authed/skills.tsx` — render badge
- `apps/dashboard/src/routes/_authed/skills.$id.tsx` — hide actions + render badge + bug fix
- `apps/dashboard/src/components/skills/edit-skill-modal.tsx` — guard against opening on `zeno_default` (defense in depth)
- `apps/dashboard/src/components/skills/delete-skill-modal.tsx` — same
- `agent/connectors-catalog.json` — playwright entry
- `infra/Dockerfile` — `playwright install chrome`

### Deleted
None.

## Phase Ordering

Hard ordering — earlier phases are dependencies of later ones.

```
A. Storage migrations 13 + 14 + Skill type + repo
   ↓
B. Worker seeder + boot wire + tests
   ↓
C. API source field + immutability lock + tests
   ↓
D. zeno-development SKILL.md content
   ↓
E. fn-code-review SKILL.md content
   ↓
F. Playwright catalog + Dockerfile chrome (parallel with G/H)
   ↓
G. Skill detail navigation bug fix
   ↓
H. Dashboard badges + hide actions
   ↓
I. Quality gate + Docker boot test
   ↓
J. E2E 10+ via Slack — relies on D, E, F, G working live
   ↓
K. Final 3-round review on the whole branch
   ↓
L. Push + open stacked PR (with explicit OK)
```

F, G, H can run in parallel after C lands. Everything else is serial.

## Risks / Open Decisions

- **Materializer's existing reconciliation.** `materializeSkillsToFs` already deletes FS files that aren't in DB. After the seeder runs, DB reflects file truth — so the materializer naturally reconciles. **Verify** in a test that orphan cleanup at DB level + materializer does NOT race.
- **`route-tree.gen.ts` regeneration.** If gitignored, the dashboard build inside the Docker image may be missing the new route. Investigation step in Phase G must check git status of that file before editing components.
- **Playwright catalog default permissions.** Catalog entries usually default tools to `permission='ask'`. For Playwright that means the operator has to manually mark tools as `always_allow` after install. Acceptable per the catalog convention; documented in S7.
- **Chrome install in Dockerfile.** `playwright install chrome` requires network at build time. If the build runs in a sandboxed environment without internet, the build breaks. Standard CI/dev assumption is fine for our use case.
- **`fn-code-review` description calibration.** The skill must auto-discover on @-mentions with PR URLs in PT-BR. Calibration is iterative and lives in Phase J (E2E). Plan budgets one tightening pass.
- **Stacked PR base.** Branch is `feat/skills-defaults-and-prreview` with `feat/skills` (PR #14) as base. We cannot merge this PR until #14 lands. Coordinate with the user before merge; the work itself can ship to draft.
