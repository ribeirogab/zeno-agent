---
tags:
  - learning
  - slack
  - gotcha
related:
  - "[[../specs/2026-05-18-channel-inbound-files/spec-channel-inbound-files|2026-05-18-channel-inbound-files]]"
  - "[[slack-file-download-html-redirect|slack-file-download-html-redirect]]"
created: 2026-05-19
---
# Slack clipboard-paste attachments all share the name `image.png`

When the operator pastes images from the clipboard into a Slack message (Cmd+V on macOS, Ctrl+V elsewhere), each upload gets the auto-generated name **`image.png`** — regardless of how many they paste. The unique identity lives only in the Slack-side `file.id` (e.g., `F0B5KPEAT7A`). A file-saving routine that writes to `<dir>/<file.name>` silently overwrites every prior paste in the same turn; only the last clipboard image survives on disk, and only that one ends up in front of the agent.

## Context

Discovered during E2E of issue [#9](https://github.com/ribeirogab/zeno-agent/issues/9). Operator sent a Slack mention with 5 clipboard-pasted images (cat, dog, shoe, hoodie, squirrel) and asked "o que são essas coisas?". Bot replied describing only the squirrel.

Worker logs confirmed the failure mode:

```
slack_file_downloaded fileId:F0B5KPEAT7A bytes:431999    # cat
slack_file_downloaded fileId:F0B4N3MT00M bytes:379335    # dog
slack_file_downloaded fileId:F0B4PD31AG6 bytes:158939    # shoe
slack_file_downloaded fileId:F0B5KPK24SU bytes:3086684   # hoodie
slack_file_downloaded fileId:F0B4V3SFGG4 bytes:1938779   # squirrel
message_received platform:slack attachments:5
backend_tool_call tool:Read input:{file_path:/workspace/uploads/<corr>/image.png}
```

Five `slack_file_downloaded` lines, all writing to the same `image.png`. The agent's prompt listed all 5 `localPath` entries — but every entry pointed at the same file, and that file held only the last download's bytes. Net result: 5 attachments declared, 1 file read, 1 image described.

The bug is older than spec 2026-05-18-channel-inbound-files — it ships pre-existing in `downloadSlackFiles`. The E2E hit it because that's the first time anyone tried multi-paste against the worker; until now the only confirmed flow was 1 file per turn.

## How to Apply

When persisting third-party attachments to disk, never trust the upstream's filename as your collision-free key. Identifier choices:

1. **Salt with the upstream's unique ID.** Slack guarantees `file.id` uniqueness within a turn; prefix the on-disk filename: `${file.id}-${file.name}`. The exposed-to-agent `Attachment.name` stays as the operator-visible original; only the path is salted. This is the fix landed in `apps/worker/src/channels/slack/files.ts` (PR #74).
2. **Per-file subdirectory.** `<dir>/<file.id>/<file.name>` — cleaner but adds one mkdir per file.
3. **Hash-based filename.** SHA of contents. Lossy (loses original name) and only useful for content-addressed deduplication, not the multi-paste case.

The salted prefix is the lowest-friction option for an agent context: the agent prompt's `[attached_files]` block still lists the human-meaningful name; tools opening the path see all five distinct files.

The new unit test `downloadSlackFiles › does not collide when multiple files share the same name (Slack clipboard pastes)` locks this in: three `image.png` uploads → three unique localPaths → three distinct file bodies on disk.
