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
├── profile/                  # gitignored except example templates
│   ├── USER.md               # your personal profile
│   ├── USER.example.md       # template for USER.md
│   ├── config.yaml           # crons + user config
│   ├── config.example.yaml   # template for config.yaml
│   ├── mcp.json              # user-level MCP servers (with tokens)
│   ├── mcp.example.json      # template for mcp.json
│   └── skills/               # your personal skills (override agent/ on name collision)
├── apps/                     # worker + api + dashboard
├── packages/                 # @zeno/storage + @zeno/logger + @zeno/ui
├── context/                  # maintainer knowledge vault (NOT in container)
├── infra/                    # Dockerfile, docker-compose, entrypoint, Slack manifest
└── .env.example              # env var template
```

`agent/` is committed — it *is* Zeno. `profile/` is gitignored (only the three `*.example.*` files and an empty `skills/.gitkeep` live in git). When a skill or MCP server with the same name exists in both `agent/` and `profile/`, the `profile/` entry wins.

## Prerequisites

- Docker and Docker Compose
- A Slack App with Socket Mode enabled (see `infra/slack-app-manifest.json` or create via `infra/README.md`)
- A GitHub PAT with `repo` + `read:org`
- A Claude Code account (Pro/Max plan)

## Setup

1. **Env vars:**
   ```bash
   cp .env.example .env
   ```
   Fill in `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `GH_TOKEN`.

2. **User profile + config:**
   ```bash
   cp profile/USER.example.md profile/USER.md
   cp profile/config.example.yaml profile/config.yaml
   cp profile/mcp.example.json profile/mcp.json
   ```
   Fill `USER.md` (name, GitHub username, Slack user ID, preferences). `config.yaml` starts empty; add crons here. `mcp.json` lists user-level MCP servers — disable what you don't use.

3. **Build:**
   ```bash
   pnpm run docker:build
   ```

4. **Claude OAuth token** (first time + on expiry):
   ```bash
   pnpm run docker:setup-token
   ```
   Complete OAuth in browser, paste the printed token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN`.

5. **Start:**
   ```bash
   pnpm run docker:up
   pnpm run docker:logs
   ```
   Watch for: `soul_md_loaded` → `user_md_loaded` → `slack_connected` → `zeno_online`.

## Usage

Mention the bot in any channel where it's invited:

> @zeno quais repos tem na octocat?

Or DM it directly.

## Docker scripts

| Script | What it does |
|---|---|
| `pnpm run docker:build` | Build the container image |
| `pnpm run docker:up` | Start in background |
| `pnpm run docker:down` | Stop |
| `pnpm run docker:logs` | Tail logs |
| `pnpm run docker:setup-token` | Mint/refresh Claude OAuth token |

## Performance

~30 seconds end-to-end warm-path target (not a guarantee). Cold starts may take 45-60s.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "meu token Claude expirou" | Re-run `claude setup-token`, paste new token into `.env`, `pnpm run docker:up` again |
| "Invalid environment" on boot | Check `.env` — all 4 tokens must be set |
| Mount error for `profile/USER.md` | `cp profile/USER.example.md profile/USER.md` and fill in |
| Bot doesn't react to mentions | Check Slack Socket Mode config; look for `slack_connected` in logs |
| "I don't have access to org X" | PAT needs `read:org`; for SSO orgs, authorize the token in GitHub settings |

## Architecture

- **Channels** (`src/channels/`) — pluggable message sources. Slack is MVP.
- **Agent Core** (`src/agent/core.ts`) — wires channel to backend. Channel-agnostic, backend-agnostic.
- **Agent Backends** (`src/agent/backends/`) — pluggable LLM engines. Claude Code (via `@anthropic-ai/claude-agent-sdk`) is MVP.
- **Profile** (`profile/`) — `SOUL.md` (agent identity) + `USER.md` (who you are) + `skills/` (reusable capabilities). Mounted read-only into the container.
- **Tools** — zero custom. Zeno uses Claude Code's built-in Bash/Read/Glob/Grep. GitHub queries go via `gh` CLI.

Full spec: `context/specs/0001-slack-zeno-mvp/`.

## Development

Zeno only runs inside Docker. Dev scripts below are for code validation, not for running the agent:

```bash
pnpm install
pnpm run check      # biome format + lint + organize imports
pnpm run typecheck  # tsc --noEmit
pnpm test           # vitest
pnpm run build      # tsc + tsc-alias (used by Dockerfile build stage)
```

## Smoke test

After setup, verify these in order:

1. `pnpm run docker:up` → logs show `zeno_online`
2. `@zeno oi` in Slack → eyes reaction → PT-BR reply → checkmark
3. `@zeno quais repos tem na octocat?` → lists repos via `gh`
4. DM the bot → reply in DM (no thread)
5. Ask about an org you don't have access to → explains clearly, no raw stderr
