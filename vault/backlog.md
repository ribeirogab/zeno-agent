---
status: living
created: 2026-04-16
updated: 2026-05-04
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
| 2 | **0058** | Migrate sample profile to channel connector | rest of #6 | M | 0057 | ✅ **MERGED PR #23.** Production cutover live (since 2026-04-29T22:13Z). `.env` fallback removed in Phase H. |
| 3 | **0059** | Channels UI section in dashboard | UI for #6 | M | 0057 | ✅ **MERGED PR #24.** Adds `/channels` route in dashboard, mirrors `/connectors` pattern (list + install modal). Operator can manage Slack via UI; closes post-0058 cutover gap. |
| 4 | **0060** | SOUL realign + skill awareness | (bug) | S | — | ✅ **MERGED PR #25.** Wraps `systemPrompt` in `claude_code` preset+append shape so SDK auto-discovers skills + rewrites SOUL.md. Skills back end-to-end. |
| 5 | **0061** | Skills multi-file — Paper artboards | #4a | S | 0060 | ✅ **MERGED PR #26.** Paper-first redesign of Skill detail (file tree + editor), Install modal (zip + fflate preview), Delete modal (cascade preview). |
| 6 | **0062** | Skills multi-file infra (impl) | #4a | L | 0061 | ✅ **MERGED PR #26.** DB metadata + FS-canonical content (no `body` column). Symlink-based materializer. API for upload-zip / per-file CRUD / download-zip. Dashboard file-tree editor. |
| 7 | **0063** | Skills best-practices + skill-creator | #4b + #4c | M | 0062 | ✅ **MERGED PR #29.** Anthropic best-practices applied to runtime skills. `.claude/skills/skill-creator` + `skill-improver` installed for project-local authoring. |
| 8 | **0064** | Channel inbound files | #7 | M | 0058 | Worker already downloads Slack attachments; missing pass-through to agent. Standardize via channel adapter. |
| 9 | **0065** | Channel outbound files | #8 | M | 0058 + 0064 | Agent generates HTML/JSON/etc → channel adapter uploads via `files.upload`. |
| 10 | **0066** | UI dashboard cleanup | #1 + #2 + #3 | S | — | ✅ **MERGED PR #30** (+ follow-ups #31/#32/#33). USER.md name in header, Sessions/Logs hidden from sidebar, Playwright logo + multicolor brand assets fixed. |
| 11 | **0067** | Settings refactor | #5a + #5b + #5c | M | — | ✅ **MERGED PR #30.** Settings tabbed (`profile`/`capabilities`/`backend`/`about`); USER.md inline editor on profile tab; Restart Worker button removed. |
| 12 | **0068** | Audio in (transcription) | #9 | M | 0064 | Voice notes via Slack → transcribe → text input to agent. |
| 13 | **0069** | Audio out (TTS) | #10 | M | 0065 | Agent generates audio reply → channel uploads. |
| 14 | **0071** | Backend auth via dashboard | (post-cutover gap) | XL | — | ✅ **MERGED PR #35.** All Claude config/login moved from `.env` to dashboard. AES-256-GCM envelope encryption + per-profile HKDF DEK; encrypted `backend_credentials` + plain `backend_settings` tables; PTY-based auto-OAuth flow wrapping `claude setup-token`; Anthropic verification handshake with `anthropic-beta: oauth-2025-04-20`; per-profile `claude_home` volume; worker resume-retry on stale session JSONLs. Foundation for #15. |
| 15 | **0072** | Multi-backend: toggle + priority + Codex impl | (new) | XL | 0071 | Per-backend on/off toggle, drag-handle priority order, fallback chain on `auth_expired`/`rate_limited`. **Includes real Codex `AgentBackend` impl** (not placeholder) — spawn, OAuth/key flow, env vars, tool-call protocol — so the second card actually serves traffic. See expanded brief below. |

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

- **0057 split into code + cutover.** Owner uses Zeno daily via Slack; cannot risk breakage during dev. Code lands in worktree (`feat/spec-2026-04-29-slack-channel`), tested in-process, no Docker / no profile touched. Cutover (0058) is a separate spec executed live against the operator's profile.
- **Channels and connectors are separate concepts.** New `agent/channels-catalog.json` parallel to existing `agent/connectors-catalog.json`. Channels are *substrate* (where the agent runs); connectors are *callable tools* (what the agent invokes). Storage layer compromise — both reuse the existing `connectors` + `connector_secrets` tables with a `kind` discriminator (avoid duplicating storage tables).
- **Channel-first.** 0057+0058 land BEFORE files (0061, 0062) and audio (0065, 0066) so those features are channel-agnostic from day one. Adding WPP/Telegram later = new entry in `channels-catalog.json` + new adapter, no rework on file/audio code.
- **Skills multi-file BEFORE skill-creator.** 0061 needs the multi-file infra (0060) to install Anthropic's skill-creator as a real skill.
- **UI changes are Paper-first.** 0059, 0064, and 0065 all have Phase 0 = update artboards in the `zeno-agent` Paper file before any code.
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

### Spec 0072 — multi-backend toggle + priority + Codex impl (expanded brief)

**Status:** in active sprint as line 15. Brainstormed 2026-05-04 with owner. Builds on spec 0071 (backend auth dashboard) which shipped the catalog + encryption + OAuth foundation. Owner expanded scope 2026-05-04: Codex must ship as a working backend in this spec, not a UI placeholder.

**Problem.** Today `backend_settings.active_backend_id` selects exactly one backend (Claude only). When the active backend's token expires or hits a rate limit, the agent simply fails — even if other configured backends could serve the message. Owner wants:

1. Multiple backends configurable at once.
2. Per-backend on/off toggle independent of credential presence ("token saved but paused").
3. An explicit priority order (`1. Claude`, `2. Codex`, …) extensible to N backends. The first enabled+configured backend serves; the next one in the list is fallback.
4. **Codex actually working as the second backend** — not a stub. By the end of the spec, owner can disable Claude and have Codex serve a real Slack message end-to-end.

**Locked design decisions (2026-05-04 brainstorm):**

- **Toggle ≠ delete credential.** `(configured, enabled)` are two independent boolean axes. Disabling a backend keeps the encrypted token in `backend_credentials` so the operator can re-enable later without re-doing OAuth.
- **Fallback fires only on `auth_expired` and `rate_limited`.** Not on `timeout` (don't double the latency), not on `network`/`unknown` (mask bugs noisily). Each new message restarts the chain from priority #1 — no sticky last-used backend.
- **Codex is a real runtime backend in this spec.** Catalog entry + logo (`agent/assets/backends/codex.svg`, saved 2026-05-04) + dashboard card + working `AgentBackend` impl in the worker. Open questions for brainstorm time: which Codex CLI/SDK (OpenAI Codex CLI vs API key path), auth model (subscription token vs flat API key), and how Codex's tool-call protocol maps to the existing `AgentInput`/`AgentOutput` shape.
- **Reorder UX = drag handle inline** on each card. Single visual, no separate "edit priority" mode.
- **Onboarding edge case = banner in `/settings/backend`**, not a forced redirect. If the operator disables the only configured backend, settings shows an inline warning and Slack messages get the existing `NoBackendConfiguredError` reply. `/onboarding/connect-claude` keeps its current "first-time setup" role only.

**Paper artboards required (5 states):**

1. Both Claude + Codex enabled + active (Claude #1, Codex #2).
2. Only Claude enabled (Codex disabled or not configured).
3. Only Codex enabled (Claude disabled).
4. Both disabled — warning banner: "agente parado, habilita um backend".
5. Only Codex configured + enabled (Claude not configured at all).

Plus the reorder interaction (drag handle hover state) and the full "Configure Codex" modal flow (auth field schema, auto-flow if applicable, verification handshake).

**Schema sketch** (defer to spec time, but gives the shape):

- New table `backend_priorities (backend_id PK, priority_idx INTEGER NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1)`.
- Drop `backend_settings.active_backend_id` after migration writes the existing active id at `priority_idx=1, enabled=1`.
- Worker resolves "active backend chain" at the start of each turn: `SELECT backend_id FROM backend_priorities JOIN backend_credentials USING (backend_id) WHERE enabled=1 AND status='active' ORDER BY priority_idx`.

**Out of scope (deliberately deferred):**

- Per-backend rate-limit / cost tracking surfaced in `/stats`.
- "Auto-rotate to cheapest backend that can handle this prompt" — clever but not justified yet.
- Gemini, GPT-4, etc. — same pattern as Codex, ship after this spec proves the multi-backend chain works in production.

**Brainstorm questions to lock before plan:**

- Which Codex distribution to integrate (OpenAI Codex CLI binary vs `@openai/openai` SDK call vs Codex Cloud API). Affects auth (CLI may have its own setup-token flow; SDK uses an API key) and feature parity (CLI gets tool-use natively; SDK requires us to wire the agent loop).
- Does Codex support the same `AgentInput` shape (system prompt + user message + tool definitions + correlation id) or do we need a translation layer in the worker? Likely a translation layer.
- Auto-OAuth flow for Codex — is there an equivalent to `claude setup-token` we can spawn under PTY, or do we paste an API key?
- Drag-handle component: native HTML5 DnD vs `dnd-kit` vs `@formkit/drag-and-drop`. Pick the lightest one that works inside the existing `@zeno/ui` Dialog primitive.

---

## Tech debt (carried over)

| Item | Where | When to revisit |
|---|---|---|
| Legacy `any` + `// biome-ignore` violations (~10) | `apps/worker/src/{agent,channels}` | When touching those files for another reason. |
| Worker tsconfig strictness flags disabled | `apps/worker/tsconfig.json` | Same trigger. |
| Watcher test flaky ~1/5 on macOS | `apps/worker/tests/profile/watcher.test.ts` | If it starts failing CI consistently. |
| `loadMcpConfig` duplicated between worker and api | `apps/worker/src/agent/mcp.ts` + `apps/api/src/lib/mcp-snapshot.ts` | When a third consumer appears. |
