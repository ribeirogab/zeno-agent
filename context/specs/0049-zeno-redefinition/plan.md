---
feature: zeno-redefinition
spec: "[[spec]]"
created: 2026-04-27
---
# Zeno Redefinition — Plan

**For this spec:** `[[spec]]`

## Approach

Three sequential phases, ordered so each phase produces a coherent doc base that the next phase can lean on.

**Phase 1 — Define vocabulary.** Edit `context/constitution.md` first because it sets the canonical language ("connector", "channel", "skills (deferred)") that every other doc cites. Targeted surgery on 4 sections (Why Zeno exists / Architecture principles first part / Zero custom tools bullet / Knowledge layering runtime mention). Other constitution sections — Reversibility first / One decision at a time / Tooling lock-in / Spec-Driven workflow / "What this constitution is not" — are preserved verbatim because they are thesis-agnostic and have institutional value.

**Phase 2 — Re-author the agent's self-concept.** Full rewrite of `agent/SOUL.md` (small file, runtime identity, lives entirely inside the new thesis vocabulary defined by constitution). Targeted edits cannot work here: the existing SOUL is "intelligence lives in your skills" from line 1; surgery would leave a Frankenstein.

**Phase 3 — External + maintainer surfaces.** Full rewrite of README's introduction (everything before the first `## Project structure` heading) plus the GitHub repo "About" tagline. Targeted edits to the rest of README (Setup, Docker scripts, Performance, Architecture diagram, Troubleshooting). Targeted single-line edits to `CLAUDE.md` and `AGENTS.md` workspace-layout tables.

After the doc rewrites land, **Phase 4 — Learnings + new artifacts:** mark superseded the learnings whose substance is the old thesis (per-file decision, not mechanical grep), create the two new learnings (`connectors-only-pivot.md` summary + `how-to-read-pre-cleanup-specs.md` reading guide).

The order is forward-only: nothing in phase N depends on phase N+1. If the implementation has to be paused after any phase, the project remains internally consistent.

## Architecture

```
                 ┌─────────────────────┐
   Phase 1 ────▶ │  constitution.md    │  defines canonical vocabulary
                 │  (targeted edits)   │
                 └──────────┬──────────┘
                            │ vocabulary
                            ▼
                 ┌─────────────────────┐
   Phase 2 ────▶ │  agent/SOUL.md      │  runtime self-concept
                 │  (full rewrite)     │
                 └──────────┬──────────┘
                            │ identity
                            ▼
                 ┌─────────────────────┐
   Phase 3 ────▶ │  README §intro      │  external + agent-instr surfaces
                 │  CLAUDE/AGENTS      │
                 │  GitHub "About"     │
                 │  (mixed)            │
                 └──────────┬──────────┘
                            │ doc set complete
                            ▼
                 ┌─────────────────────┐
   Phase 4 ────▶ │  learnings markers  │  historical lineage
                 │  + 2 new learnings  │
                 └─────────────────────┘
```

## File Structure

**Modified (existing files, kept):**

| File | Treatment | Rationale |
|---|---|---|
| `context/constitution.md` | Targeted (4 sections) | Thesis-bearing sections only; rest preserved |
| `agent/SOUL.md` | Full rewrite | Runtime identity; surgery leaves Frankenstein |
| `README.md` | Full rewrite of intro (before `## Project structure`) + targeted on rest | Intro is thesis-pure; setup/docker/troubleshoot survives |
| `CLAUDE.md` | Targeted (workspace layout table only) | Procedural; only `agent/skills/`, `profiles/default/skills/` rows go |
| `AGENTS.md` | Targeted (workspace layout table only) | Identical to CLAUDE.md content |

**Created (new files):**

| File | Purpose |
|---|---|
| `context/learnings/connectors-only-pivot.md` | 1-2 page summary of the durable architectural lesson — why connectors-only, what stays, what goes. Linked from constitution and README. |
| `context/learnings/how-to-read-pre-cleanup-specs.md` | Short reading guide for future contributors landing on superseded specs/learnings. |

**Frontmatter-only changes (no body edits):**

| File | Change |
|---|---|
| Each affected file in `context/learnings/*.md` | Add `status: superseded` and `superseded_by: 0049` |

The exact list of affected learnings is determined during Task 4.1 (per-file decision).

**Untouched in this spec (out of scope, per Non-Goals):**

- All `apps/`, `packages/`, `infra/` files (no code changes)
- `context/specs/0023-*`, `context/specs/0028-*`, `context/specs/0047-*` (deferred to spec 0050)
- `agent/connectors-catalog.json`, `agent/mcp.json`, `agent/config.example.yaml` (not docs)
- Paper "Hearty island" artboards (deferred to specs 0050/0051)
- Any profile under `profiles/<name>/`

**Deleted:** none.

## Phase Ordering

1. **Constitution targeted edits** — establishes vocabulary. Commit.
2. **SOUL.md full rewrite** — runtime identity, consumes constitution vocabulary. Commit.
3. **README intro rewrite + targeted on rest + GitHub About tagline** — public surface. Commit.
4. **CLAUDE.md + AGENTS.md targeted** — agent instructions. Commit.
5. **Learnings supersede pass** — explicit per-file list with rationale; frontmatter-only changes. Commit.
6. **Two new learnings** (`connectors-only-pivot.md`, `how-to-read-pre-cleanup-specs.md`) — historical lineage and reader's guide. Commit.
7. **3-round review on the doc set as a whole** — read all 5 anchor docs in sequence for tone consistency, broken cross-references, leftover skill mentions in non-thesis contexts. Fix-and-restart on any finding (counter resets to zero). Commit fixes if any.
8. **GitHub repo "About" description update** via `gh repo edit --description "<tagline A>"`. Verify.
9. **Push branch + open PR** (after permission per global rule 20).

The 3-round review (Rule 2 of the cleanup contract) gates step 9: PR is not opened until three consecutive review passes find zero issues.

## Risks / Open Decisions

| Risk | Decision / Mitigation |
|---|---|
| The "explicit per-file list with rationale" for learnings supersede pass (Task 4.1) is judgment-based; an over-cautious or under-cautious decision could mismark files. | **Decision:** the predicate is "this learning, if read by a future contributor as canonical, would lead them to reintroduce skills as Zeno's primary capability surface". If the answer is yes → mark superseded. If the file mentions skills only as **third-party context** (Claude SDK behavior, comparing to Hermes/openclaw, agentskills.io as cross-agent standard) → preserve canonical. The implementation produces a table with file + decision + one-line rationale, in `tasks.md` Task 4.1. |
| The constitution's "Tooling and workflow principles" section locks specific tooling (Bash, Read, Write, Edit) as Claude Code's built-in toolset. The new thesis says capabilities only come from connectors, but the constitution will still mention these tools. | **Decision:** the "Tooling and workflow principles" section is about **maintenance** of Zeno's source code, not Zeno's runtime. Bash/Read/Write/Edit are tools the developer uses to maintain the repo, not tools the running agent uses. The new "Why Zeno exists" + "Architecture principles" sections clarify this distinction explicitly. |
| README intro full rewrite may break inbound links from external sources (blogs, social posts, the GitHub repo's pinned issues, etc.). | **Decision:** preserve heading anchors (e.g. `## Setup`, `## Architecture`) and keep the project's name and core proposition recognizable. The first paragraph changes thesis but the README's overall structure is not rebuilt. |
| Frontmatter `superseded_by: 0049` references a spec that hasn't shipped yet at the moment of writing. By the time the supersede pass runs (Task 4.1), the spec exists at `context/specs/0049-zeno-redefinition/spec.md` and is on `main` after this PR merges — so the reference resolves correctly going forward. | **Accepted.** This is a normal forward reference within a single PR. |
