# Zeno — Agent Instructions

Zeno is a personal agent. The person who owns this instance is described in `profiles/<name>/USER.md` (gitignored — see `profiles/default/USER.example.md` for the template). This repository is Zeno's workspace — the place where its identity, capabilities, configuration, and operating knowledge live.

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

## Generated / temporary files

Anything you produce that isn't part of the codebase (screenshots, scratch scripts, dumps, browser output) goes under `tmp/`. See `context/rules/generated-files-location.md` for sub-folder conventions.

## Commands

The project is a Turborepo monorepo orchestrated by `pnpm` workspaces. **All runtime is Docker-only** — there are no `pnpm dev`/`start` scripts to run apps locally. Use `pnpm run quality-gate` for fast local IDE-driven feedback.

| Command | What it does |
|---|---|
| `pnpm run quality-gate` | Run lint + typecheck + tests across all workspaces (via `turbo run`). Fast, runs locally, gates every commit. |
| `pnpm run lint` / `pnpm run typecheck` / `pnpm run test` / `pnpm run build` | Individual turbo passes; each fans out to all workspaces. |
| `pnpm run docker:build` | Build the multi-stage container image (shared across profiles). |
| `pnpm run docker:up` / `pnpm run docker:down` | Start / stop the default profile container. Use `PROFILE=<name>` for other profiles. |
| `pnpm run docker:logs` | Tail container logs (`-f`). Output is prefixed `[worker]` / `[api]`. |
| `pnpm run docker:sh` | Open an interactive shell inside the running container. |
| `pnpm run docker:setup-token` | One-time helper to acquire the Claude OAuth token. |

**Dashboard URL (after `docker:up`):** http://localhost:3000

## Workspace layout

```
apps/worker/         Slack listener + cron runner + profile watcher + agent core (Node)
apps/api/            Hono HTTP server + auth + read endpoints + serves dashboard build (Node, port 3000)
apps/dashboard/      Vite + React + TanStack + shadcn SPA (built into static assets)
packages/storage/    @zeno/storage — DB connection + migrations + repos + types
packages/logger/     @zeno/logger — pino factory tipado
infra/               Dockerfile + docker-compose.<profile>.yml + docker.sh + entrypoint.sh
agent/               SOUL.md, mcp.json, connectors-catalog.json (Zeno's identity — shared across profiles)
profiles/default/    .env, USER.md, config.yaml (user config per profile)
context/             Specs, learnings, conventions, rules
```

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
| Design system (tokens + intent) | `DESIGN.md` (root) — Imperial Terminal. Format spec: `context/conventions/design-md-format.md`. Canonical-source rule: `context/rules/design-md-canonical.md`. |
| Dashboard design (Paper artboards) | Paper file `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`). Routes are top-level container artboards in the sidebar. |

## Claude Code skills and commands

These are committed to `.claude/` and provide the project's agentic workflow when working on this codebase via Claude Code. **They are not loaded by Zeno's runtime** — Zeno's runtime skills are DB-managed markdown playbooks materialized to `~/.claude/skills/<name>/SKILL.md` and auto-discovered by the Claude Agent SDK (spec 0052; option wiring fixed in spec 0060). The `.claude/` skills here are a separate repo-local set used only by Claude Code while editing this codebase. See `context/constitution.md` for the broader architecture.

- **`brainstorming`** — design exploration before writing a spec.
- **`writing-plans`** — turn an approved design into a task list.
- **`recall`** — quick project reconnaissance of the `context/` vault.
- **`/open-pr`** — **required** command to open pull requests with auto-generated title and description. Always use this command when creating a PR.
- **`/learn`** — investigate a topic in the project and save findings as a learning note in `context/learnings/`.
- **`/spec`** — take the current conversation and enter the spec flow, skipping already-discussed questions.
