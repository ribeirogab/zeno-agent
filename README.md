# Zeno

> **Personal agent that operates across the apps you use, by composing connectors you install. Self-hosted.**

Zeno is for getting things done across the systems you already work in. Open a pull request after fixing a Sentry error. Triage your inbox. List the issues blocking the current sprint. Comment on a PR with the output of a code review. Anything that involves *acting* in an external app, Zeno can do — provided you've installed a connector for that app.

Connectors are the heart of the product. A connector is an MCP server you install via the dashboard at `/connectors`. It exposes typed tools (e.g. `mcp__github-app-acme__merge_pull_request`, `mcp__sentry__list_issues`) that Zeno composes to deliver real outcomes. Without connectors, Zeno is a talking statue. Adding a capability means installing or building a connector — not modifying the codebase.

The architecture is layered, in order of weight:

1. **Connectors** — the capability surface. Everything Zeno can do externally is a tool exposed by a connector you installed.
2. **Channel** — Slack today; Discord, Telegram, email, etc. as future adapters. The channel is how requests come in and replies go out.
3. **Backend** — the reasoning engine (Claude Code today). Decides which connector tools to call, in what order.
4. **Core** — small wiring (channel ↔ backend ↔ connectors). Stable, rarely changes.
5. **Skills** — markdown playbooks the operator installs via the dashboard (spec 0052). The worker materializes each `SKILL.md` to `~/.claude/skills/<name>/` and the Claude Agent SDK auto-announces them in the system prompt. When a skill description matches the user's request, the agent reads the SKILL.md body and follows its instructions literally — including any output-format templates. Skills carry only content; capabilities like Read/Edit/Write/Bash are gated globally via `/settings/agent-capabilities`.

This is what makes Zeno extensible. Want it to act in a new app? Build or install a connector. Want it on a new channel? Add a Channel adapter. Want a different reasoning model? Swap the backend. The core never changes.

## Project structure

```
zeno-agent/
├── agent/                    # committed — Zeno's identity
│   ├── SOUL.md               # agent personality and rules
│   ├── mcp.json              # built-in MCP servers (Playwright, …)
│   └── connectors-catalog.json # curated catalog the dashboard installs from
├── profiles/
│   └── default/              # committed (examples only — real files gitignored)
│       ├── .env.example      # env var template
│       ├── USER.example.md   # user profile template
│       └── config.example.yaml # crons + config template
├── apps/                     # worker + api + dashboard
├── packages/                 # @zeno/storage + @zeno/logger + @zeno/ui + @zeno/github-app + @zeno/mcp-discover
├── vault/                  # maintainer knowledge vault (NOT in container)
└── infra/                    # Dockerfile, docker-compose, entrypoint, docker.sh
```

`agent/` is committed — it *is* Zeno. `profiles/default/` ships with `.example` templates; your actual files are gitignored. Each profile is self-contained: `.env`, `USER.md`, `config.yaml`. **Connectors are not files in the repo** — they are MCP server configurations the operator installs via the dashboard at `/connectors`, stored in the SQLite DB.

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
   Fill `.env` (GitHub PAT + dashboard password). Fill `USER.md` (name, GitHub username, preferences). `config.yaml` starts empty. MCP connectors and channel credentials (Slack et al.) are added later through the dashboard at `http://localhost:3000` (default profile; other profiles map to other host ports — see `infra/docker-compose.<profile>.yml`).

2. **Generate the encryption key:**
   ```bash
   echo "ZENO_MASTER_KEY=$(openssl rand -hex 32)" >> profiles/default/.env
   ```
   This 32-byte key encrypts every credential in the DB (Claude OAuth, Slack tokens, connector secrets). **BACK IT UP OFFLINE** — losing it bricks every encrypted row.

3. **Build:**
   ```bash
   pnpm run docker:build
   ```

4. **Start + connect Claude:**
   ```bash
   pnpm run docker:up
   pnpm run docker:logs
   ```
   Watch for: `soul_md_loaded` → `user_md_loaded` → `slack_connected` → `claude_backend_unconfigured` → `zeno_online`.

   Open `http://localhost:3000` → log in with `DASHBOARD_PASSWORD` → the **first-run onboarding hero** appears. Click **"Connect Claude"** → an OAuth tab opens at claude.ai → complete login → done. Token is verified, encrypted, and saved automatically (no terminal copy-paste).

   Need to skip the auto-flow? Click **"paste a token manually instead"** on the same hero, mint a token via `docker compose exec zeno claude setup-token`, and paste it. The fallback exists for CI provisioning, password-manager imports, and CLI-stdout drift.

5. **Test:** mention `@zeno hello` in a Slack channel where the bot is invited.

> **Migrating from a pre-0071 install?** Set `CLAUDE_CODE_OAUTH_TOKEN=<your-old-value>` in `.env` once. The worker imports it to the encrypted DB on first boot, logs `claude_token_imported_from_env_legacy`, and ignores the env on every subsequent boot. Per-profile `claude_home` volumes also need a one-time copy from the old shared volume:
> ```bash
> ./infra/migrate-claude-home.sh default
> ```

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

Each profile runs as an isolated container with its own Slack app, credentials, and workspace:

```bash
# Default profile (personal) — port 3000
pnpm run docker:up

# Work profile — port 3001 (or whatever the compose file specifies)
PROFILE=work pnpm run docker:up
```

To create a new profile:

1. `mkdir -p profiles/work`
2. Copy examples: `cp profiles/default/.env.example profiles/work/.env` (and USER, config)
3. Fill in the profile-specific values (different Slack app, different tokens)
4. Copy and adapt a compose file: `cp infra/docker-compose.default.yml infra/docker-compose.work.yml`
5. Update container name, port, and profile path in the compose file
6. `PROFILE=work pnpm run docker:up`

Profiles are fully isolated — the work container cannot see personal credentials, and vice versa. They share only the Docker image and the Claude OAuth token.

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

- **Connectors** (DB-managed, configured via dashboard) — MCP servers the agent calls. Each connector exposes a typed tool surface (e.g. `mcp__github-app-acme__merge_pull_request`). Capabilities flow exclusively through connectors; the agent has no direct shell, filesystem, or web-fetch access.
- **Channels** (`apps/worker/src/channels/`) — pluggable message sources. Slack today; Discord/Telegram/email as future adapters. The channel is *how the agent communicates*, not a tool the agent uses.
- **Agent Backends** (`apps/worker/src/agent/backends/`) — pluggable reasoning engines. Claude Code (via `@anthropic-ai/claude-agent-sdk`) is MVP. Decides which connector tools to call.
- **Agent Core** (`apps/worker/src/agent/core.ts`) — wires channel to backend. Channel-agnostic, backend-agnostic. Small and stable.
- **Agent identity** (`agent/`) — `SOUL.md` (system prompt) + `mcp.json` (built-in MCPs the runtime always exposes) + `connectors-catalog.json` (curated connectors the dashboard installs from). Shared across all profiles.
- **Profile** (`profiles/<name>/`) — `.env` + `USER.md` + `config.yaml`. One per context (personal, work, etc.), mounted read-only into the container.

Full spec: `vault/specs/0001-slack-zeno-mvp/`. For the connectors-only positioning, see `vault/specs/0049-zeno-redefinition/spec.md` and `vault/learnings/connectors-only-pivot.md`.

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
