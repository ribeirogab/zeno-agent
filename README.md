# Zeno

Personal agent. Runs in Docker on your machine, listens to Slack via Socket Mode, answers using Claude Code (OAuth subscription auth).

## Prerequisites

- Docker and Docker Compose
- A Slack App with Socket Mode enabled (scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `users:read`, `reactions:write` + `connections:write` for the App-Level token)
- A GitHub PAT with `repo` + `read:org`
- A Claude Code account (Pro/Max plan)

## Setup

1. Clone the repo and copy the env template:

   ```bash
   cp .env.example .env
   ```

   Fill in `SLACK_APP_TOKEN` (`xapp-…`), `SLACK_BOT_TOKEN` (`xoxb-…`), and `GH_TOKEN` (`ghp_…`).

2. Create your user profile:

   ```bash
   cp USER.example.md USER.md
   ```

   Open `USER.md` and fill in your name, GitHub username, Slack user ID, and any preferences/context you want Zeno to know. The file is gitignored — your profile never leaves the machine. Required: `docker compose up` will fail without it.

3. Build the image:

   ```bash
   docker compose build
   ```

4. Mint the Claude Code OAuth token (first time, and whenever it expires):

   ```bash
   docker compose run --rm zeno-agent claude setup-token
   ```

   A browser URL prints in the terminal — open it, complete OAuth on your host browser, the CLI prints the token. Paste the token into `.env` as `CLAUDE_CODE_OAUTH_TOKEN=<token>`.

5. Start Zeno:

   ```bash
   docker compose up -d
   docker compose logs -f zeno-agent
   ```

   Watch for the `zeno_online` log event. The line `user_md_loaded` confirms your profile was read.

## Usage

Mention the bot in any Slack channel where it's invited:

> @zeno quais repos tem na octocat?

Or DM it directly.

## Performance

The spec targets ~30 seconds end-to-end for the happy path — this is a **warm-path** target, not a guarantee. Cold-start responses (first mention after container restart or a full rebuild) may take 45–60 seconds as Claude Code initializes.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "meu token Claude expirou" | Re-run `docker compose run --rm zeno-agent claude setup-token`, paste new token into `.env`, `docker compose up -d --force-recreate` |
| Container exits with "Invalid environment" | Check `.env` — all four vars (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`) must be set |
| `docker compose up` fails with `USER.md not found` | Run step 2 above (`cp USER.example.md USER.md` and fill in) |
| Bot doesn't react to mentions | Verify the Socket Mode connection in the Slack app config; check logs for `slack_connected` |
| "não tenho acesso à org X" | Your PAT needs `read:org` and, for SAML SSO orgs, must be authorized for that org in GitHub settings |

## Architecture

See `context/specs/0001-slack-zeno-mvp/` for the full spec, plan, and task breakdown. Briefly:

- **Channels** (`src/channels/`) — pluggable message sources. Slack is MVP; Discord/Telegram are future.
- **Agent Core** (`src/agent/core.ts`) — wires a channel to a backend. Channel-agnostic and backend-agnostic.
- **Agent Backends** (`src/agent/backends/`) — pluggable reasoning engines. Claude Code is MVP (via `@anthropic-ai/claude-agent-sdk`); Codex/Gemini future.
- **Tools** — none. Zeno uses Claude Code's built-in tools (Bash etc.) directly. GitHub queries go via the `gh` CLI inside the container.

## Development

Local dev outside Docker (faster iteration):

```bash
npm install
# Requires gh + claude installed on host
npm run dev
```

Scripts:
- `npm run check` — Biome (format + lint + organize imports, write changes)
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest run
- `npm run build` — `tsc`
