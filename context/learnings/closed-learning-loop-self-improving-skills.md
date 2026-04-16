---
tags:
  - learning
  - concept
related:
  - "[[hermes-architecture]]"
  - "[[agent-skills-open-standard]]"
  - "[[lessons-for-zeno-from-openclaw-hermes]]"
created: 2026-04-15
---
# Closed learning loop — Hermes' self-improving skills

Hermes Agent's signature bet: a **closed learning loop** where the agent observes its own behavior, distills successful patterns into reusable skills (Python procedures), and iteratively improves those skills as they're used. Combined with Honcho dialectic user modeling — a deepening profile of *who you are* across sessions — this makes Hermes the only studied agent that genuinely gets better at serving you the longer it runs.

## Context

Studied 2026-04-15 during competitive analysis. This is the architectural feature Hermes markets most aggressively ("the agent that grows with you"). Worth understanding carefully before deciding whether Zeno needs it.

## How to Apply

**The loop (simplified):**

```
┌──────────────────┐
│  Agent executes  │
│  a complex task  │
└─────────┬────────┘
          │ trajectory recorded (tool calls, outcomes)
          ▼
┌──────────────────┐
│  Post-task       │
│  skill synthesis │  ← LLM-in-the-loop proposes:
└─────────┬────────┘    "I did X, Y, Z. Useful pattern?
          │              Encode as skill `<name>` with
          │              these steps?"
          ▼
┌──────────────────┐
│  Skill stored    │
│  ~/.hermes/      │
│  skills/<name>/  │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│  Future request  │
│  matches skill   │  ← description-based routing
│  → auto-loaded   │
└─────────┬────────┘
          │
          ▼
┌──────────────────┐
│  Skill improves  │  ← telemetry from each use:
│  during use      │    success/failure, edge cases,
└──────────────────┘    refinement suggestions.
```

**Honcho dialectic modeling** is a separate but complementary system: builds a "theory of the user" by treating each interaction as evidence that updates a persistent profile. Over weeks, the agent knows you prefer Portuguese, hate long preambles, work mainly in TypeScript, and your main personal repo.

**What's actually in a Hermes skill:**
- Python procedure (not just markdown prompt) — runnable code.
- Metadata (name, description, routing hints).
- Tests / checks (per RL environment integration).
- Conforms to agentskills.io format for portability (see `[[agent-skills-open-standard]]`).

**Why this is hard:**
1. **Trajectory recording** — need to log every tool call, input, output, outcome, without polluting prompt.
2. **Skill synthesis** — requires another LLM pass to propose the skill; the proposed skill might be wrong/over-specific/under-specific.
3. **Safe execution** — agent-generated code must run in sandbox; Hermes has 6 terminal backends to route risky code to isolated environments.
4. **Invalidation** — when the world changes (library upgrade, API breaks), the skill breaks silently. Need failure signal + repair loop.
5. **Overfitting** — skill created from one success may not generalize. Need diversity of examples before promoting.
6. **Prompt caching preservation** — Hermes explicitly forbids loading skills mid-conversation because it breaks Anthropic's cache. Skills must be decided up front, not discovered on the fly.

**When this is worth adopting:**
- Agent serves **repeatable workflows** (daily standup summaries, weekly PR reviews, common debugging patterns).
- Usage is **high-frequency** enough that learning pays off (hundreds of interactions, not dozens).
- You have **observable outcomes** (tests pass / fail, PRs merged / closed, reviews helpful / not) to tell the learning system what "good" means.

**When it's overkill (Zeno today):**
- Zeno's job is to **route** user requests to `gh` or `git` commands via Claude. Claude already generalizes these calls; manufacturing a "skill for listing repos" is redundant with Claude's own knowledge.
- Single-user scope means reward signal is sparse (one person's judgment); hard to improve.
- The complexity of trajectory recording + skill synthesis + backend routing dwarfs current Zeno codebase.
- Claude Agent SDK doesn't expose trajectory hooks in a way that makes this easy.

**A lighter alternative for Zeno (recommended):**

Instead of agent-synthesized skills, start with **user-authored skills** in `skills/` following `SKILL.md` format. Concrete:

1. User notices they keep asking "@zeno abre PR seguindo minha convenção". They author `skills/open-pr/SKILL.md` once, describing the convention in markdown.
2. Agent sees the skill, applies it consistently.
3. No learning loop — just static documentation of patterns the user has observed.

This captures 80% of the value of Hermes' self-improving skills with 5% of the complexity. Upgrade to closed-loop learning only if/when:
- You have 50+ skills in the library (scale justifies automation).
- You notice the same "I should write a skill for this" thought repeatedly (automate the authoring).
- Claude Agent SDK or a successor exposes trajectory APIs cleanly.

**Decision for Zeno now:** defer self-improving skills. Adopt user-authored SKILL.md format instead. Revisit if/when scale justifies.
