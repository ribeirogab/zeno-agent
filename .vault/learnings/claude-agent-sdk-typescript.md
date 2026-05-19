---
tags:
  - learning
  - reference
related:
  - "[[../specs/2026-04-15-slack-zeno-mvp/spec-slack-zeno-mvp|Zeno MVP spec]]"
  - "[[claude-code-oauth-token]]"
  - "[[claude-code-cli-headless]]"
created: 2026-04-15
---
# Claude Agent SDK (TypeScript)

The official TypeScript SDK for programmatic Claude Code: **`@anthropic-ai/claude-agent-sdk`**. It exposes the same agent loop that powers Claude Code CLI — built-in tools (Bash, Read, Write, Edit, Grep, Glob), MCP support, session management — as an in-process API, avoiding subprocess overhead. This is the preferred integration point for Zeno: richer API, cheaper per call, native streaming.

## Context

Discovered during Task 0 (discovery) of spec `2026-04-15-slack-zeno-mvp`. The original plan was to `spawn('claude', ['-p', ...])` as a subprocess per request; this finding makes that unnecessary. Source: [Claude Code docs — Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript).

## How to Apply

**Install:**
```bash
npm install @anthropic-ai/claude-agent-sdk
```

**Minimal invocation** — `query()` returns an `AsyncGenerator<SDKMessage, void>`:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk"

const result = query({
  prompt: "quais repos tem na octocat?",
  options: {
    systemPrompt: ZENO_SYSTEM_PROMPT,
    allowedTools: ["Bash"],              // start narrow for MVP
    tools: { type: "preset", preset: "claude_code" },  // enable built-ins
    cwd: "/workspace",
    permissionMode: "bypassPermissions", // no interactive prompting in a bot
  },
})

for await (const msg of result) {
  if (msg.type === "assistant") {
    // streaming assistant text and tool calls
  } else if (msg.type === "result") {
    // final: msg.result has the answer text, msg.total_cost_usd, msg.usage
  } else if (msg.type === "stream_event") {
    // partial tokens (if includePartialMessages: true)
  }
}
```

**Authentication** — the SDK reads `ANTHROPIC_API_KEY` OR `CLAUDE_CODE_OAUTH_TOKEN` from env. For Zeno (OAuth path), set `CLAUDE_CODE_OAUTH_TOKEN` — see [[claude-code-oauth-token]] for how to obtain it.

**Key `Options` fields** (partial list):

| Option | Purpose |
|---|---|
| `systemPrompt: string` | Replace default system prompt entirely |
| `systemPrompt: { type: "preset", preset: "claude_code", append: "…" }` | Keep Claude Code preset, append extra instructions |
| `allowedTools: string[]` | Auto-approve these tool names |
| `disallowedTools: string[]` | Always deny these (takes precedence) |
| `tools: { type: "preset", preset: "claude_code" }` | Enable the full Claude Code built-in toolset |
| `cwd: string` | Working dir for file/Bash tools |
| `permissionMode` | `"default" \| "acceptEdits" \| "bypassPermissions" \| "plan" \| "dontAsk" \| "auto"` |
| `mcpServers` | `Record<string, McpServerConfig>` for stdio/sse/http MCP servers |
| `includePartialMessages` | `true` to receive `stream_event` messages |
| `maxTurns: number` | Cap on tool-use loop iterations |
| `abortController: AbortController` | Cancel the query |

**Useful `Query` methods:** `interrupt()`, `setModel(model?)`, `setPermissionMode(mode)`, `close()`.

**Related SDK exports:**
- `tool(name, description, schema, handler)` — define custom MCP tools with Zod schemas.
- `createSdkMcpServer({ name, tools })` — bundle custom tools as an MCP server (in-process).
- `listSessions`, `getSessionMessages`, `getSessionInfo`, `renameSession`, `tagSession` — session management.

**When to still spawn `claude` CLI:** The `/login` OAuth flow and `claude setup-token` are CLI-only. The runtime path (answering Slack messages) uses the SDK. The container needs both: CLI for setup, SDK for serving.
