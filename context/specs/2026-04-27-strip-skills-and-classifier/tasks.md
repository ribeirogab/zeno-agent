---
feature: strip-skills-and-classifier
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-27
---
# Strip Skills + Classifier — Tasks

**For this plan:** `[[plan]]`

Each phase ends with a green typecheck (`pnpm run typecheck`) and a separate commit. Phases run bottom-up to keep the typecheck broken-window short.

## Phase 1: Skill content removal

### Task 1.1: Delete skill directories
- [ ] `rm -rf agent/skills/`
- [ ] `rm -rf profiles/fn/skills/`
- [ ] Verify backup at `tmp/profile-fn-backup-2026-04-27/skills/` still exists (recovery path).
- [ ] Commit: `chore: remove agent/skills and profiles/*/skills (spec 0050)`

## Phase 2: Storage layer

### Task 2.1: Delete approval-rules repo
- [ ] `rm packages/storage/src/repos/approval-rules.ts`
- [ ] `rm packages/storage/tests/approval-rules.test.ts`
- [ ] Drop `ApprovalRule` type from `packages/storage/src/types.ts`.
- [ ] Drop `ApprovalRulesRepo` export from `packages/storage/src/index.ts`.

### Task 2.2: Migration 10 — drop tables
- [ ] Append a new migration to `packages/storage/src/migrations.ts` with id 10:
  ```
  DROP INDEX IF EXISTS idx_approval_rules_pattern;
  DROP TABLE IF EXISTS approval_rules;
  DROP INDEX IF EXISTS idx_approvals_log_*;  (any associated indexes)
  DROP TABLE IF EXISTS approvals_log;
  ```
- [ ] Update `packages/storage/tests/migrations.test.ts` to expect `[1..10]` and `current = 10`.

### Task 2.3: Verify storage typecheck + tests
- [ ] `pnpm --filter @zeno/storage run typecheck`
- [ ] `pnpm --filter @zeno/storage run test`
- [ ] Commit: `refactor(storage): remove approval-rules repo + drop DB tables (spec 0050)`

## Phase 3: API layer

### Task 3.1: Delete approval-rules route
- [ ] `rm apps/api/src/routes/approval-rules.ts`
- [ ] `rm apps/api/tests/routes/approval-rules.test.ts`
- [ ] Drop the route registration from `apps/api/src/server.ts` (find `route('/api/approval-rules', ...)` and remove).
- [ ] Drop `approvalRules` from API `Deps` interface and dep wiring in `apps/api/src/index.ts`.

### Task 3.2: Verify API typecheck + tests
- [ ] `pnpm --filter @zeno/api run typecheck`
- [ ] `pnpm --filter @zeno/api run test`
- [ ] Commit: `refactor(api): remove approval-rules CRUD route (spec 0050)`

## Phase 4: Dashboard layer

### Task 4.1: Delete sensitive-tools UI
- [ ] `rm apps/dashboard/src/components/settings/sensitive-tools-section.tsx`
- [ ] `rm apps/dashboard/src/components/settings/add-rule-modal.tsx`
- [ ] `rm apps/dashboard/src/lib/use-approval-rules.ts`
- [ ] `rm apps/dashboard/src/lib/use-rule-match-preview.ts`
- [ ] `rm apps/dashboard/tests/components/settings/sensitive-tools-section.test.tsx`
- [ ] `rm apps/dashboard/tests/components/settings/add-rule-modal.test.tsx`

### Task 4.2: Drop sensitive-tools render from Settings page
- [ ] Find the Settings route component (likely `apps/dashboard/src/routes/_authed/settings.tsx` or similar).
- [ ] Remove the `<SensitiveToolsSection />` render and its imports.
- [ ] Verify the page still renders coherently (toast helper / other sections intact).

### Task 4.3: Verify dashboard typecheck + tests
- [ ] `pnpm --filter @zeno/dashboard run typecheck`
- [ ] `pnpm --filter @zeno/dashboard run test`
- [ ] Commit: `refactor(dashboard): remove sensitive-tools settings section (spec 0050)`

## Phase 5: Worker — leaf policies

### Task 5.1: Delete 5 policy files
- [ ] `rm apps/worker/src/guardrails/policies/always-allowed.ts`
- [ ] `rm apps/worker/src/guardrails/policies/always-sensitive.ts`
- [ ] `rm apps/worker/src/guardrails/policies/classifier-gate.ts`
- [ ] `rm apps/worker/src/guardrails/policies/audit.ts`
- [ ] `rm apps/worker/src/guardrails/policies/read-only-skill.ts`
- [ ] `rm apps/worker/tests/guardrails/policies/always-allowed.test.ts`
- [ ] `rm apps/worker/tests/guardrails/policies/always-sensitive.test.ts`
- [ ] `rm apps/worker/tests/guardrails/policies/classifier-gate.test.ts`
- [ ] `rm apps/worker/tests/guardrails/policies/audit.test.ts`
- [ ] `rm apps/worker/tests/guardrails/policies/read-only-skill.test.ts`

### Task 5.2: Stage commit (compile not yet green)
- [ ] DO NOT typecheck yet — orphan imports remain in `pipeline.ts`, `guarded-backend.ts`, `index.ts`. They go in subsequent phases.

## Phase 6: Worker — approver + classifier

### Task 6.1: Delete approver + classifier dirs
- [ ] `rm -rf apps/worker/src/guardrails/approver/`
- [ ] `rm -rf apps/worker/src/guardrails/classifier/`
- [ ] `rm -rf apps/worker/tests/guardrails/approver/`
- [ ] `rm -rf apps/worker/tests/guardrails/classifier/`

## Phase 7: Worker — pipeline + supports + skill-registry

### Task 7.1: Delete supporting modules
- [ ] `rm apps/worker/src/guardrails/pipeline.ts`
- [ ] `rm apps/worker/src/guardrails/slack-context.ts`
- [ ] `rm apps/worker/src/guardrails/async-context.ts`
- [ ] `rm apps/worker/src/guardrails/config.ts`
- [ ] `rm apps/worker/src/guardrails/skill-registry.ts`
- [ ] `rm apps/worker/tests/guardrails/pipeline.test.ts`
- [ ] `rm apps/worker/tests/guardrails/slack-context.test.ts` (if exists)
- [ ] `rm apps/worker/tests/guardrails/config.test.ts`
- [ ] `rm apps/worker/tests/guardrails/skill-registry.test.ts`

### Task 7.2: Shrink types.ts
- [ ] Open `apps/worker/src/guardrails/types.ts`. Determine which types are still needed by `connector-permission.ts` and `connector-gated-backend.ts`.
- [ ] Drop `PolicyMiddleware`, `PolicyContext`, `PolicyDecision` if no longer needed (or shrink to the subset).
- [ ] If types.ts becomes empty, delete it.

## Phase 8: Worker — connector-permission policy tightened

### Task 8.1: Rewrite the policy with explicit decision tree
- [ ] Open `apps/worker/src/guardrails/policies/connector-permission.ts`.
- [ ] Update doc comment to describe the new tree.
- [ ] Change the function to return a non-undefined decision in every path:
  - non-mcp tool name → `{ allow: false, reason: 'non-MCP tools are not available; install or use a connector', policyThatGated: 'non_mcp_deny' }`
  - mcp + slug not in DB → `{ allow: true, reason: 'built-in MCP from agent/mcp.json', policyThatGated: 'builtin_mcp' }`
  - mcp + slug in DB + tool not in connector → `{ allow: false, reason: \`tool ${bareTool} not registered with connector ${slug}\`, policyThatGated: 'unknown_tool' }`
  - permission='never' → existing deny path
  - permission='always_allow' → existing allow path
  - permission='ask' → `{ allow: true, reason: \`connector ${slug} permission=ask treated as allow\`, policyThatGated: 'connector_ask_allow' }` (with code comment explaining 0050's decision)
- [ ] Update `apps/worker/tests/guardrails/policies/connector-permission.test.ts` with assertions for every branch (6 cases).

## Phase 9: Worker — guarded-backend → connector-gated-backend

### Task 9.1: Rename file + class
- [ ] `git mv apps/worker/src/guardrails/guarded-backend.ts apps/worker/src/guardrails/connector-gated-backend.ts`
- [ ] Open the renamed file. Rename `GuardedBackend` → `ConnectorGatedBackend`. Update exports.
- [ ] Body shrinks: drop pipeline, drop policies array, drop skill-registry, drop async-context. The class wraps an `AgentBackend`; on each tool call invokes the connector-permission policy directly; deny throws.

### Task 9.2: Rewrite test
- [ ] `git mv apps/worker/tests/guardrails/guarded-backend.test.ts apps/worker/tests/guardrails/connector-gated-backend.test.ts`
- [ ] Rewrite test file: instantiate `ConnectorGatedBackend` with a fake AgentBackend + a fake ConnectorRepo; verify allow/deny flow matches the policy decision tree.

## Phase 10: Worker — system-prompt skill loading removed

### Task 10.1: Drop skill load functions + signature
- [ ] Open `apps/worker/src/agent/system-prompt.ts`. Remove `loadAlwaysActiveSkills()` (function + its callers).
- [ ] Update `buildSystemPrompt()` signature: drop the `alwaysActiveSkillContents: string[] = []` parameter and the "Active skills" block.
- [ ] Drop the `SKILL_CANDIDATES` constant.
- [ ] Update `apps/worker/tests/agent/system-prompt.test.ts` (or wherever it's tested) to drop skill-related assertions.

### Task 10.2: Delete config helper
- [ ] `rm apps/worker/src/config/always-active-skills.ts`

## Phase 11: Worker — boot wire-up

### Task 11.1: Strip apps/worker/src/index.ts
- [ ] Delete the import lines for: `loadApprovalsConfig`, `HaikuClassifier`, `SlackApprover`, `makeAuditLogger`, `makeAlwaysAllowedPolicy`, `makeAlwaysSensitivePolicy`, `makeClassifierGatePolicy`, `makeReadOnlySkillPolicy`, `loadSkillRegistry`, `loadAlwaysActiveSkillNames`, `loadAlwaysActiveSkills`, `GuardedBackend`.
- [ ] Add new import: `ConnectorGatedBackend` from `@/guardrails/connector-gated-backend`.
- [ ] Delete the `approvalsConfig` block (the parse + the conditional `if (approvalsConfig && isClaudeBackend)`). The chat backend wireup is now unconditional.
- [ ] Delete the `policies` array, `audit` declaration, `approver` declaration, `classifier` declaration, `skillRegistry`.
- [ ] Construct `chatBackend` as `new ConnectorGatedBackend({ backend: claudeBackend, connectorRepo: connectors })` (or matching the new constructor signature).
- [ ] Update `buildSystemPrompt` call to drop the third argument.
- [ ] Update calls passing `approvalRules` to handler factory: drop that key.
- [ ] Drop the `approvalsLog` repo wiring.
- [ ] Drop `loadAlwaysActiveSkillNames` + `loadAlwaysActiveSkills` calls.

## Phase 12: Worker — handlers

### Task 12.1: Drop approval-rules from handler deps
- [ ] `apps/worker/src/commands/handlers/index.ts` — drop `approvalRules: ApprovalRulesRepo` from `HandlerDeps` interface; drop the `approvalRules` key from the `buildHandlerMap` calls; ensure `connector_create`, `connector_uninstall`, `app_uninstall` handlers don't receive it.
- [ ] `apps/worker/src/commands/handlers/connector-create.ts` — drop the `approvalRules.upsertAuto(...)` call (auto-rule creation on connector install was the spec 0047 behavior).
- [ ] `apps/worker/src/commands/handlers/connector-uninstall.ts` — drop the `approvalRules.deleteAutoMatching(...)` cascade.
- [ ] `apps/worker/src/commands/handlers/app-uninstall.ts` — drop the analogous cascade added by R1 F1 in batch-2.

### Task 12.2: Update handler tests
- [ ] `apps/worker/tests/commands/connector-handlers.test.ts` (or wherever) — drop tests that assert auto-rule creation/cascade.
- [ ] `apps/worker/tests/commands/app-handlers.test.ts` — delete the two R1 F1 tests (`cascade-deletes auto rules scoped to mcp__github-app-%`, `still cascades auto rules even when singleton is null`); existing app_install / app_pem_rotated / app_uninstall tests stay.

## Phase 13: Worker — config schema rejects `approvals:`

### Task 13.1: Make approvals a forbidden key
- [ ] Locate the zod schema that parses `profile/config.yaml` (likely `apps/worker/src/config.ts`).
- [ ] Change the schema so `approvals` is not just optional-and-ignored — it's explicitly rejected with a clear error message.
- [ ] Add a test asserting the rejection.

## Phase 14: Worker — cron loader

### Task 14.1: Drop always_active_skills from KNOWN_SECTIONS
- [ ] `apps/worker/src/cron/static-loader.ts` — find `KNOWN_SECTIONS = new Set([...])` and drop `'always_active_skills'`.
- [ ] Update its test if it asserts the set.

## Phase 15: Worker — profile watcher

### Task 15.1: Drop skills/ ignore branch
- [ ] `apps/worker/src/profile/watcher.ts` — find `if (normalized.startsWith('skills/') || normalized === 'skills') return 'ignored';` and remove it.
- [ ] Update `apps/worker/tests/profile/watcher.test.ts` — drop the `skills/` ignored-path test case.

## Phase 16: Profile + agent yaml files

### Task 16.1: Delete `approvals:` blocks
- [ ] Open `profiles/fn/config.yaml`. Delete the entire `approvals:` block.
- [ ] Open `agent/config.example.yaml` (if present). Delete its `approvals:` block.

## Phase 17: Specs frontmatter

### Task 17.1: Mark specs 0023, 0028, 0047 superseded
For each of `context/specs/2026-04-21-guardrails-approval/spec.md`, `context/specs/2026-04-24-skill-final-reaction/spec.md`, `context/specs/2026-04-27-always-sensitive-db-ui/spec.md`:
- [ ] Add `status: superseded` and `superseded_by: 0050` to the existing frontmatter (preserve all other fields).
- [ ] Add a one-paragraph banner under the frontmatter:
  ```
  > **Superseded** by spec [[../2026-04-27-strip-skills-and-classifier/spec|2026-04-27-strip-skills-and-classifier]] — the runtime systems described here (Haiku classifier + Slack approver / skill-controlled reactions / always-sensitive DB UI) were removed in spec 0050. See [[../../learnings/connectors-only-pivot]] for context, and [[../../learnings/how-to-read-pre-cleanup-specs]] for the convention.
  ```
- [ ] Body content unchanged.

## Phase 18: Quality gate

### Task 18.1: Run full quality gate
- [ ] `pnpm run lint` — fix any holdouts.
- [ ] `pnpm run typecheck` — fix any holdouts.
- [ ] `pnpm run test` — fix any holdouts.
- [ ] Single command: `pnpm run quality-gate` ends green (30/30 turbo tasks).
- [ ] Net test count drops by ~80–120; surviving tests pass.
- [ ] Commit any straggler fixes with messages like `refactor(worker): drop ${module} (spec 0050)`.

## Phase 19: Docker boot test

### Task 19.1: Rebuild + boot + verify
- [ ] `PROFILE=fn pnpm run docker:down`
- [ ] `pnpm run docker:build`
- [ ] `PROFILE=fn pnpm run docker:up`
- [ ] `docker logs zeno-fn-agent-1 | head -100` — verify:
  - `migrations_applied` event present (migration 10 ran).
  - `github_app_metadata_backfilled` + 4 `github_app_token_initialized` events present.
  - `mcp_loaded` lists 5 (sentry, linear, klaviyo, swarmia, playwright) + 4 github-app installations = 9 servers.
  - **No mention of:** `always_active_skill_loaded`, `guardrails_enabled`, `classifier`, `approver`, `sensitive` in logs.
  - `slack_connected` + `zeno_online` present.

## Phase 20: E2E via Slack (Rule 1 of cleanup contract)

### Task 20.1: Real interaction with running Zeno
- [ ] Send `@zeno-agent` a normal request from the FN Slack workspace ("which orgs do you have access to?"). Verify the agent answers correctly based on RUNTIME tools, not skill content (skills are gone).
- [ ] Send a request that requires a specific MCP tool ("list the most recent Sentry issues for FN"). Verify the agent calls `mcp__sentry__*` and reports results.
- [ ] Send a request beyond connector capability ("delete the production database"). Verify the agent refuses honestly (per the new SOUL.md "honesty over plausibility" rule).
- [ ] Verify the agent does NOT receive a Slack DM asking the operator to approve any tool call (no approval flow remains).
- [ ] Verify worker logs show ZERO classifier or approver invocations during the conversation.

## Phase 21: Three-round review on the doc set + code diff

### Task 21.1: Round 1
- [ ] Read `git diff main..HEAD --stat` to see the breadth of the cleanup.
- [ ] Spot-check each modified file: any leftover skill or approval mention not deliberately preserved?
- [ ] Spot-check the rewritten `connector-permission.ts` and `connector-gated-backend.ts`: do they implement the spec's decision tree faithfully?
- [ ] Any finding → fix → reset counter to round 1.

### Task 21.2: Round 2
- [ ] Repeat round 1 with fresh eyes.

### Task 21.3: Round 3 (independent subagent)
- [ ] Dispatch an Explore subagent: prompt it to read `git diff main..HEAD` and report any: (a) skill-as-runtime mention surviving outside superseded specs, (b) classifier/approver/policy chain mention surviving, (c) test still expecting deleted modules, (d) untightened policy fallthrough, (e) yaml schema accepting `approvals:`. Report findings or `CLEAN`.
- [ ] Any finding → fix → reset to round 1.
- [ ] When all three rounds CLEAN consecutively, commit any final fix-ups.

## Phase 22: Push + open PR

### Task 22.1: Pre-flight
- [ ] `git status` — clean.
- [ ] `git log --oneline docs/zeno-redefinition..HEAD` — confirm phase commits are coherent.
- [ ] `git diff docs/zeno-redefinition..HEAD --stat` — confirm net code reduction.

### Task 22.2: Push + PR
- [ ] `git push -u origin chore/strip-skills-and-classifier`
- [ ] `gh pr create --base docs/zeno-redefinition --head chore/strip-skills-and-classifier --title "..." --body "..."`
- [ ] Output PR URL.
