# syntax=docker/dockerfile:1

# Stage 1: base
FROM node:24-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 build-essential gh ca-certificates curl unzip \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI v2 (official installer — Debian package ships an outdated v1).
# Multi-arch: amd64 → x86_64, arm64 → aarch64.
RUN set -eux; \
    arch=$(uname -m); \
    case "$arch" in \
      x86_64) aws_arch=x86_64 ;; \
      aarch64) aws_arch=aarch64 ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" -o /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install; \
    rm -rf /tmp/awscliv2.zip /tmp/aws
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# Stage 2: deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/worker/package.json ./apps/worker/
COPY apps/api/package.json ./apps/api/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/storage/package.json ./packages/storage/
COPY packages/logger/package.json ./packages/logger/
COPY packages/mcp-discover/package.json ./packages/mcp-discover/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

# Stage 3: builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm turbo run build --filter=@zeno/worker... --filter=@zeno/api... --filter=@zeno/dashboard...

# Stage 4: runtime
FROM base AS runtime
ENV NODE_ENV=production
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/storage/dist ./packages/storage/dist
COPY --from=builder /app/packages/storage/package.json ./packages/storage/
COPY --from=builder /app/packages/storage/node_modules ./packages/storage/node_modules
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/logger/node_modules ./packages/logger/node_modules
COPY --from=builder /app/packages/mcp-discover/dist ./packages/mcp-discover/dist
COPY --from=builder /app/packages/mcp-discover/package.json ./packages/mcp-discover/
COPY --from=builder /app/packages/mcp-discover/node_modules ./packages/mcp-discover/node_modules
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/dashboard/dist ./apps/dashboard/dist
COPY package.json pnpm-workspace.yaml ./

# Persistent volume mount point (owned by node so the agent can write workspaces)
RUN mkdir -p /workspace && chown -R node:node /workspace /app

# Switch to the non-root `node` user (uid 1000) — required because the Claude
# Code CLI refuses --dangerously-skip-permissions when running as root.
USER node
ENV HOME=/home/node

# Claude Code via official installer (used for setup-token; runtime uses the SDK).
# Installed under the node user so the binary lands in /home/node/.local/bin.
RUN curl -fsSL https://claude.ai/install.sh | bash || true
ENV PATH="/home/node/.local/bin:${PATH}"

VOLUME ["/workspace"]

COPY --chown=node:node infra/entrypoint.sh /usr/local/bin/zeno-entrypoint.sh
USER root
RUN chmod +x /usr/local/bin/zeno-entrypoint.sh
USER node
ENTRYPOINT ["/usr/local/bin/zeno-entrypoint.sh"]

EXPOSE 3000
CMD ["pnpm", "exec", "concurrently", "--kill-others-on-fail", "--prefix", "[{name}]", "--names", "worker,api", "node apps/worker/dist/index.js", "node apps/api/dist/index.js"]
