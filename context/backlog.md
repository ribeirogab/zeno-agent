---
status: living
created: 2026-04-16
updated: 2026-04-29
---
# Backlog — ideas, not specs

Running list of things that came up but don't justify a spec yet. Each item should be promoted to `context/specs/NNNN-name/` when (a) the underlying problem is felt in real use, or (b) the scope stops being "nice-to-have" and becomes "blocking something".

Don't build from this file directly. Use it to remember what was discussed and what to watch for.

The **Active roadmap** section below is the exception — that's the committed sprint, in order. Pick from there.

---

## Active roadmap — committed sprint (2026-04-29, last update 2026-04-29 post-cutover)

11 specs, in execution order. Each ships independently. Later specs depend on earlier ones (dep column). Promote each to `context/specs/NNNN-<slug>/` when work starts.

| Order | Spec # | Title | Items covered | Size | Dep | Notes |
|---|---|---|---|---|---|---|
| 1 | **0057** | Slack channel connector — code | partial #6 | XL | — | ✅ **MERGED PR #22.** New `agent/channels-catalog.json`, Slack listener becomes registrable channel-adapter, worker boot reads Slack creds DB-first with `.env` fallback. |
| 2 | **0058** | Migrate profiles/fn to channel connector | rest of #6 | M | 0057 | ✅ **PR #23 OPEN.** Production cutover live (since 2026-04-29T22:13Z). `.env` fallback removed in Phase H. |
| 3 | **0059** | Channels UI section in dashboard | UI for #6 | M | 0057 | **Paper-first.** Adds `/channels` route in dashboard, mirrors `/connectors` pattern (list + install modal). Without this, channel install requires curl — operator can't manage Slack via UI. **Inserted as response to operator gap discovered post-0058 cutover.** |
| 4 | **0060** | Skills multi-file infra | #4a | L | — | DB schema + API multipart upload + materializer + dashboard upload UI + boot seeder. Decision pending on storage shape. |
| 5 | **0061** | Skills best-practices + skill-creator | #4b + #4c | M | 0060 | Apply Anthropic best-practices. Install Anthropic's `skill-creator` from skills.sh. |
| 6 | **0062** | Channel inbound files | #7 | M | 0058 | Worker already downloads Slack attachments; missing pass-through to agent. Standardize via channel adapter. |
| 7 | **0063** | Channel outbound files | #8 | M | 0058 + 0062 | Agent generates HTML/JSON/etc → channel adapter uploads via `files.upload`. |
| 8 | **0064** | UI dashboard cleanup | #1 + #2 + #3 | S | — | **Paper-first.** USER.md name in header; remove Sessions sidebar; fix Playwright logo + description. |
| 9 | **0065** | Settings refactor | #5a + #5b + #5c | M | — | **Paper-first.** Settings becomes tabbed; add USER.md inline editor; remove Restart worker button. |
| 10 | **0066** | Audio in (transcription) | #9 | M | 0062 | Voice notes via Slack → transcribe → text input to agent. |
| 11 | **0067** | Audio out (TTS) | #10 | M | 0063 | Agent generates audio reply → channel uploads. |

### Original raw list (10 items, owner-supplied 2026-04-29)

```
1.  USER.md name in dashboard (instead of "Alex")               → 0064
2.  Remove "Sessions" sidebar entry                              → 0064
3.  Playwright connector default-installed + fix logo + trim     → 0064
4.  Skills:
    a. Support file tree, not just SKILL.md                      → 0060
    b. Read & apply Anthropic best practices                     → 0061
    c. Use Anthropic's skill-creator (skills.sh) as default      → 0061
5.  Settings page:
    a. Layout in tabs                                            → 0065
    b. Edit USER.md from settings                                → 0065
    c. Remove "Restart worker" button                            → 0065
6.  Slack as connector type=channel; future WPP/Telegram         → 0057 (code) + 0058 (cutover)
                                                                   + 0059 (UI to manage them)
    same pattern; remove SLACK_* envvars
7.  Zeno can read incoming files (images, JSON, etc) via channel → 0062
8.  Zeno can send outgoing files via channel                     → 0063
9.  Zeno can listen to / transcribe audio                        → 0066
10. Zeno can send audio                                          → 0067
```

### Architecture decisions baked in

- **0057 split into code + cutover.** Owner uses Zeno daily via Slack; cannot risk breakage during dev. Code lands in worktree (`feat/spec-0057-slack-channel`), tested in-process, no Docker / no profile touched. Cutover (0058) is a separate spec executed live against `profiles/fn`.
- **Channels and connectors are separate concepts.** New `agent/channels-catalog.json` parallel to existing `agent/connectors-catalog.json`. Channels are *substrate* (where the agent runs); connectors are *callable tools* (what the agent invokes). Storage layer compromise — both reuse the existing `connectors` + `connector_secrets` tables with a `kind` discriminator (avoid duplicating storage tables).
- **Channel-first.** 0057+0058 land BEFORE files (0061, 0062) and audio (0065, 0066) so those features are channel-agnostic from day one. Adding WPP/Telegram later = new entry in `channels-catalog.json` + new adapter, no rework on file/audio code.
- **Skills multi-file BEFORE skill-creator.** 0061 needs the multi-file infra (0060) to install Anthropic's skill-creator as a real skill.
- **UI changes are Paper-first.** 0059, 0064, and 0065 all have Phase 0 = update artboards in the "Hearty island" Paper file before any code.
- **0059 inserted post-0058 cutover.** Originally the dashboard UI for channels was deferred to a "future polish spec." After the live cutover landed, the operator immediately hit the gap (no `/channels` route in dashboard means manage-via-curl-only). Promoted to in-sprint.
- **All quick wins go through spec.** Even items 2 and 5c — owner chose spec discipline over chore-PR speed for full traceability.

### Decisions deferred to brainstorming time

- **0060 skills storage shape:** (a) `skill_files` table with one row per file, (b) ZIP body in current `skills.body` column, (c) FS-based with DB metadata + path. Affects spec size significantly.
- **0066+0067 audio providers:** Whisper (OpenAI) vs Deepgram for transcription; ElevenLabs vs Cartesia vs OpenAI TTS for synthesis. Cost vs quality trade-off.

### Items currently NOT in sprint (unblocked by sprint, but future specs)

- Telegram channel — naturally enabled by 0057 (just a new channel-type connector). Promote when prioritized.
- WhatsApp channel — same as above; needs provider decision (Meta Cloud / Evolution / Twilio).
- Image generation — separate spec; could ship as built-in skill or MCP server.

---

## Tier 0 — Pre-release (mandatory before open-source)

| # | Feature | Complexity | Notes |
|---|---|---|---|
| 1 | **Rebranding** | Medium | Current design is based on Claude Code with zero personality. Needs original identity — colors, typography, logo, dashboard look & feel. Using Claude Design for exploration. |
| 2 | **Dashboard testing + improvements** | Medium | Dashboard isn't well tested. Increase coverage, make it actually useful day-to-day. Test on top of the new branding. |
| 3 | **Cron testing** | Small-medium | Crons were implemented but need thorough testing to confirm reliability. |
| 4 | **Full regression test** | Medium | Test everything end-to-end. Guardrails, file reading, sessions, crons, dashboard, approvals — make sure nothing is broken. |
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
| 13 | **Audio reading** (all channels) | File reading (shipped) + speech-to-text (Whisper API or similar) | Medium | Killer feature for mobile. User sends voice note → Zeno transcribes → processes as text. **→ Spec 0065 (active roadmap)**. |
| 14 | **Audio sending** (all channels) | Text-to-speech (OpenAI TTS, ElevenLabs, etc.) | Medium | Closes the voice loop. Zeno replies with audio when the user sent audio. **→ Spec 0066 (active roadmap)**. |
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
