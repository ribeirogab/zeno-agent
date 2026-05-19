---
status: shipped
feature: profile-hot-reload
created: 2026-04-16
shipped: 2026-04-16
---
# Profile Hot-Reload — Spec

**Status:** Draft
**Scope:** Watch `profile/` while Zeno runs and apply changes without restarting the container. SOUL.md and USER.md changes take effect on the next agent turn (new sessions — already-resumed sessions keep their snapshot, per SDK behavior). `crons.yaml` changes re-run `replaceStaticSet`. `mcp.json` changes log a warning that a restart is required (changing MCP server processes mid-flight is unsafe).

## Context

`profile/` is the soul of Zeno. Today every edit to SOUL.md, USER.md, or crons.yaml requires `docker compose restart` — heavy and lossy (kills active sessions, drops in-flight cron runs). Zeno is meant to be edited live: tweak the prompt, see the next reply behave differently.

## Problem Statement

Iterating on Zeno's behavior is a pain when every wording change costs a 10s restart and an active-session reset. We want: edit `profile/SOUL.md`, save, send a Slack message — Zeno responds with the new prompt.

## Non-Goals

1. **Mid-session prompt rewrites.** SDK persists session state with the original system prompt. Hot-reload affects sessions started AFTER the change. Existing resumed sessions keep their old prompt — by design.
2. **Hot-reload of MCP server config.** Spawning/killing stdio MCP processes mid-flight is risky. We log a clear "restart required" warning instead. Configuration that changes only adds/removes a server — out of scope.
3. **Hot-reload of compiled code.** This is a profile/ watcher, not a dev hot-reloader. Code changes still require `docker compose up -d --force-recreate`.
4. **Configurable watch paths.** Always watches `profile/` (the bind mount). Not parameterized.
5. **Validation feedback to Slack.** If `crons.yaml` becomes invalid mid-edit, errors go to logs only — no Slack notification (out of scope; could come later).

## Constraints

- **No new dependencies.** Use `node:fs.watch` (recursive) instead of pulling chokidar. Native watch is flaky on macOS dev (extra events, deduped via debounce); reliable enough on the Linux container that runs prod.
- **Debounce.** Editors emit multiple events per save (chmod, rename-replace). Coalesce into a single reload with a 250ms trailing-edge debounce, per file group.
- **No reload on transient parse errors.** If the new content fails to parse (bad YAML, bad JSON), keep the previous in-memory state and log the error. Don't crash, don't half-apply.
- **AgentCore reads systemPrompt via getter, not snapshot.** Switch the `systemPrompt: string` constructor option to `getSystemPrompt: () => string`. Backward incompatible at the call site (only one caller).
- **Skills are already hot.** Files under `profile/skills/` are read on-demand by Zeno itself via the Read tool. No watcher needed for them.

## Design

### File groups

| File(s) | Reload action |
|---|---|
| `profile/SOUL.md`, `profile/USER.md` | Rebuild systemPrompt; new sessions pick it up |
| `profile/crons.yaml` | Reload + `crons.replaceStaticSet(...)` (preserves chat-source crons) |
| `profile/mcp.json` | Log a clear `mcp_change_requires_restart` warning |
| `profile/skills/**` | Ignored — agent reads on demand |

### Watcher architecture

```
┌──────────────────────────────────┐
│  ProfileWatcher                  │
│                                  │
│  fs.watch('profile/', recursive) │
│    → debounce(250ms, perGroup)   │
│      → switch on filename:       │
│          SOUL.md|USER.md → rebuildPrompt()
│          crons.yaml      → reloadCrons()
│          mcp.json        → warnRestart()
└──────────────────────────────────┘
```

### State holders

`PromptHolder { value: string }` — mutable wrapper around the current systemPrompt. Both `index.ts` and `AgentCore` read from `holder.value`.

```typescript
const promptHolder = { value: buildSystemPrompt(loadProfileFile('SOUL.md'), loadProfileFile('USER.md')) };
const core = new AgentCore({
  ...,
  getSystemPrompt: () => promptHolder.value,
});

const watcher = new ProfileWatcher({
  onPromptFilesChanged: () => {
    promptHolder.value = buildSystemPrompt(loadProfileFile('SOUL.md'), loadProfileFile('USER.md'));
    logger.info({ event: 'system_prompt_reloaded', bytes: promptHolder.value.length });
  },
  onCronsChanged: () => {
    const next = loadStaticCrons();
    crons.replaceStaticSet(next);
    logger.info({ event: 'static_crons_reloaded', count: next.length });
  },
  onMcpChanged: () => {
    logger.warn({ event: 'mcp_change_requires_restart' }, 'profile/mcp.json changed — restart Zeno to apply');
  },
});
watcher.start();
```

### Files changed

| File | Change |
|---|---|
| `src/profile/watcher.ts` | New — `ProfileWatcher` with `fs.watch` + debounce |
| `src/agent/core.ts` | Replace `systemPrompt: string` with `getSystemPrompt: () => string`; call it per turn |
| `src/index.ts` | Build holder, instantiate watcher, start/stop with shutdown |
| `tests/profile/watcher.test.ts` | New — verifies debounce + per-group dispatch |

## Success Criteria

1. Edit `profile/SOUL.md` → log line `system_prompt_reloaded`. Next Slack message in a NEW thread uses the new prompt (manually verified by changing the language directive).
2. Edit `profile/crons.yaml` to add a new entry → log line `static_crons_reloaded count=N+1`. The runner picks it up at the next minute boundary.
3. Edit `profile/mcp.json` → log line `mcp_change_requires_restart` with file path, no crash.
4. Save garbage to `crons.yaml` (e.g., `: : :`) → log `cron_yaml_invalid`, the previous in-memory cron set stays intact (no flush to empty).
5. Touching `profile/skills/foo.md` produces no reload event (group ignored).
6. Quality gate passes (biome + typecheck + knip + vitest).

## Risks

| Risk | Mitigation |
|---|---|
| `fs.watch` recursive emits 5+ events per editor save | 250ms trailing-edge debounce coalesces them |
| `fs.watch` on macOS sometimes drops events | Acceptable — primary deployment is Linux container; macOS dev workflow can still trigger via `touch` if needed |
| Empty SOUL.md mid-save (editor truncate-then-write) | `loadProfileFile` already returns null for empty files; `buildSystemPrompt` falls back to defaults — momentary degradation, recovers on next save event |
| `crons.yaml` syntactically valid but logically wrong (e.g., schedule that never fires) | Out of scope — same risk as static load at boot |
| Watcher leak on restart | `stop()` called from SIGINT/SIGTERM handler |

## Open Questions

None.
