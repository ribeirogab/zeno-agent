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

- `git`, `docker`, Node 24 LTS, pnpm 10
- A Slack workspace where you can install a custom app (manifest: `infra/slack-app-manifest.json`)
- A Claude account on a Pro or Max plan

### Install

```bash
curl -fsSL https://raw.githubusercontent.com/ribeirogab/zeno-agent/v2026.5.7-6/install.sh | sh
```

Clones the repo to `~/.zeno/zeno-agent/`, builds the `zeno` CLI, and symlinks it to `~/.local/bin/zeno`. The clone path is fixed (no `ZENO_HOME` override). Source: [`install.sh`](./install.sh).

### Create a profile

```bash
zeno profile create personal --owner "Alice"
$EDITOR ~/.zeno/profiles/personal/USER.md   # add Preferences and Context
zeno start personal                         # auto-builds image on first run
zeno open personal                          # opens dashboard
```

In the dashboard: click **Connect Claude** to complete the OAuth flow, install at least one connector from the catalogue, then mention the bot in any Slack channel where it is invited. Each profile gets its own dashboard at `http://localhost:6101+` (allocated automatically; range `6101-6200`).

### Daily ops

```bash
zeno profile list                  # inventory of all profiles + live status
zeno start [profile|--all]         # start (sticky default if no arg)
zeno stop [profile|--all]          # stop
zeno restart [profile|--all]       # stop + start
zeno logs [profile] --tail 100     # follow container logs
zeno open [profile]                # open dashboard in browser
zeno doctor                        # preflight diagnostics
zeno upgrade                       # move to latest stable release
zeno upgrade --list                # see available versions (stable / pre-release / edge)
zeno profile use <profile>         # set sticky default
zeno profile show <profile>        # full detail block
zeno profile delete <profile>      # confirm + tear down container, volumes, dir, DB row
zeno repo                          # print canonical repo path (~/.zeno/zeno-agent)
zeno --help                        # full surface
```

## What works today

- Slack channel adapter (Socket Mode; mention the bot or DM it)
- GitHub connector (issues, pull requests, code search)
- Linear connector (issues, projects, cycles)
- Klaviyo connector (campaigns, profiles)
- Skill playbooks (markdown files installed via dashboard upload, auto-discovered by the agent)
- Multi-profile isolation via the `zeno` CLI: each profile is its own container with its own dashboard, volumes, and credentials
- Per-tool capability gating (toggle individual connector tools on or off from the dashboard)

What is **not** here yet: no multi-user support (single operator only), no production-deployment recipe, no hosted instance.

## Setup notes

- Profile templates live at `templates/profile/USER.md` and `templates/profile/env.template`. The CLI substitutes `<your-name>` and `<auto-detected-tz>` and writes the rendered files into `~/.zeno/profiles/<profile>/` on `zeno profile create`.
- CLI orchestration state lives at `~/.zeno/state.db` (SQLite, owner-only `chmod 600`). Profile dashboards bind `127.0.0.1` on ports `6101-6200`.
- The Slack app manifest is at `infra/slack-app-manifest.json`.
- Detailed reading: `AGENTS.md` for the agent's working contract, `vault/_index/home.md` for the project's knowledge map, and `vault/constitution.md` for the non-negotiable design principles. A full documentation site (`apps/docs`) is on the roadmap.

## Project layout

```
apps/        worker (agent runtime), api (REST), dashboard (Vite + React), cli
packages/    @zeno/db (host SQLite), @zeno/storage (runtime SQLite), @zeno/logger,
             @zeno/ui, @zeno/github-app, @zeno/mcp-discover
agent/       SOUL.md, mcp.json, connectors-catalog.json (committed identity)
templates/   profile/ — read-only scaffolds the CLI uses on profile create
infra/       Dockerfile, entrypoint, slack-app-manifest.json
install.sh   one-shot installer (curl-pipe target)
vault/       constitution + specs + learnings + conventions + rules
~/.zeno/     (off-repo) zeno-agent clone, state.db, profiles/<name>/
```

Architecture detail lives in `vault/constitution.md` until the documentation site ships.

## Contributing, security, license

- Roadmap: see [ROADMAP.md](./ROADMAP.md).
- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
- Vulnerability reports: see [SECURITY.md](./SECURITY.md).
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- License: [MIT](./LICENSE).
