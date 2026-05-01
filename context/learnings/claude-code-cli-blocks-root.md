---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/2026-04-15-slack-zeno-mvp/spec-slack-zeno-mvp|Zeno MVP spec]]"
  - "[[claude-agent-sdk-typescript]]"
created: 2026-04-15
---
# Claude Code CLI refuses `--dangerously-skip-permissions` as root

When you run the Claude Agent SDK with `permissionMode: 'bypassPermissions'`, it spawns the `claude` CLI under the hood with `--dangerously-skip-permissions`. **That flag is hard-rejected when the process is root or sudo:**

```
--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons
```

The SDK surfaces only `Claude Code process exited with code 1` — the real reason is in the subprocess stderr, which the SDK does NOT include in its error object by default.

## Context

Surfaced during Zeno MVP smoke test. The container ran as root (default for `node:24-slim`), every Slack message failed with the generic exit-code-1 message. Spent a debug round adding raw error logging + an `stderr` callback before the actual cause showed up.

## How to Apply

**Required for SDK + bypassPermissions:** run the container as a non-root user. Two pieces:

1. Dockerfile: `USER node` (the official `node:*-slim` image already has uid 1000 `node`). Install Claude CLI under `/home/node/.local/bin`. Pre-create `/workspace` (or any volume mount target) with `chown node:node` BEFORE switching user, since volumes mount with their host ownership and `node` may not be able to write otherwise.
2. `COPY --chown=node:node ...` for everything copied into `/app`.

**Always pass `stderr` callback to `query()`** so the SDK forwards subprocess stderr to a callback you log:

```ts
const iter = query({
  prompt,
  options: {
    // ...
    stderr: (line) => logger.warn({ event: 'sdk_stderr', line }, 'sdk stderr'),
  },
});
```

This catches not just this specific failure but anything else the subprocess complains about (rate limits, malformed config, permission rule violations, etc.).

**Alternative if you can't go non-root:** drop `bypassPermissions`, pre-approve every tool you use via `allowedTools` with permission rule syntax (e.g., `'Bash(gh *)'`), and accept that anything outside the allowlist will fail (no prompt is possible without TTY).
