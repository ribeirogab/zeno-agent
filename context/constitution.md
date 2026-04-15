---
status: canonical
created: 2026-04-15
---
# Zerk — Constitution

This document declares the non-negotiable principles of the Zerk project. Everything here has earned its place by being a decision we never want to re-litigate or a constraint we never want to forget. Agents and humans must read this file before making any substantive change.

If you are tempted to violate a rule here, stop and open a discussion first. Never silently work around the constitution.

## Why Zerk exists

Zerk is an agent of Zunix. This repository is its workspace — the place where Zerk's identity, capabilities, configuration, and operating knowledge live.

The project is in an **exploratory phase**. Architecture, stack, and interfaces are still being discovered. The constitution will tighten as decisions are made. Until then, prefer reversible choices and document reasoning in `context/learnings/` so future-you understands why a direction was taken.

## Scope guardrails

- This repo is Zerk's workspace, not Zunix's core infrastructure. Anything generic to Zunix as a whole belongs in a Zunix-level repo, not here.
- No production deployment concerns yet — there is nothing to deploy. When deploy targets are chosen, capture them here.
- Do not add dependencies, tooling, or frameworks without first writing a learning or spec explaining the decision. Premature lock-in is the main risk during exploration.

## Architecture principles

_Not yet decided._ When the first architectural commitments are made (language, runtime, agent framework, storage, etc.), record them here as non-negotiables and drop a matching learning in `context/learnings/` with the reasoning.

Principles to honor until then:

- **Reversibility first.** Prefer choices that are easy to back out of.
- **One decision at a time.** Don't bundle stack choices; each should have its own rationale.
- **Write before you build.** If a solution isn't obvious in one sentence, use the spec flow (`/spec`).

## Tooling and workflow principles

_Not yet decided._ Package manager, linter, formatter, test runner, and CI are all open. When chosen, pin them here.

Workflow principles that already apply:

- **Never push to `main`.** Always branch + PR. Pushing to `main`/`master` is blocked by convention — it triggers deploys/automations (see global rule 20).
- **Use `/open-pr`** to open pull requests. It generates title and description consistently.
- **Explicit consent for `git add`/`commit`/`push`.** No autonomous git writes.
- **Read-only database.** No write queries without approval.

## Spec-Driven workflow

Before implementing any user request, assess whether the solution is obvious. If you cannot describe the complete solution in one sentence, use the Spec Kit flow: brainstorm → `spec.md` → `plan.md` → `tasks.md` → implement. If the solution is obvious, go direct. If almost obvious but with 1-2 open decisions, ask the user whether to spec or go direct.

Specs never get deleted. Shipped specs remain in `context/specs/` as historical record.

## Knowledge layering

- Project-specific knowledge lives in `context/`. Only add notes here for things unique to Zerk.
- Generic patterns that apply to any project should not be duplicated in this vault — they belong in global instructions or the user's global memory.
- When a decision is made about Zerk's stack or architecture, update this constitution **and** write a matching learning explaining the reasoning.

## What this constitution is not

- Not an architecture document. See `context/_index/learnings.md` for architecture notes.
- Not a style guide. See `context/conventions/` for code style conventions.
- Not a spec for any feature. Specs live in `context/specs/`.

This document exists to hold the things that would be catastrophic to forget.
