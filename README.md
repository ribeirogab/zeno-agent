# zeno-agent

> Personal agent that operates across the apps you use, by composing the connectors you install. Self-hosted. Single-user.

[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-brightgreen?style=flat-square)](./LICENSE)
[![Status: experimental](https://img.shields.io/badge/STATUS-EXPERIMENTAL-orange?style=flat-square)](./GOVERNANCE.md)
[![Built By](https://img.shields.io/badge/BUILT%20BY-ribeirogab-blueviolet?style=flat-square)](https://github.com/ribeirogab)

> [!WARNING]
> **Early / experimental.** Personal project, single-user, no SLA, no support guarantees. Breaking changes expected. Use at your own risk.

## What it does

Zeno acts on your behalf inside the apps you already work in. Open a pull request after fixing a Sentry error. Triage your inbox. List the issues blocking the current sprint. Comment on a PR with the output of a code review. Anything that involves *acting* in an external app, Zeno can do — provided you have installed a connector for that app. Connectors are the heart of the product: each one is a small MCP server you install through the dashboard at `http://localhost:3000/connectors`. Without connectors, Zeno is a talking statue.

## Quickstart

Prerequisites:

- Docker and Docker Compose
- A Slack workspace where you can install a custom app (manifest: `infra/slack-app-manifest.json`)
- A Claude account on a Pro or Max plan

```bash
git clone https://github.com/ribeirogab/zeno-agent.git
cd zeno-agent
cp profiles/default/.env.example profiles/default/.env
cp profiles/default/USER.example.md profiles/default/USER.md
cp profiles/default/config.example.yaml profiles/default/config.yaml
echo "ZENO_MASTER_KEY=$(openssl rand -hex 32)" >> profiles/default/.env
pnpm run docker:build
pnpm run docker:up
```

Open `http://localhost:3000`, sign in with the `DASHBOARD_PASSWORD` you set in `.env`, click **Connect Claude** to complete the OAuth flow, install at least one connector from the catalogue, then mention the bot in any Slack channel where it is invited.

## What works today

- Slack channel adapter (Socket Mode; mention the bot or DM it)
- GitHub connector (issues, pull requests, code search)
- Linear connector (issues, projects, cycles)
- Klaviyo connector (campaigns, profiles)
- Skill playbooks (markdown files installed via dashboard upload, auto-discovered by the agent)
- Multi-profile isolation (run a separate container per workspace, each with its own credentials)
- Per-tool capability gating (toggle individual connector tools on or off from the dashboard)

What is **not** here yet: no multi-user support (single operator only), no production-deployment recipe, no hosted instance.

## Setup notes

- Profile examples live at `profiles/default/.env.example`, `profiles/default/USER.example.md`, and `profiles/default/config.example.yaml`. The non-`.example` copies are gitignored.
- The Slack app manifest is at `infra/slack-app-manifest.json`.
- Detailed reading: `CLAUDE.md` for the agent's working contract, `vault/_index/home.md` for the project's knowledge map, and `vault/constitution.md` for the non-negotiable design principles. A full documentation site (`apps/docs`) is on the roadmap.

## Project layout

```
apps/        worker (agent runtime), api (REST), dashboard (Vite + React)
packages/    @zeno/storage, @zeno/logger, @zeno/ui, @zeno/github-app, @zeno/mcp-discover
agent/       SOUL.md, mcp.json, connectors-catalog.json (committed identity)
infra/       Dockerfile, docker-compose, entrypoint, slack-app-manifest.json
profiles/    per-context isolation (default committed as examples; rest gitignored)
vault/       constitution + specs + learnings + conventions + rules
```

Architecture detail lives in `vault/constitution.md` until the documentation site ships.

## Contributing, security, license

- Roadmap: see [ROADMAP.md](./ROADMAP.md).
- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
- Vulnerability reports: see [SECURITY.md](./SECURITY.md).
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- License: [MIT](./LICENSE).
