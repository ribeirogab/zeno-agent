---
tags:
  - learning
  - reference
related:
  - "[[openclaw-architecture]]"
  - "[[hermes-architecture]]"
  - "[[workspace-markdown-files-pattern]]"
created: 2026-04-15
status: superseded
superseded_by: 0049
---

> **Superseded** by spec [[../specs/0049-zeno-redefinition/spec|0049-zeno-redefinition]] (connectors-only positioning). Skills were removed from Zeno's runtime in this batch; if they return, the standard they follow is a future decision. See [[connectors-only-pivot]] for context, and [[how-to-read-pre-cleanup-specs]] for how to read this file as historical record.
# Agent Skills — agentskills.io open standard

Agent Skills (`agentskills.io`, spec at `agentskills.io/specification`, repo `github.com/agentskills/agentskills`) is the emerging **open, portable standard** for defining AI-agent capabilities as markdown-plus-scripts bundles. Published by Anthropic under Apache 2.0 (code) and CC-BY-4.0 (docs); adopted within days by Microsoft (VS Code + GitHub Copilot), OpenAI (Codex CLI + ChatGPT), Cursor, Amp, Goose, OpenCode, Letta, and others. Both OpenClaw and Hermes support it natively.

## Context

Studied 2026-04-15 as part of competitive analysis. If Zeno is going to have "skills" beyond what comes for free from Claude Code, adopting this standard means any skill written for Zeno works for Claude Code, Codex, Cursor, Goose, etc. — and vice versa.

## How to Apply

**Skill = directory containing `SKILL.md` + optional files:**
```
my-skill/
├── SKILL.md          # required; YAML frontmatter + markdown body
├── scripts/          # optional executable files (shell/python/etc.)
├── references/       # optional reference docs
└── assets/           # optional static resources
```

**Frontmatter constraints (per the spec):**
- `name`: lowercase letters, digits, hyphens only. **Max 64 chars.**
- `description`: **Max 1024 chars.** Plain text.
- File MUST be named exactly `SKILL.md` (case-sensitive).

**Minimal example:**
```markdown
---
name: open-pr
description: Open a well-formed pull request from the current branch, generating title and description from the diff
---

# Open PR

When the user asks you to "open a PR" or "create a PR":

1. Verify current branch is not `main`/`master`.
2. Run `git log main..HEAD --oneline` to see commits.
3. Run `git diff main..HEAD --stat` for scope.
4. Generate title (≤70 chars) + body (Summary + Test plan sections).
5. Use `gh pr create` with `--title` and `--body`.
6. Return the PR URL.

## Constraints

- Never push to main/master.
- Use conventional commit prefixes.
- Include "Co-authored-by" only if the user explicitly asks.
```

**How agents discover skills:**
- Typical: directory scan at startup (e.g., `~/.zeno/skills/` or `zeno-skills/` in the repo).
- Agent reads frontmatter → builds an index → loads full SKILL.md content on demand (when user request matches description).
- The `description` field is the routing mechanism — the agent reads it to decide if the skill applies.

**How agents invoke skills:**
- Contents of SKILL.md are injected into context (either appended to system prompt or as a user message) when matched.
- Scripts/references/assets become available for the agent to read/run.

**Why this matters vs custom tools:**
- **Portable**: write once, use in any compliant agent.
- **No code**: markdown-driven; zero compilation or registration.
- **Discoverable**: description field = natural-language routing.
- **Composable**: a skill can reference another via relative path.

**Practical notes (applicable to Zeno):**
- Skills file location in Zeno should be mounted read-only at runtime (like `USER.md`), not baked into the image (so you iterate without rebuilding).
- Skills augment the agent; they don't replace the system prompt. Keep the base prompt in code, skills in markdown.
- The `description` field is used by the LLM itself to pick the skill — write it like a router rule, not a tagline.
- Don't bundle secrets in skills (they're markdown, likely checked into repos).

**Reference implementations:**
- Anthropic reference SDK + validation tooling: `github.com/agentskills/agentskills`.
- Real skill libraries: `github.com/mergisi/awesome-openclaw-agents` (187 templates, OpenClaw-flavored but structurally compatible).
