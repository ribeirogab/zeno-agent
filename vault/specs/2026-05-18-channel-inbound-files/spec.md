---
status: draft
feature: channel-inbound-files
created: 2026-05-18
shipped: null
issue: https://github.com/ribeirogab/zeno-agent/issues/9
---
# Channel Inbound Files — Spec

**Status:** Draft
**Branch:** `worktree-issue-9-channel-inbound-files`
**Scope:** Standardise inbound file attachment pass-through across channel adapters by de-Slack-gating the prompt-context wrapper in `apps/worker/src/agent/core.ts` and adding per-turn cleanup of the local `uploads/<correlationId>/` directory in `apps/worker/src/channels/slack/adapter.ts`. Slack remains the only adapter shipped in this spec; the change unblocks future Discord/Telegram/WhatsApp adapters from editing `core.ts` to surface attachments.

## Context

Zeno's worker already implements most of the inbound-file flow:

- `apps/worker/src/channels/types.ts` defines `IncomingMessage.attachments?: Attachment[]` and the `Attachment` shape (`{name, mimetype, localPath, sizeBytes}`).
- `apps/worker/src/channels/slack/adapter.ts:102-108` downloads Slack file attachments via `downloadSlackFiles()` (in `apps/worker/src/channels/slack/files.ts`) into `<workspaceDir>/uploads/<correlationId>/`, populating `message.attachments` before invoking the message handler.
- `apps/worker/src/agent/core.ts:173-204` (`wrapWithSlackContext`) injects an `[attached_files]` block listing local paths into the agent prompt so Claude Agent SDK's `Read` tool can open them.

Two architectural gaps block the next channel adapter:

1. **`wrapWithSlackContext` is hard-gated on `platform === 'slack'`** (`core.ts:174`). Any future adapter (Discord, Telegram) that populates `IncomingMessage.attachments[]` would see them silently dropped from the prompt — the agent would never know they exist.
2. **Downloaded files in `<workspaceDir>/uploads/<correlationId>/` are never cleaned up.** Each turn accumulates a new directory; over time the workspace fills with stale uploads. This is an existing bug independent of the generalisation, but it is small enough to fix in the same spec rather than file a separate issue.

Issue [#9](https://github.com/ribeirogab/zeno-agent/issues/9) (roadmap `Next`, sized M) names this work "channel inbound files" and points to the shipped Slack channel spec [[../2026-04-29-slack-channel/spec-slack-channel|2026-04-29-slack-channel]] as the foundation. The cited spec's `Channel` port + `Attachment` type already establish the contract; this spec only fills the two gaps above.

## Problem Statement

1. **The agent core's prompt-injection step refuses to surface attachments for any platform other than Slack.** This violates the constitution's "channels are plugs" principle: a future Discord adapter must edit `agent/core.ts` to enable its own attachments, which couples the core to every new channel.
2. **The Slack adapter leaks downloaded files into `<workspaceDir>/uploads/`.** Operators who use file-heavy workflows accumulate gigabytes of stale uploads over weeks. There is no TTL sweep, no per-turn cleanup, and no operator-facing tool to clear it.

## Non-Goals

The following are explicitly OUT of scope for this spec:

- **Adding a second channel adapter** (Discord, Telegram, WhatsApp). This spec ships the *infrastructure* for channel-agnostic attachment pass-through; the only adapter populating `attachments[]` after merge is still Slack. Future channel adapters get their own specs.
- **Extracting a shared download helper** (e.g., `apps/worker/src/channels/files.ts` that accepts a generic auth header). Each platform's auth is divergent enough (Slack Bearer, Discord bot token + different URL shape, Telegram getFile two-step) that a premature abstraction would be lossy. Each adapter keeps its own downloader until at least one more adapter exists.
- **Shared size/mimetype policy module** (`channels/limits.ts`). The 50 MB cap in `slack/files.ts` (`MAX_FILE_BYTES`) stays local. No mimetype allow-list — the agent decides what to do with each file via the `Read` tool.
- **Dashboard/profile-level configuration for attachment limits or mimetype filters.** No UI surface, no DB schema, no operator-tunable knobs in this spec.
- **TTL background sweep of `<workspaceDir>/uploads/`.** The per-turn `try/finally` cleanup in the adapter is sufficient for the bug described; a periodic sweeper is unjustified complexity.
- **Outbound file attachments** (bot uploading files to the channel). That is issue [#10](https://github.com/ribeirogab/zeno-agent/issues/10), separate spec.
- **Audio in / audio out** (Slack voice transcription, TTS reply). Issues [#11](https://github.com/ribeirogab/zeno-agent/issues/11) and [#12](https://github.com/ribeirogab/zeno-agent/issues/12), separate specs.
- **Changing the `Channel` interface** in `apps/worker/src/channels/types.ts`. No new methods, no new fields on `Attachment` or `IncomingMessage`. The interface as-is already supports the goal.
- **Changing the `[attached_files]` block format.** The current format (`- <localPath> (<mimetype>, <name>)` plus the trailing "Read the attached files before responding." instruction) is preserved byte-for-byte.

## Constraints

- **Backward compatibility (slack code path):** the prompt string returned by the renamed wrapper for any `platform === 'slack'` `IncomingMessage` MUST be byte-identical to the string returned by the current `wrapWithSlackContext` for the same input. Claude Agent SDK's prompt cache key depends on the exact bytes of the user message; a change would invalidate cached sessions for every active profile on the first message after merge. The unit test suite (see Acceptance Criteria) enforces this.
- **No `Channel` interface changes:** the spec must compose with the shipped Slack channel work ([[../2026-04-29-slack-channel/spec-slack-channel|2026-04-29-slack-channel]]) without re-opening that interface. Any change there would force every present and future adapter to re-implement a new contract method.
- **Cleanup must be best-effort:** a failed `rm` on the uploads directory MUST NOT propagate as an error from the dispatch loop. The handler's success/failure result is what gets logged at `event: 'handler_error'` or implicit success; cleanup failures get their own `event: 'slack_uploads_cleanup_failed'` warn log and are otherwise swallowed.
- **Single-turn lifecycle:** the cleanup must run after `await this.handler(message)` returns (success or throw). The handler is fully synchronous w.r.t. file reads — Claude Agent SDK's `Read` tool finishes before the SDK returns control. No race with async file consumers (which do not exist in the current architecture).
- **Quality gate:** `pnpm run quality-gate` (lint + typecheck + tests across all workspaces) MUST pass at every commit. No `--no-verify`, no skipped hooks.

## User Stories / Scenarios

### Scenario 1 — Slack PDF review (unchanged behavior, regression-protected)

1. Operator uploads `report.pdf` to a Slack channel where `@zeno` is a member.
2. Operator types `@zeno summarize this report`.
3. Worker downloads `report.pdf` to `<workspaceDir>/uploads/<correlationId>/report.pdf`.
4. Worker invokes agent with prompt including `[slack_context]`, `[attached_files] - .../report.pdf (application/pdf, report.pdf) [/attached_files]`, then the operator's text.
5. Agent reads the PDF via the `Read` tool and replies with a summary in the same thread.
6. **(NEW)** After the agent's reply is posted, `<workspaceDir>/uploads/<correlationId>/` is removed; the worker logs `event: 'slack_uploads_cleaned'`.

### Scenario 2 — Hypothetical Discord image describe (forward-compatibility, no adapter today)

This scenario does NOT execute in this spec (no Discord adapter exists). It documents the contract that future adapters rely on:

1. A future `DiscordChannel` adapter receives a message with an image attachment, downloads it to a local path, and populates `IncomingMessage.attachments = [{name:'cat.png', mimetype:'image/png', localPath:'/workspace/uploads/<correlationId>/cat.png', sizeBytes:...}]`. Platform is `'discord'`.
2. The agent core's renamed wrapper detects `attachments?.length > 0` and injects the `[attached_files]` block into the prompt — without any code change in `agent/core.ts`. The `[slack_context]` and `[parent_message]` blocks are NOT emitted because `platform !== 'slack'`.
3. Agent describes the image. The Discord adapter handles its own per-turn cleanup (the Slack adapter's cleanup logic is local to `slack/adapter.ts` and does not run for Discord events).

The unit test `wrapWithChannelContext: non-slack with attachments` (see Acceptance Criteria) is the contract check that protects this future flow.

### Scenario 3 — Oversized file (graceful skip + cleanup)

1. Operator uploads a 60 MB video and mentions `@zeno`.
2. `downloadSlackFiles()` logs `event: 'slack_file_too_large'` and skips the file. `message.attachments` is set to `[]` (empty array, because the download function returned no successful entries).
3. Worker still invokes the handler with the operator's text (no `[attached_files]` block emitted — wrapper sees empty array).
4. Agent replies normally (e.g., "I can see you mentioned me but the attachment was too large to read; can you describe it or share a smaller version?").
5. The empty `<workspaceDir>/uploads/<correlationId>/` directory (created by `mkdir -p` even though no writes succeeded) is removed by the cleanup; log `event: 'slack_uploads_cleaned'`.

### Scenario 4 — Handler throws (cleanup still runs)

1. Operator uploads a small CSV and triggers a prompt that causes the agent handler to throw (e.g., transient SDK error).
2. Worker downloads the CSV successfully; `message.attachments` populated.
3. Handler invocation throws. The existing `catch` block at `slack/adapter.ts` logs `event: 'handler_error'`.
4. **(NEW)** The `finally` block runs `rm -rf` on `<workspaceDir>/uploads/<correlationId>/`. The directory is removed; log `event: 'slack_uploads_cleaned'`. The original handler error is NOT re-thrown by the cleanup logic.

## Acceptance Criteria

### Code structure

- [ ] `apps/worker/src/agent/core.ts` no longer exports a function named `wrapWithSlackContext`. The replacement function is named `wrapWithChannelContext` and is exported with the same `@internal` JSDoc tag.
- [ ] `apps/worker/src/agent/core.ts` contains exactly one call site for the wrapper, updated to call `wrapWithChannelContext`. `grep -rn 'wrapWithSlackContext' apps/worker/src` returns zero matches after the change.
- [ ] The body of `wrapWithChannelContext` gates `[slack_context]` and `[parent_message]` blocks on `message.platform === 'slack'`. The `[attached_files]` block is emitted whenever `message.attachments?.length` is truthy, regardless of `message.platform`.
- [ ] When `message.platform !== 'slack'` AND `(!message.attachments || message.attachments.length === 0)`, `wrapWithChannelContext` returns `message.text` verbatim (no wrapping, no newlines added).

### Behavioral parity (slack path)

- [ ] For every `IncomingMessage` shape with `platform === 'slack'` covered by the existing `wrapWithSlackContext` unit tests, `wrapWithChannelContext` produces a byte-identical output string. The test file `apps/worker/src/agent/core.test.ts` includes an explicit "parity" test or test group that asserts this with `expect(result).toBe(expected)` (vitest strict string equality, NOT `toEqual`) for at least these four shapes: (a) slack + no parent + no attachments; (b) slack + parent text + no attachments; (c) slack + no parent + one attachment; (d) slack + parent text + two attachments.

### New behavior (non-slack attachments)

- [ ] `apps/worker/src/agent/core.test.ts` contains a test `wrapWithChannelContext: non-slack platform with attachments emits [attached_files] block` that constructs an `IncomingMessage` with `platform: 'discord'`, one `Attachment` entry, and asserts the returned string contains the `[attached_files]` block (with the attachment's `localPath`, `mimetype`, and `name`) followed by `Read the attached files before responding.`, a blank line, and the operator's text — and does NOT contain `[slack_context]` or `[parent_message]`.
- [ ] `apps/worker/src/agent/core.test.ts` contains a test `wrapWithChannelContext: non-slack platform with no attachments returns text verbatim` asserting that for `{platform:'discord', text:'hi', attachments: undefined}` the function returns the string `'hi'` exactly.
- [ ] `apps/worker/src/agent/core.test.ts` contains a test `wrapWithChannelContext: non-slack platform with empty attachments array returns text verbatim` asserting the same for `attachments: []`.

### Cleanup behavior (slack adapter)

- [ ] `apps/worker/src/channels/slack/adapter.ts` wraps the `await this.handler(message)` call in a `try/catch/finally` such that the `finally` block runs `rm -rf` (`rm(uploadsDir, { recursive: true, force: true })`) on the per-turn uploads directory iff `downloadSlackFiles` was invoked on this dispatch. The trigger condition is `Array.isArray(slackEvent.files) && slackEvent.files.length > 0` — identical to the existing `if` guard at `apps/worker/src/channels/slack/adapter.ts:103` that wraps the download call. Note: `downloadSlackFiles` calls `mkdir` unconditionally when invoked (see `apps/worker/src/channels/slack/files.ts:34`), so the per-turn directory exists even when every individual file is skipped (oversized, no URL, fetch error). Cleanup must run in those cases too to remove the empty directory.
- [ ] When no files are attached to the inbound Slack event (`slackEvent.files` is undefined or empty), the cleanup logic does NOT compute a path, does NOT call `rm`, and does NOT emit any `slack_uploads_*` log line. Verified by a unit test `SlackChannel: dispatch without files emits no uploads cleanup log`.
- [ ] When files are attached and the handler resolves successfully, the cleanup runs, the directory is removed (`existsSync(uploadsDir) === false`), and the worker logs `event: 'slack_uploads_cleaned'` with `correlationId` and `path` fields. Verified by a unit test `SlackChannel: dispatch with files cleans uploads dir after success`.
- [ ] When files are attached and the handler rejects, the cleanup still runs and the directory is removed. The original `event: 'handler_error'` log is still emitted. Verified by a unit test `SlackChannel: dispatch with files cleans uploads dir after handler throws`.
- [ ] When files are attached but every file is skipped by `downloadSlackFiles` (e.g., all oversized), the empty per-turn directory is still removed and `event: 'slack_uploads_cleaned'` is emitted. Verified by a unit test `SlackChannel: dispatch with files that are all skipped cleans the empty uploads dir`. This is the unit-level coverage for Scenario 3 (oversized file).
- [ ] When the cleanup itself fails (e.g., `rm` rejects), the dispatch resolves without throwing, a warn log with `event: 'slack_uploads_cleanup_failed'` is emitted, and the original handler result (success or `handler_error`) is unaffected. Verified by a unit test that mocks `rm` to reject once.

### Quality gate

- [ ] `pnpm run quality-gate` (from the worktree root) exits 0 with no warnings about unused imports or dead code introduced by the rename.
- [ ] No new dependencies added to `apps/worker/package.json` (the change uses only `node:fs/promises` `rm` and `node:path` `join`, both already available).

### E2E gate (manual, required for PR merge)

The following four scenarios MUST be executed against a real Slack workspace before the PR is marked ready for review. Evidence (Slack permalink + log snippet per scenario + post-cleanup `ls` output) MUST appear in the PR description under a `## E2E Evidence` heading. A reviewer MUST block the merge if this section is missing or incomplete.

- [ ] **E1 (small PDF):** Operator uploads a PDF (≤ 1 MB, multi-paragraph content) to channel `C0B0GLS5UTB` in workspace `flavianasser.slack.com`. Sends `@zeno summarize this file` as the same message or as a follow-up in the same thread. Bot reply contains a summary that demonstrably references PDF content (not a generic "I can't read attachments" reply). Worker log within the same 30-second window shows `event: 'slack_uploads_cleaned'` with a `correlationId` matching the dispatch. `docker exec <container> ls /workspace/uploads/` after the reply lands returns either an empty listing or only directories from concurrent unrelated turns.
- [ ] **E2 (image describe):** Same flow with a PNG or JPEG (≤ 1 MB). Bot reply describes image content. Same cleanup verification.
- [ ] **E3 (oversize skip):** Operator uploads a file larger than 50 MB. Worker log shows `event: 'slack_file_too_large'` and `event: 'slack_uploads_cleaned'` for the same `correlationId` (both are required — `downloadSlackFiles` calls `mkdir` unconditionally before the size check, so the empty per-turn directory is always created and must always be cleaned). `docker exec <container> ls /workspace/uploads/` after the reply lands shows the per-turn directory is gone. Bot reply does NOT reference the file's content (which it never received).
- [ ] **E4 (handler error + cleanup):** Implementer temporarily injects a forced rejection in the message handler (concrete trigger: edit `apps/worker/src/agent/core.ts`'s `handleMessage` entry point — or the equivalent inner function called from `this.handler` — to `throw new Error('e2e-forced-error')` on its first line, rebuild the container, run the scenario, then revert. Alternative concrete trigger if the above is impractical: prefix the temporary throw with `if (message.attachments?.length) ` so only attachment-bearing turns fail.). Operator uploads a small file (≤ 100 KB) and mentions `@zeno` in channel `C0B0GLS5UTB`. Worker log shows both `event: 'handler_error'` (with `err` containing `e2e-forced-error`) and `event: 'slack_uploads_cleaned'` for the same `correlationId`. `docker exec <container> ls /workspace/uploads/` after the failure shows the dir is gone. The injected throw is reverted before opening the PR.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Renaming `wrapWithSlackContext` produces a non-byte-identical output for some edge-case slack input, invalidating the Claude Agent SDK prompt cache for all profiles on first message after merge. | The "behavioral parity (slack path)" acceptance criteria require the test suite to assert byte equality across four representative shapes. The refactor must be a transcription of the existing implementation with the gate moved inward, not a re-write. |
| `try/finally` cleanup races with async file consumption (e.g., agent SDK kicking off a background read). | The agent SDK call is `await`-ed synchronously inside the handler; the handler resolves only after the SDK's reply has been produced (which is after any `Read` tool calls have completed). Documented in the Constraints section. If a future spec introduces async file consumers, that spec is responsible for revisiting cleanup lifecycle. |
| Cleanup throws on a path that doesn't exist (e.g., `downloadSlackFiles` never reached `mkdir`). | `rm(path, { recursive: true, force: true })` is idempotent and does NOT throw on missing paths; this is the documented behavior of `node:fs/promises` since Node 14. |
| Operator runs a parallel turn (concurrent mentions) and one turn's cleanup wipes another's uploads. | Each turn's `correlationId` is unique (generated at ingress per `IncomingMessage.correlationId`). Each `uploads/<correlationId>/` directory is per-turn. No cross-turn collision. |
| E2E test on the live `flavianasser` workspace pollutes the channel with test traffic or interferes with normal use. | Use a low-noise PDF/image; post in a thread (use `thread_ts` to keep replies grouped); document the test window in the PR description. Coordinate with the operator (you) before running. |
| The renamed function's `@internal` export breaks downstream import in another worker module. | `grep -rn 'wrapWithSlackContext' apps/worker/src` is in the acceptance criteria; if any other call site exists outside the test file, it's caught before merge. |

## Open Questions

None at this time. All design questions were resolved during the brainstorming session (boundary, cleanup lifecycle, size/mimetype policy, refactor approach). E2E preflight (bot installation, profile running) was confirmed before this spec was written.

## Implementation Notes

- `apps/worker/src/agent/core.test.ts` does NOT exist in the worktree as of spec creation. The implementation plan must create it from scratch (rather than amending an existing file) to host the parity tests and new non-slack cases. Same applies to any required new test fixtures for `apps/worker/src/channels/slack/adapter.test.ts` if that file is also missing — verify during planning.
