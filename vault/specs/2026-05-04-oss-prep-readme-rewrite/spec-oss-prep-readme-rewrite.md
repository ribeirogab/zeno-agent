---
status: draft
feature: oss-prep-readme-rewrite
created: 2026-05-04
shipped: null
---
# OSS-Prep — README Rewrite for Outsider — Spec

**Status:** Draft
**Scope:** Rewrite the root `README.md` from a maintainer-self artifact into a minimal outsider-facing landing page (pitch + status + quickstart + what works + setup notes + layout + license/contributing footer). Defer detailed concept documentation to the future `apps/docs` workspace.

## Context

The current `README.md` (~170 lines) was authored over the lifetime of the project as a maintainer's notebook. It includes a multi-step setup with a `pre-0071 install` migration block, a Docker scripts table, a "Running multiple profiles" section, a performance budget, a troubleshooting table, an architecture write-up, and a smoke-test checklist. Useful for the maintainer; overwhelming for an outsider clicking the repo for the first time.

This spec is Track D of the OSS-prep pipeline (`tmp/oss-prep-pipeline.txt`), executed after Track A (sanitization + scrub, PR #1) and Track B (community files, PR #2). Track G (fresh-clone smoke test) and a separate roadmap-communication spec follow this one.

The operator has flagged that two future workspaces will own the heavy outsider-facing content:

- **`apps/docs`** — full Zeno documentation site (concepts, connectors, channels, backends, runbooks). Source of truth for "how do I use this thing". Not yet started.
- **`apps/web`** — landing page (pitch, screenshots, social proof, links to docs and repo). Not yet started.

This spec must therefore avoid building outsider-facing content that would be duplicated and re-maintained the moment those two workspaces ship.

## Problem Statement

The current `README.md` fails three reader personas:

1. **Stargazer / curious dev** — wants a one-screen pitch and an "I trust this enough to keep reading" signal. Today the README opens with marketing-flavoured prose but immediately drowns the reader in stack details.
2. **Hobbyist self-hoster** — wants a clean, current quickstart they can copy-paste. Today they have to skip a migration block, guess which Docker script to run, and parse a troubleshooting table to know what to do.
3. **Future outsider arriving via `apps/web` link** — needs a README that complements (not duplicates) the docs site. Today the README is its own competing source of truth.

## Non-Goals

- **No `apps/docs` work** — that is a separate, much larger spec.
- **No `apps/web` work** — also a separate spec.
- **No detailed architecture write-up** — defer to `apps/docs`. README points to `vault/constitution.md` as the interim source.
- **No connector catalogue prose** — defer to `apps/docs`. README only lists what works today as a short bullet list.
- **No screenshots, GIFs, or demo videos** — `apps/web` owns visual appeal.
- **No shields.io badges** — no CI is configured (operator declared "no CI" during Track A).
- **No "Why Zeno vs alternatives" comparison** — `apps/docs`.
- **No roadmap section in the README** — communication of the project roadmap is a separate spec the operator will scope.
- **No migration notes** for the `pre-0071` install path — the repo has never been public, so any "legacy" cohort is the maintainer alone, who has already migrated.
- **No troubleshooting table** — defer to `apps/docs`.
- **No performance budget** — defer to `apps/docs`.

## Constraints

- **Vault language is English-only** (locked by Track A). The new `README.md` is fully English.
- **No real identifiers in committed content** (per `vault/rules/sanitization.md`):
  - Maintainer's name does not appear in prose.
  - Personal email does not appear.
  - The canonical remote URL (`https://github.com/ribeirogab/zeno-agent`) is fine — it is the public address of the project, explicitly out-of-scope per the rule.
- **README size target: roughly 60–80 lines.** Not a hard cap, but the spirit of the rewrite is "fits on one screen + one scroll".
- **README is a placeholder until `apps/docs` and `apps/web` ship.** When those land, this README is rewritten to point at the canonical pages. Do not invent content here that will need to be migrated.
- **Single PR.** Branch `chore/oss-prep-readme` already created.

## User Stories / Scenarios

1. **A stargazer lands on `https://github.com/ribeirogab/zeno-agent`** and reads the first three lines. They learn what Zeno is, that it is early/experimental, and roughly what it does. They scroll once and see the quickstart. They either keep reading or close the tab — both are acceptable.
2. **A hobbyist self-hoster wants to try Zeno for personal use.** They scroll to Quickstart, copy-paste the commands, open `http://localhost:3000`, follow the OAuth flow, install a connector, and mention the bot in Slack. They never hit a step that says "but if you migrated from version X…".
3. **An outsider wants to know what Zeno can actually do today.** They read "What works today" and see a concrete list of capabilities (channel adapters, connectors, skills, multi-profile, etc.) plus an honest list of what is NOT supported (no multi-user, no production deploys, no hosted instance).
4. **A contributor wants to file an issue or PR.** The footer points them to `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, and `LICENSE`. They never have to guess the policy.

## Acceptance Criteria

### README structure

- [ ] `README.md` at the repo root contains, in this order, exactly these top-level sections: `# zeno-agent` (H1 with the tagline blockquote underneath), `**Status**` (single line, not a heading), `## What it does`, `## Quickstart`, `## What works today`, `## Setup notes`, `## Project layout`, `## Contributing, security, license`. No `Roadmap` section, no `Migration` section, no `Troubleshooting`, no `Performance`, no `Architecture`, no `Smoke test`, no `Running multiple profiles` section.
- [ ] The H1 is followed immediately by a blockquote tagline of 1–2 sentences describing Zeno in plain English.
- [ ] The Status line states the project is early/experimental, single-user, no SLA, no support guarantees, breaking changes expected.

### What it does

- [ ] The `## What it does` section is a single paragraph of 3–5 sentences, in plain English. It names concrete example outcomes (e.g. "open a pull request after a Sentry error", "list the issues blocking the current sprint", "triage your inbox") and explains that capabilities come from MCP connectors the operator installs via the dashboard. It does not use the internal jargon "channel", "backend", or "core" — those terms are out of scope and live in `vault/constitution.md` until `apps/docs` ships.

### Quickstart

- [ ] `## Quickstart` opens with a Prerequisites bullet list: Docker + Docker Compose, a Slack workspace where the reader can install a custom app, a Claude account (Pro/Max plan).
- [ ] A single fenced bash code block follows containing the working setup commands, in this order:

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

  No `pre-0071` migration block, no GitHub PAT env step (connectors are DB-managed since spec 0032).
- [ ] After the code block, 1–3 lines of plain text explain what to do next: open `http://localhost:3000`, sign in with `DASHBOARD_PASSWORD`, click "Connect Claude", install at least one connector, mention the bot in Slack. No troubleshooting table.

### What works today

- [ ] `## What works today` is a single bullet list of 5–8 items naming concrete capabilities present in the current codebase (e.g. Slack channel adapter, GitHub / Linear / Klaviyo connectors, skill playbooks via dashboard upload, multi-profile isolation, per-tool permissions). The list reflects shipped specs, not roadmap items.
- [ ] The list is followed by an explicit "What is NOT here" line listing the deliberate non-features: no multi-user support, no production-deploy recipe, no hosted instance.

### Setup notes

- [ ] `## Setup notes` is 3–5 lines pointing at: where the profile examples live (`profiles/default/*.example`), where the Slack manifest lives (`infra/slack-app-manifest.json`), and that detailed reading lives in `CLAUDE.md` plus the vault entry points (`vault/_index/home.md`, `vault/constitution.md`) until `apps/docs` ships. Linking to `vault/` as a bare directory is not enough — name the two specific entry-point files.

### Project layout

- [ ] `## Project layout` is a 3-line ASCII tree or a single short paragraph that names the top-level workspaces (`apps/`, `packages/`, `agent/`, `infra/`, `vault/`) and their one-line responsibilities. It points to `vault/constitution.md` for architecture detail until `apps/docs` ships.

### Contributing, security, license

- [ ] `## Contributing, security, license` is a single bullet list with four working relative links: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `LICENSE`. Every link resolves (`test -e <path>` returns success).

### Sanitization and language guards

- [ ] `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' README.md` returns zero matches.
- [ ] `grep -nE 'Gabriel|gblosr|ribeirogab' README.md` returns matches only for the canonical remote URL (`https://github.com/ribeirogab/zeno-agent.git`) — no occurrence of the maintainer's first name in prose, no occurrence of the personal email, no `ribeirogab/...` reference other than the canonical remote.
- [ ] No real third-party names appear (`Flávia`, employer slugs, customer names).

### Size target

- [ ] The new `README.md` is between 50 and 100 lines (soft cap). The current file is ~170 lines; the rewrite is meaningfully smaller.

### PR hygiene

- [ ] PR is single-purpose: only the README rewrite. No license, community-files, docs-site, or landing-page work bleeds in.
- [ ] PR description references this spec by path.
- [ ] Branch is `chore/oss-prep-readme`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The shorter README leaves a hobbyist self-hoster stuck on a step that the deleted troubleshooting table used to cover. | The "Setup notes" section explicitly points to `CLAUDE.md` and `vault/` as the interim source; the deleted troubleshooting content is recoverable from git history if a future spec wants to migrate it into `apps/docs`. |
| The Quickstart code block goes stale when `infra/` scripts change. | The Quickstart calls package-level scripts (`pnpm run docker:build`, `pnpm run docker:up`) rather than embedding raw `docker compose` invocations. Script renames happen in lockstep with `package.json` updates and are caught by the existing convention. |
| The "What works today" list drifts as new specs ship without README maintenance. | The list is intentionally short and concrete (5–8 items); maintenance burden is low. Tracked as a follow-up reminder when a new connector ships. |
| Removing the architecture section orphans a contributor who was relying on the README to navigate. | The "Project layout" section explicitly points at `vault/constitution.md` as the interim source; once `apps/docs` ships it will be the canonical landing page for architecture. |
| The README is rewritten now and rewritten again when `apps/docs` and `apps/web` ship — wasted effort. | Accepted. The current README is a leak risk for outsiders today; a placeholder rewrite buys correct outsider experience until the bigger workspaces ship. The next rewrite will mostly be deletions and pointer updates. |

## Open Questions

(None blocking. The three brainstorm decisions Q1–Q3 — primary audience, scope of minimal README, status tag style — are recorded in the Constraints and Acceptance Criteria sections above.)
