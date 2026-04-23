---
status: living
created: 2026-04-16
updated: 2026-04-23
---
# Backlog — ideas, not specs

Running list of things that came up but don't justify a spec yet. Each item should be promoted to `context/specs/NNNN-name/` when (a) the underlying problem is felt in real use, or (b) the scope stops being "nice-to-have" and becomes "blocking something".

Don't build from this file directly. Use it to remember what was discussed and what to watch for.

---

## Tier 0 — Pre-release (mandatory before open-source)

| # | Feature | Complexity | Notes |
|---|---|---|---|
| 1 | **Dashboard testing + improvements** | Medium | Dashboard isn't well tested. Increase coverage, make it actually useful day-to-day. |
| 2 | **Cron testing** | Small-medium | Crons were implemented but need thorough testing to confirm reliability. |
| 3 | **Full regression test** | Medium | Test everything end-to-end. Guardrails, file reading, sessions, crons, dashboard, approvals — make sure nothing is broken. |
| 4 | **Rebranding** | Medium | Current design is based on Claude Code with zero personality. Needs original identity — colors, typography, logo, dashboard look & feel. |
| 5 | **Documentation site (`apps/docs`)** | Medium | Create a docs app with how to install, configure, create profiles, write skills, use the dashboard. |
| 6 | **Onboarding / setup experience** | Small | Interactive `scripts/setup.sh` that guides first-time users through Docker, tokens, profile, Slack manifest. |
| 7 | **Error resilience** | Medium | What happens when Slack disconnects mid-session? SDK crash? Container restart? Test and ensure graceful recovery. |
| 8 | **README de qualidade** | Small | GIF/video demo, badges, "why Zeno?", quick-start in 3 steps. Must sell the project. |
| 9 | **CI on GitHub** | Small | `.github/workflows/quality-gate.yml` running lint + typecheck + test on every PR. |
| 10 | **Open-source essentials** | Small | LICENSE (MIT), CONTRIBUTING.md, CODE_OF_CONDUCT.md, issue/PR templates, scrub internal references from specs/learnings. |

---

## Tier 1 — Multichannel + media

| # | Feature | Dependency | Complexity | Notes |
|---|---|---|---|---|
| 11 | **Telegram channel** | None (ports & adapters ready) | Medium | Bot API is clean; second easiest channel after Slack. Implement the `Channel` interface. |
| 12 | **WhatsApp channel** | None (but needs a provider: Meta Cloud API, Evolution API, or Twilio) | Medium-high | Webhook-based (needs a public URL or tunnel). Consider Evolution API for self-hosted. |
| 13 | **Audio reading** (all channels) | File reading (shipped) + speech-to-text (Whisper API or similar) | Medium | Killer feature for mobile. User sends voice note → Zeno transcribes → processes as text. |
| 14 | **Audio sending** (all channels) | Text-to-speech (OpenAI TTS, ElevenLabs, etc.) | Medium | Closes the voice loop. Zeno replies with audio when the user sent audio. |
| 15 | **Image generation** | Prompt → image API (DALL-E, Flux, etc.) | Small | High visual impact. Could be a built-in skill or MCP server. |

### Multichannel design notes

- Each new channel implements the `Channel` interface (`start`, `send`, `react`, `unreact`, `stop`).
- Slash commands should work cross-channel. Inspired by Hermes's `COMMAND_REGISTRY` — one source of truth, each channel adapter maps to its native dispatch (Slack `/command`, Telegram `/command`, WhatsApp keyword trigger).
- File/audio/image handling should be channel-agnostic: each adapter normalizes attachments into a common `Attachment` shape (type, buffer, mime, filename) before passing to the agent core.

---

## Tier 2 — Intelligence and memory

| # | Feature | Inspiration | Complexity | Notes |
|---|---|---|---|---|
| 16 | **Session memory (cross-turn search)** | Hermes (FTS5 + session search) | Medium | "What did I ask Zeno last week about the deploy?" — requires full-text index on session messages. |
| 17 | **User modeling** | Hermes (Honcho — dialectic model of who the user is) | High | Zeno builds an evolving understanding of the user's preferences, projects, schedule. Goes beyond static `USER.md`. |
| 18 | **Assisted skill authoring** | Hermes (agent observes → generalizes → proposes skill) | Medium | "Zeno, I keep doing X manually" → Zeno proposes a skill draft. Not auto-creation (anti-goal) — always user-initiated, always proposed for approval. |
| 19 | **Cron intelligence** | OpenClaw (crons that suggest themselves) | Low-medium | "You ask about PRs every morning at 9. Want me to create a cron for that?" Pattern detection over conversation history. |

---

## Tier 3 — Operations and observability

| # | Feature | Complexity | Notes |
|---|---|---|---|
| 20 | **Dashboard: skills viewer** | Small | List installed skills per profile, show descriptions, last-invoked timestamp. |
| 21 | **Dashboard: profile switcher** | Small | Switch between profile dashboards (different ports today; could be unified). |
| 22 | **Cost tracking** | Medium | Token usage per session/cron/skill. Inspired by Hermes's iteration budget. Surface in dashboard. |
| 23 | **Audit log viewer** | Medium | Who asked what, when, which tools ran, what was the outcome. Critical for worker mode (company Slack). |
| 24 | **Dashboard chat** | Medium-high | Talk to Zeno from the browser, not just Slack. Requires IPC between API and worker + a `WebChannel` adapter. |

---

## Future ideas (park here, don't build)

| Idea | Source | Value | When |
|---|---|---|---|
| ACP adapter (VS Code / Cursor / JetBrains) | Hermes | Talk to Zeno from the IDE | When "Zeno as dev agent" is the primary use case |
| Context compression | Hermes | Long sessions get expensive; compress while keeping relevant info | When cost becomes painful |
| Notification routing | OpenClaw | "Send on Telegram if I don't reply on Slack in 5min" | When tier 1 channels are stable |
| Scheduled visual reports | — | Crons that generate interactive HTML dashboards (via Playwright) | When Playwright skill is battle-tested |
| Multi-backend (Codex, Gemini) | Constitution (ports & adapters) | Alternative reasoning engines | When a concrete use case appears (cost, capability, availability) |
| Plugin system | OpenClaw (ClawHub) | Third-party skill distribution | When the skill ecosystem is mature enough to share |

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
