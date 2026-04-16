# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production

# OS deps: git, gh prereqs, jq, bash
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates gnupg jq bash \
 && rm -rf /var/lib/apt/lists/*

# gh CLI from official repo
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# Switch to the non-root `node` user (uid 1000) — required because the Claude
# Code CLI refuses --dangerously-skip-permissions when running as root.
USER node
ENV HOME=/home/node

# Claude Code via official installer (used for setup-token; runtime uses the SDK)
RUN curl -fsSL https://claude.ai/install.sh | bash
ENV PATH="/home/node/.local/bin:${PATH}"

WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node package.json ./

# Persistent volume mount point (owned by node so the agent can write workspaces)
USER root
RUN mkdir -p /workspace && chown node:node /workspace
USER node
VOLUME ["/workspace"]

CMD ["node", "dist/index.js"]
