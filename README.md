# Zeno

Personal agent. Runs in Docker on your machine, listens to Slack via Socket Mode, answers using Claude Code (OAuth subscription auth).

## Project structure

```
zeno-agent/
├── profile/                  # runtime: mounted into container (read-only)
│   ├── SOUL.md               # agent personality and rules
│   ├── USER.md (gitignored)  # your personal profile
│   ├── USER.example.md       # template for USER.md
│   └── skills/               # SKILL.md bundles (agentskills.io)
├── src/                      # TypeScript source
│   ├── index.ts              # boot + composition root
│   ├── config.ts             # env validation (zod)
│   ├── logger.ts             # pino structured JSON
│   ├── channels/             # message-source adapters (Slack, future Discord…)
│   └── agent/                # core + backends + prompt loader
├── tests/                    # vitest
├── context/                  # maintainer knowledge vault (NOT in container)
├── infra/                    # Dockerfile, docker-compose, Slack manifest
├── AGENTS.md                 # instructions for AI agents working on this code
└── .env.example              # env var template
```

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

2. **User profile:**
   ```bash
   cp profile/USER.example.md profile/USER.md
   ```
   Fill in name, GitHub username, Slack user ID, preferences.

3. **Build:**
   ```bash
   npm run docker:build
   ```

4. **Claude OAuth token** (first time + on expiry):
   ```bash
   npm run docker:setup-token
   ```
   Complete OAuth in browser, paste the printed token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN`.

5. **Start:**
   ```bash
   npm run docker:up
   npm run docker:logs
   ```
   Watch for: `soul_md_loaded` → `user_md_loaded` → `slack_connected` → `zeno_online`.

## Usage

Mention the bot in any channel where it's invited:

> @zeno quais repos tem na octocat?

Or DM it directly.

## Docker scripts

| Script | What it does |
|---|---|
| `npm run docker:build` | Build the container image |
| `npm run docker:up` | Start in background |
| `npm run docker:down` | Stop |
| `npm run docker:logs` | Tail logs |
| `npm run docker:setup-token` | Mint/refresh Claude OAuth token |

## Performance

~30 seconds end-to-end warm-path target (not a guarantee). Cold starts may take 45-60s.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "meu token Claude expirou" | Re-run `claude setup-token`, paste new token into `.env`, `npm run up` again |
| "Invalid environment" on boot | Check `.env` — all 4 tokens must be set |
| Mount error for `profile/USER.md` | `cp profile/USER.example.md profile/USER.md` and fill in |
| Bot doesn't react to mentions | Check Slack Socket Mode config; look for `slack_connected` in logs |
| "não tenho acesso à org X" | PAT needs `read:org`; for SSO orgs, authorize the token in GitHub settings |

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
npm install
npm run check      # biome format + lint + organize imports
npm run typecheck  # tsc --noEmit
npm test           # vitest
npm run build      # tsc + tsc-alias (used by Dockerfile build stage)
```

## Smoke test

After setup, verify these in order:

1. `npm run docker:up` → logs show `zeno_online`
2. `@zeno oi` in Slack → eyes reaction → PT-BR reply → checkmark
3. `@zeno quais repos tem na octocat?` → lists repos via `gh`
4. DM the bot → reply in DM (no thread)
5. Ask about an org you don't have access to → explains clearly, no raw stderr
