---
feature: strip-skills-and-classifier
spec: "[[spec]]"
created: 2026-04-27
---
# Strip Skills + Classifier — Plan

**For this spec:** `[[spec]]`

## Approach

**Bottom-up phased deletion.** Delete leaf modules first (specific policies, approver, classifier, repo, dashboard components, skill content); the TypeScript compiler then points at every orphan import in the call sites; fix those; repeat until the tree is green. Each phase ends in a green typecheck and a separate commit. The phased sequence is:

1. **Skill content removal** (no compile impact) — delete `agent/skills/`, `profiles/fn/skills/`, `agent/skills/dev-workflow/SKILL.md`. Trivial.
2. **Storage layer** — delete `packages/storage/src/repos/approval-rules.ts` and its tests; drop the `ApprovalRule` type; add migration 10 (`DROP TABLE IF EXISTS approval_rules; DROP TABLE IF EXISTS approvals_log;` plus matching `DROP INDEX`). The storage package compiles green; nothing else has imported it yet.
3. **API layer** — delete `apps/api/src/routes/approval-rules.ts` + tests; drop the route registration in `apps/api/src/server.ts`; drop `approvalRules` from API deps. API compiles green.
4. **Dashboard layer** — delete the sensitive-tools section + add-rule modal + 2 hooks + 2 tests; drop the section from the Settings page render. Dashboard compiles green.
5. **Worker — leaf policies** — delete `apps/worker/src/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,audit,read-only-skill}.ts` and their tests. Compiler now flags `pipeline.ts` and `index.ts` for orphan imports.
6. **Worker — approver + classifier** — delete `apps/worker/src/guardrails/approver/` and `classifier/` directories and their tests. Compiler flags more orphans.
7. **Worker — pipeline + supporting modules** — delete `pipeline.ts`, `slack-context.ts`, `async-context.ts`, `config.ts`, `skill-registry.ts`. `types.ts` shrinks to types still in use (`ConnectorGatedBackend` may not need anything from it).
8. **Worker — connector-permission policy tightened** — modify `apps/worker/src/guardrails/policies/connector-permission.ts` to implement the explicit decision tree from the spec (no more `undefined` returns). Update its test to verify deny-on-non-mcp + allow-on-built-in-mcp + the four DB-driven branches.
9. **Worker — guarded-backend → connector-gated-backend** — `git mv` the file, rename the class, simplify body to a direct call to the connector-permission policy. Rewrite its test.
10. **Worker — system-prompt skill loading removed** — `apps/worker/src/agent/system-prompt.ts` drops `loadAlwaysActiveSkills()`; `buildSystemPrompt()` signature drops the `alwaysActiveSkillContents` parameter. Update its test.
11. **Worker — boot wire-up** — `apps/worker/src/index.ts` cleaned end-to-end: drop the entire `approvalsConfig` branch, the classifier/approver/audit/skill instantiation, the policies array, the `guardedDeps` object. Replace with a direct `new ConnectorGatedBackend({ backend, connectorRepo })` construction.
12. **Worker — handlers** — `apps/worker/src/commands/handlers/{connector-create,connector-uninstall,app-uninstall}.ts` drop the `approvalRules.upsertAuto/deleteAutoMatching` calls. `index.ts` (handler builder) drops `approvalRules` from `HandlerDeps`. Update the handler tests.
13. **Worker — config schema rejects `approvals:`** — the yaml parser at `apps/worker/src/config.ts` (or wherever the zod schema lives) is updated so `approvals` is a forbidden key (not a deprecated optional one); the validation error explicitly tells the operator to remove it.
14. **Worker — cron loader** — `apps/worker/src/cron/static-loader.ts` `KNOWN_SECTIONS` set drops `'always_active_skills'`.
15. **Worker — profile watcher** — `apps/worker/src/profile/watcher.ts` `skills/` ignore branch removed.
16. **Profile config files** — `profiles/fn/config.yaml` and `agent/config.example.yaml` (if present) have their `approvals:` block deleted.
17. **Specs frontmatter** — `2026-04-21-guardrails-approval`, `2026-04-24-skill-final-reaction`, `2026-04-27-always-sensitive-db-ui` get `status: superseded` + `superseded_by: 0050` + a one-paragraph banner under their frontmatter; bodies untouched.
18. **Quality gate** — `pnpm run quality-gate`. Fix any holdouts (likely a few stragglers in dashboard tests or worker boot tests).
19. **Docker boot test** — `pnpm run docker:build && PROFILE=fn pnpm run docker:up` against the fn profile. Watch logs for `zeno_online` with no skill/classifier/approval mentions; all 4 github-app installations get tokens.
20. **E2E via Slack** — actual interaction with the running Zeno via the Slack workspace: a normal request, an out-of-capability request, and (if there's a connector tool with `permission='ask'`) confirm direct execution without DM-approval.
21. **3-round review on the doc set + code diff.** Counter resets on any finding. Three consecutive clean.

## Architecture

```
                          ┌───────────────────────────────┐
                          │   Storage layer               │
   Phase 2 ──────────────▶│   - DROP approval-rules repo  │
                          │   - DROP types                │
                          │   - migration 10              │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   API + Dashboard layers      │
   Phase 3 + 4 ──────────▶│   (parallel — independent)    │
                          │   - DROP approval-rules route │
                          │   - DROP sensitive-tools UI   │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Worker — guardrails leaves  │
   Phase 5–7 ────────────▶│   - DROP policies (5 files)   │
                          │   - DROP approver, classifier │
                          │   - DROP pipeline + supports  │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Worker — gate tightening    │
   Phase 8 ──────────────▶│   - connector-permission deny │
                          │     non-mcp explicitly        │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Worker — wrapper rename     │
   Phase 9 ──────────────▶│   - guarded → connector-gated │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Worker — runtime cleanup    │
   Phase 10–15 ─────────▶ │   - system-prompt drops skill │
                          │   - boot wire-up shrinks      │
                          │   - handlers drop deps        │
                          │   - config rejects approvals  │
                          │   - cron + watcher cleanup    │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Yaml + Specs                │
   Phase 16 + 17 ───────▶ │   - drop approvals: block     │
                          │   - frontmatter superseded    │
                          └───────────────┬───────────────┘
                                          │
                          ┌───────────────▼───────────────┐
                          │   Verification               │
   Phase 18–21 ─────────▶ │   - quality gate             │
                          │   - Docker boot              │
                          │   - E2E Slack                │
                          │   - 3-round review           │
                          └───────────────────────────────┘
```

## File Structure

**Deleted (production):**
- Directories: `agent/skills/`, `profiles/fn/skills/`, `apps/worker/src/guardrails/approver/`, `apps/worker/src/guardrails/classifier/`.
- Files in `apps/worker/src/guardrails/`: `pipeline.ts`, `slack-context.ts`, `async-context.ts`, `config.ts`, `skill-registry.ts`, `types.ts` (shrunk or removed).
- Files in `apps/worker/src/guardrails/policies/`: `always-allowed.ts`, `always-sensitive.ts`, `classifier-gate.ts`, `audit.ts`, `read-only-skill.ts`.
- `apps/worker/src/agent/system-prompt.ts` `loadAlwaysActiveSkills()` (function deletion).
- `apps/worker/src/config/always-active-skills.ts`.
- `apps/api/src/routes/approval-rules.ts`.
- `packages/storage/src/repos/approval-rules.ts`.
- `apps/dashboard/src/components/settings/sensitive-tools-section.tsx`.
- `apps/dashboard/src/components/settings/add-rule-modal.tsx`.
- `apps/dashboard/src/lib/use-approval-rules.ts`.
- `apps/dashboard/src/lib/use-rule-match-preview.ts`.

**Deleted (tests):** mirroring the production deletions, plus:
- `apps/worker/tests/guardrails/{approver,classifier}/**`, `tests/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,audit,read-only-skill}.test.ts`, `tests/guardrails/{pipeline,slack-context,config,skill-registry}.test.ts`.
- `apps/api/tests/routes/approval-rules.test.ts`.
- `packages/storage/tests/approval-rules.test.ts`.
- `apps/dashboard/tests/components/settings/{sensitive-tools-section,add-rule-modal}.test.tsx`.

**Renamed:**
- `apps/worker/src/guardrails/guarded-backend.ts` → `connector-gated-backend.ts` (class `GuardedBackend` → `ConnectorGatedBackend`).
- `apps/worker/tests/guardrails/guarded-backend.test.ts` → `connector-gated-backend.test.ts` (rewritten).

**Modified:**
- `apps/worker/src/guardrails/policies/connector-permission.ts` — explicit decision tree replacing `undefined` returns.
- `apps/worker/src/index.ts` — boot wire-up shrinks ~30%.
- `apps/worker/src/agent/system-prompt.ts` — function deletion + signature change in `buildSystemPrompt`.
- `apps/worker/src/commands/handlers/{connector-create,connector-uninstall,app-uninstall,index}.ts` — drop approvalRules deps.
- `apps/worker/src/cron/static-loader.ts` — drop `'always_active_skills'` from `KNOWN_SECTIONS`.
- `apps/worker/src/profile/watcher.ts` — drop `skills/` ignore branch.
- `apps/worker/src/config.ts` (or wherever the zod yaml schema lives) — make `approvals` a forbidden key.
- `apps/api/src/server.ts` and `apps/api/src/index.ts` — drop approval-rules route + dep.
- `packages/storage/src/index.ts` — drop ApprovalRulesRepo export.
- `packages/storage/src/types.ts` — drop `ApprovalRule` type.
- `packages/storage/src/migrations.ts` — append migration 10.
- `packages/storage/tests/migrations.test.ts` — update expected migration count.
- `apps/dashboard/src/routes/_authed/settings.tsx` (or equivalent) — drop the sensitive-tools section render.
- `profiles/fn/config.yaml` — delete `approvals:` block.
- `agent/config.example.yaml` — delete `approvals:` block (if present).
- `context/specs/2026-04-21-guardrails-approval/spec.md` — frontmatter + banner.
- `context/specs/2026-04-24-skill-final-reaction/spec.md` — frontmatter + banner.
- `context/specs/2026-04-27-always-sensitive-db-ui/spec.md` — frontmatter + banner.

**Deleted (frontmatter-only changes):** none. The 3 specs above keep their bodies; only frontmatter + banner change.

**Net diff estimate:** ~−1500 lines of production code + tests removed. Worker compiles + lints + types clean at every phase commit. Final quality gate green; Docker boot clean.

## Phase Ordering

Phases 1–17 are sequenced bottom-up (leaves → glue → boot → yaml → specs). Phases 18–21 are verification.

The order minimizes the typecheck-broken interval: after each phase commit, the project is in a green state. A reviewer (or an `git bisect`) can stop at any phase boundary and find a working build.

## Risks / Open Decisions

| Risk | Decision / Mitigation |
|---|---|
| The connector-permission policy tightening (deny on non-mcp) blocks `Bash`/`Read`/`Write`/`Edit` etc. — but the SDK still **registers** these tools. The agent will see them in its tools list and may try one, getting a deny error each time, polluting context. | Accepted for this PR. The deny error tells the agent the tool is unavailable — the SOUL.md instructions tell it to compose connectors instead. A future spec may add `disallowedTools` to the SDK invocation to remove the tools from the agent's view entirely. Recorded in spec Risks. |
| The yaml schema rejecting `approvals:` will break operators who haven't deleted the block from their config.yaml on upgrade. | Intentional. The error message is explicit ("`approvals:` block was removed in spec 0050; delete it from `profile/config.yaml`"). Spec 0048 Q5 set the precedent for this pattern with `always_sensitive`. |
| Migration 10 dropping `approval_rules` and `approvals_log` tables loses any historical data those tables contained. | Accepted: with no readers/writers post-cleanup, the data is unreachable. The migration uses `DROP TABLE IF EXISTS` for idempotency. |
| The handler tests (`apps/worker/tests/commands/app-handlers.test.ts`) currently include the auto-rule cascade tests added in batch-2 (R1 F1 fix). Deleting the `approvalRules` deps means those tests fail until the assertions are also dropped. | Phase 12 (handler cleanup) updates the tests in the same commit that drops the deps. The two tests added in batch-2 (`cascade-deletes auto rules scoped to mcp__github-app-%` and `still cascades auto rules even when singleton is null`) get deleted. |
| The `'ask'` permission value remains in the schema but is now equivalent to `'always_allow'` (a noop). Future readers may be confused. | A code comment in `connector-permission.ts` documents the equivalence and points at this spec. A future spec may rename or remove the third state. |
