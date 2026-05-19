---
status: ready
feature: channel-outbound-files
created: 2026-05-19
shipped: null
issue: https://github.com/ribeirogab/zeno-agent/issues/10
---
# Channel Outbound Files — Spec

**Status:** Ready (reviewer approved 2026-05-19)
**Branch:** `feat/channel-outbound-files`
**Scope:** Standardise outbound file attachment delivery across channel adapters. The agent writes files into a per-turn `outbox/<correlationId>/` directory and the channel adapter uploads them via the native platform API (Slack `files.uploadV2` today). Generalises `Channel.send` from `(target, text)` to `(target, OutgoingMessage)` so future Discord/Telegram adapters add file delivery without core changes. Closes the loop opened by inbound files ([[../2026-05-18-channel-inbound-files/spec-channel-inbound-files|2026-05-18-channel-inbound-files]]).

## Context

Zeno's reply path today is text-only:

- `apps/worker/src/channels/types.ts:8` defines `Channel.send(target: MessageTarget, text: string): Promise<{messageRef: string}>`.
- `apps/worker/src/channels/slack/adapter.ts:171-185` implements `send` by calling `client.chat.postMessage({channel, thread_ts, text: toSlackMrkdwn(text)})` — no file attachment surface.
- `apps/worker/src/agent/core.ts:105, 148` calls `channel.send(target, output.text)` (primary + the reset-on-resume retry block).
- `apps/worker/src/agent/core.ts:52` (`reportFailure`) calls `channel.send(target, reply)`.
- `apps/worker/src/cron/runner.ts:255` (`deliver`) calls `this.opts.channel.send(target, text)` — cron output delivery path.
- `apps/worker/src/channels/manager.ts:137-139` proxies `send(target, text)` through `asChannel()` — the manager's hot-reload-stable proxy that forwards to the active adapter.
- `apps/worker/src/channels/noop/noop-channel.ts:28` implements `send(_target, _text)` for the bootstrap "no channel installed" state.

Total: 4 call sites + 3 implementations/proxies. All must update together.

The agent has powerful capabilities to produce structured output:

- Native `Write` tool (Claude Agent SDK) can produce UTF-8 text files of any shape (`.md`, `.json`, `.csv`, `.html`, `.svg`, `.xml`, `.yaml`, `.txt`).
- Connectors (MCP servers managed via dashboard) can produce arbitrary bytes from third-party APIs (e.g. a future `pdf-generator` connector). Connector-produced files are out of scope for this spec but the surface must not preclude them.

The inbound spec ([[../2026-05-18-channel-inbound-files/spec-channel-inbound-files|2026-05-18-channel-inbound-files]]) established two reusable patterns: (a) per-turn directory keyed by `correlationId` under the workspace mount, (b) universal context block in the user-message wrapper that any channel benefits from without core changes. This spec applies both inversely — for output instead of input.

Issue [#10](https://github.com/ribeirogab/zeno-agent/issues/10) (roadmap `Next`, sized M) names this work "channel outbound files" and explicitly depends on #9.

## Problem Statement

1. **Agent reply path is text-only.** The agent can compose a JSON report, an HTML summary, or a CSV export, but has no way to deliver it to the operator. Today the only options are: (a) inline it into the reply text (breaks at >500 lines, no syntax highlighting, hostile to download), (b) ask the operator to copy-paste into a file. Both are degraded UX for any output more structured than prose.
2. **`Channel.send` signature is locked to a single string.** Any future channel adapter that wants to support file delivery (Discord attachments, Telegram `sendDocument`) has no contract to plug into. The string-only signature is a port-and-adapters violation in waiting.
3. **No symmetric outbox surface to mirror the inbound `uploads/` directory.** Inbound files have a documented, tested per-turn lifecycle. Outbound files have no convention at all — an agent that tries `Write` to `/tmp/foo.json` produces a file the operator can't see.

## Non-Goals

The following are explicitly OUT of scope for this spec:

- **Adding a second channel adapter** (Discord, Telegram, WhatsApp). This spec ships the channel-agnostic outbound infrastructure; the only adapter implementing file delivery after merge is Slack. Future channel adapters get their own specs.
- **Binary file generation by the agent without a connector.** The native `Write` tool emits UTF-8 text. PDF / PNG / MP4 generation requires a connector (e.g., a future `pdf-generator` or `headless-chrome` connector); this spec does not ship one. Operators who need binary output today must build/install such a connector.
- **TTL background sweep of `/workspace/outbox/`.** Per-turn `try/finally` cleanup in `AgentCore.bind` is sufficient. Mirror inbound decision.
- **Dashboard / profile-level configuration for outbound limits or mimetype filters.** No UI surface, no DB schema, no operator-tunable knobs in this spec.
- **Shared download/upload helper across channels** (`apps/worker/src/channels/files.ts`). Each platform's upload API diverges enough that a premature abstraction loses fidelity. Each adapter keeps its own uploader until at least one more adapter exists.
- **Approval gate before file upload** (e.g., reaction-confirm-before-send for file deliveries). Existing guardrails apply at the agent level; file delivery itself is not gated. Future spec if needed.
- **Streaming uploads / progress indicators.** Single chunk via `createReadStream`. No progress UI.
- **Custom `title` / `alt_text` per file.** Slack `files.uploadV2` accepts these; this spec sets `title === filename` and omits `alt_text`. Future enhancement if needed.
- **Deduplication when the agent writes the same filename multiple times in one turn.** `Write` tool overwrites in place; only the final version is uploaded. Documented but not salted (unlike inbound, where multi-paste `image.png` collision needed the file.id salt — see [[../../learnings/slack-clipboard-paste-name-collision]]).
- **Inbound files** (#9, shipped 2026-05-19). Inbound `uploads/<correlationId>/` cleanup and `[attached_files]` injection are untouched.
- **Audio in / audio out** ([#11](https://github.com/ribeirogab/zeno-agent/issues/11), [#12](https://github.com/ribeirogab/zeno-agent/issues/12)). Separate specs.
- **Reusing the inbound `uploads/<correlationId>/` directory for outbound.** Inbound is owned by the Slack adapter; outbound is owned by `AgentCore`. Keeping them in distinct subdirectories (`uploads/` vs `outbox/`) preserves clear ownership and lets the agent see at a glance which files are inputs vs outputs.
- **Outbox surface for cron-delivered messages.** The cron runner (`apps/worker/src/cron/runner.ts:255`) delivers scheduled-job output to the channel via `channel.send`. After the signature change it sends `{text: text}` with no outbox attachments. Cron jobs that want to emit files would need an outbox surface bound to the cron invocation's correlationId; that is a separate spec.
- **Error-reply outbox attachments.** `reportFailure` in `AgentCore` sends `{text: reply}` with NO outbox attachments even if the partial outbox is non-empty when the backend throws. Rationale: error replies are auto-generated user-facing strings ("token expirou", "rate limited", etc.) — attaching partial agent work would be confusing. Partial outbox files are cleaned up in the `finally` block regardless.

## Constraints

- **No `Channel` interface back-compat shim.** This is a clean breaking change to the internal `Channel.send` signature: `(target, text: string)` → `(target, message: OutgoingMessage)`. Every call site AND every implementation/proxy in `apps/worker/src/` MUST be updated in the same commit; no temporary `string | OutgoingMessage` union. The interface is internal (one package, no external consumers), so a clean rename is safer than a long-lived shim. Concrete update list:
  - **Call sites (4):** `apps/worker/src/agent/core.ts:52` (`reportFailure` — sends `{text: reply}` with NO outbox attachments, since error replies are never the agent's structured output), `:105` (primary success — sends `{text, attachments: collectOutbox(outboxDir)}`), `:148` (resume-retry success — same as primary); `apps/worker/src/cron/runner.ts:255` (`deliver` — sends `{text}` only; outbox surface for cron output is out of scope for this spec).
  - **Implementations (2):** `apps/worker/src/channels/slack/adapter.ts` `SlackChannel.send`; `apps/worker/src/channels/noop/noop-channel.ts` `NoopChannel.send` (still throws the "no channel installed" error; signature only).
  - **Proxy (1):** `apps/worker/src/channels/manager.ts` `asChannel().send` forwards `OutgoingMessage` unchanged to the active adapter.
- **No new runtime dependencies.** Mimetype lookup uses an inline ~30-entry map (`apps/worker/src/channels/slack/mimetype.ts`), not the `mime` or `mime-types` packages. Justification: the supported set is small and stable; an inline map is a single source of truth that survives audit. Re-evaluate if the set grows past ~60 entries.
- **`Write` tool produces text-only.** The agent cannot natively emit binary files. Documented in Non-Goals; not a constraint on this spec's surface (the surface is byte-agnostic) but a constraint on what operators will see working day-one.
- **Slack manifest needs `files:write`.** `infra/slack-app-manifest.json` currently has `files:read` (added in #9). `files.uploadV2` requires `files:write`. The manifest update is part of this spec; the operator MUST reinstall the Slack app after merge for the new scope to take effect.
- **Bolt SDK 4.x `client.files.uploadV2` is the canonical endpoint.** Legacy `files.upload` (singular) is deprecated. The wrapper handles single-file and multi-file uploads identically; this spec uses the multi-file form (`file_uploads: [...]`) unconditionally for consistency.
- **Per-turn directory isolation.** Each `<workspaceDir>/outbox/<correlationId>/` is unique per turn. Concurrent turns do not collide. Cross-turn read/write is not a use case — finished turns' outboxes are deleted.
- **Quality gate:** `pnpm run quality-gate` (lint + typecheck + tests across all workspaces) MUST pass at every commit. No `--no-verify`, no skipped hooks.
- **Prompt cache stability.** Adding the `[outbox]` block to the user-message wrapper changes the user-message bytes, but the user message already varies per turn (`current_time` in `[slack_context]`). Prompt cache is segmented by system-prompt + tool-defs prefix, which this spec does not touch. No cache invalidation expected.

## User Stories / Scenarios

### Scenario 1 — Slack JSON artifact (happy path, primary)

1. Operator types `@zeno crie um JSON com meus 3 lugares favoritos e me manda como arquivo` in channel `C0B0GLS5UTB`.
2. Worker creates `/workspace/outbox/<correlationId>/` (empty) before invoking the backend.
3. Worker injects `[outbox] /workspace/outbox/<correlationId> [/outbox]` block in the user message wrapper alongside `[slack_context]`.
4. Agent uses the `Write` tool to create `/workspace/outbox/<correlationId>/places.json` with `[{"name":"...","city":"..."}, ...]`.
5. Agent's reply text says "Pronto, segue o JSON com seus 3 lugares favoritos."
6. After `backend.query` returns, worker reads the outbox directory: one file, `places.json`, mimetype `application/json` (inferred from extension), 312 bytes.
7. Worker calls `channel.send(target, {text: 'Pronto, segue o JSON...', attachments: [{name:'places.json', mimetype:'application/json', localPath:'...', sizeBytes:312}]})`.
8. Slack adapter calls `client.files.uploadV2({channel_id, thread_ts, initial_comment:'Pronto, segue o JSON...', file_uploads:[{file: createReadStream(localPath), filename:'places.json', title:'places.json'}]})`.
9. Slack shows one message in the thread with the operator-visible text as caption and `places.json` as a downloadable attachment.
10. Worker logs `event: 'slack_files_uploaded'` with file ids and total bytes.
11. `finally` block removes `/workspace/outbox/<correlationId>/`; worker logs `event: 'outbox_cleaned'`.

### Scenario 2 — Slack Markdown report (mimetype path: text/markdown)

1. Operator types `@zeno escreve um resumo do projeto Zeno em markdown e me manda como arquivo .md`.
2. Same flow as Scenario 1; agent writes `summary.md` to outbox.
3. Mimetype lookup resolves `.md` → `text/markdown`.
4. Slack renders the `.md` attachment with download affordance + inline preview.

### Scenario 3 — Text-only reply (regression: no outbox, no upload)

1. Operator types `@zeno me dá um oi`.
2. Worker creates outbox dir as usual.
3. Agent writes nothing to the outbox; reply is plain text `oi!`.
4. Worker reads outbox → empty list. Calls `channel.send(target, {text: 'oi!'})` with NO `attachments` key (omitted per the chosen convention; see Acceptance Criteria).
5. Slack adapter sees `message.attachments?.length` is falsy → routes to `chat.postMessage` (existing path, unchanged).
6. Worker logs `event: 'outbox_collected'` with `count: 0`. Cleanup removes the empty dir.

### Scenario 4 — Oversized file (graceful skip + cleanup)

1. Agent writes `huge.json` (60 MB) to the outbox.
2. `collectOutbox` detects `sizeBytes > 50 * 1024 * 1024`, skips it, logs `event: 'outbox_file_too_large'` with `name` and `bytes`.
3. Worker calls `channel.send(target, {text: '...', attachments: []})` (attachments empty after skip).
4. Slack adapter routes to `chat.postMessage` (no upload). Operator sees text only.
5. Cleanup removes the outbox (including the skipped 60 MB file).

### Scenario 5 — Upload failure with text-fallback

1. Agent writes valid `report.csv` to outbox.
2. Worker calls `client.files.uploadV2`; Slack returns an error (e.g., `not_allowed_token_type` because operator forgot to reinstall after the manifest update).
3. Slack adapter catches the error, logs `event: 'slack_files_upload_failed'` with `err`, and falls back to `chat.postMessage({text: text + '\n\n_(file upload failed — check worker logs)_'})`.
4. Operator sees the text reply with a visible note that the file delivery failed. Cleanup still removes the outbox.

### Scenario 6 — Handler error (cleanup still runs)

1. Agent writes `partial.json` then the backend throws (e.g., transient SDK error).
2. `AgentCore.bind` catches in `reportFailure`, posts an error reply via `channel.send`.
3. `finally` block runs `rm -rf` on the outbox dir; logs `event: 'outbox_cleaned'`.
4. The original handler error is NOT re-thrown by the cleanup logic.

### Scenario 7 — Hypothetical Discord adapter (forward-compatibility, no adapter today)

This scenario does NOT execute in this spec. It documents the contract:

1. A future `DiscordChannel` adapter implements `send(target, {text, attachments})` by calling Discord's attachment API (`channel.send({content: text, files: attachments.map(...)})`).
2. `AgentCore.bind` is unchanged — it constructs the same `OutgoingMessage` shape regardless of platform.
3. The `[outbox]` block in the user message wrapper is platform-agnostic; Discord turns get the same outbox surface for free.
4. Discord's per-message file limit (currently 25 MB on free tier, 50 MB Nitro Basic, etc.) is enforced inside the Discord adapter — `OutgoingMessage` itself imposes no platform-specific limit beyond the worker-wide 50 MB cap on `collectOutbox`.

## Acceptance Criteria

### Code structure

- [ ] `apps/worker/src/channels/types.ts` exports two new types: `OutgoingAttachment` (fields: `name: string`, `mimetype: string`, `localPath: string`, `sizeBytes: number`) and `OutgoingMessage` (fields: `text: string`, `attachments?: OutgoingAttachment[]`).
- [ ] `apps/worker/src/channels/types.ts` redefines `Channel.send` as `send(target: MessageTarget, message: OutgoingMessage): Promise<{messageRef: string}>` — no string-accepting overload, no union type.
- [ ] `grep -rn 'channel.send(target, [a-zA-Z_.]*\(text\|reply\|output\.text\)[)]' apps/worker/src` returns zero matches after the change (every call passes an object).
- [ ] `apps/worker/src/channels/slack/adapter.ts` `send` method signature matches the interface; its body branches on `message.attachments?.length` to route between `client.files.uploadV2` (with attachments) and `client.chat.postMessage` (without). Returned `messageRef` for the uploadV2 path is the `ts` of the first uploaded file's share message in the target channel (`result.files?.[0]?.shares?.public?.[channelId]?.[0]?.ts ?? result.files?.[0]?.shares?.private?.[channelId]?.[0]?.ts`). If that lookup yields no `ts` (defensive: SDK shape changes), throw `Error('files.uploadV2 returned no message ts')`.
- [ ] `apps/worker/src/channels/noop/noop-channel.ts` `NoopChannel.send` signature is updated to `send(target: MessageTarget, message: OutgoingMessage): Promise<{messageRef: string}>`. Body unchanged — still throws `Error('no channel installed — install Slack via dashboard /connectors and restart')`. No test added (existing behavior preserved).
- [ ] `apps/worker/src/channels/manager.ts` `asChannel().send` proxy method signature is updated to forward `OutgoingMessage` instead of `string`. Body becomes `return get().send(target, message);`.
- [ ] `apps/worker/src/channels/slack/mimetype.ts` is a new file exporting `lookupMimetype(filename: string): string` with an inline map covering: `.txt .md .markdown .json .csv .tsv .html .htm .svg .xml .yaml .yml .pdf .png .jpg .jpeg .gif .webp .mp4 .mp3 .wav .ogg .zip .log`. Fallback for unknown / no extension: `application/octet-stream`. Lookup is case-insensitive on the extension.
- [ ] `apps/worker/src/agent/collect-outbox.ts` is a new file exporting `collectOutbox(outboxDir: string): Promise<OutgoingAttachment[]>`. Behavior: shallow `readdir` (not recursive), `lstat` then `realpath` each entry, filter out non-regular files (subdirectories — warn `outbox_subdir_skipped`; symlinks whose `realpath` is outside `outboxDir` — warn `outbox_symlink_skipped`), filter out files whose size exceeds `50 * 1024 * 1024` bytes with warn `outbox_file_too_large`, return remaining as `OutgoingAttachment[]` sorted alphabetically by `name`. Each warn log carries `name`, `path`, and (for size) `bytes` fields.
- [ ] `apps/worker/src/agent/core.ts` `AgentCore.bind` creates `<workspaceDir>/outbox/<correlationId>/` via `mkdir({recursive: true})` before invoking the backend, passes the path into `wrapWithChannelContext` as a second argument, calls `collectOutbox` after `backend.query` resolves (BOTH the primary call AND the session-resume retry call — single outboxDir per dispatch shared across both attempts), passes the result to `channel.send` inside the `OutgoingMessage` object, and cleans the directory in a `finally` block via `rm(outboxDir, {recursive: true, force: true})`. Lifecycle order: `mkdir → emit outbox_created log → backend.query (primary or retry) → collectOutbox → emit outbox_collected log → channel.send → finally: rm + emit outbox_cleaned log`.
- [ ] `apps/worker/src/agent/core.ts` `AgentCore.bind` emits a log event `outbox_created` (info level) after `mkdir` succeeds, with fields `correlationId` and `path`. Emits `outbox_collected` (info level) after `collectOutbox` returns, with fields `correlationId`, `path`, `count` (number of attachments), and `totalBytes`. Emits `outbox_cleaned` (info level) after the `finally` `rm` succeeds, with fields `correlationId` and `path`. Emits `outbox_cleanup_failed` (warn level) when the `finally` `rm` rejects, with fields `correlationId`, `path`, and `err`.
- [ ] `apps/worker/src/agent/core.ts` `AgentCore.bind` session-resume retry path (currently lines 130-159) is updated so its `channel.send(target, retryOutput.text)` call also wraps the text in `OutgoingMessage` shape AND includes the same `collectOutbox(outboxDir)` result. The outbox directory is NOT cleared between the failed first attempt and the retry — any partial files the agent wrote during the failed first turn are included with the retry's reply (this is intentional; the resume failure is typically an SDK-level error before the agent's tool calls executed, so the outbox is usually empty, but if not, the work is preserved).
- [ ] `apps/worker/src/agent/core.ts` `wrapWithChannelContext` accepts a second parameter `opts?: {outboxDir?: string}`. When `opts?.outboxDir` is a non-empty string, the function appends an `[outbox]` block in the same position-and-separator style as the existing `[attached_files]` block: if any prior lines exist in the buffer (`[slack_context]`, `[parent_message]`, or `[attached_files]`), push a blank line separator (`lines.push('')`) before pushing the `[outbox]` opener. The block body is exactly three lines: `[outbox]`, then the absolute `outboxDir` path, then `Write any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.`, then the closer `[/outbox]`. When `opts?.outboxDir` is undefined or empty string, no `[outbox]` block is emitted and no extra whitespace is added.

### Behavioral parity (slack text-only path)

- [ ] For every `IncomingMessage` shape with `platform === 'slack'` and no outbox path passed (or `opts` argument omitted entirely), `wrapWithChannelContext(message)` returns byte-identical output to the current pre-#10 implementation. Unit test `wrapWithChannelContext: slack path with no outbox is byte-identical to pre-#10 behavior` enforces this via `expect(result).toBe(expected)` (vitest strict equality) for at least these four shapes (matching the inbound spec's parity coverage): (a) slack + no parent + no attachments; (b) slack + parent text + no attachments; (c) slack + no parent + one attachment; (d) slack + parent text + two attachments.
- [ ] The Slack adapter's `chat.postMessage` call path is unchanged for `OutgoingMessage` with no `attachments`. Unit test `SlackChannel.send: text-only routes to chat.postMessage` mocks the Slack client and asserts only `chat.postMessage` is called (not `files.uploadV2`), with the same args shape as today.

### New behavior (outbox surface)

- [ ] Unit test `wrapWithChannelContext: emits [outbox] block with leading blank-line separator when outboxDir provided alongside other blocks` asserts that for `{platform:'slack', ..., parentText:'p', attachments:[a1]}` + `{outboxDir:'/workspace/outbox/abc'}`, the returned string contains the substring `[/attached_files]\nRead the attached files before responding.\n\n[outbox]\n/workspace/outbox/abc\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\n` followed by the operator text. Strict `expect(result).toBe(expected)` against a hand-crafted full expected string.
- [ ] Unit test `wrapWithChannelContext: emits [outbox] block without leading blank line when no other blocks present` asserts that for `{platform:'discord', text:'hi'}` + `{outboxDir:'/workspace/outbox/abc'}`, the returned string is exactly `'[outbox]\n/workspace/outbox/abc\nWrite any file you want to send to the user into this directory. The channel adapter will upload them alongside your reply.\n[/outbox]\n\nhi'`.
- [ ] Unit test `wrapWithChannelContext: omits [outbox] block when opts.outboxDir is undefined` asserts no `[outbox]` substring appears in the result for any platform.
- [ ] Unit test `wrapWithChannelContext: omits [outbox] block when opts.outboxDir is empty string` asserts the same as the previous test, with `{outboxDir: ''}` explicitly.
- [ ] Unit test file `apps/worker/tests/agent/collect-outbox.test.ts` covers: (a) empty dir → `[]`; (b) two text files → both returned, sorted alphabetically by name, with correct mimetype; (c) file > 50 MB → skipped + `outbox_file_too_large` warn log; (d) symlink pointing outside the dir → skipped + `outbox_symlink_skipped` warn log; (e) subdirectory → skipped (not recursed into); (f) unknown extension → mimetype `application/octet-stream`; (g) no extension → mimetype `application/octet-stream`.
- [ ] Unit test `AgentCore.bind: creates outboxDir, passes path to wrapper, calls collectOutbox after backend.query, passes attachments to channel.send, cleans up in finally` asserts the full lifecycle by mocking `mkdir`, `collectOutbox`, the backend, the channel, and `rm` and verifying call order.
- [ ] Unit test `AgentCore.bind: cleans outboxDir after handler error` asserts the `finally` block runs `rm` even when `backend.query` rejects.
- [ ] Unit test `AgentCore.bind: omits attachments key when outbox is empty` asserts `channel.send` is called with `{text: '<reply>'}` (no `attachments` field) when `collectOutbox` returns `[]`. The adapter's `message.attachments?.length` branch then evaluates to falsy and routes to `chat.postMessage`. This is the chosen convention; the alternative (passing `attachments: []`) is rejected because it adds a useless key.
- [ ] Unit test `AgentCore.bind: cleanup failure logs outbox_cleanup_failed warn and does not throw` mocks `rm` to reject once and asserts dispatch resolves cleanly.

### Slack adapter (outbound)

- [ ] Unit test `SlackChannel.send: text + 1 attachment routes to files.uploadV2 with initial_comment, channel_id, thread_ts, file_uploads array` mocks the Slack client and asserts the exact call shape.
- [ ] Unit test `SlackChannel.send: text + 2 attachments uploads both in one files.uploadV2 call`.
- [ ] Unit test `SlackChannel.send: empty text + 1 attachment omits initial_comment` asserts that for `{text: '', attachments: [a1]}`, the call to `files.uploadV2` omits the `initial_comment` key entirely (does NOT pass `''`). Implementation: `initial_comment: toSlackMrkdwn(text) || undefined`.
- [ ] Unit test `SlackChannel.send: files.uploadV2 throws, falls back to chat.postMessage with warning suffix, logs slack_files_upload_failed` asserts the fallback behavior: text is delivered with the appended `\n\n_(file upload failed — check worker logs)_`, error log emitted, no exception propagated.
- [ ] Unit test `SlackChannel.send: messageRef from files.uploadV2 is the ts of the first uploaded file's share message in the target channel` mocks `client.files.uploadV2` to return `{ok: true, files: [{id:'F123', shares: {public: {C0B0GLS5UTB: [{ts: '1234567890.000100'}]}}}]}` and asserts the returned `messageRef === '1234567890.000100'`.
- [ ] Unit test `SlackChannel.send: files.uploadV2 returning no shares ts throws "files.uploadV2 returned no message ts"` mocks the SDK to return `{ok: true, files: [{id:'F123'}]}` (no `shares`) and asserts the promise rejects with that exact error message. This defends against silent SDK shape drift.

### Manifest update

- [ ] `infra/slack-app-manifest.json` `oauth_config.scopes.bot` includes `files:write` in addition to the existing scopes.
- [ ] The PR description includes a step-by-step "Operator action required" block explaining: open Slack app config → Install App → Re-install to Workspace → confirm new scope `files:write` is requested → re-grant.

### Quality gate

- [ ] `pnpm run quality-gate` (from the worktree root) exits 0 with no warnings about unused imports or dead code introduced by the changes.
- [ ] No new entries in any `package.json` `dependencies` or `devDependencies` (the change uses only `node:fs/promises`, `node:path`, the existing `@slack/bolt` client, and the inline mimetype map).

### E2E gate (manual, required for PR merge)

The following three scenarios MUST be executed against the real Slack workspace before the PR is marked ready for review. Evidence (Slack permalink + worker log snippet per scenario + post-cleanup `docker exec <container> ls /workspace/outbox/` output) MUST appear in the PR description under a `## E2E Evidence` heading. A reviewer MUST block the merge if this section is missing or incomplete.

- [ ] **E1 (JSON artifact):** Operator sends `@zeno crie um JSON com meus 3 lugares favoritos e me manda como arquivo` in channel `C0B0GLS5UTB` in workspace `flavianasser.slack.com`. Bot reply appears in the same thread with a `places.json` (or similar) attachment AND a caption text. Downloading the file yields valid JSON (e.g., `[{"name":"...","city":"..."},...]`). Worker logs within the 30-second window show `event: 'outbox_created'`, `event: 'outbox_collected'` with `count: 1`, `event: 'slack_files_uploaded'`, and `event: 'outbox_cleaned'`, all with the same `correlationId`. `docker exec <container> ls /workspace/outbox/` after the reply lands shows no directory for that correlationId.
- [ ] **E2 (Markdown report):** Operator sends `@zeno escreve um resumo do projeto Zeno em markdown e me manda como arquivo .md`. Bot reply contains a `.md` attachment whose body is parseable as Markdown (has at least one `#` heading). Slack inline preview renders the markdown. Same cleanup verification as E1. Mimetype of the uploaded file (visible in Slack file metadata or via `files.info`) is `text/markdown`.
- [ ] **E3 (text-only regression):** Operator sends `@zeno responde só com texto, sem arquivo nenhum`. Bot reply is plain text in the thread. Worker logs show `event: 'outbox_created'` and `event: 'outbox_collected'` with `count: 0` and `event: 'outbox_cleaned'` — and do NOT show `event: 'slack_files_uploaded'`. Slack message has zero attachments. `docker exec` confirms cleanup.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `Channel.send` signature change breaks an undiscovered call site in another workspace. | `grep -rn 'channel.send(' apps/worker/src` is part of the implementer's pre-commit checklist. The TypeScript compiler catches any missed call site at typecheck. `pnpm run quality-gate` runs across all workspaces. |
| Bolt SDK `client.files.uploadV2` signature differs from documented shape (SDK versions diverge). | Implementer verifies the call shape against the installed Bolt version (`pnpm list @slack/bolt`) before writing tests. The integration test (Scenario E1 in E2E) catches signature mismatches against the real API. |
| Agent writes a binary file (e.g., a connector dumps a PDF byte buffer) and `collectOutbox` does not handle it specifically. | `collectOutbox` is byte-agnostic — it reads via `createReadStream` and infers mimetype from extension. Binary files work the same as text files. The constraint (text-only via `Write`) is on what the AGENT can produce natively, not what the surface accepts. |
| Operator forgets to reinstall the Slack app for the new `files:write` scope. | Scenario 5 (upload failure with text-fallback) handles this gracefully — the operator sees the text reply with a visible failure note, can fix the scope, and re-try. The PR description's "Operator action required" block makes the step explicit. |
| `[outbox]` block in the user message wrapper changes prompt cache hit rate. | The user-message portion already changes per turn (`current_time` in `[slack_context]`). Prompt cache is segmented by system-prompt + tool-defs prefix; this spec does not touch either. No cache invalidation. |
| Agent fills the outbox with 50 MB of files every turn → workspace disk pressure. | Each turn's outbox is removed in `finally`. Steady-state disk usage is bounded by `max_concurrent_turns × 50 MB`, which is ≤ 1 turn × 50 MB on the single-user MVP architecture. |
| Concurrent turns race on outbox path. | Each `correlationId` is unique. Each `outbox/<correlationId>/` is per-turn. No cross-turn collision. |
| Slack rate-limits `files.uploadV2` aggressively (≈ 20 req/min on tier 2). | A single Zeno operator generating files at ≤ 1/min is far below the limit. If a future scenario hits the limit, the existing error log + text-fallback path surfaces it. |
| The renamed `Channel.send` parameter breaks a downstream consumer of `OutgoingMessage` shape (e.g., a future connector). | `OutgoingMessage` is exported from `apps/worker/src/channels/types.ts`; any consumer imports the type. Renaming a field would surface as a typecheck error. |
| E2E run pollutes the channel with test traffic. | Use low-noise prompts. Post in a thread (use `thread_ts` for follow-ups). Document the test window in the PR description. Coordinate with the operator before running. |
| `mkdir` of `<workspaceDir>/outbox/<correlationId>/` fails (e.g., disk full, workspace read-only). | `AgentCore.bind` catches the `mkdir` error before invoking the backend, logs `event: 'outbox_mkdir_failed'` at error level with `correlationId`, `path`, and `err`, and proceeds with `outboxDir: undefined` (passed to `wrapWithChannelContext`, which then omits the `[outbox]` block; passed to `collectOutbox` is skipped entirely; `finally` cleanup is also skipped because the path was never created). The agent runs without an outbox surface but the operator still gets a text reply. Unit test `AgentCore.bind: mkdir failure proceeds without outbox surface and logs outbox_mkdir_failed` enforces this. |
| Agent writes a file with a path-traversal name (e.g., `Write` tool to `../../../etc/passwd`). | The agent runs in Docker with no host filesystem access beyond mounted volumes. Even if the `Write` tool wrote to `../<correlationId>/foo`, the path would resolve inside `/workspace/outbox/` (which IS the mounted volume). `collectOutbox` uses shallow `readdir` of `outboxDir` exclusively — files outside `outboxDir` are never enumerated. Symlinks whose `realpath` exits `outboxDir` are explicitly skipped (`outbox_symlink_skipped` warn). Unit test `collectOutbox: symlink pointing outside outboxDir is skipped` enforces this. |

## Open Questions

None at this time. All design questions were resolved during the brainstorming session: agent surface (magic outbox dir), discovery (post-turn `readdir`), `Channel.send` signature (clean break to `OutgoingMessage`), Slack endpoint (`files.uploadV2` with `initial_comment`), limits (50 MB cap, mimetype from extension), cleanup ownership (`AgentCore`), Slack scope (`files:write` in manifest), E2E scenarios (E1 JSON, E2 Markdown, E3 text-only regression).

## Implementation Notes

Tests live under `apps/worker/tests/`, NOT colocated with `src/`. Established patterns:

- **Wrapper tests:** `apps/worker/tests/agent/wrap-context.test.ts` (existing). Extend in place: add `[outbox]` cases, re-validate slack-path parity with `outboxDir: undefined`.
- **Core tests:** `apps/worker/tests/agent/core.test.ts` (existing if any, otherwise new). Mock the backend, the channel, `mkdir`, `rm`, and `collectOutbox`. Pattern follows `wait-reaction.test.ts` listener-registry style.
- **Outbox collector tests:** `apps/worker/tests/agent/collect-outbox.test.ts` (new). Uses real `tmpdir()` paths (pattern from `files.test.ts`).
- **Slack adapter outbound tests:** `apps/worker/tests/channels/slack/adapter.test.ts` (existing from #9, extend). Mock `@slack/bolt` `App` and assert calls to `client.chat.postMessage` and `client.files.uploadV2`. May need to add `client.files.uploadV2` to the mock factory.
- **Mimetype tests:** `apps/worker/tests/channels/slack/mimetype.test.ts` (new). Pure-function test, no mocks.

Existing test infrastructure (`vi.mock('@slack/bolt')`, `vi.useFakeTimers()` for the `current_time` byte-parity check) is reusable. No new test dependencies.

The `OutgoingMessage` and `OutgoingAttachment` types are intentionally symmetric to `IncomingMessage` and `Attachment` (same field names: `name`, `mimetype`, `localPath`, `sizeBytes`). This is by design — future code that bridges inbound to outbound (e.g., a "forward this attachment" tool) can pass the shapes through with minimal conversion.

The mimetype map in `apps/worker/src/channels/slack/mimetype.ts` lives under `slack/` for now even though it is content-type-agnostic. If a second adapter starts needing it, lift to `apps/worker/src/channels/mimetype.ts` (same package, no API change). Premature lift is avoided per the "no shared helpers until a second adapter exists" principle from #9.
