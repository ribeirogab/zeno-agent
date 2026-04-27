---
tags:
  - learning
  - concept
related:
  - "[[openclaw-architecture]]"
  - "[[hermes-architecture]]"
  - "[[agent-skills-open-standard]]"
created: 2026-04-15
status: superseded
superseded_by: 0049
---

> **Superseded** by spec [[../specs/0049-zeno-redefinition/spec|0049-zeno-redefinition]] (connectors-only positioning). The pattern includes `SKILL.md` as part of Zeno's expected workspace shape; skills are no longer a runtime concept. SOUL.md and USER.md remain canonical; references to per-skill markdown reflect the old thesis. See [[connectors-only-pivot]].

# Workspace markdown files — the emerging agent-config lingua franca

Both OpenClaw and Hermes converge on a small set of markdown files that encode agent identity, memory, and user model. These filenames are becoming a de-facto standard across agent ecosystems — using them means portability (Hermes can `claw migrate` from an OpenClaw install and pick up state directly).

## Context

Observed during 2026-04-15 competitive analysis. Zeno already uses `USER.md` and `AGENTS.md` — this note pins down the full convention so future additions align.

## How to Apply

**The canonical files (in order of adoption maturity):**

### `AGENTS.md` — universal entry point for any AI agent working on the repo

Purpose: "when an AI agent loads this repo, read this first to know what it is and how to behave." Not the runtime agent's identity — the development-time agent's briefing.

Common sections:
- Project one-liner
- Pre-work checklist (read X, read Y)
- Decision heuristics (when to spec vs go direct)
- Post-work rituals (write learnings, etc.)
- Pointers to deeper knowledge (`context/`, etc.)

**Zeno status:** ✅ implemented at repo root.

### `SOUL.md` — the runtime agent's personality / identity

Purpose: injected into the system prompt of the **running** agent. Defines role, tone, behavioral guidelines, responsibilities. OpenClaw's primary configuration; central to the "copy a SOUL.md to spin up an agent" paradigm.

Common structure (from `awesome-openclaw-agents` repo):
```markdown
# <Name> - The <Role>

You are <Name>, an AI <role> powered by <platform>.

## Core Identity
- Role: ...
- Personality: ...
- Communication: ...

## Responsibilities
1. ...
2. ...

## Behavioral Guidelines
### Do:
- ...
### Don't:
- ...

## Severity Levels / Categories
- ...

## Example Interactions
...

## Integration Notes
- ...
```

**Zeno status:** ❌ doesn't exist; the runtime agent's identity lives inline in `src/agent/system-prompt.ts`. See `[[lessons-for-zeno-from-openclaw-hermes]]` for the case for extracting it to `SOUL.md`.

### `USER.md` — profile of the person the agent serves

Purpose: injected into system prompt so the agent knows who it's talking to. Name, preferences, context. Gitignored typically (personal data).

**Zeno status:** ✅ implemented; `USER.example.md` committed template, `USER.md` gitignored and mounted read-only into the container.

### `MEMORY.md` — durable facts the agent has learned

Purpose: persistent across sessions. Facts like "user prefers PT-BR", "their main project is X", "last week they tried Y and it failed". Agent can read and (with approval) write.

**Zeno status:** ❌ not implemented; no persistent memory yet. Relevant future work.

### `TOOLS.md` — reference of tools available, in human terms

Purpose: sometimes injected alongside SOUL.md, often with examples. Helps the agent pick the right tool for the job when tool schemas alone aren't enough context. OpenClaw injects this automatically.

**Zeno status:** ❌ not separately written; tool info is embedded in the system prompt today.

### `SKILL.md` (per-skill) — reusable capabilities

Purpose: one per skill directory. YAML frontmatter (name, description) + markdown body. See `[[agent-skills-open-standard]]`.

**Zeno status:** ❌ no skills system yet.

### Zeno's unique additions (not in the "standard"):

- `context/constitution.md` — maintainer-facing principles, NOT runtime-agent-facing.
- `context/specs/` — feature specs, maintainer docs.
- `context/learnings/` — this file, also maintainer docs.

**The maintainer-vs-runtime split:**

Important pattern: keep files that shape **the code-base's evolution** (`context/`, `AGENTS.md` for code-working agents) separate from files that shape **the runtime agent's behavior** (`SOUL.md`, `USER.md`, `MEMORY.md`, `SKILL.md`). Mixing them (as Zeno briefly did when mounting `context/` into the container) pollutes the runtime agent with source-code metadata it doesn't care about.

**Recommended Zeno structure going forward:**
```
/                                # repo root
├── AGENTS.md                    # for dev-time agents working ON Zeno
├── USER.md / USER.example.md    # the runtime user's profile
├── SOUL.md (proposed)           # runtime agent identity, extracted from code
├── MEMORY.md (proposed)         # runtime agent's durable memory
├── skills/ (proposed)           # agentskills.io SKILL.md bundles
├── context/                     # maintainer docs (NOT mounted)
└── src/                         # code
```

**Mounting in container:**
- `USER.md`, `SOUL.md`, `MEMORY.md`, `skills/` → read-only bind-mount into `/app/`.
- `context/` → **not** mounted (maintainer-only).
- `AGENTS.md` → not mounted (it's for agents editing the code, not for the runtime agent).

**Why these names specifically:**
- `AGENTS.md` is becoming a de-facto standard for agent-facing project READMEs (see: Cursor, Claude Code conventions).
- `SOUL.md` is OpenClaw's naming, now adopted by Hermes and the awesome-openclaw-agents ecosystem (187 templates).
- `USER.md` + `MEMORY.md` are Hermes + OpenClaw convention, also in agentskills ecosystem.
- Using these names means any future migration tool (think `hermes claw migrate`) can pick up state without translation.
