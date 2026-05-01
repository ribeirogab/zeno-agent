---
tags:
  - learning
  - claude-agent-sdk
  - storage
related:
  - "[[claude-agent-sdk-typescript]]"
  - "[[../specs/2026-04-16-dashboard-crud/spec-dashboard-crud|spec 0013]]"
created: 2026-04-16
---
# Claude Agent SDK session transcripts: where they live + how to parse

The `@anthropic-ai/claude-agent-sdk` persists every session's full conversation as NDJSON (one JSON object per line) in:

```
<claudeHome>/<sessionId>.jsonl
```

where `claudeHome` is the path passed to the SDK (or `~/.claude/projects/<workspace-slug>/` by default). In our Docker setup, `claudeHome` is `/home/node/.claude/projects/-workspace/` — that's what we mount via the `claude_home` Docker volume so sessions survive container restarts.

## File format

Each line is a JSON object. The shape we've seen (SDK v0.2.x):

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"abre um PR"}]},"timestamp":"2026-04-16T12:00:00Z","uuid":"msg-1"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"feito"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"echo ok"}}]},"timestamp":"2026-04-16T12:00:05Z","uuid":"msg-2"}
```

Key fields:
- `type` — `user` | `assistant` | `system`
- `message.role` — same values as `type` (redundant but both present)
- `message.content` — string OR array of content blocks:
  - `{type: 'text', text: string}` — the main text content
  - `{type: 'tool_use', id, name, input}` — tool call from assistant
  - `{type: 'tool_result', content, ...}` — tool result (response to a tool_use)
- `timestamp` — ISO 8601, optional in some entries
- `uuid` — SDK-assigned id, optional

## Parser in Zeno

Lives at `apps/api/src/lib/read-session-jsonl.ts`. Strategy:
1. `readFileSync` the file (sessions are typically < 1MB; streaming not needed for v1).
2. Split on `\n`, filter empty lines.
3. JSON.parse each line, catch parse errors → emit a system-role placeholder with `text: "[unparseable line N]"` rather than crashing.
4. Validate shape with a Zod schema; invalid shapes → similar placeholder.
5. Normalize to our own `SessionMessage` type: `{id, role, author, timestamp, text, toolCalls[]}`.

## Why read, not store

Spec 0013 non-goal: the agent doesn't double-write session content to the DB. The SDK already writes the JSONL files; reading them on-demand for the `/sessions/$threadId` page is cheaper and leaves a single source of truth.

Trade-off: if the Docker `claude_home` volume is wiped (`docker compose down -v`), transcripts vanish even though the `sessions` DB table still has the thread→session mapping. Acceptable — the volume is intentional shared state.

## Fragility and upgrade path

The SDK's JSONL format is not a published API contract. When we upgrade `@anthropic-ai/claude-agent-sdk`, the parser might need updates.

**Detection**: the fixture test at `apps/api/tests/fixtures/session.jsonl` + `apps/api/tests/lib/read-session-jsonl.test.ts` is a canary. If an upgrade breaks those, update the parser + fixture together.

**Mitigation**: parser fails soft (placeholder messages instead of 500 errors on the route), so even a format change just degrades the transcript view rather than taking down the page.

## How to Apply

- **Don't write to `.jsonl` files yourself.** Let the SDK own that path.
- **When adding a new transcript feature** (search, export, etc.), derive from the existing parser — don't write a second parser.
- **When the SDK adds new entry types** (e.g., `type: 'memory'` or `type: 'tool_result'` which we currently pass through with `passthrough()`), extend the parser Zod schema to extract whatever the new type provides, or leave it as a placeholder if it's not user-facing.
