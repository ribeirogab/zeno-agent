---
tags:
  - learning
  - claude-agent-sdk
  - mcp
related:
  - "[[../specs/2026-04-16-cron-scheduled-tasks/spec|spec 0007]]"
  - "[[../specs/2026-04-16-mcp-configuration/spec|spec 0004]]"
created: 2026-04-16
---
# In-process MCP servers don't share a public type with the SDK's mcpServers option

`createSdkMcpServer({...})` returns `McpSdkServerConfigWithInstance` but the SDK's `mcpServers` option on `query()` is typed as `Record<string, McpServerConfig>` — a discriminated union of stdio/SSE/HTTP shapes, NOT including the in-process variant exposed by the helper. So you can't just pass the helper's return value through without a cast.

## Context

Discovered during spec 0007 (cron tools). The chat-facing backend needed to merge config-driven MCP servers (from `agent/mcp.json` + `profiles/<name>/mcp.json`) with the in-process cron-tools server. TypeScript rejected `mcpServers: { ...config, zeno: cronMcp }` because the in-process value's `type` property included `'http'` (from our config shape) which doesn't satisfy `McpStdioServerConfig`.

## How to Apply

When passing a mix of config-driven and in-process MCP servers to the SDK's `query()`:

1. Type your local `inProcessMcpServers` as `Record<string, any>` (the SDK doesn't export the in-process type publicly anyway).
2. At the call site, cast the merged object to the SDK option with a single `// biome-ignore lint/suspicious/noExplicitAny` comment — don't try to satisfy the union pointwise.
3. Keep the cast at the call boundary only, not in the registry/builder layer, so the rest of the code stays typed.

See `src/agent/backends/claude-code.ts` for the pattern (`buildMcpServers()` builds the merged map, the spread at the call site does the cast).
