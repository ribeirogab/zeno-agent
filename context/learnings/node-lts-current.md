---
tags:
  - learning
  - reference
related:
  - "[[../specs/0001-slack-wesker-mvp/spec|Wesker MVP spec]]"
  - "[[docker-node-image-variants]]"
created: 2026-04-15
---
# Node.js LTS status (as of April 2026)

**Target Node version for Wesker: Node 24.** As of April 15, 2026, Node 24 is the most recently-active LTS line.

## Context

Node release schedule: even majors are cut in April, transition to LTS in October, and receive 30 months of total LTS support (12 Active + 18 Maintenance). Source: [Node.js previous releases](https://nodejs.org/en/about/previous-releases), [Node release schedule](https://github.com/nodejs/Release).

## How to Apply

**Current landscape (April 2026):**
- **Node 20** — end-of-life on 2026-04-30 (imminent, do NOT use for new projects).
- **Node 22** — Maintenance LTS; supported through 2027-04.
- **Node 24** — Active LTS (entered LTS Oct 2025); supported through Apr 2028.
- **Node 25** — Current (non-LTS), cut Oct 2025.
- **Node 26** — next Active LTS, expected Oct 2026.

**Pick for Wesker:** **Node 24** — broadest support window, widely available in `node:24-slim` Docker images, compatible with `@slack/bolt@4` (requires ≥18) and `@anthropic-ai/claude-agent-sdk`.

**Pin everywhere coherently:**
- `.nvmrc` → `24`
- `package.json` → `"engines": { "node": ">=24.0.0" }`
- `Dockerfile` → `FROM node:24-slim` (or `node:24-alpine` if minimum image size is critical — see [[docker-node-image-variants]])

**Upcoming schedule change to watch:** starting October 2026, the release model changes to one major per year (April), with every even-numbered release becoming LTS. Node 26 will be the last under the current model; Node 27 the first under the new. No action for Wesker — Node 24 still follows the current 30-month LTS window.
