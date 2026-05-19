---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files]]"
  - "[[slack-file-download-html-redirect]]"
created: 2026-05-19
---
# Slack overrides uploaded-file mimetype via content sniffing

When uploading a file via `client.files.uploadV2` with `file: Buffer` and `filename: 'places.json'`, Slack stores the file with `mimetype: text/plain` even though the extension says `.json` and the agent intended `application/json`. Slack sniffs the file body (UTF-8 with no JSON-specific magic header), classifies it as plain text, and overrides any client-side hint. The same happens to `.md` (Slack stores it as `text/plain`).

## Context

Observed during E2E of spec [[../specs/2026-05-19-channel-outbound-files/spec-channel-outbound-files|2026-05-19-channel-outbound-files]]. Worker logged `slack_files_uploaded fileId:F0B4MP08M8B count:1 totalBytes:284`; the worker's `OutgoingAttachment.mimetype` was `application/json` (correctly inferred from `.json` via `lookupMimetype`). Slack's thread metadata for the same file reported `text/plain`. The download from Slack's UI still works (filename preserves `.json`, Slack's UI shows a code-snippet preview), but any downstream code that reads `files.info` and switches on Slack's `mimetype` field will see `text/plain` not `application/json`.

This is NOT an issue with `lookupMimetype` (the implementation is correct). It is an asymmetry between what we declare and what Slack stores.

## How to Apply

- Don't assert on Slack's reported mimetype in E2E checks. Assert on filename + file size instead, and (if needed) on Slack's `pretty_type` rather than `mimetype` (Slack stores `pretty_type: 'JSON'` even when `mimetype: 'text/plain'`).
- If a future feature needs Slack to render a file with the right mimetype (e.g., to trigger image preview), pass binary content with the correct magic bytes — for text-shaped formats, Slack will sniff them as `text/plain` regardless of what we set.
- Don't waste time trying to force Slack's mimetype via the SDK — `uploadV2` has no `mimetype` argument; it's read-only on Slack's side.
- For docs/READMEs: when describing the user-visible outcome of uploads, say "the file lands as `places.json`" not "the file lands as `application/json`," since users see the filename in Slack's UI but Slack's `files.info` API will lie about the mimetype.
