---
status: draft
feature: multi-profile-isolation
created: 2026-04-21
shipped: null
---
# Multi-Profile Isolation — Spec

**Status:** Draft
**Scope:** Reorganize the project so that multiple isolated profiles can coexist, each with its own credentials, skills, config, and container — sharing only the agent identity and Docker image.

## Context

Zeno is a personal agent whose capabilities come from skills. Today there is a single `profile/` directory and one `docker-compose.yml`. This works for single-context use, but the owner wants to run Zeno in multiple contexts (personal Slack, company Slack) with strict isolation between them: the company instance must not see personal skills/credentials, and vice versa.

The agent/profile split shipped in spec 0021 already separates "what Zeno is" (`agent/`) from "who configures it" (`profile/`). This spec extends that to support N profiles, each mounted into its own container.

## Problem Statement

1. **No isolation between contexts.** A single `profile/` means every skill and credential is visible to every conversation. If Zeno is deployed on a company Slack, company employees could theoretically trigger skills that access personal repos or AWS accounts.
2. **Single compose file.** Only one container can run at a time with the current setup — no way to run personal and company instances concurrently on different ports.
3. **`.env` at root.** A single `.env` mixes Slack tokens from different workspaces, making multi-instance setup impossible.

## Non-Goals

- **No code changes in the worker, API, or dashboard.** The code already reads from `/app/profile` — each compose file just mounts a different host directory there.
- **No dynamic profile switching at runtime.** Each container boots with one profile and keeps it for its lifetime.
- **No profile management UI or CLI.** Creating a new profile is: make a directory, copy examples, fill in values, write a compose file.
- **No shared workspace volume across profiles.** Isolation means isolation — each profile gets its own `/workspace`.
- **No changes to the `agent/` directory.** SOUL.md, built-in skills, and built-in MCP are shared across all profiles.

## Constraints

- **Only `default` profile is committed.** It ships with `.example` files (USER, config, mcp, .env) and a `skills/.gitkeep`. Actual user files inside `default/` are gitignored. All other profiles (`acme`, future ones) are fully gitignored.
- **`claude_home` volume is shared.** The `/home/node/.claude` volume holds the Claude OAuth token and ephemeral session data. Sharing avoids running `setup-token` per profile. Sessions are ephemeral and contain no sensitive cross-profile data.
- **Workspace volumes are isolated per profile.** `/workspace` is where repos are cloned. Each profile gets a named volume (`workspace-default`, `workspace-acme`, etc.) so cloned repos don't leak across contexts.
- **Container names and ports must not collide.** `zeno-default` on port 3000, `zeno-acme` on port 3001, etc.
- **Profile-specific scripts are NOT committed.** `package.json` has generic `docker:*` scripts that accept a profile name argument via a wrapper script. No `docker:up:acme` — the user runs `pnpm run docker:up -- acme`.

## Target Layout

```
profiles/
├── default/                        # committed (examples only)
│   ├── .env.example                # committed
│   ├── .env                        # gitignored
│   ├── USER.example.md             # committed
│   ├── USER.md                     # gitignored
│   ├── config.example.yaml         # committed
│   ├── config.yaml                 # gitignored
│   ├── mcp.example.json            # committed
│   ├── mcp.json                    # gitignored
│   └── skills/
│       └── .gitkeep                # committed
│
├── acme/                           # fully gitignored
│   ├── .env
│   ├── USER.md
│   ├── config.yaml
│   ├── mcp.json
│   └── skills/
│       └── acme/
│
├── <any-future-profile>/           # fully gitignored
│   └── ...

agent/                              # shared, committed (unchanged)
├── SOUL.md
├── mcp.json
└── skills/

infra/
├── docker-compose.default.yml
├── docker-compose.acme.yml         # gitignored (user-created)
├── docker.sh                       # wrapper script
├── Dockerfile
└── entrypoint.sh
```

## Compose File Shape

Each compose file follows the same template, varying only profile name, container name, port, and workspace volume name:

```yaml
# infra/docker-compose.<profile>.yml
name: zeno-<profile>

services:
  zeno:
    build:
      context: .
      dockerfile: infra/Dockerfile
    image: zeno-agent:dev
    container_name: zeno-<profile>
    env_file: profiles/<profile>/.env
    init: true
    ports:
      - "<port>:3000"
    volumes:
      - workspace-<profile>:/workspace
      - claude_home:/home/node/.claude
      - ./agent:/app/agent:ro
      - ./profiles/<profile>:/app/profile:ro
    restart: unless-stopped
    stdin_open: true
    tty: true

volumes:
  workspace-<profile>:
  claude_home:
    external: true
```

The `claude_home` volume is `external: true` — created once with `docker volume create claude_home`, shared across all profiles.

**Path resolution:** all compose files are invoked with `--project-directory .` (repo root). This means `env_file`, `volumes` bind-mount paths, and `build.context` are all relative to the **repo root**, not to the compose file's location inside `infra/`. Implementers must not write paths relative to `infra/`.

Only `docker-compose.default.yml` is committed. Other compose files (e.g., `docker-compose.acme.yml`) are created by the user and gitignored.

## Wrapper Script

`infra/docker.sh` accepts an optional `PROFILE` env var (defaults to `default`). Package.json scripts pass it via environment, avoiding positional argument conflicts with docker-compose flags like `-f` or `-d`:

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

Package.json scripts:

```json
{
  "docker:build": "docker compose -f infra/docker-compose.default.yml --project-directory . build",
  "docker:up": "sh infra/docker.sh up -d",
  "docker:down": "sh infra/docker.sh down",
  "docker:logs": "sh infra/docker.sh logs -f",
  "docker:sh": "sh infra/docker.sh exec zeno bash",
  "docker:setup-token": "sh infra/docker.sh run --rm zeno claude setup-token"
}
```

Usage:

```bash
pnpm run docker:up                         # default profile
PROFILE=work pnpm run docker:up            # work profile
PROFILE=work pnpm run docker:down          # work profile
PROFILE=work pnpm run docker:logs          # work profile
```

## Gitignore

```gitignore
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

# Root .env no longer used (each profile has its own)
.env
.env.*
```

## Migration Steps

Current state: `profile/` contains operator-specific content (custom skill, GitHub App config, custom MCP servers) PLUS the `.example` template files. The root `.env` has the owner's current Slack/GitHub/Claude tokens (used by the operator today). There are no personal-specific files yet — the `default` profile starts empty.

1. **Create `profiles/default/`**: move `.example` files from `profile/` → `profiles/default/` (USER.example.md, config.example.yaml, mcp.example.json). Create `profiles/default/skills/.gitkeep`. Create `profiles/default/.env.example` from the current root `.env.example`.
2. **Create `profiles/acme/`**: move remaining `profile/` contents (USER.md, config.yaml, mcp.json, `skills/acme/`) → `profiles/acme/`. Move root `.env` → `profiles/acme/.env`.
3. **Delete old `profile/` directory** and root `.env.example`.
4. **Create `infra/docker-compose.default.yml`** (port 3000, `profiles/default/`, `workspace-default` volume).
5. **Create `infra/docker-compose.acme.yml`** (port 3001, `profiles/acme/`, `workspace-acme` volume). This file is gitignored.
6. **Create `infra/docker.sh`** wrapper script.
7. **Delete old `infra/docker-compose.yml`**.
8. **Update `package.json`** scripts to use `docker.sh`.
9. **Rewrite `.gitignore`** profile and compose sections.
10. **Migrate `claude_home` volume**: the existing volume is named `zeno-agent_claude_home` (Docker prefixed with old project name). Rename: `docker volume create claude_home && docker run --rm -v zeno-agent_claude_home:/src -v claude_home:/dst alpine cp -a /src/. /dst/`. The old volume can be removed after verification.
11. **Update `README.md`, `CLAUDE.md`** with new setup instructions and profile layout.

Note: since the owner is the only user, this is a one-shot move on their machine. No backward-compatibility shim is needed.

## User Stories

1. **Fresh clone.** I clone the repo. `profiles/default/` has `.example` files. I copy them, fill in my Slack tokens and Claude OAuth, run `docker volume create claude_home && pnpm run docker:up`. Zeno boots with an empty personal profile.
2. **Adding a work profile.** I create `profiles/work/`, copy the examples from `default/`, fill in company Slack tokens and config, write `infra/docker-compose.work.yml` (copy from default, change profile name/port). Run `PROFILE=work pnpm run docker:up`. Both instances run concurrently.
3. **Running both profiles.** `pnpm run docker:up` starts default on port 3000. `PROFILE=work pnpm run docker:up` starts work on port 3001. Each has its own workspace, skills, credentials. They share the Claude OAuth token.
4. **Isolation guarantee.** I ask Zeno-work (company Slack) to list my personal repos. It can't — the work profile has no PAT for personal repos, and the workspace volume has no personal clones.

## Success Criteria

1. `profiles/default/` exists with committed `.example` files and `skills/.gitkeep`.
2. `profiles/acme/` exists locally (gitignored) with all current operator config + custom skill.
3. `pnpm run docker:up` boots `zeno-default` on port 3000 using `profiles/default/`.
4. `pnpm run docker:up -- acme` boots `zeno-acme` on port 3001 using `profiles/acme/`.
5. Both containers can run concurrently without port or volume conflicts.
6. `docker exec zeno-acme ls /app/profile/skills/` shows the operator's custom skill but NOT personal skills.
7. `docker exec zeno-default ls /app/profile/skills/` shows nothing (or only personal skills if any were added).
8. Root `.env` no longer exists (moved into profile dirs).
9. `pnpm run quality-gate` passes.
10. No code changes in `apps/` or `packages/` — only infra/config/docs.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `claude_home` shared volume doesn't exist on first run | README documents `docker volume create claude_home` as a setup step. `docker.sh` could check and create automatically, but YAGNI for now. |
| Service name mismatch between compose file and pnpm scripts | The current compose uses service name `zeno-agent`; the new compose uses `zeno`. Verify `docker:sh` and `docker:setup-token` reference the correct service name at implementation time. |
| Profile-specific compose files get accidentally committed | Gitignore rule `infra/docker-compose.*.yml` + exception for `!infra/docker-compose.default.yml` prevents this. |
| Existing `claude_home` volume from old setup has different name (`zeno-agent_claude_home`) | Migration step renames or recreates. Document in migration. |

## Open Questions

None — all scoping decisions resolved during brainstorming.
