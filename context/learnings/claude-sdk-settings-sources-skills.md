---
tags:
  - learning
  - gotcha
related:
  - "[[../specs/0021-agent-profile-split/spec|spec 0021]]"
  - "[[claude-agent-sdk-typescript]]"
created: 2026-04-21
---
# Claude Agent SDK does NOT auto-discover skills — `settingSources` is required

The Claude Code CLI auto-discovers skills from `~/.claude/skills/` and `.claude/skills/` (project-level). The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) does **not** — by default `settingSources` is `[]`, meaning no filesystem settings are loaded.

## Context

Discovered during spec 0021 (agent/profile split). Built-in skills existed in `profile/skills/` but the SDK never loaded them. Investigation of `sdk.d.ts` (line 2838-2840) confirmed the default is empty.

## How It Works

`settingSources` accepts `'user' | 'project' | 'local'`:
- `'user'` → loads `~/.claude/settings.json` + `~/.claude/skills/`
- `'project'` → loads `.claude/settings.json` + `.claude/skills/` relative to `cwd`
- `'local'` → loads `.claude/settings.local.json`

Skills placed at `~/.claude/skills/<name>/SKILL.md` are auto-discovered when `'user'` is in the array.

## How to Apply

When using the SDK's `query()` function, always set `settingSources: ['user']` (at minimum) in the options if you want skills to be visible. In Zeno, this is set in `apps/worker/src/agent/backends/claude-code.ts`.

If running inside Docker, bind-mount the skills directory to `/home/node/.claude/skills/` (the home dir of the container user). Zeno uses an entrypoint script that symlinks from both `agent/skills/` and `profiles/<name>/skills/` into this path, merging built-in and user skills.
