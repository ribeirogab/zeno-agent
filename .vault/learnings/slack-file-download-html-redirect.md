---
tags:
  - learning
  - slack
  - gotcha
related:
  - "[[../specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files|2026-05-18-channel-inbound-files]]"
  - "[[slack-bolt-socket-mode|slack-bolt-socket-mode]]"
created: 2026-05-19
---
# Slack file downloads return a 200 OK HTML login page when `files:read` scope is missing

When a Slack bot token lacks the `files:read` OAuth scope (or the workspace install is stale), requests to `url_private_download` / `url_private` do NOT return 401 or 403 — they return **200 OK with a full HTML login page body** (`<!DOCTYPE html><html lang="en-US">...`). A naive downloader that trusts the status code persists the HTML as the original filename (e.g., `image.png`), and any downstream consumer that expects the declared mimetype produces a confusing failure far from the root cause.

## Context

Discovered during E2E of issue [#9](https://github.com/ribeirogab/zeno-agent/issues/9) (channel inbound files). The worker's `downloadSlackFiles` reported `slack_file_downloaded` with 55779 bytes for a real PNG upload, the adapter populated `message.attachments` correctly, the agent invoked the `Read` tool with the right path — and then the Claude Agent SDK returned `API Error: 400 "Could not process image"`. Inspection via `docker exec zeno-fn head -c 16 /workspace/uploads/<corr>/image.png | xxd` revealed magic bytes `3c21 444f 4354 5950 4520 6874 6d6c 3e3c` (`<!DOCTYPE html><`) — HTML, not PNG.

The Anthropic vision endpoint was correctly rejecting the bogus image; the bug was several layers upstream, in the Slack downloader silently turning a scope problem into a content-type problem.

## How to Apply

When fetching from Slack file URLs (or any internal-API endpoint behind cookie/session auth that can serve user-facing HTML on auth failure):

1. **Never trust `response.ok` alone.** Validate the `Content-Type` response header against the declared mimetype. Reject if they're incompatible.
2. **Loose compatibility is fine.** Accept exact match, same primary type (`image/*`), and `application/octet-stream` (Slack uses it for some downloads). Accept missing `Content-Type` (some CDN edges omit it). Only reject when there's a positive signal of HTML / unexpected type.
3. **Log the actual content-type on rejection.** Without it, operators reading the log can't tell whether the upstream is broken, the token has the wrong scope, or some new edge case is in play.
4. **Operationally:** when adding Slack file features, audit the bot's OAuth scopes against `api.slack.com/apps/<app-id>/oauth` and bump the manifest at `infra/slack-app-manifest.json` to include `files:read` (read) and `files:write` (write) as needed. A re-install of the bot in the workspace is required after scope changes.

The fix lives at `apps/worker/src/channels/slack/files.ts`'s `isContentTypeCompatible()` helper (commit `c93d482`).
