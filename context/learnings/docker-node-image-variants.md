---
tags:
  - learning
  - reference
related:
  - "[[../specs/0001-slack-zeno-mvp/spec|Zeno MVP spec]]"
  - "[[node-lts-current]]"
created: 2026-04-15
---
# Node.js Docker image — variant choice

Official Node images come in several variants: `node:<ver>`, `node:<ver>-slim`, `node:<ver>-alpine`, `node:<ver>-bookworm-slim`, and distroless alternatives. For Zeno, **`node:24-slim`** is the right default.

## Context

Source: [nodejs/docker-node README](https://github.com/nodejs/docker-node) and community best-practices. Zeno's container needs `gh`, `git`, `curl`, `jq`, `bash`, and the Claude Code CLI on top of Node — so the image must be `apt`-friendly (Debian-based), ruling out Alpine for this case.

## How to Apply

**Variant comparison:**

| Variant | Size | OS | Notes |
|---|---|---|---|
| `node:24` | ~1.1 GB | Debian full | Everything pre-installed; oversized for production |
| `node:24-bookworm-slim` or `node:24-slim` | ~250 MB | Debian slim | Balanced default; `apt` works; room for `gh`, `git`, CLIs |
| `node:24-alpine` | ~140 MB | Alpine | Smallest; uses `apk`, `musl` libc; some native modules break |
| Distroless variants | varies | minimal | No shell, no package manager; requires multi-stage build; not suited when CLI tools like `claude` and `gh` need to run at runtime |

**Zeno's choice: `node:24-slim`.** Reasons:
- `apt` works — needed for `gh`, `git`, `curl`, `jq`.
- Claude Code installer expects Debian/Ubuntu-style `~/.local/bin` layout.
- Native deps (e.g., `@slack/socket-mode` uses `ws`, pure JS) don't need Alpine fight.
- ~250 MB runtime layer is fine for a personal-scale agent.

**Pattern:**

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl ca-certificates gnupg jq bash \
 && rm -rf /var/lib/apt/lists/*
# + gh CLI apt repo install
# + Claude Code install via curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
CMD ["node", "dist/index.js"]
```

**Non-root user:** `node` user exists in the official image by default. For Zeno's MVP we keep `root` because `gh auth`, `claude setup-token`, and the persistent volumes at `/root/.claude` and `/workspace` simplify setup. When hardening (post-MVP), switch to `USER node` and move volumes to `/home/node/`.

**Future Node release change (Oct 2026):** Node 26 Dockerfile will drop bundled Yarn v1. Install Yarn manually if needed. Not relevant to Zeno (uses npm).
