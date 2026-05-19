---
tags:
  - rule
  - workflow
severity: important
applies-to:
  - all agents working in this repo
created: 2026-04-16
---
# Generated / temporary files go under `tmp/`

Every file an agent produces that is **not part of the codebase** — screenshots, debug scripts, scratch notes, dumps, log captures, browser session output, manual test artifacts, anything the user didn't explicitly ask to commit — goes under `tmp/` (gitignored, at the repo root).

Never drop temp files at the repo root or inside `src/`, `apps/`, `packages/`, `infra/`, `.vault/`, `profiles/`, `agent/`, or `.claude/`.

## Why

Temp files dumped at the repo root pollute `git status`, risk accidental commits, and leak across sessions. A single known-location convention (`tmp/`) scoped to gitignore keeps the working copy clean and makes cleanup trivial (`rm -rf tmp/*`).

This rule was set after Playwright MCP screenshots ended up untracked at the repo root during a manual testing session.

## How to Apply

Sub-folders by concern (create as needed):

| Kind | Path |
|---|---|
| Playwright MCP screenshots (explicit `filename:` arg) | `tmp/playwright/*.png` |
| Playwright MCP auto-generated state (snapshots, console logs) | `.playwright-mcp/` is created by the tool; it's gitignored separately — leave it alone |
| Ad-hoc screenshots from other tools | `tmp/screenshots/*.png` |
| Debug scripts, one-off scratch | `tmp/scratch/` |
| Log captures / db dumps | `tmp/logs/` |

**For `mcp__playwright__browser_take_screenshot`:** always set `filename` to a path under `tmp/playwright/`, e.g. `tmp/playwright/login-wrong-password.png`. A bare filename lands in the repo root.

**For any tool that writes to CWD with a configurable path:** prepend `tmp/<concern>/`.

**For documents the user asked to commit:** those belong in their proper home (`.vault/`, `apps/`, `packages/`, etc), not in `tmp/`. When in doubt, ask.
