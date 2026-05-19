---
tags:
  - learning
  - gotcha
related:
  - "[[prototype-as-pixel-spec]]"
created: 2026-04-26
---
# Always verify Paper's open file before consulting

The Paper desktop MCP server reads from **whatever file is currently open** in the Paper desktop app. The user typically has multiple Paper files in parallel for different projects; if you call `mcp__plugin_paper-desktop_paper__get_basic_info` and the open file isn't this repo's design file, every subsequent call returns data from a wrong project. The first call before any Paper consultation should always be `get_basic_info` to verify `fileName` matches "zeno-agent" — if not, stop and tell the user to switch files.

## Context

During spec 0030 implementation, Phase 2 needed to verify the canonical canvas color against Paper. The user had warned at the start of the session: "estou trabalhando em paralelo em outros projetos no paper. se por acaso quando vc consultar não for esse… pare imediatamente e me avise". The first `get_basic_info` came back with `fileName: "lynar"` — a completely different project. Continuing would have meant treating that project's tokens as canon for Zeno. Stopped, asked, user switched, re-checked, got `fileName: "zeno-agent"`, proceeded.

## How It Works

`mcp__plugin_paper-desktop_paper__get_basic_info` returns:

```json
{
  "fileName": "zeno-agent",
  "pageName": "Page 1",
  "rootNodeId": "root_node_1-0",
  "nodeCount": 3988,
  "artboardCount": 57,
  "artboards": [...],
  "fontFamilies": [...]
}
```

The `fileName` is the only authoritative identity check. Page names ("Page 1") and artboard names ("Cover") are too generic to disambiguate; `nodeCount` and `artboardCount` will drift as the design evolves. The Zeno design file's identity is also recorded in the user's session context (file id `01KPYCJ6QXK8Z1PEVQME9262RP`) — useful as a tiebreaker if two files happen to share a name.

When the wrong file is open, every other tool (`get_node_info`, `get_computed_styles`, `get_tree_summary`, `get_jsx`) returns data from that wrong file. There's no in-band signal of mismatch — node IDs are file-local and would just look "found".

## How to Apply

Before any sequence of Paper calls in a session:

1. **First call: `get_basic_info`**, no exceptions. Even if you "just consulted Paper a few minutes ago" — the user may have switched files between turns.
2. Read `fileName`. If it does **not** match the project's expected name (for this repo: `"zeno-agent"`), stop immediately. Do not proceed with any other Paper tool.
3. Surface the mismatch to the user clearly: "Paper has `<filename>` open, not `zeno-agent`. Please switch files." Pause until they confirm.
4. After the user switches, re-call `get_basic_info` to verify. Don't trust "I switched" without re-verifying.
5. Inside a single sustained sequence (one task, one turn), one verification at the start is enough. For new sessions or after long breaks, re-verify.

This is cheap (`get_basic_info` is one call, a few hundred bytes) and catches a class of failure that's silent and high-cost — wrong-project values committed as if they were canonical.
