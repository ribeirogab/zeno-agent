---
feature: agent-profile-split
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-21
---
# Agent / Profile Split — Tasks

**For this plan:** `[[plan]]`

- [ ] **Phase 1 — File move + gitignore + examples.**
  - `mkdir -p agent/skills`
  - `git mv profile/SOUL.md agent/SOUL.md`
  - `git mv profile/skills/dev-workflow agent/skills/dev-workflow`
  - `git mv profile/skills/cron-management agent/skills/cron-management`
  - `git mv profile/crons.yaml profile/config.yaml`
  - Create `agent/mcp.json` with only the Playwright entry (copy its block from `profile/mcp.json`).
  - Edit `profile/mcp.json` to remove the Playwright entry (leaves Linear/Notion/Granola + disabled examples).
  - Create `profile/config.example.yaml` — identical structure to current `profile/crons.yaml` comments (the commented sample already follows the right shape).
  - Create `profile/mcp.example.json` — copy of the now-reduced `profile/mcp.json` (user-level examples with placeholders).
  - `touch profile/skills/.gitkeep` + `git add -f profile/skills/.gitkeep`.
  - Rewrite `.gitignore` — replace the current `profile/skills/*` + `!profile/skills/dev-workflow/` + `!profile/skills/cron-management/` block with:
    ```
    # User profile (personal to whoever runs this Zeno instance)
    profile/*
    !profile/USER.example.md
    !profile/config.example.yaml
    !profile/mcp.example.json
    !profile/skills/
    profile/skills/*
    !profile/skills/.gitkeep
    ```
  - `pnpm run quality-gate` (should still pass — no code changed yet).
  - Commit `chore(layout): move Zeno identity into agent/, rename crons.yaml to config.yaml`.

- [ ] **Phase 2 — Container wiring.**
  - Create `infra/entrypoint.sh`:
    ```sh
    #!/bin/sh
    set -eu

    AGENT_SKILLS=/app/agent/skills
    PROFILE_SKILLS=/app/profile/skills
    DEST=/home/node/.claude/skills

    [ -d "$AGENT_SKILLS" ] || { echo "skills_bootstrap_failed: $AGENT_SKILLS missing" >&2; exit 1; }
    [ -d "$PROFILE_SKILLS" ] || { echo "skills_bootstrap_failed: $PROFILE_SKILLS missing" >&2; exit 1; }

    mkdir -p "$DEST"

    for d in "$AGENT_SKILLS"/*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      ln -sfn "$d" "$DEST/$name"
    done

    for d in "$PROFILE_SKILLS"/*/; do
      [ -d "$d" ] || continue
      name=$(basename "$d")
      if [ -L "$DEST/$name" ]; then
        echo "skill_override: profile/$name replaces agent/$name" >&2
      fi
      ln -sfn "$d" "$DEST/$name"
    done

    exec "$@"
    ```
  - `chmod +x infra/entrypoint.sh`.
  - Edit `infra/Dockerfile`: after the existing `USER node` block, add:
    ```dockerfile
    COPY --chown=node:node infra/entrypoint.sh /usr/local/bin/zeno-entrypoint.sh
    RUN chmod +x /usr/local/bin/zeno-entrypoint.sh
    ENTRYPOINT ["/usr/local/bin/zeno-entrypoint.sh"]
    ```
    (Leave the existing `CMD` unchanged — `ENTRYPOINT` forwards to it via `exec "$@"`.)
  - Edit `infra/docker-compose.yml` — remove `./profile/skills:/home/node/.claude/skills:ro`, add `./agent:/app/agent:ro` and `./profile:/app/profile:ro` (keep the second line; drop the first) so volumes section becomes:
    ```yaml
    volumes:
      - workspace:/workspace
      - claude_home:/home/node/.claude
      - ./agent:/app/agent:ro
      - ./profile:/app/profile:ro
    ```
  - Commit `chore(infra): symlink skills from agent/ and profile/ via entrypoint`.

- [ ] **Phase 3 — Backend loaders.**
  - **`apps/worker/src/agent/system-prompt.ts`:**
    - Add `AGENT_CANDIDATES = ['/app/agent', 'agent']`.
    - Add `loadAgentFile(filename)` mirroring `loadProfileFile` but over `AGENT_CANDIDATES`.
    - `buildSystemPrompt` reads SOUL via `loadAgentFile('SOUL.md')` (callers in `index.ts` and wherever it's wired).
  - **`apps/worker/src/cron/static-loader.ts`:**
    - Change filename from `crons.yaml` → `config.yaml`.
    - Top-level schema: wrap the existing `crons:` schema in `z.object({ crons: z.array(z.unknown()).default([]) }).passthrough()`. Log `config_unknown_section` at warn level for each top-level key that isn't `crons`.
    - Rename log events: `cron_yaml_missing` → `config_file_missing`, `cron_yaml_invalid` → `config_file_invalid`, `cron_yaml_schema_error` → `config_schema_error`, `cron_yaml_entry_skipped` → `cron_entry_skipped`, `cron_yaml_bad_schedule` → `cron_bad_schedule`. (Keep the existing messages; they still describe what happened.)
    - `createdBy: 'profile/crons.yaml'` → `'profile/config.yaml'`.
  - **`apps/worker/src/profile/watcher.ts`:**
    - Keep the `ProfileWatcher` class name and callback names (`onPromptFilesChanged`, `onCronsChanged`, `onMcpChanged`).
    - Internal refactor: hold an array of `FSWatcher` (`this.watchers: FSWatcher[] = []`) rather than a single `watcher`.
    - `start()` opens one `fs.watch` per existing source directory (agent and profile) and stores the source label in the listener closure.
    - `classify(source, filename)` returns a group:
      - `(source === 'agent' && filename === 'SOUL.md')` → `'prompt'`
      - `(source === 'profile' && filename === 'USER.md')` → `'prompt'`
      - `(source === 'profile' && filename === 'config.yaml')` → `'crons'`
      - `(filename === 'mcp.json')` → `'mcp'` (either source — both matter)
      - anything under `skills/` → `'ignored'`
      - else → `'ignored'`
    - `stop()` closes each watcher and clears timers as before.
    - On start, log `profile_watcher_started` once per source (so two log lines today: `source: 'agent'` and `source: 'profile'`).
  - **`apps/worker/src/agent/mcp.ts`:**
    - Add `AGENT_CANDIDATES = ['/app/agent', 'agent']`.
    - Add `findAgentFile(filename)` mirroring `findProfileFile`.
    - Refactor `loadMcpConfig` into a private `loadOne(path, layer)` that returns resolved entries (runs the existing `_disabled` / env interpolation / `_comment` strip logic), plus a public `loadMcpConfig` that calls it twice (agent, then profile) and merges (`{ ...agent, ...profile }`).
    - On collision, log `mcp_server_override: { name, winner: 'profile' }`.
  - `pnpm run quality-gate`. All must pass; if tests break on the watcher/schema changes, fix them.
  - Commit `refactor(worker): teach loaders about the agent/ + profile/ split`.

- [ ] **Phase 4 — Playwright skill + memory cleanup.**
  - Create `agent/skills/playwright/SKILL.md` with the frontmatter `name: playwright`, description, requirements, tool cheatsheet, and the `.playwright-mcp/` screenshot-path convention rule (moved from global memory).
  - Edit `README.md` setup section: replace the `cp profile/USER.example.md profile/USER.md` step with three `cp` lines (USER, config, mcp). Add a one-paragraph paragraph under *Project structure* describing `agent/` vs `profile/`.
  - Delete `~/.claude/projects/<project-id>/memory/feedback_playwright_screenshot_path.md` and remove the matching line from `MEMORY.md`.
  - `pnpm run quality-gate`.
  - Commit `feat(skills): add built-in playwright skill + retire global memory rule`.

- [ ] **Phase 5 — Runtime smoke.**
  - `pnpm run docker:build`.
  - `pnpm run docker:up`.
  - `docker logs zeno-agent` — assert: `zeno_online`, `profile_watcher_started` appears twice (sources `agent` and `profile`), `mcp_server_enabled` lists `playwright` (from agent).
  - `docker exec zeno-agent ls /home/node/.claude/skills/` — expect `dev-workflow`, `cron-management`, `playwright`.
  - `docker exec zeno-agent claude --print --setting-sources user "list the names of your skills"` — expect the three built-in skills to appear.
  - Touch `agent/SOUL.md` (add/remove a blank line) — confirm a `prompt` group dispatch in the watcher log.
  - `pnpm run docker:down`.
  - Commit any residual fixups from what the smoke test uncovered.

- [ ] **Ship.** (Do NOT execute without user approval.) Flip spec frontmatter `status: shipped`, set `shipped: 2026-04-21`. Update `context/_index/specs.md` MOC. Push branch, open PR.
