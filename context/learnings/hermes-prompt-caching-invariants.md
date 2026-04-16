---
tags:
  - learning
  - gotcha
related:
  - "[[hermes-architecture]]"
  - "[[claude-agent-sdk-typescript]]"
created: 2026-04-15
---
# Hermes' prompt-caching invariants — what NOT to do mid-conversation

Hermes Agent maintains Anthropic prompt caching aggressively because cache misses multiply cost. Their dev docs call out a hard rule that applies equally to Zeno: **never alter past context mid-conversation.** Specifically: no toolset changes, no memory reloads, no system-prompt rebuilds between turns of the same conversation. The ONLY permitted exception is explicit context compression.

## Context

Discovered 2026-04-15 in the Hermes `AGENTS.md` / development guide. Surfaced here because Zeno may be tempted to do these exact things as "features" (dynamically load skills per turn, refresh USER.md every message, etc.) and would silently burn money.

## How to Apply

**Anthropic prompt cache basics:**
- Up to 4 cache breakpoints per request.
- Cache stays warm for ~5 minutes after last read.
- Cached tokens cost ~10× less to read than write; 10× less than uncached input.
- **A cache hit requires a byte-exact prefix match** up to each breakpoint.

**What "altering past context mid-conversation" means (things to avoid):**

1. **Changing the toolset mid-session.** If turn 1 exposes `[Bash, Read]` and turn 2 exposes `[Bash, Read, Glob]`, the tool-definition block in the system prompt changes — cache invalidates from that byte onward. All subsequent reads are uncached.

2. **Reloading memory files mid-session.** If USER.md changes on disk and turn 3 re-reads it, any byte difference breaks cache. (Zeno reads USER.md once at boot — good.)

3. **Rebuilding system prompt per turn.** If you do `buildSystemPrompt(userMd, currentTimestamp)`, the timestamp breaks cache every turn. **Build ONCE at boot, keep static.**

4. **Appending dynamic rules per turn.** Same failure mode — any change in the system prefix kills cache.

**The ONE permitted exception: context compression.**
When the conversation grows too long to fit in the model's context window, you compress: summarize old messages, replace them with a shorter summary. This inherently breaks cache for that turn — but you pay the miss once in exchange for fitting new content. Hermes has a dedicated `context/context_compressor.py` module precisely because this is the only time cache-breaking is acceptable.

**Zeno's current state (2026-04-15):**
- System prompt built ONCE at boot by `buildSystemPrompt(userMdContent)`. ✅ Cache-safe.
- USER.md read ONCE at boot. ✅ Cache-safe.
- `allowedTools` hardcoded in `ClaudeCodeBackend` constructor. ✅ Cache-safe.
- No mid-conversation context mutation anywhere. ✅ Cache-safe.

**Zeno's exposure when adding features:**

Be careful when designing:

- **Skills dynamic loading** — if the agent sees the catalog of skills differ from turn to turn (e.g., you installed a new skill mid-session), cache breaks. Solution: load skills at boot, don't hot-reload. Require container restart to pick up new skills.

- **User preference updates** — same story. USER.md change → needs restart.

- **Conversational thread sessions** (future feature) — stateful threads preserve history but the initial system prompt + tools must stay identical across turns in the same thread. Build once per thread-first-message, reuse for rest.

- **Approval prompts that alter context** — if rejecting a tool call changes what the agent can see next turn, you're breaking cache. Keep the tool list stable; use `canUseTool` callback to deny at call time without changing the exposed toolset.

**Debug signal:** cache-miss rates are visible in Claude's billing. If you see usage explode after a feature launch, the first thing to audit is whether the system prompt or tool list changed between turns.

**Rule of thumb:** treat the system prompt + tool definitions + USER.md as *read-only after boot*. Feature changes that want to mutate them require restart. This is a constraint, not a limitation — it's actually easier to reason about.
