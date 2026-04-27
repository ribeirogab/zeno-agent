# Zeno

> **A personal agent whose intelligence lives in the skills you author.**

Zeno is a self-hosted personal agent. The core is deliberately small and stable: a channel listener, a reasoning backend, a cron runner, a dashboard. That is all it does. Everything Zeno *knows how to do* — open a pull request, review code, summarize your inbox, manage tasks in a specific tool, whatever matters to you — lives outside the core, as **skills** you write.

A skill is a folder with a `SKILL.md` file (following the [agentskills.io](https://agentskills.io) open standard) plus whatever auxiliary files that skill needs: credentials, context, templates, scripts. Skills are self-contained, private to you by default, and loaded on demand. Zeno picks the right skill by matching your request against each skill's description — or you can invoke one explicitly.

This design is intentional. Adding a capability should not require changing the codebase. Swapping the reasoning backend should not require rewriting your skills. Adding a new channel should not touch anything else. Zeno grows sideways, through the library of skills you maintain, not upwards through more code.

## Project structure

```
zeno-agent/
├── agent/                    # committed — Zeno's identity
│   ├── SOUL.md               # agent personality and rules
│   ├── mcp.json              # built-in MCP servers (Playwright, …)
│   └── skills/               # built-in skills (dev-workflow, cron-management, playwright)
├── profiles/
│   └── default/              # committed (examples only — real files gitignored)
│       ├── .env.example      # env var template
│       ├── USER.example.md   # user profile template
│       ├── config.example.yaml # crons + config template
│       └── skills/           # your skills (override agent/ on name collision)
├── apps/                     # worker + api + dashboard
├── packages/                 # @zeno/storage + @zeno/logger + @zeno/ui
├── context/                  # maintainer knowledge vault (NOT in container)
└── infra/                    # Dockerfile, docker-compose, entrypoint, docker.sh
```

`agent/` is committed — it *is* Zeno. `profiles/default/` ships with `.example` templates; your actual files are gitignored. Each profile is self-contained: `.env`, `USER.md`, `config.yaml`, and `skills/`. MCP servers (connectors) are configured entirely through the dashboard at `/connectors` and stored in the SQLite DB.

## Prerequisites

- Docker and Docker Compose
- A Slack App with Socket Mode enabled (see `infra/slack-app-manifest.json`)
- A GitHub PAT with `repo` + `read:org` (or a GitHub App for bot identity)
- A Claude Code account (Pro/Max plan)

## Setup

1. **Profile config:**
   ```bash
   cd profiles/default
   cp .env.example .env
   cp USER.example.md USER.md
   cp config.example.yaml config.yaml
   ```
   Fill `.env` (Slack tokens, GitHub token, Claude OAuth). Fill `USER.md` (name, GitHub username, preferences). `config.yaml` starts empty. MCP connectors are added later through the dashboard at `http://localhost:3001/connectors`.

2. **Shared volume** (first time only):
   ```bash
   docker volume create claude_home
   ```

3. **Build:**
   ```bash
   pnpm run docker:build
   ```

4. **Claude OAuth token** (first time + on expiry):
   ```bash
   pnpm run docker:setup-token
   ```
   Complete OAuth in browser, paste the printed token into `profiles/default/.env` as `CLAUDE_CODE_OAUTH_TOKEN`.

5. **Start:**
   ```bash
   pnpm run docker:up
   pnpm run docker:logs
   ```
   Watch for: `soul_md_loaded` → `user_md_loaded` → `slack_connected` → `zeno_online`.

## Usage

Mention the bot in any channel where it's invited:

> @zeno list open PRs in my-org

Or DM it directly.

## Docker scripts

All scripts default to the `default` profile. Use `PROFILE=<name>` to target a different profile:

| Script | What it does |
|---|---|
| `pnpm run docker:build` | Build the container image (shared across profiles) |
| `pnpm run docker:up` | Start the default profile in background |
| `pnpm run docker:down` | Stop |
| `pnpm run docker:logs` | Tail logs |
| `pnpm run docker:sh` | Open a shell inside the running container |
| `pnpm run docker:setup-token` | Mint/refresh Claude OAuth token |
| `PROFILE=work pnpm run docker:up` | Start a different profile |

## Running multiple profiles

Each profile runs as an isolated container with its own Slack app, credentials, skills, and workspace:

```bash
# Default profile (personal) — port 3000
pnpm run docker:up

# Work profile — port 3001 (or whatever the compose file specifies)
PROFILE=work pnpm run docker:up
```

To create a new profile:

1. `mkdir -p profiles/work/skills`
2. Copy examples: `cp profiles/default/.env.example profiles/work/.env` (and USER, config, mcp)
3. Fill in the profile-specific values (different Slack app, different tokens)
4. Copy and adapt a compose file: `cp infra/docker-compose.default.yml infra/docker-compose.work.yml`
5. Update container name, port, and profile path in the compose file
6. `PROFILE=work pnpm run docker:up`

Profiles are fully isolated — the work container cannot see personal skills/credentials, and vice versa. They share only the Docker image and the Claude OAuth token.

## Performance

~30 seconds end-to-end warm-path target (not a guarantee). Cold starts may take 45-60s.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid environment" on boot | Check `profiles/<name>/.env` — all required tokens must be set |
| Bot doesn't react to mentions | Check Slack Socket Mode config; look for `slack_connected` in logs |
| "I don't have access to org X" | PAT needs `read:org`; for SSO orgs, authorize the token in GitHub settings |
| `claude_home` volume not found | Run `docker volume create claude_home` (first-time setup) |

## Architecture

- **Channels** (`apps/worker/src/channels/`) — pluggable message sources. Slack is MVP.
- **Agent Core** (`apps/worker/src/agent/core.ts`) — wires channel to backend. Channel-agnostic, backend-agnostic.
- **Agent Backends** (`apps/worker/src/agent/backends/`) — pluggable LLM engines. Claude Code (via `@anthropic-ai/claude-agent-sdk`) is MVP.
- **Agent** (`agent/`) — `SOUL.md` (identity) + `mcp.json` (built-in MCPs) + `skills/` (built-in skills). Shared across all profiles.
- **Profile** (`profiles/<name>/`) — `.env` + `USER.md` + `config.yaml` + `mcp.json` + `skills/`. One per context (personal, work, etc.), mounted read-only into the container.

Full spec: `context/specs/0001-slack-zeno-mvp/`.

## Development

Zeno only runs inside Docker. Dev scripts below are for code validation, not for running the agent:

```bash
pnpm install
pnpm run quality-gate  # lint + typecheck + test (via turbo)
pnpm run build         # tsc (used by Dockerfile build stage)
```

## Smoke test

After setup, verify these in order:

1. `pnpm run docker:up` → logs show `zeno_online`
2. `@zeno hello` in Slack → eyes reaction → reply → checkmark
3. DM the bot → reply in DM (no thread)
