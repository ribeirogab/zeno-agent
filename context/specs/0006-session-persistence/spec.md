---
status: draft
feature: session-persistence
created: 2026-04-16
shipped: null
---
# Session Persistence (DB-backed) — Spec

**Status:** Draft
**Scope:** Replace the in-memory `Map<threadId, sessionId>` in `AgentCore` with `SessionRepo` from spec 0005. Mount `~/.claude` as a Docker volume so the Claude Agent SDK's own session files persist too. After this, multi-turn Slack threads survive container restart.

## Context

Spec 0003 shipped sessions but kept the threadId→sessionId map in process memory. Container restart wipes it, AND wipes `~/.claude/projects/` (where the SDK persists actual session content) since that path is in the ephemeral container layer. To make sessions survive, both need to persist.

Spec 0005 built `SessionRepo` for exactly this use case. Now we wire it.

## Problem Statement

Today: `docker compose down && up` loses every active thread. User asks Zeno on a thread today, then asks again tomorrow — Zeno has no idea what they were doing. Awful UX for any non-trivial workflow.

## Non-Goals

1. **Session expiry / TTL.** Sessions live forever until manually deleted. Cleanup can come later.
2. **Cross-restart session recovery beyond what the SDK provides.** If the SDK can't resume a saved session for any reason, we fall back to a fresh session (already handled by spec 0003's resume-failure path).
3. **Migrating in-memory entries to DB on restart.** The map is ephemeral; on restart we start with whatever's in the DB.
4. **Per-user session isolation.** Single-user scope.

## Constraints

- **No new dependencies.** SessionRepo + better-sqlite3 already exist (spec 0005).
- **AgentCore interface stable.** `bind(channel)` signature unchanged. Adding a constructor option (`sessions: SessionRepo`) is the only public change.
- **Backwards-compatible startup.** If the DB is fresh, behavior is identical to today.
- **Resume failure logic preserved.** The existing fallback-to-fresh-session on resume failure stays.
- **Volume mount for `~/.claude`.** New named Docker volume `claude_home` mounted at `/home/node/.claude` so SDK's session files persist.

## Design

### AgentCore changes

```typescript
// Before:
class AgentCore {
  private readonly sessionMap = new Map<string, string>();
  // ... uses sessionMap.get/set/has/delete
}

// After:
class AgentCore {
  constructor(private readonly opts: { backend, workspaceDir, systemPrompt, sessions: SessionRepo }) {}
  // Replace sessionMap.get(threadId) → this.opts.sessions.get(threadId)
  // Replace sessionMap.set(threadId, id) → this.opts.sessions.upsert(threadId, id)
  // Replace sessionMap.has(threadId) → this.opts.sessions.get(threadId) !== null
  // Replace sessionMap.delete(threadId) → this.opts.sessions.delete(threadId)
}
```

### Index wiring

```typescript
// Already opens DB + creates SessionRepo (spec 0005).
// Now pass it to AgentCore:
const core = new AgentCore({ backend, workspaceDir, systemPrompt, sessions });
```

### Docker compose

```yaml
services:
  zeno-agent:
    volumes:
      - workspace:/workspace
      - claude_home:/home/node/.claude    # NEW — SDK session files
      - ./profile:/app/profile:ro

volumes:
  workspace:
  claude_home:                            # NEW
```

### Files changed

| File | Change |
|---|---|
| `src/agent/core.ts` | Drop `sessionMap`, accept `sessions: SessionRepo`, replace map calls with repo calls |
| `src/index.ts` | Pass `sessions` to `AgentCore` constructor |
| `infra/docker-compose.yml` | Add `claude_home` named volume + mount |
| `context/specs/0006-session-persistence/spec.md` | This file |

## Success Criteria

1. After `docker compose down -v && up`, a Slack reply in an old thread starts a new session (clean slate confirmed by `session_resume_failed` log if SDK still has the session id reference, but no in-memory carryover).
2. After `docker compose down && up` (without `-v`, preserving volumes), a Slack reply in an old thread successfully resumes the SDK session — `session_resumed` log appears, no error.
3. `/workspace/zeno.db` contains the active session rows (verifiable via `pnpm run docker:sh` then `sqlite3 /workspace/zeno.db "SELECT * FROM sessions"`).
4. `claude_home` volume contains SDK session files after first message in a thread.
5. Quality gate passes (biome + typecheck + knip + vitest).

## Risks

| Risk | Mitigation |
|---|---|
| Existing `void sessions` in index.ts (placeholder from spec 0005) needs to become a real wire-up | Trivial — just pass to AgentCore |
| Tests might break if any depended on AgentCore's internal Map | None do — tested by re-running the existing suite |
| SDK session files in `~/.claude/projects/` grow unbounded | Out of scope — cleanup is a future operational concern |

## Open Questions

None.
