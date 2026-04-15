---
tags:
  - learning
  - reference
related:
  - "[[../specs/0001-slack-zeno-mvp/spec|Zeno MVP spec]]"
  - "[[claude-agent-sdk-typescript]]"
  - "[[claude-bare-mode-no-oauth]]"
created: 2026-04-15
---
# Claude Code CLI — headless flags

Claude Code CLI flags for programmatic use via `claude -p`. Zeno's runtime path uses the SDK ([[claude-agent-sdk-typescript]]), but the CLI is still relevant for setup (`claude /login`, `claude setup-token`), debugging, and one-off scripts.

## Context

The CLI headless mode (previously called "headless", now just "Agent SDK via CLI") is documented at [Run Claude Code programmatically](https://code.claude.com/docs/en/headless).

## How to Apply

**Basic invocation:**

```bash
claude -p "prompt text"
```

**Important flags:**

| Flag | What it does |
|---|---|
| `-p, --print` | Non-interactive single-shot mode |
| `--bare` | Skip hooks/skills/plugins/MCP/CLAUDE.md auto-discovery; **also skips OAuth reads** ([[claude-bare-mode-no-oauth]]) |
| `--output-format text\|json\|stream-json` | `json` = full metadata envelope; `stream-json` = NDJSON stream |
| `--include-partial-messages` | Emit token-level events in `stream-json` |
| `--verbose` | Required alongside partial messages for full stream |
| `--json-schema '<schema>'` | Force output to match JSON Schema; result in `.structured_output` |
| `--allowedTools "Bash,Read,Edit"` | Pre-approve tools (comma-separated) |
| `--permission-mode default\|acceptEdits\|bypassPermissions\|plan\|dontAsk\|auto` | Session-wide permission baseline |
| `--dangerously-skip-permissions` | Disable prompts entirely (for automation) |
| `--append-system-prompt "…"` | Add to default system prompt |
| `--append-system-prompt-file path` | Same, from file |
| `--system-prompt "…"` | Replace the default system prompt |
| `--continue` | Continue most recent conversation |
| `--resume <session_id>` | Continue specific session |
| `--settings <file-or-json>` | Load settings object |
| `--mcp-config <file-or-json>` | Configure MCP servers |

**Auth precedence:**
- Interactive mode and default `-p`: reads OAuth from `~/.claude/` (after `/login`).
- `--bare` mode: **OAuth is skipped**; requires `ANTHROPIC_API_KEY` or `apiKeyHelper` in `--settings`.

**Canonical `stream-json` envelope fields** (for manual parsing if needed):
- `type: "system"` / `subtype: "init"` — session start
- `type: "assistant"` / `message.content: [{type: "text"|"tool_use", ...}]`
- `type: "result"` / `result: string` / `total_cost_usd` / `usage` — final
- `type: "stream_event"` / `event.delta` — partial tokens (with `--include-partial-messages`)
- `type: "system"` / `subtype: "api_retry"` — transient error backoff

**For Zeno:** the only CLI invocations expected in the container's runtime are setup-time (`/login`, `setup-token`, `--version` health check). The runtime uses the SDK.
