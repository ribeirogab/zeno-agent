---
status: draft
feature: oss-prep-roadmap
created: 2026-05-04
shipped: null
---
# OSS-Prep — Roadmap Communication — Spec

**Status:** Draft
**Scope:** Ship a public roadmap for outsiders: a curated `ROADMAP.md` at the repo root with Now/Next/Later sections; a `roadmap` issue label; eight initial GitHub issues for the items the maintainer has committed to surface; two repo-local Claude Code slash commands (`/new-issue` and `/new-pr`) that draft and file new issues and PRs in the project's predefined shape; and a privacy move that turns `vault/backlog.md` into a gitignored maintainer-only scratch doc.

## Context

Tracks A, B, D, F of the OSS-prep pipeline have shipped (PRs #1–#4). The repo is sanitized, licensed, community-onboarded, outsider-readable, and has a release flow with a first pre-release (`v2026.5.4`) live. What it lacks is **a public answer to "what is the maintainer planning next"**. Today an outsider opening the repo sees only finished, shipped state. The intent and direction live in `vault/backlog.md`, which is committed but not discoverable (buried under `vault/`, mixes PT-BR and EN, contains internal scratch).

This spec is the next pipeline item, one that was deliberately deferred during Track D (README rewrite). It produces three things at once because they are tightly coupled:

1. **The contract**: `ROADMAP.md` at the root + `roadmap` issue label + eight initial issues for the items the maintainer is willing to surface today.
2. **The privacy move**: `vault/backlog.md` becomes gitignored. It continues to live on the maintainer's disk as scratch (PT-BR/EN flexible, raw ideas, internal sprint planning) but no longer ships.
3. **The slash commands**: `/new-issue` and `/new-pr` — Claude Code slash commands installed in `.agents/commands/` (symlinked to `.claude/commands/`) — that draft and file issues and PRs in the project's shape (Conventional Commits titles, the right templates, the `roadmap` label when applicable, sanitization and quality-gate gates before push).

The eight initial roadmap items, distributed Now/Next/Later by the operator, are:

- **Now (in flight)**: Zeno CLI (replace daily `docker compose`), `apps/docs` minimal scaffold, `apps/web` landing page.
- **Next (committed, soon)**: 0072 Multi-backend toggle + Codex impl, 0064 Channel inbound files, 0065 Channel outbound files.
- **Later (no commitment)**: 0068 Audio in (transcription), 0069 Audio out (TTS).

## Problem Statement

The repo currently has no public-facing roadmap surface. As consequences:

1. An outsider stargazer cannot tell whether the project is alive, paused, or abandoned. There are no in-flight issues, no committed direction, no signal of momentum.
2. Maintainer-side commitment is implicit only — `vault/backlog.md` is the operator's working notebook, not a contract with anyone outside.
3. There is no convention for *creating* issues and PRs in the project's shape. The existing issue templates exist but a Claude/Codex/Cursor agent operating in the repo has to reverse-engineer Conventional Commits, the PR template fields, the sanitization checklist, the quality-gate expectation, and the spec-flow link every time.
4. `vault/backlog.md` is committed and contains operator scratch (mixed PT-BR/EN, internal decisions, half-formed ideas). It is not the contract anyone outside should read, but right now anyone fork-cloning gets it as part of the public surface.

## Non-Goals

- **No GitHub Projects v2 board.** The pinned-doc + `roadmap`-label combo is the chosen surface.
- **No GitHub Discussions** for roadmap ideation. Out of scope for this spec; potentially adopted later if community appears.
- **No milestones.** Zeno is rolling-CalVer (Track F); milestones do not map. The `Now / Next / Later` sections of `ROADMAP.md` carry cohorting.
- **No `priority:*` labels.** YAGNI for a solo project.
- **No `area:*` labels.** YAGNI for a solo project.
- **No automated `ROADMAP.md` updates** (no GitHub Action that mutates the file). The maintainer edits it by hand or via the `/new-pr` command's reminder.
- **No new issue template** for "roadmap item". Existing `feature-request.md` is reused; the `roadmap` label is what distinguishes a triaged-and-committed feature-request from a raw incoming one.
- **No migration of existing `memex-*` commands** to the `.agents/commands/` symlink pattern. Existing files stay as regular files in `.claude/commands/`. `memex-open-pr.md` is legacy; it is being deprecated in a separate change.
- **No deletion of `vault/backlog.md` content** — the file remains on disk; only its committed-status is removed.
- **No rewriting of historical specs that reference `vault/backlog.md`** by path. References in shipped specs stay as text (rendered as code, not as broken hyperlinks); outsiders see opaque text, not 404s.

## Constraints

- **Vault language is English-only** (locked Track A). New committed files (`ROADMAP.md`, `.agents/commands/*`, the spec/plan/tasks artifacts) are EN.
- **No real personal identifiers** in committed prose (per `vault/rules/sanitization.md`). The maintainer's GitHub handle (`ribeirogab`) is allowed in attribution contexts under the rule's existing out-of-scope clause; no other personal name appears.
- **Slash command symlink pattern matches the existing skills pattern.** Real file under `.agents/commands/<name>.md`; `.claude/commands/<name>` (no `.md` suffix) is a relative symlink to `../../.agents/commands/<name>.md`. The same shape is already in use under `.claude/skills/` for `opensource-guide-coach`, `skill-creator`, and `skill-improver` (real files in `.agents/skills/`, symlinked from `.claude/skills/`). `.agents/commands/` does NOT yet exist in the repo and is created as part of this spec; no prior symlink under `.claude/commands/` exists today (the only file there is the legacy `memex-open-pr.md` as a regular file).
- **`ROADMAP.md` issue numbers are placeholders during drafting.** Issues are created first; their real numbers are written into the file before commit. The committed `ROADMAP.md` never has a `#X`/`#TBD` placeholder.
- **Single PR.** All deliverables ship together to avoid a partial state where `ROADMAP.md` references issues that do not exist or where `/new-issue` is shipped before there is a roadmap to file against.

## User Stories / Scenarios

1. **A stargazer opens the repo for the first time.** The README footer points at `ROADMAP.md`. They click, land on a curated three-section list with eight items. They see "Now: Zeno CLI, apps/docs, apps/web" and immediately understand the project is active and what is in flight. They can click any item to read its issue.
2. **An outsider proposes a feature.** They use the existing `feature-request.md` template. The maintainer triages: if accepted, the maintainer adds the `roadmap` label and slots the new issue into `ROADMAP.md`'s Now/Next/Later section. If rejected, the maintainer closes with `wontfix`.
3. **The maintainer (or a Claude/Codex/Cursor agent) wants to file a new issue.** They run `/new-issue` from their editor or the command line. The slash command asks (concisely) for type, title, motivation; selects the right template; adds the `roadmap` label if the operator says yes; runs `gh issue create`; reports the issue number.
4. **The maintainer is opening a PR.** They run `/new-pr`. The slash command verifies the branch is pushed, that `pnpm run quality-gate` is green, that the diff has no obvious sanitization-rule violations, and drafts a PR body matching the project's `PULL_REQUEST_TEMPLATE.md` shape (Summary, Spec / issue, Test plan, Sanitization checkbox, Quality gate checkbox). The title follows Conventional Commits.
5. **A future maintainer brainstorms something internal.** They edit `vault/backlog.md` freely (PT-BR/EN, raw ideas, half-formed). The file is gitignored; nothing leaks. When an idea matures into a public commitment, they run `/new-issue` to surface it, then add it to `ROADMAP.md`.

## Acceptance Criteria

### `roadmap` label

- [ ] A repository label named `roadmap` exists, color `#0e8a16` (green), with description "Tracked on the public roadmap (`ROADMAP.md`)". Verifiable via `gh label list` showing the label, or by visiting `https://github.com/ribeirogab/zeno-agent/labels`.

### Eight initial issues

- [ ] Eight issues are filed against the repo, one per ROADMAP item, each with the `roadmap` label and the `enhancement` label (existing). Each issue's title follows Conventional Commits style:
  - `feat(cli): add zeno CLI to replace daily docker compose`
  - `feat(docs): add apps/docs minimal scaffold`
  - `feat(web): add apps/web landing page`
  - `feat(agent): multi-backend toggle + Codex impl (spec 0072)`
  - `feat(channels): channel inbound files (spec 0064)`
  - `feat(channels): channel outbound files (spec 0065)`
  - `feat(channels): audio in / Slack voice transcription (spec 0068)`
  - `feat(channels): audio out / TTS reply (spec 0069)`
- [ ] Each issue's body contains, at minimum: a one-paragraph description of what the item is and a one-paragraph motivation. Issues created via the existing `feature-request.md` template structure (Description, Motivation / use case, Alternatives considered, Additional context). Where the item maps to a published spec slug (e.g. `0072 multi-backend`, `0064 channel inbound files`, `0065 channel outbound files`, `0068 audio in`, `0069 audio out`), the issue body cites the spec slug in the Additional context field — those slugs survive in the public `vault/specs/` tree even after `vault/backlog.md` is gitignored. The issue body does NOT cite `vault/backlog.md` line numbers (the file is no longer public after this spec ships).
- [ ] Each issue is open. Each issue's `body` field contains no real personal identifier (verifiable via `gh issue view <n> --json body | grep -E 'Gabriel|gblosr'` returning zero matches).

### `ROADMAP.md`

- [ ] `ROADMAP.md` exists at the repo root.
- [ ] The file has these top-level sections, in order: `# Roadmap` (H1), `## Now (in flight)`, `## Next (committed, soon)`, `## Later (no commitment)`, `## Recently shipped`.
- [ ] `## Now (in flight)` lists exactly three items (Zeno CLI, `apps/docs`, `apps/web`) as a checklist; each links its issue by number.
- [ ] `## Next (committed, soon)` lists exactly three items (0072 multi-backend, 0064 channel inbound, 0065 channel outbound) as a checklist; each links its issue by number.
- [ ] `## Later (no commitment)` lists exactly two items (0068 audio in, 0069 audio out) as a checklist; each links its issue by number.
- [ ] `## Recently shipped` lists the four shipped OSS-prep tracks (#1 sanitization, #2 community files, #3 README rewrite, #4 governance + release flow) as completed-checklist items linking each PR.
- [ ] No `#TBD` or `#X` placeholders survive in the committed file. Every issue reference is a real number.
- [ ] File is fully in English. `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' ROADMAP.md` returns zero matches.
- [ ] File length is between 30 and 100 lines (soft cap; the doc is intentionally short but four sections plus an intro blurb plus eight roadmap items plus four shipped entries naturally lands above 60).

### `vault/backlog.md` privatisation

- [ ] `.gitignore` has a new entry that matches `vault/backlog.md` (e.g. an explicit `vault/backlog.md` line, not a glob).
- [ ] `vault/backlog.md` is no longer tracked by git. Verifiable: `git ls-files vault/backlog.md` returns nothing; `git status vault/backlog.md` shows the file as ignored.
- [ ] `vault/backlog.md` continues to exist on the maintainer's disk (it is not deleted, only untracked).
- [ ] No other files are gitignored as side effects.

### `README.md` footer link

- [ ] The README's `## Contributing, security, license` section gains exactly one new bullet: `- Roadmap: see [ROADMAP.md](./ROADMAP.md).`
- [ ] No other change to `README.md`. The eight-section structure shipped in PR #3 is preserved; the badges and WARNING block from PR #4 are preserved.

### `.agents/commands/new-issue.md`

- [ ] File `.agents/commands/new-issue.md` exists. It is a Claude Code slash-command file (markdown body that the agent follows when the user invokes `/new-issue`).
- [ ] The slash command, when invoked, asks the user (concisely) for: issue type (bug / feature / question), then the title, then the body fields appropriate to the chosen type. Body fields per type, mirroring the actual files in `.github/ISSUE_TEMPLATE/`:
  - `bug` (template file `bug-report.md`): description, repro steps, expected, actual, environment, additional context.
  - `feature` (template file `feature-request.md`): description, motivation / use case, alternatives considered, additional context.
  - `question` (template file `question.md`): question, what you have tried.
  After collecting the body, the command runs `gh issue create --template <bug-report|feature-request|question>.md` with the type-appropriate label (`bug`, `enhancement`, or `question`). The command MUST use the actual template filenames listed above — not shortened forms like `bug.md` or `feature.md` (which do not exist).
- [ ] The roadmap-label offer is only presented for `bug` and `feature` types (not for `question`, where it is semantically incoherent — questions are not roadmap items). When offered and the user accepts, the command adds the `roadmap` label and offers to draft an updated `ROADMAP.md` slotting the new issue into Now / Next / Later (the user picks the section).
- [ ] The slash command is in English.

### `.agents/commands/new-pr.md`

- [ ] File `.agents/commands/new-pr.md` exists. It is a Claude Code slash-command file.
- [ ] The slash command, when invoked, performs in order:
  1. Confirms the branch is not `main` (refuses to open a PR against `main` from `main`).
  2. Confirms `pnpm run quality-gate` is green (runs it; aborts if not green).
  3. Confirms there are no obvious sanitization-rule violations in the diff (greps the diff for the maintainer's known real identifiers and obvious leak patterns; aborts if matches).
  4. Pushes the branch to `origin` if not already pushed.
  5. Drafts a PR title in Conventional Commits style.
  6. Drafts a PR body matching `.github/PULL_REQUEST_TEMPLATE.md`'s shape — Summary, Spec / issue, Test plan, Sanitization checkbox, Quality gate checkbox. The Sanitization and Quality gate checkboxes are written as `- [x]` (already-checked) since the command verified them in steps 2–3.
  7. Runs `gh pr create` with the title and body.
  8. Reports the PR URL.
- [ ] The slash command is in English.

### Symlinks

- [ ] `.claude/commands/new-issue` (no `.md` suffix) is a symbolic link to `../../.agents/commands/new-issue.md`. Verifiable: `readlink .claude/commands/new-issue` returns `../../.agents/commands/new-issue.md`.
- [ ] `.claude/commands/new-pr` is a symbolic link to `../../.agents/commands/new-pr.md` (same shape).
- [ ] No existing `.claude/commands/memex-*.md` file is touched. The symlink pattern is applied only to the two new commands.

### Sanitization and language guards

- [ ] `grep -rnE '\b(você|porquê|nessa|também|então|usuário|configura)\b' ROADMAP.md .agents/commands/new-issue.md .agents/commands/new-pr.md` returns zero matches.
- [ ] `grep -rnE 'Gabriel|gblosr' ROADMAP.md .agents/commands/new-issue.md .agents/commands/new-pr.md` returns zero matches. (`ribeirogab` is allowed in canonical-URL contexts under the rule's existing out-of-scope clause.)

### PR hygiene

- [ ] PR is single-purpose: only the roadmap surface, the eight issues, the privacy move, and the two slash commands. No unrelated work bleeds in.
- [ ] The PR's body description references this spec by path and lists the operator-side observations (label created, the eight new issue numbers, the resulting `ROADMAP.md` link) so the operator can sanity-check from the PR alone.
- [ ] Branch is `chore/oss-prep-roadmap`.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `ROADMAP.md` drifts from the actual issue state because the maintainer ships an item but forgets to move the bullet from "Now" to "Recently shipped". | The `/new-pr` slash command, in its final step, asks "did this PR ship a roadmap item? If yes, edit `ROADMAP.md` to move it to Recently shipped" — a soft reminder, not enforcement. |
| Issue numbers are unknown until the issues are filed, so `ROADMAP.md` cannot be drafted in a single shot ahead of time. | The plan splits implementation into two phases: (1) create issues via `gh issue create` and capture their numbers; (2) write `ROADMAP.md` with the captured numbers. No `#TBD` ever survives in a committed file. |
| The eight issues filed all at once are mostly empty stubs and look like spam. | Each issue body is a real one-paragraph description plus motivation, sourced from `vault/backlog.md` and from the operator's stated intent during this brainstorm. They are not empty. |
| `vault/backlog.md` going gitignored breaks tooling that referenced the path (e.g. shipped specs that mention `context/backlog.md` or `vault/backlog.md`). | Those references are textual and rendered as code, not as clickable links. Outsiders see opaque text but not 404s. Maintainer-side, the file still exists on disk so any local tooling that reads it continues to work. |
| The `/new-pr` slash command's "no sanitization violations" check is a heuristic and can produce false positives. | The check is advisory, not blocking. The user can override with a one-line confirmation. The real audit is in the sanitization rule + the operator's diff review. |
| Adding two new slash commands while the existing `memex-*` files use a different pattern creates inconsistency. | Acknowledged and accepted (Q7 (a)). The `memex-open-pr.md` is legacy and being deprecated; the inconsistency is bounded and known. |
| Outsider opens a roadmap issue and asks for a status update on the issue rather than the roadmap doc. | Acceptable. Issues are the per-item conversation surface; `ROADMAP.md` is the at-a-glance index. They serve different roles. |

## Open Questions

(None blocking. The seven brainstorm decisions Q1–Q7 — Now/Next/Later structure, initial-content distribution, vault/backlog gitignore, README footer link, no new template, label minimalism, symlink-only-for-new-commands — are recorded in the Constraints, Non-Goals, and Acceptance Criteria sections.)
