---
tags:
  - learning
  - concept
related:
  - "[[openclaw-architecture]]"
  - "[[hermes-architecture]]"
  - "[[claudeclaw-claude-code-plugin-pattern]]"
  - "[[agent-skills-open-standard]]"
  - "[[workspace-markdown-files-pattern]]"
  - "[[tool-registry-autodiscovery-pattern]]"
  - "[[gateway-daemon-vs-single-process]]"
  - "[[closed-learning-loop-self-improving-skills]]"
  - "[[dm-pairing-allowlist-security]]"
  - "[[multi-agent-routing-channels-to-agents]]"
  - "[[profile-isolation-via-env-var]]"
  - "[[hermes-prompt-caching-invariants]]"
  - "[[connectors-only-pivot]]"
  - "[[../specs/2026-04-27-zeno-redefinition/spec-zeno-redefinition]]"
created: 2026-04-15
status: superseded
superseded_by: 0049
---

> **Superseded** by spec [[../specs/2026-04-27-zeno-redefinition/spec-zeno-redefinition|2026-04-27-zeno-redefinition]] (connectors-only positioning). The "what to adopt" recommendations include `SKILL.md + MCP servers` as Zeno's future capability surface — that direction is no longer canonical; the new direction is connectors as the single capability surface, skills deferred. The OpenClaw/Hermes study itself remains useful third-party reference. See [[connectors-only-pivot]].

# Lessons for Zeno — what to adopt from OpenClaw and Hermes, what to leave behind

Synthesis of 2026-04-15 deep study of OpenClaw and Hermes Agent. Zeno's target positioning is **personal agent with minimal setup that grows by adding access (GitHub orgs, Linear, Drive, Notion) — simpler than both references**. This note translates the study into concrete refactor directions.

## Context

the operator's stated use case: single user, Slack as the primary channel, agent acts on work repos (`acme`) and personal repos (`octocat`), opens PRs, reviews code, integrates with Linear in the future. Core success criterion: **easier to configure than OpenClaw and Hermes**.

## How to Apply

### The strategic positioning

| Dimension | OpenClaw | Hermes | Zeno (target) |
|---|---|---|---|
| Scope | Personal assistant across 22+ channels | Self-improving agent, research + product | Personal agent for dev workflow |
| Stack | TS monorepo, gateway daemon | Python, gateway + backends + ACP | TS single process |
| Channels | 22+ | 7+ | 1 (Slack) → few later |
| Setup | CLI + daemon + workspace files + pairings | `hermes setup` wizard + model + tools + gateway | `.env` + `USER.md` + `docker compose up` |
| Custom code to extend | Skills (markdown) + workspace configs | Tool registry + skills + plugins + toolsets | Today: none; Future: SKILL.md + MCP servers |
| Memory | Session store + workspace files | Honcho + FTS5 + MEMORY.md + skills | USER.md (static) |
| Learning | Skill registry, not self-improving | Closed loop, self-improving | None (intentional) |
| Security | DM pairing, sandbox non-main sessions | Env isolation per profile | Solo scope, no allowlist |

Zeno's differentiator: **"it's your Claude Code, in Slack, with access to everything you already pay for, and you configure it by editing markdown."** Nothing more ambitious than that. Every architectural decision should defend that simplicity.

### What to adopt (recommended, high-value)

**1. SOUL.md extraction — move identity out of code (`src/agent/system-prompt.ts`) into a markdown file at repo root.**

Today Zeno's system prompt is a `const BASE_PROMPT` in TypeScript. Iterating on the persona requires rebuilding the container. Extract to `SOUL.md` at repo root, gitignored or committed depending on whether it's user-specific. Load at boot the same way `USER.md` is loaded. Benefits:
- Hot-iterate the persona without touching code.
- Users can customize their Zeno's personality per instance.
- Aligns with OpenClaw/Hermes/awesome-openclaw-agents naming convention (SOUL.md is the lingua franca — see `[[workspace-markdown-files-pattern]]`).

**2. Skills via `agentskills.io` standard — `SKILL.md` directory bundles.**

Start empty; grow organically. Location: `skills/` at repo root (committed template, per-user overrides via gitignored `skills/user/`). Mount read-only into container alongside `USER.md`. System prompt tells Zeno: *"your skills live at `/app/skills/`. Use Glob/Read to consult them when a user request matches a skill description."* Benefits:
- User authors `skills/open-pr/SKILL.md` once, Zeno applies consistently forever.
- Zero custom code — skills are just markdown.
- Portable — your skills work with Claude Code, Codex, Cursor, Goose.
- See `[[agent-skills-open-standard]]`.

**3. MCP server registry — declarative config for external-service access.**

Add `infra/mcp-servers.json` (or a section in `.env`) listing MCP servers to enable. `ClaudeCodeBackend` reads it, passes to SDK's `mcpServers` option. Natural hooks for: Linear (future), Notion (future), Slack MCP server for cross-channel search (future). Growing by config instead of code is Zeno's whole promise.

**4. Slack thread → agent session persistence.**

The biggest UX gap in current MVP is stateless per-turn. OpenClaw and Hermes both persist sessions naturally — Slack thread ID maps to an agent session ID, conversation state lives across turns. Claude Agent SDK supports `persistSession: true` + `resume: <session-id>`. Storage: SQLite file (boring, works) at `/app/data/sessions.db` mounted as volume.

**5. Approval flow via `canUseTool` callback.**

The current `permissionMode: 'bypassPermissions'` is a blunt instrument. SDK exposes `canUseTool(tool, input) => allow|deny|ask` callback. Route `ask` through Slack reactions: post "Posso rodar `gh pr merge #42`? 👍/👎" and await reaction. Fixes the "Zeno could do anything" concern as the scope grows.

**6. DM allowlist — ready-to-enable, even if inactive now.**

Write the code path for `ALLOWED_SLACK_USER_IDS` env-var allowlist; leave it empty (effectively disabled). When workspace stops being solo, you flip one env var on. Beats remembering to implement it under pressure. See `[[dm-pairing-allowlist-security]]`.

### What to hold off on (defer, tempting but premature)

**1. Gateway daemon pattern (OpenClaw).** Zeno is one channel + one process; gateway introduces ops responsibility. See `[[gateway-daemon-vs-single-process]]`. Tipping point: 3+ channels OR real cross-channel state.

**2. Closed learning loop (Hermes).** See `[[closed-learning-loop-self-improving-skills]]`. Start with user-authored SKILL.md; revisit when there are 50+ skills and Claude SDK exposes trajectory hooks.

**3. Honcho user modeling / FTS5 session search.** USER.md is sufficient identity. Session SQLite with basic text search is enough; FTS5 is overengineering for solo use.

**4. Multi-agent routing.** One Zeno, one persona. Credentials already span both orgs via PAT. Adopt when hard isolation is needed (see `[[multi-agent-routing-channels-to-agents]]`).

**5. Profile isolation via env var.** One Zeno, one `HOME`. Framework exists on the shelf (`[[profile-isolation-via-env-var]]`).

**6. Multiple terminal backends (local/docker/ssh/modal/daytona/singularity).** Zeno runs in Docker. That's the backend. Other 5 are solutions to Hermes-specific deployment goals.

**7. Skin engine / CLI theming.** Vanity feature. Zero value for a bot you interact with via Slack.

**8. ACP adapter (VS Code/Zed/JetBrains).** Zeno is a Slack bot, not an IDE companion.

### Concrete refactor shape (proposed spec 0002+)

Based on the above, here's what spec 0002 could propose. Not committing — just sketching:

**Spec 0002: Slack thread sessions + SOUL.md externalization (first iteration on MVP)**
- Extract `BASE_PROMPT` → `SOUL.md` at repo root.
- Session persistence via SQLite mapping `slack_thread_id → session_id`.
- Use SDK's `persistSession` + `resume`.
- Preserves prompt cache (see `[[hermes-prompt-caching-invariants]]`) — session is a Claude-SDK concept, doesn't mutate system prompt.

**Spec 0003: Skills support via SKILL.md**
- `skills/` directory at repo root, committed template.
- Read-only bind-mount into `/app/skills/`.
- System prompt updated to mention the skills dir.
- No custom discovery code — Claude uses Read/Glob/Grep.

**Spec 0004: Approval flow via `canUseTool`**
- Drop `permissionMode: 'bypassPermissions'`; use `canUseTool` callback.
- Destructive ops (configurable pattern list) post approval request on Slack thread.
- Agent awaits reaction; 👍 allow, 👎 deny, no reaction within 5min → deny.

**Spec 0005: GitHub App migration + optional GitHub MCP server**
- Kill PAT-based auth, move to GitHub App installation tokens.
- Optionally register GitHub MCP server to replace `gh` CLI Bash calls with typed tools.
- Pre-req work for multi-user future.

**Spec 0006: Linear integration**
- Linear MCP server registration.
- Zeno can read tasks, create tasks, update status via conversation.

Each is a focused iteration. Each adds ONE capability. The single-process Node architecture holds through all of them — nothing below forces a gateway daemon.

### Anti-goals (explicitly not pursuing)

- Do NOT become OpenClaw. Don't compete on channel breadth.
- Do NOT become Hermes. Don't attempt self-improving skills until core UX is solid.
- Do NOT add a web dashboard until Docker logs feel insufficient (they will, eventually, but not soon).
- Do NOT expose public endpoints — Zeno is personal, Slack Socket Mode is perfect for that.

### Decision log to update

`context/constitution.md` should gain a section on this strategic positioning, something like:

> **Positioning.** Zeno is a personal agent that lives in Slack and grows by being given access to your existing tools. Configuration is by editing markdown files, not writing code. When in doubt between flexibility and simplicity, simplicity wins. Specifically: single process over gateway daemon, user-authored skills over self-improving agents, solo scope over multi-tenancy until the use case demands otherwise.

Adding that to the constitution prevents the drift toward "just one more feature" that eventually turns Zeno into OpenClaw.
