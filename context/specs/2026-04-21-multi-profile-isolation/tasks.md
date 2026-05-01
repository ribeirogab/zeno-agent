---
feature: multi-profile-isolation
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-04-21
---
# Multi-Profile Isolation — Tasks

**For this plan:** `[[plan]]`

- [ ] **Phase 1 — File move + gitignore.**
  - `mkdir -p profiles/default/skills profiles/fn/skills`
  - Move example files to default: `mv profile/USER.example.md profile/config.example.yaml profile/mcp.example.json profiles/default/`
  - Create `profiles/default/.env.example` from `.env.example` (root): `cp .env.example profiles/default/.env.example`
  - `mv profile/skills/.gitkeep profiles/default/skills/.gitkeep`
  - Move FN content: `mv profile/USER.md profile/config.yaml profile/mcp.json profiles/fn/`
  - `mv profile/skills/acme profiles/fn/skills/acme`
  - Move root env: `mv .env profiles/fn/.env`
  - Remove old dirs: `rm -rf profile/ .env.example`
  - Rewrite `.gitignore` — replace the old `profile/*` section + root `.env` rules with:
    ```
    # Profiles — only default's examples are committed
    profiles/*/
    !profiles/default/
    profiles/default/*
    !profiles/default/.env.example
    !profiles/default/USER.example.md
    !profiles/default/config.example.yaml
    !profiles/default/mcp.example.json
    !profiles/default/skills/
    profiles/default/skills/*
    !profiles/default/skills/.gitkeep

    # Profile-specific compose files (only default is committed)
    infra/docker-compose.*.yml
    !infra/docker-compose.default.yml

    # Root .env no longer used
    .env
    .env.*
    ```
  - Verify: `git status` shows the moves. `git check-ignore profiles/fn/skills/acme` confirms fn is ignored. `git check-ignore profiles/default/USER.example.md` returns nothing (not ignored).
  - `pnpm run quality-gate` (passes — no code changed).
  - Commit `chore(layout): split profile/ into profiles/default/ + profiles/fn/`.

- [ ] **Phase 2 — Infra: compose files + wrapper + scripts.**
  - Create `infra/docker-compose.default.yml`:
    ```yaml
    name: zeno-default

    services:
      zeno:
        build:
          context: .
          dockerfile: infra/Dockerfile
        image: zeno-agent:dev
        container_name: zeno-default
        env_file: profiles/default/.env
        init: true
        ports:
          - "3000:3000"
        volumes:
          - workspace-default:/workspace
          - claude_home:/home/node/.claude
          - ./agent:/app/agent:ro
          - ./profiles/default:/app/profile:ro
        restart: unless-stopped
        stdin_open: true
        tty: true

    volumes:
      workspace-default:
      claude_home:
        external: true
    ```
  - Create `infra/docker-compose.fn.yml` (same shape, `name: zeno-fn`, `container_name: zeno-fn`, `env_file: profiles/fn/.env`, port `3001:3000`, `workspace-fn`, `./profiles/fn:/app/profile:ro`).
  - Create `infra/docker.sh`:
    ```sh
    #!/bin/sh
    set -eu
    PROFILE="${PROFILE:-default}"
    COMPOSE_FILE="infra/docker-compose.${PROFILE}.yml"

    if [ ! -f "$COMPOSE_FILE" ]; then
      echo "error: profile '${PROFILE}' not found (expected ${COMPOSE_FILE})" >&2
      exit 1
    fi

    exec docker compose -f "$COMPOSE_FILE" --project-directory . "$@"
    ```
  - `chmod +x infra/docker.sh`
  - Delete `infra/docker-compose.yml`.
  - Update `package.json` scripts:
    ```json
    "docker:build": "docker compose -f infra/docker-compose.default.yml --project-directory . build",
    "docker:up": "sh infra/docker.sh up -d",
    "docker:down": "sh infra/docker.sh down",
    "docker:logs": "sh infra/docker.sh logs -f",
    "docker:setup-token": "sh infra/docker.sh run --rm zeno claude setup-token",
    "docker:sh": "sh infra/docker.sh exec zeno bash"
    ```
  - Commit `chore(infra): per-profile compose files + docker.sh wrapper`.

- [ ] **Phase 3 — Volume migration.**
  - Stop existing container: `pnpm run docker:down` (uses old compose — will fail since it was deleted; use `docker stop zeno-agent && docker rm zeno-agent` as fallback).
  - Create shared external volume: `docker volume create claude_home`
  - Copy data from old volume: `docker run --rm -v zeno-agent_claude_home:/src -v claude_home:/dst alpine cp -a /src/. /dst/`
  - Verify: `docker run --rm -v claude_home:/data alpine ls /data` — should show `sessions/`, `downloads/`, etc.
  - Boot FN profile: `PROFILE=fn pnpm run docker:up`
  - Wait for `zeno_online` in `PROFILE=fn pnpm run docker:logs`.
  - Verify skills: `docker exec zeno-fn ls /home/node/.claude/skills/` — shows `dev-workflow`, `cron-management`, `playwright`, `acme`.
  - Verify isolation: `docker exec zeno-fn ls /app/profile/skills/` — shows only `acme/`.
  - `PROFILE=fn pnpm run docker:down`.
  - Commit residuals (if any).

- [ ] **Phase 4 — Docs.**
  - Update `README.md`:
    - Project structure: replace `profile/` with `profiles/default/` + `profiles/<name>/` + `agent/`.
    - Setup steps: three `cp` commands inside `profiles/default/`, plus `docker volume create claude_home`.
    - New section "Running multiple profiles" with the `PROFILE=work` usage examples from the spec.
    - Remove references to root `.env`.
  - Update `CLAUDE.md` (root):
    - Workspace layout table: `profile/` → `profiles/default/` (or `profiles/<name>/`).
    - Commands table: update `docker:up` etc. to mention `PROFILE=<name>` usage.
  - `pnpm run quality-gate`.
  - Commit `docs: update README + CLAUDE.md for multi-profile layout`.

- [ ] **Ship.** (After user approval.) Flip spec 0022 `status: shipped`, `shipped: 2026-04-21`. Update `context/_index/specs.md` MOC. Push to main.
