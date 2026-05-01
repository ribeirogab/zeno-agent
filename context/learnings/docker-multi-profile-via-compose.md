---
tags:
  - learning
  - concept
related:
  - "[[../specs/2026-04-21-multi-profile-isolation/spec|spec 0022]]"
  - "[[profile-isolation-via-env-var]]"
created: 2026-04-21
---
# Multi-profile isolation via separate Docker Compose files

Running multiple isolated contexts of the same agent (personal, work, etc.) without code changes: one Docker image, N compose files, N profile directories.

## Context

Implemented for Zeno to allow a work instance (Flávia Nasser Slack) and a personal instance to run concurrently without cross-contamination of skills, credentials, or cloned repos.

## How It Works

```
profiles/
├── default/    # .env, USER.md, config.yaml, mcp.json, skills/
└── fn/         # same shape, different content

infra/
├── docker-compose.default.yml   # mounts profiles/default/ → /app/profile
├── docker-compose.fn.yml        # mounts profiles/fn/ → /app/profile
└── docker.sh                    # wrapper: PROFILE=fn → correct compose file
```

Key decisions:
- **Workspace volumes isolated**: `workspace-default`, `workspace-fn` — cloned repos don't leak.
- **`claude_home` volume shared** (`external: true`): avoids re-running `setup-token` per profile. Sessions inside are ephemeral.
- **Service name = `agent`** (same across profiles). Docker auto-names containers as `zeno-fn-agent-1`, `zeno-default-agent-1` (project prefix prevents collisions).
- **Wrapper script** scans args for a word matching an existing compose file, extracts it as profile name, passes rest to `docker compose`. Supports both `PROFILE=fn pnpm run docker:up` and `pnpm run docker:up -- fn`.

## How to Apply

To add a new profile: create `profiles/<name>/` (copy examples from `default/`), create `infra/docker-compose.<name>.yml` (copy from default, change name/port/profile path), run `PROFILE=<name> pnpm run docker:up`.

Container names include the project prefix, so no collisions. Ports must differ per profile (default: 3000, fn: 3001, etc.).

All profile-specific compose files except `default` are gitignored (`infra/docker-compose.*.yml` + `!infra/docker-compose.default.yml`).
