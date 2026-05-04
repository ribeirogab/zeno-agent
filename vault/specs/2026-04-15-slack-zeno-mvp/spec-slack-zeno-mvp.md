---
status: shipped
feature: slack-zeno-mvp
created: 2026-04-15
shipped: 2026-04-15
---
# Zeno MVP — Personal agent over Slack that queries GitHub

**Status:** Shipped (2026-04-15)
**Scope:** Deliver a Docker process that, on receiving a mention or DM in the Operator's Slack, uses Claude Code (via plan OAuth, not API key) to answer questions about GitHub repos — starting with "what repos are in org X?".

**Validation:** S1 (happy path: `@zeno-agent quais repos tem na octocat?` → reply in PT-BR with 23 repos) validated end-to-end via real smoke in Slack + claude directly in the container. Scenarios S2 (DM), S3 (org without access), and S5 (auth expired) covered by code (same path as S1 + unit tests of `classifyError`); manual validation in Slack optional.

## Context

This repository (today `zeno-agent`, will be renamed to `zeno-agent` as the first task of the implementation) is the workspace of an operator's personal agent. The end goal is to have a conversational agent accessible via messaging channels (Slack to start, potentially Discord/Telegram/WhatsApp later) capable of executing any technical task the operator asks for — listing repos, cloning code, editing, opening PRs, analyzing codebases, etc.

This spec covers **the first useful delivery**: the minimal infrastructure to prove that the loop Slack ↔ Claude Code ↔ GitHub works, using a single concrete case as the validation vector (listing an org's repos). The whole architecture was designed so that subsequent iterations (other tools, other channels, other models, persistent sessions, etc.) are additive — without rewriting the core.

Foundational decisions made in the brainstorming (see conversation history, 2026-04-15):

- **Where it runs:** Node/TS process in a Docker container, on the Operator's local machine. Future migration to the cloud is anticipated but not necessary now.
- **How the LLM is accessed:** `@anthropic-ai/claude-agent-sdk` called in-process. Authentication via `CLAUDE_CODE_OAUTH_TOKEN` env var, generated once by the `claude setup-token` command — **does not use `ANTHROPIC_API_KEY`**. Predictable cost via the plan, aligned with the "personal agent" model. The `claude` binary stays in the container only to run `setup-token` when the OAuth expires. Decision validated during Task 0 discovery; details in `context/learnings/claude-agent-sdk-typescript.md` and `claude-code-oauth-token.md`.
- **Architecture:** ports & adapters. Two pluggable abstractions — `Channel` (message sources) and `AgentBackend` (models/CLIs like Claude Code, Codex, Gemini). MVP implements one of each: `SlackChannel` + `ClaudeCodeBackend`.
- **Agent tools:** Claude Code's built-in toolset (Bash, Read, Write, Edit, Grep, Glob). **No custom tool is written in the MVP**. GitHub tasks are resolved by Claude calling `gh` CLI via Bash.
- **GitHub auth:** Personal Access Token (PAT classic) with scopes `repo` + `read:org`. GitHub App is left for the next iteration.
- **Slack integration:** Socket Mode (outbound websocket) — no need for a public URL or tunnel.
- **Reply language:** PT-BR by default.

## Problem Statement

Today, to look up information about repos, orgs, and code, the operator has to switch between Slack (where they chat), the terminal (where `gh` runs), and the GitHub UI (where they explore). For dev tasks, they also go through the IDE/Claude Code locally.

The MVP solves **a slice of this**: allow simple questions about repos — e.g., "what repos are in octocat?" — to be answered without leaving Slack, in natural language, with the right context. It's a thin slice of the broader vision ("any technical task via Slack"), chosen because:

- It exercises the full loop (Slack → Agent → Claude → shell → reply).
- It's low risk (read-only, trivial GitHub operation).
- It validates the choice of Claude Code via OAuth as the backend before investing in more complex flows.
- Generalizing to other questions ("what open issues are in X?", "list PRs from the last month") is nearly free — the same code works, only the command Claude chooses to run changes.

## Non-Goals

Explicitly **out of MVP** (will not be implemented in this delivery):

1. **User allowlist on Slack.** The operator's workspace is solo; nobody else talks to the bot. The moment the workspace stops being solo, the allowlist becomes a blocker and gets added immediately.
2. **GitHub App.** Stays as the **first post-MVP iteration**, as confirmed in the brainstorm. PAT covers 100% of the MVP.
3. **Persistent sessions / thread as context.** Each message is stateless — Zeno does not remember previous turns. Replying in a thread does not continue a conversation.
4. **Custom file tools** (`read_file`, `write_file`, `edit_file` with diff). Only `Bash` and the other Claude Code built-ins are enabled; file tools become in scope when the dev agent (clone/edit/PR) is implemented.
5. **Other channels** (Discord, Telegram, WhatsApp). The `Channel` interface exists, but only `SlackChannel` is implemented.
6. **Other backends** (Codex, Gemini). The `AgentBackend` interface exists, but only `ClaudeCodeBackend`.
7. **Human approval of destructive operations via Slack.** In the MVP Zeno does not perform destructive operations; the system prompt instructs it to ask for confirmation before running risky commands, but the Slack approval UX (buttons, reactions) is left for later.
8. **Incremental feedback / progress streaming on Slack.** The final reply is a single message, with no intermediate "editing file X..." updates.
9. **Multiple Slack workspaces.** One workspace (the operator's personal one). Scaling to multiple is adapter work, not core work.
10. **CI/CD, metrics, dashboards, alerts.** JSON logs to stdout (`docker compose logs`) are sufficient for the MVP.
11. **Multi-user Claude Code.** The OAuth session belongs to the operator; any Slack message consumes from their plan.
12. **E2E tests against real Slack/Claude.** Only targeted unit tests. Final validation is a manual smoke test.

## Constraints

**Technical:**

- Must run in Docker from the start (portability to cloud in the future).
- Must use Claude Agent SDK with OAuth, not API key — implies installing the `claude` CLI in the container (to generate the token via `setup-token`) and keeping `CLAUDE_CODE_OAUTH_TOKEN` in `.env`.
- The first `setup-token` is manual and interactive (opens a URL in the host browser, copies the token to `.env`). Must be documented.
- Slack Socket Mode requires an **App-level token** (`xapp-...`) in addition to the bot token — both go in `.env`.
- The GitHub PAT must have minimum scopes `repo` + `read:org`.
- Stack: TypeScript + Node 22 LTS (confirm current LTS in Task 0 of the implementation).
- The container must have `gh`, `git`, `node`, `claude` installed. Nothing beyond what is needed.

**Organizational:**

- The operator confirmed that using personal Claude Code on work repos is fine (company policy permits it).
- No SLA commitment — it's a personal tool, "broke? fix it tonight".

**Architectural (to avoid immediate technical debt):**

- The `Agent Core` **must not import** anything Slack-, Discord-, Claude-Code-specific, etc. It only knows the types in `channels/types.ts` and `agent/types.ts`.
- Tools are Claude Code built-ins; the `tools/` folder **does not exist** in the MVP. Adding a custom tool in the future will be justified by concrete need.
- Secrets (tokens) never committed. `.env` in `.gitignore`, `.env.example` versioned.

**Communication with the user:**

- First reply language: PT-BR.
- Tone: direct, subtle humor ok (Resident Evil is a freebie theme). Short replies.
- Format: Slack markdown (code blocks, bold). No huge tables.

## User Stories / Scenarios

**S1 — Happy path (the validation vector):**

1. The operator mentions in the `#agents` channel: `@zeno-agent quais repos tem na octocat?`
2. Zeno reacts to the original message with `:eyes:` within 2s (ack).
3. Zeno calls Claude Code, which calls `gh repo list octocat --json name,description --limit 100` via Bash.
4. Zeno posts a reply in the same thread in PT-BR, listing the repos with a short description.
5. Zeno swaps the reaction for `:white_check_mark:`.

**S2 — User talks via DM:**

Same as S1, but the initial message is a direct DM to Zeno (no `@`). `threadId` is `null`. The reply goes in the DM itself.

**S3 — Question about an org without access:**

1. Operator: `@zeno-agent quais repos tem na anthropics?`
2. Claude calls `gh repo list anthropics`, which returns a permission error.
3. Claude reads stderr and translates: "I don't have access to org `anthropics` — your PAT would need to be a member or have access to it."
4. Zeno posts that explanation in the thread. It does not leak the raw error content.

**S4 — Generic question / out of repo scope:**

1. Operator: `@zeno-agent qual a capital do Peru?`
2. Claude answers naturally ("Lima"), without invoking a tool.
3. Zeno posts the reply. There is no error, just LLM use without Bash.

**S5 — Claude session expired:**

1. Operator: `@zeno-agent oi`
2. `ClaudeCodeBackend.query()` returns an error indicating auth failed.
3. Zeno posts: "my Claude token expired. Run `docker compose run --rm zeno-agent claude setup-token`, paste the new token in `.env` and `docker compose up -d --force-recreate`."
4. Logs record `warn` with timestamp and correlationId.

**S6 — Container boot:**

1. The operator configures `.env` (including `CLAUDE_CODE_OAUTH_TOKEN` generated by `claude setup-token`) and runs `docker compose up -d`.
2. Zeno connects to Slack via Socket Mode (log `slack_connected`).
3. Zeno validates `gh auth status` (log `github_auth_ok`).
4. Zeno confirms `claude --version` (log `claude_cli_ok`) + presence of the token (log `claude_oauth_token_present`).
5. Final log `zeno_online`. The container stays `up`, ready to receive events.

## Success Criteria

This delivery is **done** when all of the following are observable:

1. The repository was renamed from `zeno-agent` to `zeno-agent`: `origin` already points at `octocat/zeno-agent` (done), all textual references in `README`, `AGENTS.md`, `context/constitution.md`, system prompt, package.json have been updated. No "Zeno" or "zeno-agent" string remains in the project's code/docs (except git history).
2. `docker compose up --build` brings the container up without errors on a clean machine (macOS + Docker Desktop).
3. `docker compose run --rm zeno-agent claude setup-token` completes OAuth successfully and the generated token, when pasted into `.env` as `CLAUDE_CODE_OAUTH_TOKEN`, is consumed by the SDK on subsequent `docker compose up`.
4. After starting, scenario S1 (happy path) works end-to-end in under 30 seconds: mention → `:eyes:` reaction → correct reply in PT-BR in the thread → `:white_check_mark:` reaction.
5. Scenario S2 (DM) works — reply in the DM, no thread.
6. Scenario S3 (org without access) produces an explanatory reply in PT-BR, does not expose raw stderr or token.
7. Scenario S5 (expired session) is detected and clearly communicated.
8. Structured JSON logs appear in `docker compose logs -f zeno-agent`, with the key events listed in Section 4 of the brainstorm (`message_received`, `backend_started`, `backend_tool_call`, `backend_completed`, `response_sent`), all carrying a `correlationId` consistent per interaction.
9. `npm run test` passes (unit tests for `SlackAdapter.normalize`, `ClaudeCodeBackend` with mocked spawn, and `config` validation).
10. The versioned `.env.example` covers all needed variables (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`), with no `ANTHROPIC_API_KEY` placeholder.
11. `README.md` documents the full setup: dependencies, `setup-token`, `.env`, smoke test checklist.
12. `context/constitution.md` updated reflecting the foundational decisions (Zeno name, defined stack, Claude Code via OAuth).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| My knowledge (Claude) is from May/2025 and we are in April/2026 — Claude Code, Agent SDK, and Bolt APIs may have changed in relevant ways. | **Task 0 of the implementation plan is mandatory discovery** — verify current official docs of each dependency before coding. If anything has materially changed, return to the spec and adjust. Formalize this step as a project convention after the MVP ships. |
| ~~Claude Code headless via subprocess can have complex output that's hard to parse~~ | **Resolved during Task 0:** we use `@anthropic-ai/claude-agent-sdk` in-process (`query()` async generator), not a subprocess. See `context/learnings/claude-agent-sdk-typescript.md`. |
| Claude Code OAuth token expires without clear advance warning. | Detect auth error coming from the SDK in `ClaudeCodeBackend`, classify as `kind: "auth_expired"`, translate into a Slack message with `setup-token` instructions (S5). |
| `gh` CLI authenticated by `GH_TOKEN` via env var may behave differently from interactive `gh auth login` in some edge cases (e.g., 2FA, SSO orgs). | Document in the README: PAT must have SSO authorized for the orgs the operator wants to query. The smoke test covers this. |
| First `setup-token` via Docker requires copying the URL from the terminal to the host browser and pasting the token back into `.env` — annoying flow. | The README documents it explicitly. Accept the rough UX here; it's a one-time setup (and per-renewal). |
| Slack Bolt Socket Mode may have different defaults in 2026 (retry, reconnect, etc.). | Discovery (Task 0). Fallback: use the current Bolt SDK defaults, which are reasonable. |
| `bash` as the only tool is too powerful — a malicious user could do damage. | Today mitigated by: (a) solo workspace = only the operator talks to the bot, (b) container = sandbox without host access beyond mounted volumes, (c) the system prompt instructs to ask for confirmation before destructive commands. Allowlist becomes active the moment the workspace stops being solo. |
| Claude Code plan rate limit may hit under heavy use. | Detect the specific error, warn on Slack ("hit the limit, try later"). Not an MVP blocker — it's clear feedback. |
| Workspace volume may grow unchecked (cloned repos never cleaned). | Out of MVP (Non-Goal #3 implies nothing is cloned in the MVP, since there are no file tools or git ops). Revisit when the dev agent is implemented. |

## Open Questions

None blocking the spec. All decisions were taken during the brainstorming. Items to be confirmed during Task 0 (discovery) may reopen questions — in that case, return to the spec before continuing the plan.

Possible discovery surprises (these are not open questions now, but may become so):

- Is there an official Slack MCP server that simplifies SlackChannel? If so, it drastically reduces adapter code.
- Does Claude Code in 2026 already have a native "server" mode? If so, it could eliminate subprocess-per-request.
- Is Node 22 still LTS? If Node 24 has become LTS, update the base image.
