---
status: shipped
feature: mcp-configuration
created: 2026-04-16
shipped: 2026-04-16
---
# MCP Configuration — Spec

**Status:** Draft
**Scope:** Declarative MCP server registry via `profile/mcp.json` with env var interpolation. User adds new MCPs by editing config + `.env` — no code changes. Ships 4 pre-configured entries (Playwright, Linear, Notion, Granola) and 3 commented examples (Sentry, Cloudflare, Vercel).

## Context

Today Zeno's `ClaudeCodeBackend` doesn't expose MCP servers to the SDK at all. The Claude Agent SDK accepts `mcpServers` in its options, taking either stdio (`{command, args, env}`) or HTTP/SSE config. To plug an MCP server today, we'd hardcode it in the backend constructor.

The user wants to add many MCPs over time (Playwright already, Linear/Notion/Granola soon, eventually whatever the day demands). Hardcoding doesn't scale. A config file driven by env vars matches how Claude Code itself works (`.mcp.json` / `~/.claude/mcp.json`) and keeps secrets out of the committed file.

## Problem Statement

Adding a new MCP server should be: edit one config file, set credentials in `.env`, restart container. No TypeScript edit, no rebuild image (unless secrets change in compose), no spec required.

## Non-Goals

1. **MCP server discovery / marketplace.** No automatic search of npm. User picks the package name themselves.
2. **MCP authentication flows.** OAuth flows for Notion, Linear etc. happen out-of-band (user sets up tokens manually). We just pass credentials through env vars.
3. **MCP server health checks.** SDK handles connection. We log success/failure but don't actively monitor.
4. **Hot-reload of mcp.json.** Out of scope (covered by spec 0010 hot-reload).
5. **Per-thread MCP scoping.** All sessions get the same MCP set. Selective enabling per task is future work.

## Constraints

- **`profile/mcp.json` is committed.** Contains references to env vars (`${VAR_NAME}`) — never raw secrets. Gitignore stays focused on `USER.md` and user skills.
- **Secrets live in `.env`.** Env vars are interpolated at load time.
- **Servers with unresolved env vars are silently skipped** (with warning log). Lets the file ship with examples that activate when user fills in credentials.
- **`_disabled: true` skips a server** even if env vars resolve. For users who want to keep an entry around without running it.
- **Backwards-compatible.** If `profile/mcp.json` doesn't exist, behavior is identical to today (no MCP servers passed to SDK).

## Design

### Config file format (`profile/mcp.json`)

```jsonc
{
  "mcpServers": {
    "<name>": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "SOME_API_KEY": "${SOME_API_KEY}"
      },
      "_disabled": false,
      "_comment": "Optional human note about this server"
    }
  }
}
```

- `command` + `args` for stdio servers (most common).
- HTTP transport: use `{ "type": "http", "url": "..." }` instead of command/args.
- `env` map: values matching `${VAR_NAME}` are replaced with `process.env.VAR_NAME`. Unresolved → server skipped + warning.
- `_disabled` (optional): boolean, default false. Underscore prefix marks our convention (vs SDK fields).
- `_comment` (optional): ignored at runtime, exists for human readers.

### Pre-configured servers (committed in `profile/mcp.json`)

Active by default (no credentials required):
- `playwright` — `npx -y @playwright/mcp@latest`

Active when user fills credentials in `.env`:
- `linear` — env: `LINEAR_API_KEY`
- `notion` — env: `NOTION_API_KEY`
- `granola` — env: `GRANOLA_API_KEY`

Commented examples (`_disabled: true` + comment with link to docs):
- `sentry`
- `cloudflare`
- `vercel`

### Loading and interpolation

```typescript
// src/agent/mcp.ts
export function loadMcpConfig(): McpServerMap {
  const path = resolveProfilePath('mcp.json');
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const resolved: McpServerMap = {};
  for (const [name, server] of Object.entries(raw.mcpServers ?? {})) {
    if (server._disabled) continue;
    const interpolated = interpolateEnv(server);
    if (!interpolated) {
      logger.warn({ event: 'mcp_server_skipped', name, reason: 'unresolved_env' });
      continue;
    }
    resolved[name] = interpolated;
    logger.info({ event: 'mcp_server_enabled', name });
  }
  return resolved;
}
```

### Wiring into ClaudeCodeBackend

`AgentInput` does NOT change — MCP config is global, not per-message. `ClaudeCodeBackend` accepts `mcpServers` in its constructor options and passes it to every `query()` call.

```typescript
const mcpServers = loadMcpConfig();
const backend = new ClaudeCodeBackend({ mcpServers });
```

### Files changed

| File | Change |
|---|---|
| `profile/mcp.json` | New — 4 active + 3 commented examples |
| `src/agent/mcp.ts` | New — loader + env var interpolation |
| `src/agent/backends/claude-code.ts` | Accept `mcpServers` in opts; pass to SDK |
| `src/index.ts` | Load mcp config at boot, pass to backend |
| `tests/agent/mcp.test.ts` | New — interpolation, skip-on-unresolved, _disabled |

## Success Criteria

1. `profile/mcp.json` ships with 4 active + 3 commented entries.
2. Boot logs `mcp_server_enabled` for `playwright` (no credential needed) — and `mcp_server_skipped` for the others until user fills credentials.
3. After user adds `LINEAR_API_KEY=...` to `.env`, `linear` activates on restart and Claude can call its tools (verifiable via Slack: `@zeno usa o linear pra listar minhas tasks`).
4. `_disabled: true` entries never register, even with credentials present.
5. Quality gate passes (biome + typecheck + knip + vitest).
6. Test coverage for: env interpolation happy path, missing env var, malformed `${...}`, `_disabled` skip, missing file fallback.

## Risks

| Risk | Mitigation |
|---|---|
| Server package name guess is wrong | User edits `profile/mcp.json` to fix; framework doesn't care which package |
| Security: env var names collide with internal vars | Convention: prefix MCP env vars by service (LINEAR_API_KEY not API_KEY) |
| Secret leaks if `.env` is shared | `.env` already gitignored; we only document the pattern |

## Open Questions

None. Design follows Claude Code's own `.mcp.json` convention.
