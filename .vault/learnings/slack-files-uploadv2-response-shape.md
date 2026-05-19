---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files]]"
created: 2026-05-19
---
# Slack `files.uploadV2` does not return a posted-message ts

Slack's `client.files.uploadV2` (Bolt SDK 4.7 / `@slack/web-api` 7.15.1) returns `{ok: true, files: Array<completeUploadExternalResponse>}` where each entry is itself `{ok, files: [{id, title, ...}]}` — a **nested** wrapper from the underlying `files.completeUploadExternal` calls. The response carries file IDs but **no message timestamp** (`ts`) for the message the upload was posted to. Some SDK code paths flatten the wrapper to `{ok, files: [{id, ...}]}`; both shapes must be handled.

## Context

Discovered during E2E of spec [[../specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files|2026-05-19-channel-outbound-files]] (issue [#10](https://github.com/ribeirogab/zeno-agent/issues/10)). The brainstorming-phase plan assumed `result.files[0].shares.public[channelId][0].ts` would yield the posted message ts — that path *does* exist in Slack's REST docs for `files.info` and similar, but `uploadV2` does NOT enrich its response with shares. The first happy-path E1 run succeeded at the API layer (file delivered, text rendered as `initial_comment`), but my adapter's defensive throw `'files.uploadV2 returned no message ts'` fired AFTER the file had landed, so the worker logged `handler_error` even though the user-visible outcome was correct.

## How to Apply

- When implementing outbound files in a channel adapter, **return the first uploaded file's `id` as `messageRef`**, not a message ts. The contract `Channel.send` → `{messageRef}` becomes "stable opaque reference," not "Slack message ts." Document this asymmetry: inbound `IncomingMessage.messageRef` IS a ts (used for reactions on the operator's message); outbound `OutgoingMessage`'s returned `messageRef` is a file id when files were uploaded, a ts when text-only.
- Always parse the SDK response with **both nested + flat fallback**: `result.files[0]?.files?.[0]?.id ?? result.files[0]?.id`. Different SDK versions / code paths flatten differently.
- The defensive throw should be `'no file id'`, not `'no message ts'` — file id is what's always present.
- If a future feature needs the actual posted-message ts (e.g., to react on the bot's reply), call `files.info({file: fileId}).shares.public[channelId][0].ts` after upload, or — better — use `chat.postMessage` for text and `files.uploadV2` separately with `thread_ts`, paying the cost of two messages.
- During E2E, **always check the Slack thread for the actual rendered outcome** before trusting worker logs. The adapter can log `handler_error` while Slack has already delivered the message. The reverse-truth (`response_sent` logged but message missing in Slack) also happens during rate-limits.
