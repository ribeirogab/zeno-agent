---
tags:
  - learning
  - reference
related:
  - "[[../specs/2026-04-15-slack-zeno-mvp/spec-slack-zeno-mvp|Zeno MVP spec]]"
  - "[[claude-agent-sdk-typescript]]"
  - "[[claude-bare-mode-no-oauth]]"
created: 2026-04-15
---
# Claude Code — OAuth token for programmatic use

To authenticate the Claude Agent SDK without `ANTHROPIC_API_KEY`, use a `CLAUDE_CODE_OAUTH_TOKEN`. This is how Zeno uses the user's Claude Pro/Max subscription flat-rate plan instead of pay-per-token API billing — aligning with the spec's decision to avoid an API key.

## Context

The spec explicitly requires OAuth auth, not API key. Discovery revealed two paths: (a) subprocess `claude -p` which reads OAuth from `~/.claude/` automatically, or (b) Claude Agent SDK which reads `CLAUDE_CODE_OAUTH_TOKEN` from env. Zeno uses (b) per [[claude-agent-sdk-typescript]].

Note: Anthropic's formal policy restricts OAuth-based auth for third-party products; the `CLAUDE_CODE_OAUTH_TOKEN` env var is documented in community demos ([weidwonder/claude_agent_sdk_oauth_demo](https://github.com/weidwonder/claude_agent_sdk_oauth_demo)) and requires an active Pro/Max subscription. For a personal agent (Zeno's scope), this is acceptable. For a multi-tenant product, prefer API key.

## How to Apply

**Generate the token** (interactive, one time plus on expiry):

```bash
claude setup-token
```

This opens a browser for authentication and prints the token to the terminal.

**Use it with the SDK** — copy the token into the env of the process that runs the SDK:

```
# .env
CLAUDE_CODE_OAUTH_TOKEN=<pasted-from-setup-token-output>
```

The SDK reads it automatically. Priority vs `ANTHROPIC_API_KEY` is not explicitly documented; set only one to avoid ambiguity.

**Docker setup for Zeno:**

1. During image build, install the Claude Code CLI (via `curl -fsSL https://claude.ai/install.sh | bash` or `npm i -g @anthropic-ai/claude-code`).
2. After building, run **once** interactively to mint the token:

   ```bash
   docker compose run --rm zeno-agent claude setup-token
   ```

   Copy the output, paste into `.env`.

3. Restart the service so it picks up the new env:

   ```bash
   docker compose up -d --force-recreate
   ```

**Expiration / refresh:** Not documented. The demo README advises re-running `claude setup-token` if auth fails. Zeno's backend should classify auth failures as `kind: "auth_expired"` and surface a re-login instruction in Slack.

**Do not confuse with Claude Code's `/login`:** `/login` authenticates the interactive CLI session (stores creds in `~/.claude/`); it is NOT equivalent to `setup-token` for SDK purposes. The SDK needs the token in the env var, not a session file. This is a real trap — see [[claude-bare-mode-no-oauth]].
