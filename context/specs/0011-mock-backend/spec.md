---
status: draft
feature: mock-backend
created: 2026-04-16
shipped: null
---
# MockBackend — Spec

**Status:** Draft
**Scope:** A second `AgentBackend` implementation that returns canned replies instead of calling Claude. Selectable at boot via `ZENO_BACKEND=mock`. Lets us iterate on the Slack adapter, AgentCore, cron runner, and DB persistence without burning Claude tokens or hitting rate limits.

## Context

Every change to message handling currently costs a real Claude turn. Local development, integration tests, and demos all benefit from a deterministic, free, instant backend. The `AgentBackend` interface (spec 0001) was designed for this — a second implementation should be a small drop-in.

## Problem Statement

We have one backend (`ClaudeCodeBackend`) and no way to test the surrounding pipeline without it. Symptoms:
- Tests can't assert end-to-end Slack→core→backend→Slack flows without stubbing in each test
- Manual UI/UX tweaks require waiting 5–30s per Claude turn and paying tokens
- Rate-limit issues during dev block the developer for hours

## Non-Goals

1. **Simulated streaming.** MockBackend resolves with the full reply at once. No fake `assistant`/`tool_use` event timing.
2. **LLM behavior simulation.** No fake reasoning, no fake "use this tool then this one". Just static reply lookup.
3. **A web UI / fixtures editor.** Patterns live in code (or a JSON file under `profile/`) — that's enough for v1.
4. **Per-platform fixtures.** Same fixtures regardless of channel.
5. **Recording mode.** No "capture real Claude responses to replay later". Possibly later if the need is clear.

## Constraints

- **Implements `AgentBackend` exactly.** Same shape as `ClaudeCodeBackend.query()` — returns `AgentOutput { text, toolCalls, sessionId? }`.
- **Selected at boot via env.** `ZENO_BACKEND=claude-code` (default) | `mock`. Bad value → boot error with a clear message.
- **Deterministic session ids.** When the input has no `resumeSessionId`, MockBackend mints `mock-sess-${counter}`. Lets thread→session mapping be exercised end-to-end.
- **Optional fixtures file.** `profile/mock-fixtures.json` — array of `{ match: string (regex source), reply: string }`. Missing file is fine: falls back to a generic echo reply.
- **No new dependencies.** Plain JSON parse + RegExp construction.

## Design

### Backend implementation

```typescript
class MockBackend implements AgentBackend {
  readonly name = 'mock';
  private counter = 0;

  constructor(private readonly fixtures: Fixture[] = []) {}

  async query(input: AgentInput): Promise<AgentOutput> {
    const matched = this.fixtures.find(f => f.match.test(input.userMessage));
    const text = matched?.reply ?? defaultEcho(input.userMessage);
    const sessionId = input.resumeSessionId ?? `mock-sess-${++this.counter}`;
    logger.info({ event: 'mock_backend_reply', matched: !!matched, sessionId }, 'mock backend');
    return { text, toolCalls: [], sessionId };
  }
}
```

### Fixtures file (optional)

`profile/mock-fixtures.json`:

```json
{
  "fixtures": [
    { "match": "^lista os crons", "reply": "1. morning-summary (next: 09:00)\\n2. health-check (next: 10:00)" },
    { "match": "(?i)oi|olá|hey", "reply": "oi! sou o Zeno em modo mock — nada que eu disser conta de verdade." }
  ]
}
```

Patterns are JS-style RegExp source strings. Bad patterns are skipped with a warning, not fatal.

### Default echo

When no fixture matches, return:

```
[mock] você disse: "<first 200 chars of userMessage>"
```

Trims the `[slack_context]` preamble before echoing so dev output stays readable.

### Backend selection in `index.ts`

```typescript
const backendName = process.env.ZENO_BACKEND ?? 'claude-code';

function buildBackend(opts: { mcpServers, inProcessMcpServers? }): AgentBackend {
  switch (backendName) {
    case 'claude-code': return new ClaudeCodeBackend(opts);
    case 'mock': return new MockBackend(loadMockFixtures());
    default: throw new Error(`Unknown ZENO_BACKEND: ${backendName} (expected 'claude-code' or 'mock')`);
  }
}
```

### Files changed

| File | Change |
|---|---|
| `src/agent/backends/mock.ts` | New — `MockBackend` class + `Fixture` type |
| `src/agent/backends/mock-fixtures.ts` | New — `loadMockFixtures()` reads + parses `profile/mock-fixtures.json` |
| `src/index.ts` | Switch on `ZENO_BACKEND` env var to pick a backend |
| `tests/agent/mock-backend.test.ts` | New — verifies pattern matching, default echo, session minting |

## Success Criteria

1. `ZENO_BACKEND=mock pnpm run dev` boots Zeno; Slack messages get echoed via the mock without any Claude SDK call (verified by absence of `backend_started backend=claude-code` logs).
2. `ZENO_BACKEND=mock` + `profile/mock-fixtures.json` with a pattern → matching messages return the fixture reply.
3. `ZENO_BACKEND=garbage` fails boot with a clear error.
4. Default behavior unchanged: with no env var set, Zeno uses ClaudeCodeBackend.
5. Quality gate passes (biome + typecheck + knip + vitest).

## Risks

| Risk | Mitigation |
|---|---|
| Mock backend used in prod by accident | Env var defaults to claude-code; selection logged at boot (`backend_selected backend=...`) |
| Fixtures file with malformed regex | Each pattern tried in a try/catch; bad ones skipped + logged, others continue |
| Mock breaks AgentCore session-resume retry path | Mock honors `resumeSessionId` and never throws — won't trigger the retry path. That path is exercised by ClaudeCodeBackend tests anyway |

## Open Questions

None.
