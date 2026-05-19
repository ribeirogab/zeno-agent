---
feature: multi-profile-isolation
spec: "[[spec-multi-profile-isolation]]"
created: 2026-04-21
---
# Multi-Profile Isolation — Plan

**For this spec:** `[[spec-multi-profile-isolation]]`

**Goal:** Reorganize from single `profile/` + single compose into N isolated profiles, each with its own `.env`, config, skills, compose file, and workspace volume — zero code changes.

**Architecture:** File moves + new compose files + wrapper script. The worker code reads `/app/profile` — each compose file mounts a different host directory there. `agent/` stays shared. `claude_home` volume shared; workspace volumes isolated per profile.

## Approach

Four commits, each self-contained:

1. **File move.** Create `profiles/default/` (examples) + `profiles/acme/` (existing operator content). Delete old `profile/`. Update gitignore.
2. **Infra.** New compose files (`docker-compose.default.yml`, `docker-compose.acme.yml`), wrapper script `docker.sh`. Delete old `docker-compose.yml`. Update `package.json` scripts.
3. **Volume migration.** Migrate existing `zeno-agent_claude_home` → external `claude_home`.
4. **Docs.** Update README + CLAUDE.md with new layout, setup, and usage.

## File Structure

### NEW

| File | Responsibility |
|---|---|
| `profiles/default/.env.example` | Committed env template for new users |
| `profiles/default/USER.example.md` | Moved from `profile/USER.example.md` |
| `profiles/default/config.example.yaml` | Moved from `profile/config.example.yaml` |
| `profiles/default/mcp.example.json` | Moved from `profile/mcp.example.json` |
| `profiles/default/skills/.gitkeep` | Keeps the empty skills dir in git |
| `profiles/acme/.env` | Moved from root `.env` (gitignored) |
| `profiles/acme/USER.md` | Moved from `profile/USER.md` (gitignored) |
| `profiles/acme/config.yaml` | Moved from `profile/config.yaml` (gitignored) |
| `profiles/acme/mcp.json` | Moved from `profile/mcp.json` (gitignored) |
| `profiles/acme/skills/acme/` | Moved from `profile/skills/acme/` (gitignored) |
| `infra/docker-compose.default.yml` | Compose for default profile (port 3000) |
| `infra/docker-compose.acme.yml` | Compose for acme profile (port 3001, gitignored) |
| `infra/docker.sh` | Wrapper script — reads `PROFILE` env var, delegates to compose |

### DELETE

| File | Reason |
|---|---|
| `profile/` (entire directory) | Replaced by `profiles/default/` + `profiles/acme/` |
| `infra/docker-compose.yml` | Replaced by per-profile compose files |
| `.env.example` (root) | Moved to `profiles/default/.env.example` |
| `.env` (root) | Moved to `profiles/acme/.env` |

### EDIT

| File | Change |
|---|---|
| `package.json` | Rewrite `docker:*` scripts to use `docker.sh` |
| `.gitignore` | Rewrite profile + compose + env sections |
| `README.md` | New project structure, setup steps, multi-profile usage |
| `CLAUDE.md` | Update workspace layout and command tables |

## Phase Ordering

Strict: 1 (files) → 2 (infra) → 3 (volume) → 4 (docs). Each commits green.

## Risks / Open Decisions

- Service name: current compose uses `zeno-agent`, new compose uses `zeno`. Scripts (`docker:sh`, `docker:setup-token`) reference the service name — must match.
- `claude_home` volume migration: if the old volume doesn't exist (fresh machine), the copy command is a no-op.
