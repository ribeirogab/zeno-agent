---
feature: channel-outbound-files
spec: "[[spec-channel-outbound-files]]"
created: 2026-05-19
---
# Channel Outbound Files — Implementation Plan

> **For agentic workers:** Execute task-by-task from `[[tasks-channel-outbound-files]]`. Steps use checkbox (`- [ ]`) syntax for tracking.

**For this spec:** [[spec-channel-outbound-files]]

**Goal:** Land issue [#10](https://github.com/ribeirogab/zeno-agent/issues/10) in a single PR (`feat/channel-outbound-files`): introduce a channel-agnostic outbound-file surface where the agent writes files into a per-turn `<workspaceDir>/outbox/<correlationId>/` directory, `AgentCore.bind` collects them after `backend.query` resolves, the renamed `Channel.send(target, OutgoingMessage)` interface carries the resulting `OutgoingAttachment[]`, and `SlackChannel.send` uploads them via `client.files.uploadV2` (text-only replies still route to `chat.postMessage`). Update the Slack manifest to add `files:write`. Execute a manual E2E gate against Slack channel `C0B0GLS5UTB` in workspace `flavianasser.slack.com`.

**Architecture:** Mirror the inbound spec's universal-context-block + per-turn-correlationId-dir pattern, inverted for output. `AgentCore` owns the outbox lifecycle: `mkdir → log outbox_created → backend.query → collectOutbox → log outbox_collected → channel.send({text, attachments}) → finally: rm -rf + log outbox_cleaned`. The `wrapWithChannelContext` user-message wrapper grows a new `[outbox]` block (universal — platform-agnostic) that tells the agent where to write files. The `Channel.send` interface changes from `(target, text: string)` to `(target, message: OutgoingMessage)` — a clean break across 4 call sites + 3 implementations/proxies in `apps/worker/src`, enforced by the TypeScript compiler. The Slack adapter branches on `message.attachments?.length`: with attachments → `files.uploadV2({channel_id, thread_ts, initial_comment, file_uploads})` (single API call combining text + files); without → existing `chat.postMessage` path unchanged. Upload failures fall back to text-only with a visible "(file upload failed — check worker logs)" suffix, so a Slack reinstall miss (operator forgot `files:write` scope) degrades gracefully rather than silently swallowing the agent's reply. Quality gate (`pnpm run quality-gate`) must pass at every commit.

**Tech Stack:** TypeScript strict, Node 24 LTS (Docker), pnpm 10 workspaces, [@slack/bolt@4](https://slack.dev/bolt-js/) (`client.files.uploadV2`), [vitest](https://vitest.dev/), [biome](https://biomejs.dev/), `node:fs/promises` (`mkdir`, `readdir`, `lstat`, `realpath`, `rm`, `createReadStream`), `node:path` (`join`, `basename`, `extname`). No new dependencies.

---

## Architecture

### Module boundaries

```
apps/worker/src/
  channels/
    types.ts                               ← MODIFY: add OutgoingAttachment + OutgoingMessage;
                                              change Channel.send signature to (target, OutgoingMessage).
    slack/
      adapter.ts                           ← MODIFY: SlackChannel.send branches on attachments;
                                              uploadV2 path + fallback; reuses toSlackMrkdwn.
      mimetype.ts                          ← NEW: inline extension → mimetype lookup.
                                              ~30 entries, fallback application/octet-stream.
    noop/
      noop-channel.ts                      ← MODIFY: NoopChannel.send signature only;
                                              body still throws.
    manager.ts                             ← MODIFY: asChannel().send proxy signature update.
  cron/
    runner.ts                              ← MODIFY: deliver() passes {text} object.
  agent/
    core.ts                                ← MODIFY: wrapWithChannelContext grows opts.outboxDir;
                                              bind owns outbox lifecycle (mkdir → collect → send → rm);
                                              reportFailure wraps reply in {text: reply};
                                              retry path also wraps + includes collectOutbox result.
    collect-outbox.ts                      ← NEW: collectOutbox(outboxDir) → OutgoingAttachment[];
                                              shallow readdir, lstat, realpath, size filter,
                                              warn logs for skip cases.

apps/worker/tests/
  agent/
    wrap-context.test.ts                   ← MODIFY: add [outbox] block tests (with + without leading
                                              separator); raise parity coverage to 4 shapes
                                              (slack + no outbox passed).
    core.test.ts                           ← MAYBE NEW or extend existing: bind lifecycle tests
                                              (mkdir + collect + send + cleanup; cleanup-on-throw;
                                              omit attachments key when empty; mkdir failure path;
                                              cleanup failure path; retry path collects + sends).
    collect-outbox.test.ts                 ← NEW: pure-function tests over a real tmpdir.
  channels/slack/
    adapter.test.ts                        ← MODIFY (file from #9): add SlackChannel.send tests
                                              (text-only, text+1, text+2, empty-text+attachment,
                                              uploadV2-failure fallback, messageRef from shares,
                                              messageRef missing throws).
    mimetype.test.ts                       ← NEW: pure-function tests.

infra/
  slack-app-manifest.json                  ← MODIFY: add "files:write" to oauth_config.scopes.bot.
```

### Data flow (new shape for the success path)

```
SlackChannel.dispatch → AgentCore.bind(channel)(message)
  ├─ outboxDir = `${workspaceDir}/outbox/${correlationId}`
  ├─ TRY mkdir(outboxDir, {recursive:true})
  │     └─ on FAIL: log outbox_mkdir_failed; outboxDir = undefined; continue
  ├─ log outbox_created (if mkdir succeeded)
  ├─ agentInput = { userMessage: wrapWithChannelContext(message, {outboxDir}), ... }
  │              └─ wrapper appends [outbox] block (universal, platform-agnostic)
  ├─ output = await backend.query(agentInput)
  │           └─ agent uses Write tool → /workspace/outbox/<id>/places.json
  ├─ attachments = await collectOutbox(outboxDir)
  │                └─ shallow readdir → lstat/realpath → size filter
  │                   warn skips: outbox_subdir_skipped, outbox_symlink_skipped, outbox_file_too_large
  ├─ log outbox_collected { count, totalBytes }
  ├─ channel.send(target, {text: output.text, ...(attachments.length ? {attachments} : {})})
  │   └─ SlackChannel.send branches:
  │      ├─ NO attachments → chat.postMessage (existing path, byte-identical)
  │      └─ attachments    → files.uploadV2({
  │                            channel_id, thread_ts,
  │                            initial_comment: toSlackMrkdwn(text) || undefined,
  │                            file_uploads: [{file: createReadStream(localPath), filename: name, title: name}, ...]
  │                          })
  │                          ON uploadV2 throw → fall back to chat.postMessage(text + "\n\n_(file upload failed — check worker logs)_")
  │                                              + log slack_files_upload_failed
  ├─ session persist + react ✅ (existing)
  └─ FINALLY: rm(outboxDir, {recursive:true, force:true})
              ├─ on SUCCESS: log outbox_cleaned
              └─ on FAIL:    log outbox_cleanup_failed (warn, swallowed)
```

### File Structure

| File | Action | Responsibility |
|---|---|---|
| `apps/worker/src/channels/types.ts` | MODIFY | Add `OutgoingAttachment` + `OutgoingMessage` exports; change `Channel.send` signature. |
| `apps/worker/src/channels/slack/mimetype.ts` | NEW | Pure inline-map `lookupMimetype(filename)`; case-insensitive on extension; ~30 entries; `application/octet-stream` fallback. |
| `apps/worker/src/channels/slack/adapter.ts` | MODIFY | `SlackChannel.send` branches on `message.attachments?.length`; uploadV2 path with fallback; messageRef from first file's `shares.public/private[channel][0].ts`. |
| `apps/worker/src/channels/noop/noop-channel.ts` | MODIFY | `NoopChannel.send` signature only; body unchanged. |
| `apps/worker/src/channels/manager.ts` | MODIFY | `asChannel().send` proxy signature forwards `OutgoingMessage`. |
| `apps/worker/src/cron/runner.ts` | MODIFY | `deliver()` passes `{text}` object. |
| `apps/worker/src/agent/core.ts` | MODIFY | `wrapWithChannelContext` grows `opts?.outboxDir`; `AgentCore.bind` owns outbox lifecycle; `reportFailure` wraps reply; retry path wraps + collects. |
| `apps/worker/src/agent/collect-outbox.ts` | NEW | `collectOutbox(outboxDir)` → `OutgoingAttachment[]`; shallow + size-bounded + symlink-safe. |
| `apps/worker/tests/agent/wrap-context.test.ts` | MODIFY | Add `[outbox]` tests; raise parity to 4 shapes. |
| `apps/worker/tests/agent/core.test.ts` | NEW OR EXTEND | Bind lifecycle unit tests. |
| `apps/worker/tests/agent/collect-outbox.test.ts` | NEW | Pure-function tests over real `tmpdir()`. |
| `apps/worker/tests/channels/slack/adapter.test.ts` | MODIFY | Add `SlackChannel.send` unit cases. |
| `apps/worker/tests/channels/slack/mimetype.test.ts` | NEW | Pure-function tests. |
| `infra/slack-app-manifest.json` | MODIFY | Add `files:write` to bot scopes. |
| `.vault/specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files.md` | EXISTING | Source of truth for ACs. |
| `.vault/specs/2026-05-19-channel-outbound-files/plan-channel-outbound-files.md` | NEW (this file) | This plan. |
| `.vault/specs/2026-05-19-channel-outbound-files/tasks-channel-outbound-files.md` | NEW | Bite-sized tasks. |

No changes to: `apps/worker/src/channels/slack/files.ts`, `apps/worker/src/channels/slack/format.ts`, `apps/worker/src/channels/slack/normalize.ts`, dashboard, CLI, docs.

## Phase Ordering

The work is laid out in seven phases. Each phase ends with `pnpm run quality-gate` passing and one commit. Phases 1-3 are independent foundation pieces and could be reordered; phases 4-6 sequence them into the core change.

1. **Types + interface signature change** (`channels/types.ts`). Add `OutgoingAttachment` + `OutgoingMessage`; change `Channel.send` signature. This breaks the build; the next two tasks fix it.
2. **`NoopChannel` + manager proxy + cron + `reportFailure` signature catch-up** (`noop-channel.ts`, `manager.ts`, `cron/runner.ts`, `agent/core.ts:52`). Fix every call site that doesn't need outbox semantics. Build goes green.
3. **Mimetype helper** (`channels/slack/mimetype.ts` + test). Pure function, no integration. Independent commit.
4. **`collectOutbox` helper** (`agent/collect-outbox.ts` + test). Pure function over `tmpdir()`, no integration. Independent commit.
5. **`wrapWithChannelContext` outbox block** (`agent/core.ts` + `tests/agent/wrap-context.test.ts`). TDD: extend existing test file, then add the second parameter to the function. Raise parity coverage from #9's 4 shapes (already in file) to confirm no regression with the new `opts` parameter.
6. **`AgentCore.bind` lifecycle** (`agent/core.ts` + `tests/agent/core.test.ts`). Wire outbox mkdir, log events, collectOutbox, channel.send wrap, retry path, finally cleanup. Mock `channel`, `backend`, and `fs/promises`.
7. **`SlackChannel.send` outbound branching** (`channels/slack/adapter.ts` + `tests/channels/slack/adapter.test.ts`). Branch on `attachments?.length`. uploadV2 path + fallback. messageRef from shares with defensive throw.
8. **Manifest update + E2E gate + PR**:
   - Patch `infra/slack-app-manifest.json` adding `files:write`.
   - Operator reinstalls the Slack app.
   - Execute E1 (JSON), E2 (Markdown), E3 (text-only regression) on channel `C0B0GLS5UTB`. Capture Slack permalinks + log snippets + `docker exec ls /workspace/outbox/`.
   - `/new-pr` with `## E2E Evidence` heading.

## Risks / Open Decisions

| Risk | Decision / Mitigation |
|---|---|
| `Channel.send` signature change breaks an undiscovered call site outside `apps/worker/src/`. | The interface is internal; `grep -rn 'channel\.send\|\.send(target' apps/worker/src` enumerated exactly 5 lines (3 call sites + 1 proxy + 1 noop implementation), plus `cron/runner.ts:255` (4th call site). TypeScript compiler enforces atomicity at typecheck. Quality-gate runs across all workspaces. |
| `client.files.uploadV2` signature in installed Bolt version differs from spec assumption. | Task 7 starts with `pnpm list @slack/bolt` to confirm version, then reads the Bolt source for `uploadV2` in `node_modules/@slack/web-api/dist/methods/files.d.ts` (or equivalent) before writing the test. The integration test (E1 in E2E) catches signature mismatches against the live Slack API. |
| `outbox` block bytes change Claude Agent SDK prompt cache hit rate. | Per spec Constraints, user-message bytes already vary per turn (`current_time` in `[slack_context]`). Cache key is segmented by system-prompt + tool-defs prefix; this plan does not touch either. No invalidation. |
| Operator reinstalls Slack app but forgets to grant `files:write`. | Scenario 5 in the spec (uploadV2 throws → fall back to chat.postMessage with suffix) handles this gracefully. PR description's "Operator action required" block makes the step explicit. |
| `collectOutbox` symlink-realpath check is platform-dependent (Linux container vs macOS dev). | Tests run on the implementer's OS (macOS); production runs in the Node 24 Debian-slim container (`docker-node-image-variants` learning). `fs.realpath` semantics are POSIX-uniform for in-mounted-volume paths; no platform branching needed. |
| Test for cleanup-failure path requires mocking `node:fs/promises` `rm`, which in ESM cannot be `vi.spyOn`'d. | Use `vi.mock('node:fs/promises')` with a factory delegating to `await vi.importActual` plus a `rmMock` override (the pattern that fixed the same issue in #9 — see `wrap-context.test.ts` and `adapter.test.ts` git history). |
| Implementer skips quality-gate between tasks. | Each task ends with explicit `pnpm run quality-gate` step; tasks.md enforces. |
| Implementer breaks the existing `chat.postMessage` byte-identity for text-only replies. | Phase 7 includes an explicit regression test (`SlackChannel.send: text-only routes to chat.postMessage with identical args`) that mocks the client and asserts the args object verbatim against the pre-change shape. |
| E2E gate (phase 8) blocks merge but cannot be automated. | Spec already documents this; implementer runs scenarios manually and posts evidence in PR description; reviewer enforces. |
