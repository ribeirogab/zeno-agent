---
feature: agent-profile-split
spec: "[[spec]]"
created: 2026-04-21
---
# Agent / Profile Split — Plan

**For this spec:** `[[spec]]`

**Goal:** Split `profile/` into `agent/` (Zeno's identity, committed) + `profile/` (user-specific, gitignored); unify `crons.yaml` into `config.yaml`; add built-in Playwright skill + MCP.

**Architecture:** A git-mv reshuffle followed by a small wave of code edits. Runtime side: an entrypoint script symlinks skills from both sources into `~/.claude/skills/`. Code side: three loaders (`system-prompt.ts`, `static-loader.ts`, `mcp.ts`) learn a second filesystem source; the watcher learns to watch two directories.

## Approach

Five commits, each green and self-contained:

1. **File move.** `git mv` everything into its new home, rewrite `.gitignore`, drop new example files. No code changes yet — the container still boots because the old paths still exist from Docker's point of view, but we update compose in the same commit. Actually split: move files + compose/Dockerfile in Phase 2 because they need to move together to keep the container functional.
2. **Container wiring.** `infra/entrypoint.sh` creates symlinks; `Dockerfile` runs it; `docker-compose.yml` swaps mounts.
3. **Backend loaders.** `system-prompt.ts`, `static-loader.ts`, `watcher.ts`, `mcp.ts` updated in one commit (they are tightly coupled — watcher dispatches to all of them).
4. **Playwright skill.** SKILL.md in `agent/skills/playwright/`, README setup refreshed, global memory rule about `.playwright-mcp/` prefix retired (its content moves into the skill).
5. **Runtime smoke.** Docker build + up, verify skills visible, watcher reacts, cron loader reads `config.yaml`. Commit any residual fixups.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `agent/SOUL.md` | Moved from `profile/SOUL.md` — unchanged content. |
| `agent/mcp.json` | Built-in MCP servers (Playwright only for now). |
| `agent/skills/dev-workflow/` | Moved from `profile/skills/dev-workflow/`. |
| `agent/skills/cron-management/` | Moved from `profile/skills/cron-management/`. |
| `agent/skills/playwright/SKILL.md` | New skill — browser automation via Playwright MCP. |
| `profile/config.yaml` | Renamed from `profile/crons.yaml`; wrapped shape stays identical. |
| `profile/config.example.yaml` | Committed example with empty `crons: []` and a commented reference entry. |
| `profile/mcp.example.json` | Committed example — user-layer MCPs (Linear, Notion, Granola, Sentry, Cloudflare, Vercel). No Playwright (moved to agent/). |
| `profile/skills/.gitkeep` | Empty file that keeps the directory tracked. |
| `infra/entrypoint.sh` | Shell script that symlinks skills from `/app/agent/skills/*` and `/app/profile/skills/*` into `/home/node/.claude/skills/*` before exec'ing the Node process. Fails fast on missing source dirs. |

### EDIT

| File | Change |
|---|---|
| `apps/worker/src/agent/system-prompt.ts` | Rename `loadProfileFile` → keep it for profile-side reads; add `loadAgentFile`. `buildSystemPrompt` reads SOUL from agent and USER from profile. |
| `apps/worker/src/cron/static-loader.ts` | Read `profile/config.yaml` (under `crons:` key); rename log events (`cron_yaml_*` → `cron_config_*`); update `createdBy` string; permissive top-level schema (unknown keys logged, not rejected). |
| `apps/worker/src/profile/watcher.ts` | Two `fs.watch` watchers, one per source dir. `classify()` takes `{source, filename}`. Watcher exposes `start()`/`stop()` that manage both. |
| `apps/worker/src/agent/mcp.ts` | Add `AGENT_CANDIDATES`; load both `agent/mcp.json` and `profile/mcp.json` through the same interpolation path; merge with profile-wins. |
| `infra/docker-compose.yml` | Remove `./profile/skills:/home/node/.claude/skills:ro`. Add `./agent:/app/agent:ro`. Keep `./profile:/app/profile:ro`. |
| `infra/Dockerfile` | Copy `entrypoint.sh`; run it via `ENTRYPOINT` before the existing `CMD`. |
| `.gitignore` | Rewrite the skills section — no more per-skill exceptions; `profile/*` ignored with a short exception list. |
| `README.md` | Update setup steps (`cp` three `*.example.*` files); mention agent/profile split briefly. |
| `profile/USER.example.md` | Unchanged (already committed). |

### DELETE

| File | Reason |
|---|---|
| `profile/SOUL.md` | Moved to `agent/`. |
| `profile/crons.yaml` | Renamed to `profile/config.yaml`. |
| `profile/skills/dev-workflow/` | Moved to `agent/skills/`. |
| `profile/skills/cron-management/` | Moved to `agent/skills/`. |

### MEMORY / GLOBAL

| File | Reason |
|---|---|
| `~/.claude/projects/<project-id>/memory/feedback_playwright_screenshot_path.md` | Delete — the rule moves into `agent/skills/playwright/SKILL.md` where it belongs (project-specific convention, not global preference). |
| `~/.claude/projects/<project-id>/memory/MEMORY.md` | Remove the Playwright entry from the index. |

## Phase Ordering

Strict sequence, because each phase must leave the tree green and the container bootable:

1. File move + gitignore + examples (commit — working tree still builds, but container can't boot because Dockerfile/compose still point at old paths)
2. Container wiring (commit — container boots again, skills still visible via old code-side assumptions about `profile/SOUL.md` → **this is the one commit window where things are briefly broken until Phase 3**)
3. Backend loaders (commit — full runtime green)
4. Playwright skill + memory cleanup (commit)
5. Smoke test (commit residuals, if any)

**Alternative considered:** bundle Phases 1+2+3 into one commit to avoid the brief broken window. Rejected — the diff would be ~40 files, hard to review. The "broken window" is purely between phases 1 and 3 on a single developer's machine; no CI or external user observes it.

## Risks / Open Decisions

- **Entrypoint script must run as `node` user** (the `USER node` is set in Dockerfile at line 56). Symlink creation needs `/home/node/.claude/skills/` writable; the `claude_home` named volume is owned by `node` after the `chown -R node:node /app` at line 52, but `.claude/skills/` may not exist yet. Entrypoint creates the dir `mkdir -p` before symlinking.
- **`config.example.yaml` commented sample** must reflect the real zod schema (nested `notify:` object) — easy to verify because `profile/crons.yaml` today already ships a correct commented example that we can adapt verbatim.
- **PROFILE_CANDIDATES vs AGENT_CANDIDATES naming.** Keep `PROFILE_CANDIDATES` in each loader; add sibling `AGENT_CANDIDATES` where needed. Don't refactor into a shared helper yet — three loaders, three needs, no abstraction win.
- **Retiring the global memory rule about Playwright screenshots.** Confirm the rule only appears in one place (`feedback_playwright_screenshot_path.md`) before deleting.
