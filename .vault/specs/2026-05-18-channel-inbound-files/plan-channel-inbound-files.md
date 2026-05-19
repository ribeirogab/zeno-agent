---
feature: channel-inbound-files
spec: "[[spec-channel-inbound-files]]"
created: 2026-05-18
---
# Channel Inbound Files — Implementation Plan

> **For agentic workers:** Execute task-by-task from `[[tasks-channel-inbound-files]]`. Steps use checkbox (`- [ ]`) syntax for tracking.

**For this spec:** [[spec-channel-inbound-files]]

**Goal:** Land issue [#9](https://github.com/ribeirogab/zeno-agent/issues/9) in a single PR (`feat/channel-inbound-files`): rename `wrapWithSlackContext` → `wrapWithChannelContext` in `apps/worker/src/agent/core.ts` and de-gate the `[attached_files]` injection so any channel populating `IncomingMessage.attachments[]` surfaces them to the agent prompt; add a `try/catch/finally` cleanup in `SlackChannel`'s dispatch loop so `<workspaceDir>/uploads/<correlationId>/` is removed after every turn (success or handler throw); update existing tests and add new unit coverage; execute a manual E2E gate against Slack channel `C0B0GLS5UTB` in workspace `flavianasser.slack.com`.

**Architecture:** Two surgical edits with zero new files in `src/`. The agent core's wrapper currently short-circuits on `message.platform !== 'slack'` and returns the raw text; this couples the core to one channel. After this plan, the wrapper composes optional blocks: `[slack_context]` and `[parent_message]` remain gated by `platform === 'slack'`; `[attached_files]` runs whenever `attachments?.length > 0` regardless of platform. The Slack adapter remains the only adapter that downloads files today, but the contract the agent core relies on is now channel-agnostic — a future Discord/Telegram adapter populates `attachments[]` the same way and gets prompt surfacing for free. The per-turn cleanup is a 12-line addition in the Slack adapter's `dispatch` callback: track the uploads dir when `downloadSlackFiles` is invoked, `rm -rf` it in `finally`. Quality gate (`pnpm run quality-gate`) must pass at every commit. Slack remains the only channel adapter shipped in this PR — `agent/channels-catalog.json` and the dashboard are untouched.

**Tech Stack:** TypeScript strict, Node 24 LTS (Docker), pnpm 10 workspaces, [@slack/bolt@4](https://slack.dev/bolt-js/) (Socket Mode), [vitest](https://vitest.dev/), [biome](https://biomejs.dev/), `node:fs/promises` (rm), `node:path` (join). No new dependencies.

---

## Architecture

### Module boundaries

```
apps/worker/src/
  agent/
    core.ts                                ← MODIFY: rename wrapWithSlackContext → wrapWithChannelContext;
                                              de-gate [attached_files] (always emitted when attachments?.length);
                                              [slack_context] + [parent_message] stay platform-gated.
  channels/
    slack/
      adapter.ts                           ← MODIFY: wrap `await this.handler(message)` in try/catch/finally;
                                              track uploadsDir when downloadSlackFiles is invoked;
                                              rm -rf in finally with own try/catch for cleanup-failure tolerance.
                                              Add imports: `rm` from node:fs/promises, `join` from node:path.

apps/worker/tests/
  agent/
    wrap-context.test.ts                   ← MODIFY: rename `describe('wrapWithSlackContext'` →
                                              `describe('wrapWithChannelContext'`; rename all `wrapWithSlackContext(...)`
                                              calls to `wrapWithChannelContext(...)`; add 3 parity tests with `toBe`
                                              assertions; add 2 non-slack-with-attachments tests.
  channels/slack/
    adapter.test.ts                        ← NEW: 5 tests covering cleanup behavior. vi.mock('@slack/bolt')
                                              following wait-reaction.test.ts pattern; real tmpdir() workspace.
```

### Data flow (unchanged shapes)

The contract surface from spec [[../2026-04-29-slack-channel/spec-slack-channel|2026-04-29-slack-channel]] is preserved byte-for-byte for the Slack code path:

```
Slack event (with files[])
  └─> SlackChannel.dispatch
      ├─> normalizeSlackEvent → IncomingMessage (no attachments yet)
      ├─> [if thread] fetch parent → message.parentText = ...
      ├─> [if files] downloadSlackFiles(...) → message.attachments = Attachment[]
      │              └─ mkdir uploads/<correlationId>/    ← always runs when called
      ├─> [TRY]   await this.handler(message)
      │           └─> handler invokes AgentCore.handleMessage
      │               └─> wrapWithChannelContext(message)  ← was wrapWithSlackContext
      │                   ├─ [slack_context] + [parent_message]   (gated: platform === 'slack')
      │                   └─ [attached_files]                     (gated: attachments?.length > 0; platform-agnostic)
      ├─> [CATCH] log handler_error                              ← existing behavior preserved
      └─> [FINALLY] rm -rf uploads/<correlationId>/ if dir was created  ← NEW
                    └─ inner try/catch: warn-log `slack_uploads_cleanup_failed`, swallow
```

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/worker/src/agent/core.ts` | MODIFY | Rename `wrapWithSlackContext` to `wrapWithChannelContext`; restructure body to split Slack-gated blocks from the universal `[attached_files]` block. Update single call site (line 82). |
| `apps/worker/src/channels/slack/adapter.ts` | MODIFY | Add `try/catch/finally` around `await this.handler(message)` (around lines 116-130); track `uploadsDir` when `downloadSlackFiles` is invoked; `rm` it in `finally`. Add imports. |
| `apps/worker/tests/agent/wrap-context.test.ts` | MODIFY | Update existing tests (rename + parity), add new cases. |
| `apps/worker/tests/channels/slack/adapter.test.ts` | NEW | Cleanup-behavior tests for `SlackChannel.dispatch`. |
| `.vault/specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files.md` | EXISTING | Source of truth for ACs. |
| `.vault/specs/2026-05-18-channel-inbound-files/plan-channel-inbound-files.md` | NEW (this file) | This plan. |
| `.vault/specs/2026-05-18-channel-inbound-files/tasks-channel-inbound-files.md` | NEW | Bite-sized tasks. |

No changes to: `apps/worker/src/channels/types.ts`, `apps/worker/src/channels/slack/files.ts`, `agent/channels-catalog.json`, dashboard, CLI, docs.

## Phase Ordering

The work has three phases. Phases 1 and 2 are independent (can be done in either order); phase 3 depends on both.

1. **Wrapper refactor + tests** (apps/worker/src/agent/core.ts + apps/worker/tests/agent/wrap-context.test.ts). TDD: update existing tests first (they fail with the rename), implement, watch them pass, add new tests for new behavior. Quality gate.
2. **Cleanup + tests** (apps/worker/src/channels/slack/adapter.ts + new adapter.test.ts). TDD: write new test file first, implement minimal cleanup, iterate. Quality gate.
3. **E2E gate**: execute E1-E4 scenarios in channel `C0B0GLS5UTB`; collect Slack permalinks + log snippets + post-cleanup `ls` output; assemble PR description with `## E2E Evidence` section.

Phase 1 → 2 → 3 chosen for tasks.md ordering for clarity. Implementer can swap 1 ↔ 2 if convenient — they don't share files.

## Risks / Open Decisions

| Risk | Decision / Mitigation |
|---|---|
| The existing test `returns plain text for non-slack platforms` (`wrap-context.test.ts:21-24`) currently relies on the bug — its fixture has no attachments, so the test happens to pass. After the rename, that exact assertion still holds (no attachments → text verbatim) — confirmed by re-reading the test fixture. No change needed to that specific test. | Keep test green; new tests cover the actual fix. |
| Renaming exported symbol breaks any external import. | `grep -rn 'wrapWithSlackContext' apps/worker` covers it (function is `@internal`, only call sites are `core.ts:82` and `wrap-context.test.ts`). Step 0 in Task 1 runs the grep. |
| The `vi.mock('@slack/bolt')` listener-registry pattern from `wait-reaction.test.ts` needs adaptation for `app_mention` events with `files: [...]`. | Task 4 includes the full mock setup with file-bearing fixture; pattern copy from wait-reaction is straightforward. |
| Cleanup tests would tightly couple to filesystem timing and risk flakiness. | Use synchronous `existsSync()` after `await dispatch(...)` resolves — the cleanup is in a `finally` block that completes before the awaited dispatch promise resolves. No race. |
| E2E gate (phase 3) blocks merge but cannot be automated. | Spec already documents this; implementer runs scenarios manually and posts evidence in PR description; reviewer enforces. |
| Implementer skips quality-gate between tasks. | Each task ends with explicit `pnpm run quality-gate` step; tasks.md enforces. |
| Implementer forgets to revert E4's forced throw. | E4 task explicitly includes a "Revert the throw and re-run quality-gate" step; final verification `grep -r 'e2e-forced-error' apps/worker/src` returns nothing. |
