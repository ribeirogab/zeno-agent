# zeno-agent

> Personal agent that operates across the apps you use, by composing the connectors you install. Self-hosted. Single-user.

[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-brightgreen?style=flat-square)](./LICENSE)
[![Status: experimental](https://img.shields.io/badge/STATUS-EXPERIMENTAL-orange?style=flat-square)](./GOVERNANCE.md)
[![Built By](https://img.shields.io/badge/BUILT%20BY-ribeirogab-blueviolet?style=flat-square)](https://github.com/ribeirogab)

> [!WARNING]
> **Early / experimental.** Personal project, single-user, no SLA, no support guarantees. Breaking changes expected. Use at your own risk.

## What it does

Zeno acts on your behalf inside the apps you already work in. Open a pull request after fixing a Sentry error. Triage your inbox. List the issues blocking the current sprint. Comment on a PR with the output of a code review. Anything that involves *acting* in an external app, Zeno can do — provided you have installed a connector for that app. Connectors are the heart of the product: each one is a small MCP server you install through the dashboard. Without connectors, Zeno is a talking statue.

## Install

```bash
curl -fsSL https://zeno-agent.dev/install.sh | sh
```

Full walkthrough — prerequisites, profile creation, first `@zeno hello` in Slack — at <https://docs.zeno-agent.dev/install>. Daily commands at <https://docs.zeno-agent.dev/daily-ops>.

## What works today

- **Channel:** Slack via Socket Mode (mention the bot or DM it). Worker boots without Slack creds and falls back to a `NoopChannel` so first install isn't blocked on the dashboard chicken-egg.
- **Connectors** (live in the dashboard catalogue at <https://docs.zeno-agent.dev/connector-catalogue>): GitHub App, GitHub Personal (PAT), Linear, Klaviyo, Sentry, Swarmia, Playwright.
- **Skills:** Markdown SKILL.md playbooks installed via the dashboard, materialized into `~/.claude/skills/`, auto-discovered by the Claude Agent SDK. Capabilities (Read/Edit/Write/Bash) are gated globally per profile.
- **Multi-profile isolation:** the `zeno` CLI manages N profiles via a host SQLite (`~/.zeno/state.db`); each profile is its own container, dashboard, master key, and credentials.
- **Per-tool capability gating:** toggle individual connector tools allow/ask/off from `/connectors/<id>`.
- **Crons:** scheduled agent runs configured in the dashboard at `/crons`, persistent across restarts, with per-cron run history.

What is **not** here yet: no multi-user support (single operator only), no production-deployment recipe, no hosted instance.

## Project layout

```
apps/        worker (agent runtime), api (REST), dashboard, docs (Fumadocs site), web (landing), cli
packages/    @zeno/db (host SQLite), @zeno/storage (runtime SQLite), @zeno/logger,
             @zeno/ui, @zeno/github-app, @zeno/mcp-discover
agent/       SOUL.md, mcp.json, connectors-catalog.json (committed identity)
templates/   profile/ — read-only scaffolds the CLI uses on profile create
infra/       Dockerfile, entrypoint, slack-app-manifest.json
install.sh   one-shot installer (curl-pipe target)
vault/       constitution + specs + learnings + conventions + rules
~/.zeno/     (off-repo) zeno-agent clone, state.db, profiles/<name>/
```

`AGENTS.md` is the agent's working contract. `vault/_index/home.md` is the project's knowledge map. `vault/constitution.md` carries the non-negotiable design principles. The outsider documentation site lives at <https://docs.zeno-agent.dev>.

## Contributing, security, license

- Roadmap: see [ROADMAP.md](./ROADMAP.md).
- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
- Vulnerability reports: see [SECURITY.md](./SECURITY.md).
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- License: [MIT](./LICENSE).
