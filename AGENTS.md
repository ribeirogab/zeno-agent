# Zeno — Agent Instructions

Zeno is a personal agent. The person who owns this instance is described in `USER.md` at the repo root — gitignored, see `USER.example.md` for the template and what goes in it. This repository is Zeno's workspace — the place where its identity, capabilities, configuration, and operating knowledge live. The first implementation is underway per `context/specs/0001-slack-zeno-mvp/` (Slack ↔ Claude Code via OAuth ↔ GitHub).

## Before starting any work

1. **Read `context/_index/home.md`** for project-specific knowledge.
2. **Read `context/constitution.md`** for non-negotiable principles.
3. **If the user is asking you to implement, modify, or create something**, assess the request: "Can I describe the complete solution in one sentence?"
   - **Yes** → implement directly.
   - **No** → invoke `/brainstorming` → `spec.md` → `/writing-plans` → `plan.md` + `tasks.md` → implement.
   - **Almost** (1-2 open decisions) → ask the user whether to spec or go direct.

   If the user is asking a question, investigating, or exploring — just answer.

## After completing any task

If you discovered something non-obvious during implementation — a gotcha, a constraint, a surprising behavior — create an atomic note in `context/learnings/` using the template at `context/templates/learning.md`. Link it to the relevant spec with a wikilink if applicable. Do this without asking permission.

## Commands

_No project scripts yet — tooling hasn't been chosen. Update this section when `package.json`, `Makefile`, or similar is introduced._

Full command catalog: `context/learnings/commands-catalog.md` _(create this note after tooling is introduced)_.

## Knowledge locations

| What | Where |
|---|---|
| Non-negotiable principles | `context/constitution.md` |
| Specs (active + shipped) | `context/specs/` |
| Architecture, patterns, gotchas | `context/learnings/` (indexed by `context/_index/learnings.md`) |
| Code style conventions | `context/conventions/` (indexed by `context/_index/conventions.md`) |
| Project-specific rules | `context/rules/` |
| Spec template | `context/specs/_template/` |
| Note templates (learning, rule) | `context/templates/` |

## Claude Code skills and commands

These are committed to `.claude/` and provide the project's agentic workflow.

- **`brainstorming`** — design exploration before writing a spec.
- **`writing-plans`** — turn an approved design into a task list.
- **`recall`** — quick project reconnaissance of the `context/` vault.
- **`/open-pr`** — **required** command to open pull requests with auto-generated title and description. Always use this command when creating a PR.
- **`/learn`** — investigate a topic in the project and save findings as a learning note in `context/learnings/`.
- **`/spec`** — take the current conversation and enter the spec flow, skipping already-discussed questions.
