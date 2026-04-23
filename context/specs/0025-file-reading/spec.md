---
status: shipped
feature: file-reading
created: 2026-04-22
shipped: 2026-04-22
---
# File Reading (All Channels) — Spec

**Status:** Shipped
**Scope:** When a user sends a file attachment (image, PDF, code, document) in a Slack message, Zeno downloads it to the workspace and includes the local path in the agent's prompt so Claude can read it via built-in tools.

## Context

Backlog Tier 1 #2. Base for audio, images, and documents. Without this, Zeno ignores any file a user uploads — a significant gap in usability.

## Design

Files are downloaded to `/workspace/uploads/<correlationId>/` by the Slack adapter before passing the message to AgentCore. Local file paths are included in a `[attached_files]` block in the user message, alongside the existing `[slack_context]` block. Claude Code's built-in `Read` tool handles images (multimodal), PDFs, and text files natively — no special handling per file type.

## Deliverables

| File | Action | What |
|---|---|---|
| `apps/worker/src/channels/types.ts` | Modify | Added `Attachment` interface + optional `attachments` field on `IncomingMessage` |
| `apps/worker/src/channels/slack/files.ts` | Create | `downloadSlackFiles()` — downloads Slack-hosted files with bot token auth, 50MB size limit |
| `apps/worker/src/channels/slack/adapter.ts` | Modify | Calls `downloadSlackFiles` in dispatch when `event.files` present; added `workspaceDir` option |
| `apps/worker/src/agent/core.ts` | Modify | `wrapWithSlackContext` emits `[attached_files]` block with local paths |
| `apps/worker/src/index.ts` | Modify | Passes `workspaceDir` to SlackChannel |

## Non-Goals

- Audio transcription (deferred to spec 0026 or later).
- File type filtering (Claude handles what it can; if it can't, it says so).
- Automatic cleanup of uploaded files (workspace is ephemeral in Docker).
- Multimodal SDK calls (files are saved locally; Claude reads them via `Read` tool).
- Non-Slack channels (Telegram/WhatsApp don't exist yet).

## Tests

- `apps/worker/tests/channels/slack/files.test.ts` — 8 tests: happy path, multiple files, no-URL skip, url_private fallback, 50MB size limit, HTTP error, fetch throw, auth header.
- `apps/worker/tests/agent/wrap-context.test.ts` — 6 tests: attachments block in prompt, no attachments, non-slack passthrough, ordering, empty array.
