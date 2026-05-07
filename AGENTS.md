# Zeno — Agent Instructions

Zeno is a personal agent. The operator of this instance is described in `~/.zeno/profiles/<profile>/USER.md` (off-repo, owner-only). The canonical scaffold lives at `templates/profile/USER.md`; the `zeno` CLI substitutes placeholders into the operator's copy on `zeno profile create`. This repo is Zeno's workspace: identity, capabilities, configuration, and operating knowledge.

## Before starting any work

1. **Read `vault/_index/home.md`** for project-specific knowledge.
2. **Read `vault/constitution.md`** for non-negotiable principles.
3. **If asked to implement, modify, or create something**, assess: "Can I describe the complete solution in one sentence?" — **Yes** → implement; **No** → invoke `/brainstorming` → `spec.md` → `/writing-plans` → `plan.md` + `tasks.md` → implement; **Almost** (1-2 open decisions) → ask whether to spec or go direct. If the user is asking, investigating, or exploring — just answer.

## Work ethic — never the lazy path

When you see two ways to do something — quick-and-shallow vs. correct-and-thorough — **default to correct**. You may surface the lighter option with tradeoffs, but never silently pick the worse one to finish faster. Cutting corners now creates work later. If the task is hard, do it right; don't redefine "done" downward.

## When stuck or in doubt — read the vault first

`vault/` is your project brain. Before grinding on a hard problem, before guessing, before asking the user a question whose answer might already be captured: search `vault/learnings/`, `vault/conventions/`, `vault/rules/`, the relevant spec, and `vault/constitution.md`. Use `recall` or grep. Reading the vault is the **first move**, not the last. If it answers the question, cite the note; if it almost does, update the note after you fill the gap.

## After completing any task

If you discovered something non-obvious — a gotcha, constraint, or surprising behavior — create an atomic note in `vault/learnings/` using `vault/templates/learning.md`. Link it to the relevant spec with a wikilink. Do this without asking. Generated/temporary output (screenshots, scratch scripts, dumps) goes under `tmp/` per `vault/rules/generated-files-location.md`.

## After completing a spec

When a spec is shipped (all tasks done, `status: shipped`), always run an explicit reflection step:

1. Ask: "What did I learn implementing this that wasn't obvious from the spec?" Consider gotchas, constraints, surprising library behavior, and decisions that reversed mid-implementation.
2. If there's at least one useful learning, create one atomic note per learning in `vault/learnings/`, link it back to the spec, and add it to `vault/_index/learnings.md`.
3. If nothing non-obvious came up, say so explicitly ("No new learnings from this spec") — silence is not reflection.

## Commands (most used)

Turborepo + `pnpm` workspaces. **Runtime is Docker-only** — use `pnpm run quality-gate` for fast IDE feedback.

The `zeno` CLI is the documented entry point for daily ops. The CLI talks directly to the Docker socket via `dockerode` and stores profile metadata in `~/.zeno/state.db` (drizzle + better-sqlite3).

| Command | What it does |
|---|---|
| `pnpm run quality-gate` | Lint + typecheck + tests across all workspaces. Gates every commit. |
| `zeno profile create <profile> [--owner X]` | Create a new profile (allocates port, generates master key, scaffolds USER.md + .env). |
| `zeno profile list` / `show <profile>` / `delete <profile>` | Inventory + drill-down + tear-down. |
| `zeno profile edit <profile> --port N` | Move a profile's host port. |
| `zeno profile use <profile>` | Set sticky default. |
| `zeno start [profile|--all] [--build]` | Start container(s). Auto-builds `zeno-agent:dev` if missing. |
| `zeno stop [profile|--all]` / `restart [profile|--all]` | Lifecycle. |
| `zeno logs [profile] [--tail N]` | Follow container logs (SIGINT to abort). |
| `zeno open [profile]` | Open the profile's dashboard in the system browser. |
| `zeno doctor` | Preflight diagnostics (docker reachable, DB ↔ Docker drift, etc.). |
| `zeno upgrade [--list / --to / --prerelease / --edge]` | Version pin via `gh release list` + `git checkout` + rebuild. |
| `zeno repo` | Print the canonical repo path. |

Each profile's dashboard binds `127.0.0.1` on a port allocated from `[6101, 6200]` and shown in `zeno profile list`.

## Knowledge locations

| What | Where |
|---|---|
| Non-negotiable principles | `vault/constitution.md` |
| Specs (active + shipped) | `vault/specs/` |
| Architecture, patterns, gotchas | `vault/learnings/` (MOC: `vault/_index/learnings.md`) |
| Code style conventions | `vault/conventions/` (MOC: `vault/_index/conventions.md`) |
| Project rules | `vault/rules/` |
| Spec / note templates | `vault/specs/_template/`, `vault/templates/` |
| Design system | `DESIGN.md` (Imperial Terminal). Spec: `vault/conventions/design-md-format.md`. |
| Dashboard design (Paper) | Paper file `zeno-agent` (`01KPYCJ6QXK8Z1PEVQME9262RP`, page `1-0`). |

## Skills and slash commands

Repo-local skills under `.claude/` for Claude Code only — **not** loaded by Zeno's runtime (runtime skills are DB-managed playbooks per spec 0052/0060).

- **`brainstorming`** — design exploration before a spec.
- **`writing-plans`** — turn an approved design into tasks.
- **`recall`** — quick reconnaissance of `vault/`.
- **`/learn`** — investigate a topic and save a learning note.
- **`/spec`** — promote the current conversation into the spec flow.
- **`/new-issue`** — required for filing GitHub issues. Never run `gh issue create` directly.
- **`/new-pr`** — required for opening PRs. Never run `gh pr create` directly.
