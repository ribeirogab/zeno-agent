---
status: draft
feature: strip-skills-and-classifier
spec: "[[spec-strip-skills-and-classifier]]"
created: 2026-04-27
shipped: null
---
# Strip Skills Runtime + Haiku Classifier + Slack Approval Flow — Spec

**Status:** Draft
**Scope:** Implement the code-level cleanup mandated by spec [[../2026-04-27-zeno-redefinition/spec|0049]]: remove the runtime skill loading mechanism, the Haiku classifier, the Slack-approval flow, the always-sensitive policy chain, and the supporting infrastructure (approval_rules CRUD + repo + dashboard settings UI). Mark specs [[../2026-04-21-guardrails-approval/spec|0023]], [[../2026-04-24-skill-final-reaction/spec|0028]], [[../2026-04-27-always-sensitive-db-ui/spec|0047]] as `status: superseded` (`superseded_by: 0050`). The single guardrail that survives is `connector-permission` — per-tool allow/deny driven by the dashboard toggle.

## Context

Spec 0049 redefined Zeno around the connectors-only thesis at the documentation level. The code still embodies the prior thesis: the worker loads skill files into the system prompt at boot, the chat backend wraps every tool call in a multi-policy chain (always-sensitive, always-allowed, classifier-gate, audit, read-only-skill, connector-permission), the Haiku classifier decides if a call is sensitive, and a Slack approver routes the decision to the operator. None of that survives the new positioning: there is no operator/guest distinction in a single-user agent, "installing the connector is the approval", and skills as a runtime concept are deferred. The current implementation is dead weight.

The QA findings file at `tmp/qa-findings-batch-2.md` (gitignored) catalogs the surface area; finding #9 enumerates the skills runtime, finding #11 the guardrails infrastructure. The connectors-only-pivot learning summarizes the durable lesson.

This spec executes the removal. It is the second of three sequential PRs in the cleanup arc: PR 1 (#10, `docs/zeno-redefinition`) anchored the docs; PR 2 (this spec, `chore/strip-skills-and-classifier`) deletes code; PR 3 (spec 0051, `chore/connector-ux-cleanup`) deletes the operator-picked envVar, the rotate-PEM flow, the duplicate uninstall-app button, and fixes the alert→modal + post-uninstall navigation.

## Problem Statement

The worker, API, dashboard, storage package, and profile config files contain ~1500 lines of code (production + tests) implementing systems that are no longer canonical: skill loading, classifier, approver, policy chain, approval-rules CRUD, sensitive-tools UI, `__GITHUB_ENV_VAR__` references in skill content. This dead weight blocks the connectors-only thesis from being operationally true (the agent can still shell out via Claude Code's built-in `Bash`/`Read`/`Write`/`Edit`/`Grep`/`Glob` tools regardless of what SOUL.md says). Deleting it lets the agent be what the docs already declare.

## Non-Goals

- **Operator-picked envVar field, rotate-PEM, duplicate uninstall-app button, alert→modal, post-uninstall navigation** — out of scope; spec 0051 handles these.
- **Paper artboards updates** — out of scope; spec 0051 picks them up alongside the dashboard UI removals there.
- **Skills' future return design** — out of scope; future spec.
- **Renaming or restructuring `apps/worker/src/guardrails/` directory beyond what's required by the deletion** — keep the directory; just shrink it (one file moved + renamed, the rest deleted).
- **Migration to a new DB table layout** — `approval_rules` and any associated `approvals_log` table are dropped via a new migration (10), but no other schema changes.
- **Runtime skill format design (SKILL.md) cleanup of references in non-runtime code** — wikilinks in `context/specs/_template/` etc. are not part of the runtime; ignore.
- **Removing built-in Claude Code tools (`Bash`/`Read`/`Write`/`Edit`/...) from the SDK invocation** — the SDK still has them. The connector-permission gate is what enforces "no shell". A future spec may further restrict via `disallowedTools` SDK option; out of scope here.

## Constraints

- **Compile must stay green at every commit.** The phased order is bottom-up: delete leaf modules first, then the glue that imports them, then the boot wire-up. This way TypeScript points at exactly the next thing to fix at each step.
- **Quality gate (lint + typecheck + ~700 tests) must pass before the PR is opened.** Tests for deleted modules go too; tests for kept modules (connector-permission) may need rewrite to drop assumptions about the wrapper's prior shape.
- **Docker boot (operator profile) must produce a clean log to `zeno_online` after the changes are applied.** No `always_active_skill_loaded`, `mcp_loaded` (with skill-related entries), `guardrails_enabled`, classifier or approver events. The four github-app installations still acquire tokens.
- **The yaml `approvals:` block hard-fails at boot** if present, with a clear error message ("`approvals:` block was removed in spec 0050; delete it from your profile's `config.yaml`"). This matches the spec 0048 Q5 precedent for `always_sensitive`.
- **Constitution principle "Reversibility first":** revert of this PR must restore the prior code AND the prior frontmatter status of specs 0023/0028/0047 atomically.
- **Constitution principle "One decision at a time":** this spec is the implementation only; the architectural decision was 0049.

## User Stories / Scenarios

1. **A maintainer rebuilds Docker after this PR lands.** `pnpm run docker:build && PROFILE=<your-profile> pnpm run docker:up` succeeds. Logs show `migrations_applied`, `github_app_metadata_backfilled`, all four installations get tokens, `slack_connected`, `zeno_online`. No log line mentions `skill`, `classifier`, `approval`, or `sensitive`.

2. **The agent receives a Slack mention asking for something the connectors expose.** It responds composing connector tools (e.g. `mcp__sentry__list_issues` then `mcp__github-app-acme__create_pull_request`). It does NOT receive a Slack DM asking the operator for approval. It does NOT shell out via `Bash`.

3. **The agent receives a Slack mention asking for something no connector exposes** (e.g. "reboot the database server"). It answers honestly that no installed connector lets it do that. It does NOT try to script around the gap via shell.

4. **A maintainer opens `context/specs/2026-04-21-guardrails-approval/spec.md`.** The frontmatter shows `status: superseded` and `superseded_by: 0050`. A banner under the frontmatter explains the supersession.

5. **A maintainer with a profile yaml still containing the legacy `approvals:` block reboots Zeno.** The boot fails with a clear zod validation error pointing at the offending field and instructing the operator to remove it.

6. **An external contributor running `pnpm run quality-gate` after pulling this PR.** All 30 turbo tasks pass: lint, typecheck, tests across worker/api/dashboard/storage/github-app/mcp-discover/logger/ui packages.

## Success Criteria

- [ ] **Worker — skills runtime fully removed:**
  - `agent/skills/` deleted (along with `dev-workflow/SKILL.md` content).
  - `profiles/<your-profile>/skills/` deleted (backed up at `tmp/profile-backup-2026-04-27/skills/` already; no production loss).
  - `apps/worker/src/agent/system-prompt.ts` `loadAlwaysActiveSkills()` function removed; `buildSystemPrompt()` signature drops the `alwaysActiveSkillContents` parameter; the "Active skills" block is gone.
  - `apps/worker/src/config/always-active-skills.ts` deleted.
  - `apps/worker/src/guardrails/skill-registry.ts` deleted.
  - `apps/worker/src/cron/static-loader.ts` `KNOWN_SECTIONS` no longer contains `'always_active_skills'`.
  - `apps/worker/src/profile/watcher.ts` `skills/` ignore branch removed.
- [ ] **Worker — guardrails approval flow fully removed:**
  - `apps/worker/src/guardrails/approver/` directory deleted.
  - `apps/worker/src/guardrails/classifier/` directory deleted.
  - `apps/worker/src/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,audit,read-only-skill}.ts` deleted.
  - `apps/worker/src/guardrails/{pipeline,slack-context,async-context,config}.ts` deleted.
  - `apps/worker/src/guardrails/types.ts` shrunk to types still in use (or deleted if no consumer remains).
  - `apps/worker/src/guardrails/guarded-backend.ts` renamed to `connector-gated-backend.ts`; class renamed `ConnectorGatedBackend`; content shrunk to the connector-permission check only (no more skill registry, no more pipeline, no more policy context with `skillReadOnly`).
  - `apps/worker/src/index.ts` boot sequence drops every reference to: `loadApprovalsConfig`, `HaikuClassifier`, `SlackApprover`, `makeAuditLogger`, `approvalsLog`, `makeAlwaysAllowedPolicy`, `makeAlwaysSensitivePolicy`, `makeClassifierGatePolicy`, `makeReadOnlySkillPolicy`, `loadSkillRegistry`, `loadAlwaysActiveSkillNames`, `loadAlwaysActiveSkills`. `guardedDeps` is replaced by direct construction of `ConnectorGatedBackend`.
  - **Single survivor:** `apps/worker/src/guardrails/policies/connector-permission.ts` stays — but its semantics are tightened (next bullet).
- [ ] **Connector-permission policy semantics tightened (no more fallthrough to deleted policies):**
  - The policy currently returns `undefined` for non-`mcp__` tool names AND for `permission='ask'`, expecting downstream policies to decide. After this cleanup there is no downstream — `undefined` has no destination.
  - **New explicit decision tree:**
    - Tool name does NOT match `mcp__<slug>__<bareTool>` → **deny** (`reason: 'non-MCP tools are not available; install or use a connector'`). This hard-blocks `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `Task` and any other Claude Code SDK built-in tools, making the constitution's "no shell, no filesystem" claim operationally true.
    - Tool name matches `mcp__<slug>__<bareTool>` AND `slug` is NOT in `connector_repo` → **allow** (built-in MCPs from `agent/mcp.json` like `playwright` ride this slot — they are operator-committed in the repo, distinct from DB-managed catalog connectors).
    - Tool matches AND slug is in `connector_repo` AND tool entry has `permission='never'` → **deny**.
    - Tool matches AND slug is in `connector_repo` AND tool entry has `permission='always_allow'` → **allow**.
    - Tool matches AND slug is in `connector_repo` AND tool entry has `permission='ask'` → **allow** (rationale: in the new model, "installing the connector with this permission setting" is the operator's pre-approval; if they want hard-block they set `'never'`. The 'ask' value remains in the schema for compatibility with existing connector_tools rows; future spec may rename it to 'allow' or remove the third state.).
    - Tool matches AND slug is in `connector_repo` AND tool is NOT in the connector's tools list → **deny** (`reason: 'tool not registered with connector ${slug}'`).
  - The policy's return type stays `PolicyDecision` (allow|deny + reason); `undefined` is never returned.
  - `ConnectorGatedBackend` calls the policy directly (no pipeline) and acts on the decision; deny throws an exception that the agent observes as a tool error.
- [ ] **API — approval-rules CRUD removed:**
  - `apps/api/src/routes/approval-rules.ts` deleted.
  - `apps/api/tests/routes/approval-rules.test.ts` deleted.
  - `apps/api/src/index.ts` and `apps/api/src/server.ts` drop the route registration and `approvalRules` from deps.
- [ ] **Storage — approval-rules repo + DB table removed:**
  - `packages/storage/src/repos/approval-rules.ts` deleted.
  - `packages/storage/tests/approval-rules.test.ts` deleted.
  - `packages/storage/src/index.ts` drops the export.
  - `packages/storage/src/types.ts` drops the `ApprovalRule` type.
  - **Migration 10 added:** `DROP TABLE IF EXISTS approval_rules; DROP TABLE IF EXISTS approvals_log;` (with any associated indexes via `DROP INDEX IF EXISTS`).
  - `packages/storage/tests/migrations.test.ts` updated to expect the new migration count.
- [ ] **Dashboard — sensitive-tools settings UI removed:**
  - `apps/dashboard/src/components/settings/sensitive-tools-section.tsx` deleted.
  - `apps/dashboard/src/components/settings/add-rule-modal.tsx` deleted.
  - `apps/dashboard/src/lib/use-approval-rules.ts` deleted.
  - `apps/dashboard/src/lib/use-rule-match-preview.ts` deleted.
  - `apps/dashboard/tests/components/settings/{sensitive-tools-section,add-rule-modal}.test.tsx` deleted.
  - The Settings page route's render no longer references the sensitive-tools section; layout reflows naturally.
- [ ] **Worker — handler-side cleanup of auto-rule cascade:**
  - `apps/worker/src/commands/handlers/connector-create.ts` drops the `approvalRules.upsertAuto(...)` block (auto-create rules on connector install).
  - `apps/worker/src/commands/handlers/connector-uninstall.ts` drops the `approvalRules.deleteAutoMatching(...)` cascade.
  - `apps/worker/src/commands/handlers/app-uninstall.ts` drops the analogous cascade added by R1 F1 in batch-2.
  - `apps/worker/src/commands/handlers/index.ts` `HandlerDeps` drops `approvalRules`.
- [ ] **Profile config:**
  - `profiles/<your-profile>/config.yaml` `approvals:` block deleted entirely.
  - `agent/config.example.yaml` (if present) `approvals:` block deleted.
  - The yaml schema (zod) defined for the `config.yaml` parser **rejects** the `approvals` field if present, with a fatal validation error pointing at spec 0050.
- [ ] **Tests — removed for deleted modules; rewritten for kept modules:**
  - `apps/worker/tests/guardrails/{approver,classifier}/**` deleted.
  - `apps/worker/tests/guardrails/policies/{always-allowed,always-sensitive,classifier-gate,audit,read-only-skill}.test.ts` deleted.
  - `apps/worker/tests/guardrails/{pipeline,slack-context,config,skill-registry}.test.ts` deleted.
  - `apps/worker/tests/guardrails/guarded-backend.test.ts` rewritten as `apps/worker/tests/guardrails/connector-gated-backend.test.ts` testing only the connector-permission path.
  - `apps/worker/tests/guardrails/connector-permission.test.ts` survives unchanged or with minor adaptation if the policy signature simplified.
  - `apps/worker/tests/profile/watcher.test.ts` drops the `skills/` ignored-path test case.
- [ ] **Specs marked superseded:**
  - `context/specs/2026-04-21-guardrails-approval/spec.md` frontmatter gets `status: superseded` + `superseded_by: 0050`; one-paragraph banner under frontmatter; body unchanged.
  - `context/specs/2026-04-24-skill-final-reaction/spec.md` same treatment.
  - `context/specs/2026-04-27-always-sensitive-db-ui/spec.md` same treatment.
- [ ] **Documentation — minor updates if internal links break:**
  - `context/learnings/connectors-only-pivot.md` references stay accurate (the file mentions specifics that are deleted; if any reference rots, fix in this PR).
  - `context/_index/specs.md` and `context/_index/learnings.md` updated only if they listed superseded specs as canonical.
- [ ] **Quality gate green:** `pnpm run quality-gate` passes (30/30 tasks). Total test count drops by approximately 80-120 tests (removed ones); remaining tests pass.
- [ ] **Docker boot clean:** `pnpm run docker:build && PROFILE=<your-profile> pnpm run docker:up`. Logs to `zeno_online` show no skill/classifier/approval mentions; all 4 github-app installations get tokens; settings page renders without the sensitive-tools section.
- [ ] **E2E via Slack (Rule 1):** mention `@zeno-agent` from the Slack workspace; verify (a) it answers via connector tools only (no Bash invocation in logs), (b) for a request beyond connector capability it answers honestly (no fabrication), (c) for a tool call that would have been "sensitive" before, it executes directly without DM-approval roundtrip.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The bottom-up phased order causes a long stretch where typecheck fails, slowing iteration. | Each phase is a separate commit. The compiler points at the next surgery. The phased order is documented in plan.md so a reviewer can replay the path mentally. |
| Removing `__GITHUB_ENV_VAR__` reserved key references breaks the env-var injection that the worker still does on each refresh tick (the operator-picked env var). | Out of scope here — that's spec 0051. In this PR, the reserved key remains and the env var injection still happens. The worker's `process.env[envVar]` write stays; the *consumers* (skill files referencing the env var) are gone. The dead-but-harmless write goes in 0051. |
| The `approvals_log` table stores classifier decisions historically; dropping it removes audit trail. | Acceptable: no readers exist after this cleanup, so the data is unreachable. If anyone wants the historical decisions, they pre-cleanup. The migration uses `IF EXISTS` so re-runs and missing-table cases are graceful. |
| The yaml schema rejecting `approvals:` breaks any operator who pulls this PR with the legacy block still in their `config.yaml`. | This is the intended hard-fail (spec 0048 Q5 precedent). The error message tells the operator exactly what to do. The operator's profile `config.yaml` is updated in this PR; operators on other profiles are explicitly responsible for editing their yaml on upgrade. |
| The `tmp/profile-backup-2026-04-27/` backup of the operator's profile (from the spec 0049 workflow) should be preserved as recovery, but it's gitignored. | No mitigation needed: the backup is local-only, on the operator's machine. If they want a committed backup, they create it explicitly before merging. |
| Renaming `guarded-backend.ts` → `connector-gated-backend.ts` may create rebase friction with PR 1 if PR 1 needs late changes. | PR 1 (#10) is docs-only, didn't touch this file. The rename is local to PR 2; PR 3 will branch off PR 2 cleanly. |
| The constitution.md `Sandboxed execution` principle says "the agent runs inside a Docker container with no shell or filesystem access of its own". After this PR, the agent's runtime still has Claude Code SDK's built-in `Bash`/`Read`/`Write`/`Edit` tools registered (the SDK adds them automatically). The connector-permission policy now actively denies all non-`mcp__` tools, but the tools are still IN THE TOOLS LIST that the agent sees. The constitution claim becomes operationally true (denies enforce the rule) but the agent gets a denial each time it tries a built-in. | Document this as a known seam: spec 0050 enforces "connector tools only" via runtime-deny (the tightened connector-permission policy denies any tool not matching `mcp__<slug>__<bareTool>`). A future spec can disable Bash/Read/Write/Edit at the SDK level via `disallowedTools` for cleaner UX (the agent stops seeing them in its tools list, never tries them). Recorded as a potential follow-up. |

## Open Questions

None at this time. All five brainstorming questions resolved with the multi-perspective protocol; final calls recorded above and in plan.md.
