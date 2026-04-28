---
status: draft
feature: zeno-redefinition
created: 2026-04-27
shipped: null
---
# Zeno Redefinition — Connectors-Only Positioning — Spec

**Status:** Draft
**Scope:** Realign the project's identity documents around the new "connectors-only" thesis: connectors are the single capability surface, the channel (Slack today, others later) is the I/O boundary, skills are deferred. Anchor the change in `agent/SOUL.md`, `context/constitution.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`, the GitHub repo "About" tagline, and supersede-marking of the **learnings** whose substance is the old thesis (the **specs** describing the old code — 0023, 0028, 0047 — are superseded by spec 0050 when their implementation is actually removed; out of scope here).

## Context

Up to this point Zeno's positioning has been "**a personal agent whose intelligence lives in the skills its owner authors**". This shaped every layer:

- `agent/SOUL.md` instructs the runtime agent to "match request to skill, follow skill"
- `context/constitution.md` declares "skills are the product", "skill layer wins", "Zero custom tools by default. Capabilities come from Claude Code's built-in toolset (`Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`)"
- `README.md` opens with "intelligence lives in the skills you author"
- Specs 0023 (guardrails-approval), 0047 (always-sensitive-db-ui), 0028 (skill-final-reaction) and ~17 learnings derive from this thesis
- The chat backend can run shell commands, read/write files, fetch URLs etc. — capabilities flow from Claude Code's built-in toolset, with skills directing how to use them

This positioning has produced concrete operational problems documented in `tmp/qa-findings-batch-2.md`:

- The agent claims access to GitHub orgs that have no current installation, sourcing the claim from skill markdown rather than runtime state (qa-findings #3, #4).
- Two incompatible mechanisms of "how Zeno acts on GitHub" exist: (a) shell `gh` commands using a per-installation env var the operator picks (#7), and (b) MCP tools exposed by the github-mcp-server connector — the second is sufficient and the first is vestigial (#8).
- Skill content drifts from runtime reality (skill files referencing env vars no longer set, repo lists no longer accurate).

The user has decided to pivot the architecture so that **all interaction with the external world goes through a connector** (an MCP server installed via the dashboard). The channel (Slack today; Discord/email/etc. tomorrow) is the only non-connector I/O — and only because it is the channel itself, not a tool the agent uses. Skills (per-domain knowledge) are deferred from the runtime; they may return later, possibly bundled with connectors. The full reasoning, alternatives considered, and follow-up touch-points live in `tmp/qa-findings-batch-2.md` (gitignored — not part of the codebase).

Shipping this redefinition in **documentation first** anchors the contract before the code cleanup happens. Specs 0050 (skills + classifier removal) and 0051 (connector ergonomics: drop envVar customization, remove rotate-PEM, fix uninstall UX) implement the cleanup against the redefinition this spec lands.

## Problem Statement

Five anchor documents (`agent/SOUL.md`, `context/constitution.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`) currently declare a thesis ("intelligence lives in skills") that the project has decided to abandon. Three specs (0023, 0028, 0047) and ~17 learnings prescribe behaviors and patterns derived from that thesis. The GitHub repo's public "About" tagline still echoes the old thesis. Without realigning these artifacts, every future agent reading the project will reintroduce the old vocabulary and patterns by inertia, and external readers landing on the README will form a wrong mental model.

## Non-Goals

- **Code changes are out of scope.** This spec only edits markdown/text. Skill loading, guardrails wrapper, classifier code, approval-rules CRUD, and dashboard UI all stay as-is until specs 0050 and 0051. The docs describe the **intended** state; the cleanup specs implement it.
- **Paper artboard updates are out of scope.** The `Hearty island` Paper file visualizes UI components (e.g. sensitive-tools-section) that will be removed in spec 0050. Updating artboards now would create rework. Artboards are touched in 0050/0051 alongside the UI removals they reflect.
- **Marking specs `0023-guardrails-approval`, `0028-skill-final-reaction`, `0047-always-sensitive-db-ui` as `status: superseded` is OUT OF SCOPE.** These are *implementation* specs whose substance is the runtime code that will be removed in spec 0050. The supersession event is the code removal; their frontmatter flips when 0050 ships, with `superseded_by: 0050`. Spec 0049 only handles the **doc-level thesis** and the **learnings** that derive from it.
- **No backwards-compat migrations.** Learnings marked superseded are not renumbered, moved, or rewritten — they keep historical content intact, gain only a frontmatter status flag.
- **No new conventions or templates.** The spec uses the project's existing template (`context/specs/_template/`), the existing frontmatter convention (`status: canonical | draft | superseded`), and the existing learnings folder structure.
- **No detailed design for skills' future return.** A brief note acknowledges skills are deferred and may return possibly bundled with connectors. Concrete design is for a future spec.

## Constraints

- **Project rule:** *"Specs never get deleted. Shipped specs remain in `context/specs/` as historical record."* Superseded specs stay in place; only their frontmatter changes.
- **Project rule:** Anything that isn't part of the codebase goes under `tmp/` — `tmp/qa-findings-batch-2.md` is gitignored and cannot be linked from committed content as a permanent reference. Any durable lesson in it must be extracted into `context/learnings/`.
- **Constitution principle:** "Reversibility first" — prefer changes that are easy to back out of. Targeted edits beat wholesale rewrite where the structure is sound.
- **Constitution principle:** "One decision at a time" — this spec lands the redefinition only; code cleanup is its own decision (specs 0050/0051).
- **Audience awareness:** the five anchor docs target different readers — `SOUL.md` is the runtime agent itself, `constitution.md` is project maintainers and AI working on the source, `README.md` is the external public, `CLAUDE.md` and `AGENTS.md` are the same content for two ecosystems (Claude Code and the AGENTS.md generic standard) instructing agents that touch the source. Each rewrite must respect its reader.

## User Stories / Scenarios

1. **A future agent (Claude Code or other) opens the repo to do work.** It reads `CLAUDE.md` / `AGENTS.md`, follows the pointer to `context/constitution.md`. The constitution declares connectors as the capability surface; the agent does not propose adding a skill or extending shell-skill patterns when designing new work.

2. **An external reader visits the GitHub repo.** The "About" tagline shows option A: *"Personal agent that operates across the apps you use, by composing connectors you install. Self-hosted."* The README's first paragraph reinforces: this is a personal agent that acts across your apps via composable connectors. They form the right mental model from line 1.

3. **The Zeno runtime agent boots in production.** It loads `SOUL.md` into the system prompt. The new SOUL declares the agent's identity in connector-first language. It does not instruct the agent to "match request to skill" because skills are not a runtime concept right now.

4. **A maintainer reads pre-cleanup learning `context/learnings/agent-skills-open-standard.md`.** The frontmatter shows `status: superseded` and `superseded_by: 0049`. They know the lesson reflects the old thesis without having to read it through. (The implementation specs `0023-guardrails-approval`, `0028-skill-final-reaction`, `0047-always-sensitive-db-ui` get the same treatment in spec 0050, which removes the runtime they describe — out of scope here.)

5. **A future contributor wants to know why the pivot happened.** They find `context/learnings/connectors-only-pivot.md` — a 1-2 page summary capturing the architectural lesson and the durable reasoning, with a pointer back to the originating discussion artifacts.

## Success Criteria

This spec is "done" when ALL of the following observable checks pass:

- [ ] `agent/SOUL.md` no longer mentions skills as a runtime concept; instructs the agent in connector-first language; preserves the "final-message-is-the-reply" mechanic (still operationally true) and the inviolable safety rules (cleaned up to remove obsolete shell-rooted ones).
- [ ] `README.md` opens with tagline A *"Personal agent that operates across the apps you use, by composing connectors you install. Self-hosted."* The introduction (everything before the first `## Project structure` heading) anchors on connectors as the capability surface and describes the 5-layer hierarchy (connectors > channel > backend > core > skills future).
- [ ] `context/constitution.md` "Why Zeno exists" section reflects the new thesis. The "Architecture principles" first section lists the 5 layers correctly and drops the "Zero custom tools by default" bullet. The "Knowledge layering" section's mention of "tools available in the container" is reconciled with connector-only access. The thesis-agnostic sections (Tooling, Spec-Driven workflow, Reversibility first, One decision at a time, scope guardrails, "What this constitution is not") are preserved verbatim.
- [ ] `CLAUDE.md` and `AGENTS.md` workspace-layout tables drop rows referring to `agent/skills/` and `profiles/default/skills/`. Other content unchanged.
- [ ] GitHub repo "About" description equals tagline A.
- [ ] **Learnings** whose substance prescribes Zeno's runtime architecture in terms of skills as a primary capability surface (i.e., learnings that would mislead a future reader into reintroducing skills as canonical) carry frontmatter `status: superseded` and `superseded_by: 0049`. The body of each file stays unchanged. **The implementation produces an explicit list, file by file**, with a one-line rationale per file (why it's superseded vs why it's preserved). A mechanical `grep -l "skill"` is NOT a sufficient predicate: files that mention skills only as third-party context (e.g., describing how Claude Code SDK loads skills, or comparing to other agents like Hermes/openclaw) stay canonical; only files prescribing skills as Zeno's runtime get marked superseded.
- [ ] A new learning `context/learnings/connectors-only-pivot.md` exists. 1-2 pages. Captures the durable architectural lesson (why the pivot, the 5-layer hierarchy, what stays / what goes), referencing specs 0049/0050/0051 as the cleanup arc. Does **not** rely on `tmp/qa-findings-batch-2.md` (gitignored) for any load-bearing content.
- [ ] A new learning `context/learnings/how-to-read-pre-cleanup-specs.md` exists. Short. Tells future readers that specs/learnings dated before this batch and marked `status: superseded` reflect the old "skills as the product" thesis, and how to mentally translate them.
- [ ] No code or config changes (`apps/`, `packages/`, `infra/`, `.env*`, `.yaml`) — verified via `git diff main` showing only `context/`, `agent/SOUL.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`.
- [ ] The mention of `agentskills.io` in README/constitution stays present, but recontextualized: it inspired the open-standard composable-units philosophy, and skills (deferred) may return possibly bundled with connectors.
- [ ] Each anchor doc carries one brief deferred-skills note (a single sentence) so a reader is not surprised by the silence; full design of skills' return is explicitly punted to a future spec.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| The hybrid rewrite (SOUL + README full; constitution targeted) creates inconsistent tone between docs that were rewritten and docs that were patched. | Run a final-pass review reading the 5 docs in sequence (constitution → SOUL → README → CLAUDE → AGENTS) before opening the PR. Adjust phrasing for tone consistency. The implementation requires three consecutive clean review passes on the doc set as a whole before the PR is opened (any finding in a pass resets the counter to zero). |
| Pre-cleanup specs and learnings still describe old patterns and a reader may treat them as canonical. | Two layers of mitigation: (1) frontmatter `status: superseded` + `superseded_by: 0049` on the affected files (machine-greppable, visible in any frontmatter renderer); (2) a dedicated learning `how-to-read-pre-cleanup-specs.md` explaining the convention. |
| The `connectors-only-pivot.md` summary loses fidelity vs. the full `tmp/qa-findings-batch-2.md` discussion. | Accept the trade-off intentionally: full copy of 308 lines of Q&A discussion would be a log not a learning. Summary captures the durable lesson; original lives in `tmp/` (local-only) for the contributor who wrote it. Future contributors get the lesson, not the conversation. |
| The redefinition lands before code cleanup, so for ~1-2 weeks the docs describe a state the code does not match (skill loading still happens, classifier still runs). | Acknowledge in the docs themselves: a note in the new constitution's "Why Zeno exists" or in the new SOUL points at specs 0050 and 0051 as the implementing cleanup. The code state catches up branch-by-branch. |
| Two specs that mention skills heavily (0028 skill-final-reaction, 0021 agent-profile-split) are NOT marked superseded but reference skill content. | 0028 is marked `superseded_by: 0050` (in spec 0050 — out of scope here) because it builds on the runtime skill mechanism that 0050 removes. 0021 is NOT marked superseded — it's about profile-level isolation (Docker compose, env separation) which is independent of skills. Risk accepted. |
| Wikilink rot — the constitution and learnings reference each other via `[[wikilink]]` syntax. Renaming or moving anything breaks links. | This spec **does not move or rename** any file. Frontmatter is the only structural change. Wikilinks survive. |

## Open Questions

None at the time of writing. All seven brainstorming questions (rewrite scope, skills mention, Paper artboards, supersede mechanism, supersede scope, agentskills.io fate, qa-findings archive format) have been resolved with the multi-perspective protocol from `tmp/zeno-cleanup-contract.md` Rule 3 and recorded in this spec.
