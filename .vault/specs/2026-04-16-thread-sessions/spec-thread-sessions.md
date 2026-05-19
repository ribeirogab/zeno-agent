---
status: shipped
feature: thread-sessions
created: 2026-04-16
shipped: 2026-04-16
---
# Thread Sessions — Spec

**Status:** Draft
**Scope:** Map Slack thread IDs to Claude Agent SDK session IDs so conversations within a thread maintain context across turns. In-memory storage (Map), no external database.

## Context

Spec 0001 (shipped) delivered stateless single-turn interactions. Spec 0002 (shipped) added the dev workflow (bare clone + worktrees + PRs). The stateless limitation is now the top UX blocker: a user says "@zeno clone octocat/my-app" in turn 1, then "show me the README" in turn 2 of the same thread — Zeno has no idea which repo the user is talking about because each turn starts fresh.

The Claude Agent SDK natively supports session persistence via `persistSession: true` (on first turn) and `resume: <sessionId>` (on subsequent turns). The SDK handles conversation history internally. Zeno only needs to map `slackThreadId → sdkSessionId` to bridge the two systems.

## Problem Statement

Without thread sessions, every Slack message is an independent agent invocation. Multi-step dev workflows ("clone X" → "edit Y" → "test" → "open PR") must be crammed into a single message or fail. This defeats the purpose of having a conversational agent.

Thread sessions solve this by making each Slack thread a continuous conversation where Zeno remembers what it did in previous turns.

## Non-Goals

1. **Persistent storage (SQLite, file).** Sessions live in an in-memory `Map`. Container restart = clean slate. Persistence is a future iteration if needed.
2. **Cross-thread memory.** Thread A and thread B are independent sessions. No shared state.
3. **Session expiry / TTL.** Sessions live until the process restarts. No automatic cleanup.
4. **Session management commands** ("list sessions", "delete session"). Not needed for in-memory.
5. **Custom metadata per session** (active repo, worktree path). The SDK's conversation history already captures this — Claude sees its own prior tool calls and results.

## Constraints

- **Prompt caching must not break.** The system prompt (SOUL.md + USER.md) is built once at boot and reused across all sessions and turns. It is NEVER rebuilt mid-session. This preserves Anthropic's prompt cache (see `context/learnings/hermes-prompt-caching-invariants.md`).
- **In-memory only.** The `Map<string, string>` lives on the `AgentCore` instance. No file I/O, no database dependency, no new npm packages.
- **Backward-compatible.** Messages without a `threadId` (first DM before reply) behave exactly as today — stateless, single-turn.
- **No Channel interface changes.** `IncomingMessage.threadId` already exists and is populated correctly by `SlackChannel`.
- **AgentOutput gains `sessionId`.** The backend extracts the session ID from the SDK's `result` message and returns it so `AgentCore` can store the mapping.

## Design

### Data flow (per message)

Note: the Claude Agent SDK defaults `persistSession` to `true` — sessions are saved to `~/.claude/projects/` automatically. We only need to set `persistSession: false` explicitly when we do NOT want a session saved (stateless DMs).

```
IncomingMessage arrives
        │
        ▼
  threadId is null? (DM first msg)
   ┌──────┴──────┐
   │ YES         │ NO (has threadId)
   ▼             ▼
query({        sessionMap.has(threadId)?
  ...input,    ┌──────┴──────┐
  persist-     │ NO          │ YES
  Session:     ▼             ▼
  false        query({       query({
})               ...input,     ...input,
   │             // persist-    resume:
   │             // Session     sessionMap
   │             // defaults    .get(threadId)
   │             // to true   })
   │           })              │
   │             │             ▼
   │             ▼           (session continued)
   │          output
   │          .sessionId
   │             │
   │             ▼
   │          sessionMap.set(
   │            threadId,
   │            sessionId)
   ▼
(stateless,
 no map entry)
```

### Messages without threadId (DM first message)

`threadId` is `null` → no session lookup. Pass `persistSession: false` to avoid saving throwaway sessions to disk. When Zeno replies, Slack creates a thread. The user's next message in that thread has a `threadId` → session begins from turn 2 (with default `persistSession: true`).

### Resume failure fallback

When `resume` is passed but the SDK can't find the session (e.g., container restarted and `~/.claude/projects/` was wiped), the SDK throws an error. This is handled in `AgentCore` (not the backend):

```typescript
// In AgentCore message handler:
try {
  output = await this.opts.backend.query(agentInput);
} catch (error) {
  if (resumeSessionId && isResumeFailed(error)) {
    // Session gone — delete stale mapping and retry as new session
    this.sessionMap.delete(msg.threadId);
    logger.warn({ event: 'session_resume_failed', threadId: msg.threadId }, 'stale session, starting fresh');
    output = await this.opts.backend.query({ ...agentInput, resumeSessionId: undefined });
  } else {
    throw error; // other errors bubble up normally
  }
}
```

`isResumeFailed(error)` checks the error message for session-not-found signals. The stale entry is deleted from `sessionMap` so future turns in the same thread start fresh instead of failing repeatedly.

### Container restart

The in-memory `Map` is empty after restart. Additionally, the SDK stores session data on the container's filesystem at `~/.claude/projects/` — this path is NOT volume-mounted, so session files are lost when the container is recreated.

If a user replies in a thread from before the restart:
- `sessionMap.get(threadId)` returns `undefined` → treated as new session (no resume attempted).
- A new session starts naturally. No error, no crash.

Note: if a future iteration wants sessions to survive restarts, the fix is mounting `~/.claude/` as a Docker volume — not adding a database. The SDK already handles filesystem-based persistence; we just need to make the filesystem persist.

## Changes

### `src/agent/types.ts`

```typescript
// Add to AgentInput:
persistSession?: boolean;    // set to false for stateless DMs; omit (defaults true) for sessions
resumeSessionId?: string;    // set when resuming an existing session

// Add to AgentOutput:
sessionId?: string;          // extracted from SDK result, stored in sessionMap
```

### `src/agent/backends/claude-code.ts`

In `query()`, pass session options to the SDK:

```typescript
const iter = query({
  prompt: input.userMessage,
  options: {
    ...existingOptions,
    // Session handling: resume if sessionId provided; disable persistence if explicitly false
    ...(input.resumeSessionId
      ? { resume: input.resumeSessionId }
      : input.persistSession === false
        ? { persistSession: false }
        : {}),  // default: persistSession=true (SDK default), new session saved
  },
});
```

Extract `sessionId` from the result message:

```typescript
if (message.type === 'result') {
  finalText = message.result;
  sessionId = message.session_id;  // capture for caller
}

return { text: finalText, toolCalls, sessionId };
```

### `src/agent/core.ts`

Add session map and lookup logic:

```typescript
class AgentCore {
  private readonly sessionMap = new Map<string, string>();

  // In the message handler (bind closure):
  const resumeSessionId = msg.threadId
    ? this.sessionMap.get(msg.threadId)
    : undefined;

  const output = await this.opts.backend.query({
    systemPrompt: this.opts.systemPrompt,
    userMessage: msg.text,
    cwd: this.opts.workspaceDir,
    correlationId: msg.correlationId,
    persistSession: msg.threadId == null ? false : undefined, // DMs without thread: don't persist
    resumeSessionId,
  });

  // Store mapping after successful response
  if (msg.threadId && output.sessionId) {
    this.sessionMap.set(msg.threadId, output.sessionId);
  }
```

### Files changed summary

| File | Change | Lines ~est |
|---|---|---|
| `src/agent/types.ts` | Add `persistSession`, `resumeSessionId` to `AgentInput`; add `sessionId` to `AgentOutput` | +3 |
| `src/agent/backends/claude-code.ts` | Pass session options to SDK; extract `sessionId` from result | +10 |
| `src/agent/core.ts` | Add `sessionMap: Map<string, string>`; lookup/store logic in handler | +10 |
| `tests/agent/backends/claude-code.test.ts` | Test: session ID extraction; test: resume passed when provided | +20 |

**Total: ~43 lines changed across 4 files. No new files, no new dependencies.**

## Success Criteria

1. **Thread continuity:** turn 1 in a Slack thread: "@zeno clone octocat/my-app". Turn 2 in the same thread: "show me the README". Zeno knows which repo — responds with the README content without re-cloning.
2. **Thread isolation:** new thread in the same channel starts fresh — no bleed from previous thread's context.
3. **DM behavior:** first DM is stateless. Reply in the DM thread that forms → session starts, subsequent replies maintain context.
4. **Container restart:** reply in a thread from before restart → Zeno responds normally but without prior context. No error, no crash.
5. **Quality gate:** `npm run quality-gate` passes (biome + typecheck + knip + vitest).
6. **Logging:** `session_created` event when new session starts (with threadId + sessionId); `session_resumed` event when existing session is continued.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| SDK `resume` fails because session not found (e.g., after restart) | `AgentCore` catches resume-specific errors, deletes stale `sessionMap` entry, retries as new session. Logs `session_resume_failed`. See "Resume failure fallback" in Design section. |
| SDK `session_id` field name differs from documented (`session_id` vs `sessionId`) | Verify during implementation via debug log of the full result message shape. |
| Memory leak from unbounded Map growth (long-running container, many threads) | Acceptable for personal use (hundreds of threads, not millions). If it becomes an issue, add a simple LRU eviction or periodic clear. |
| Prompt caching breaks if system prompt varies per session | System prompt is built ONCE at boot, stored as string on AgentCore, passed identically to every `query()` call. No per-session variation. |

## Open Questions

None. All decisions resolved during brainstorming (2026-04-16).
