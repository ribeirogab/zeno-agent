---
status: living
created: 2026-04-16
updated: 2026-04-21
---
# Backlog — ideas, not specs

Running list of things that came up but don't justify a spec yet. Each item should be promoted to `context/specs/NNNN-name/` when (a) the underlying problem is felt in real use, or (b) the scope stops being "nice-to-have" and becomes "blocking something".

Don't build from this file directly. Use it to remember what was discussed and what to watch for.

---

## Tier 1 — Foundation (unblocks everything else)

| # | Feature | Why first | Complexity | Trigger to promote |
|---|---|---|---|---|
| 1 | **Guardrails + approval flow** | Without this, nothing sensitive can be done safely. Blocks worker mode (company Slack) entirely. | Medium | Ready now — worker mode is insecure without it |
| 2 | **File reading** (all channels) | Base for audio, images, documents. Slack already has file upload API. | Small | First time a user sends a file and Zeno ignores it |

### Guardrails — design sketch

- `canUseTool`-style callback in the SDK: before executing a destructive command, Zeno posts "Can I run `X`? 👍/👎" and waits for a reaction.
- **Two approval modes:**
  - **Owner mode** (personal Slack): approval goes to the same thread.
  - **Worker mode** (company Slack): approval goes to the **owner** via DM, not to the employee who asked.
- Configurable in `config.yaml`:
  ```yaml
  approvals:
    mode: worker  # owner | worker
    owner_slack_user_id: U0ABC123
    sensitive_patterns:
      - "aws .* (delete|terminate|stop|modify|create|put)"
      - "gh pr merge"
      - "git push --force"
      - "rm -rf"
  ```
- A skill can declare `read_only: true` in its frontmatter to bypass approval for all its commands (e.g., `acme` is already read-only by IAM policy + skill rules).
- DM pairing / allowlist (inspired by OpenClaw): control which Slack users can talk to Zeno in a shared workspace. Unknown users get ignored or get a "not authorized" reply.

---

## Tier 2 — Multichannel + media

| # | Feature | Dependency | Complexity | Notes |
|---|---|---|---|---|
| 3 | **Telegram channel** | None (ports & adapters ready) | Medium | Bot API is clean; second easiest channel after Slack. Implement the `Channel` interface. |
| 4 | **WhatsApp channel** | None (but needs a provider: Meta Cloud API, Evolution API, or Twilio) | Medium-high | Webhook-based (needs a public URL or tunnel). Consider Evolution API for self-hosted. |
| 5 | **Audio reading** (all channels) | #2 (file reading) + speech-to-text (Whisper API or similar) | Medium | Killer feature for mobile. User sends voice note → Zeno transcribes → processes as text. |
| 6 | **Audio sending** (all channels) | Text-to-speech (OpenAI TTS, ElevenLabs, etc.) | Medium | Closes the voice loop. Zeno replies with audio when the user sent audio. |
| 7 | **Image generation** | Prompt → image API (DALL-E, Flux, etc.) | Small | High visual impact. Could be a built-in skill or MCP server. |

### Multichannel design notes

- Each new channel implements the `Channel` interface (`start`, `send`, `react`, `unreact`, `stop`).
- Slash commands should work cross-channel. Inspired by Hermes's `COMMAND_REGISTRY` — one source of truth, each channel adapter maps to its native dispatch (Slack `/command`, Telegram `/command`, WhatsApp keyword trigger).
- File/audio/image handling should be channel-agnostic: each adapter normalizes attachments into a common `Attachment` shape (type, buffer, mime, filename) before passing to the agent core.

---

## Tier 3 — Intelligence and memory

| # | Feature | Inspiration | Complexity | Notes |
|---|---|---|---|---|
| 8 | **Session memory (cross-turn search)** | Hermes (FTS5 + session search) | Medium | "What did I ask Zeno last week about the deploy?" — requires full-text index on session messages. |
| 9 | **User modeling** | Hermes (Honcho — dialectic model of who the user is) | High | Zeno builds an evolving understanding of the user's preferences, projects, schedule. Goes beyond static `USER.md`. |
| 10 | **Assisted skill authoring** | Hermes (agent observes → generalizes → proposes skill) | Medium | "Zeno, I keep doing X manually" → Zeno proposes a skill draft. Not auto-creation (anti-goal) — always user-initiated, always proposed for approval. |
| 11 | **Cron intelligence** | OpenClaw (crons that suggest themselves) | Low-medium | "You ask about PRs every morning at 9. Want me to create a cron for that?" Pattern detection over conversation history. |

---

## Tier 4 — Operations and observability

| # | Feature | Complexity | Notes |
|---|---|---|---|
| 12 | **Dashboard: skills viewer** | Small | List installed skills per profile, show descriptions, last-invoked timestamp. |
| 13 | **Dashboard: profile switcher** | Small | Switch between profile dashboards (different ports today; could be unified). |
| 14 | **Cost tracking** | Medium | Token usage per session/cron/skill. Inspired by Hermes's iteration budget. Surface in dashboard. |
| 15 | **Audit log** | Medium | Who asked what, when, which tools ran, what was the outcome. Critical for worker mode (company Slack). |
| 16 | **Dashboard chat** | Medium-high | Talk to Zeno from the browser, not just Slack. Requires IPC between API and worker + a `WebChannel` adapter. |

---

## Future ideas (park here, don't build)

| Idea | Source | Value | When |
|---|---|---|---|
| ACP adapter (VS Code / Cursor / JetBrains) | Hermes | Talk to Zeno from the IDE | When "Zeno as dev agent" is the primary use case |
| Context compression | Hermes | Long sessions get expensive; compress while keeping relevant info | When cost becomes painful |
| Notification routing | OpenClaw | "Send on Telegram if I don't reply on Slack in 5min" | When tier 2 channels are stable |
| Scheduled visual reports | — | Crons that generate interactive HTML dashboards (via Playwright) | When Playwright skill is battle-tested |
| Multi-backend (Codex, Gemini) | Constitution (ports & adapters) | Alternative reasoning engines | When a concrete use case appears (cost, capability, availability) |
| Plugin system | OpenClaw (ClawHub) | Third-party skill distribution | When the skill ecosystem is mature enough to share |

---

## Recommended execution order

```
1. Guardrails + approval flow     ← gates worker mode safety
2. File reading                   ← unblocks audio/docs/screenshots
3. Telegram channel               ← second channel, clean API
4. Audio reading                  ← killer feature for mobile
5. WhatsApp channel               ← third channel, more complex
6. Audio sending                  ← closes voice loop
7. Image generation               ← simple, high impact
8+ Memory / modeling / audit       ← when the basics are solid
```

Guardrails is the gating item — without it, scaling to a company Slack is insecure.

---

## Dashboard polish (carried over, lower priority)

| Idea | Trigger to promote | Notes |
|---|---|---|
| Pagination UI for Crons/Sessions list | >50 items OR scroll fatigue | API already accepts `limit`/`offset`. |
| Session filters (channel, date) | "I can't find the thread from yesterday" | Ordered `last_used_at DESC` today. |
| Edit cron via UI | Slack-based editing feels slow | Form ~identical to create. |
| Playwright e2e suite | Regressions between phases | 5 canonical flows. |
| Mobile / responsive layout | Dashboard used from a phone | Designed at 1440×900; responsive is a real spec. |

## Tech debt (carried over)

| Item | Where | When to revisit |
|---|---|---|
| Legacy `any` + `// biome-ignore` violations (~10) | `apps/worker/src/{agent,channels}` | When touching those files for another reason. |
| Worker tsconfig strictness flags disabled | `apps/worker/tsconfig.json` | Same trigger. |
| Watcher test flaky ~1/5 on macOS | `apps/worker/tests/profile/watcher.test.ts` | If it starts failing CI consistently. |
| `loadMcpConfig` duplicated between worker and api | `apps/worker/src/agent/mcp.ts` + `apps/api/src/lib/mcp-snapshot.ts` | When a third consumer appears. |
