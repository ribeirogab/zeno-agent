---
feature: oss-prep-roadmap
spec: "[[spec-oss-prep-roadmap]]"
created: 2026-05-04
---
# OSS-Prep — Roadmap Communication — Plan

**For this spec:** `[[spec-oss-prep-roadmap]]`

## Approach

Mostly mechanical: one root file (`ROADMAP.md`), two slash-command files in `.agents/commands/`, two symlinks in `.claude/commands/`, one `.gitignore` line, one `git rm --cached`, one new label, eight new issues, one footer bullet in `README.md`.

Order matters in two places: (1) the eight issues are created **before** `ROADMAP.md` is written, so the file references real issue numbers (no `#TBD` placeholders survive); (2) `vault/backlog.md` is `git rm --cached` only after `.gitignore` includes it, so the file stays on disk.

Inline execution. Each step is small, sequential, and self-validating.

## Architecture

```
Phase 1: Label                          → gh label create roadmap

Phase 2: Eight roadmap issues           → gh issue create x8
  └─ each via existing feature-request
     template + label roadmap + label
     enhancement; capture issue numbers
     into a temp file

Phase 3: ROADMAP.md                     → ROADMAP.md (new, root)
  └─ uses captured issue numbers from
     Phase 2

Phase 4: Privacy move                   → .gitignore (mod)
  ├─ add `vault/backlog.md`
  └─ git rm --cached vault/backlog.md

Phase 5: README footer link             → README.md (mod)
  └─ add 1 bullet in footer section

Phase 6: Slash commands                 → .agents/commands/new-issue.md (new)
  ├─ .agents/commands/new-pr.md (new)
  ├─ .claude/commands/new-issue (symlink)
  └─ .claude/commands/new-pr (symlink)

Phase 7: Quality gate                   → pnpm run quality-gate

Phase 8: PR                             → gh pr create
```

## File Structure

**Created:**
- `ROADMAP.md` — root file with Now / Next / Later / Recently shipped sections; written after Phase 2 captures real issue numbers.
- `.agents/commands/new-issue.md` — Claude Code slash command body. Real file.
- `.agents/commands/new-pr.md` — Claude Code slash command body. Real file.
- `.claude/commands/new-issue` — symlink → `../../.agents/commands/new-issue.md`.
- `.claude/commands/new-pr` — symlink → `../../.agents/commands/new-pr.md`.

**Modified:**
- `.gitignore` — adds `vault/backlog.md`.
- `README.md` — footer "Contributing, security, license" gains one bullet.

**Untracked (not deleted):**
- `vault/backlog.md` — `git rm --cached`. File continues on disk; gitignored from now on.

**Created via gh CLI (no file diff):**
- Repo label `roadmap` with color `#0e8a16`.
- Eight new issues, captured as `#N` references in `ROADMAP.md`.

**Untouched:**
- All existing community files, the constitution, vault rules, code workspaces, prior shipped specs, the existing release workflow, the existing `.claude/commands/memex-*.md` files (they stay as regular files; only the two new commands use the symlink pattern).

## Phase Ordering

| Phase | Depends on | Parallelism |
|---|---|---|
| 1 — Label | nothing | single CLI call |
| 2 — Eight issues | Phase 1 (label must exist before being applied) | one issue per file change; eight `gh issue create` calls; capture numbers |
| 3 — ROADMAP.md | Phase 2 (real numbers) | single edit |
| 4 — Privacy move | nothing | sequential — modify `.gitignore` first, then `git rm --cached` |
| 5 — README footer | Phase 3 (link target must exist) | single edit |
| 6 — Slash commands | nothing | two file creates + two symlinks |
| 7 — Quality gate | Phases 1–6 | single command |
| 8 — PR | Phase 7 green | single command |

## Risks / Open Decisions

- **Issue numbers in `ROADMAP.md` could collide with existing issues** if any are open. Mitigation: at time of writing the repo's open-issue count is zero (verifiable with `gh issue list --state all` returning empty). The eight new issues will get sequential numbers starting at #1.
- **`gh issue create --template` path resolution.** The template flag in `gh` accepts the bare filename (e.g. `feature-request.md`). Verifiable in plan tasks below.
- **Branch is `chore/oss-prep-roadmap`** — already created from `main`, no rename needed.
- **`vault/backlog.md` deletion via `git rm --cached`** is the only step that affects committed history. It does NOT delete the file from disk; the operator's local copy survives.
- **The `.agents/commands/new-pr.md` slash command's "no obvious sanitization violations" check** is a heuristic. It greps for known leak patterns; it does not replicate the full Track A audit. Documented as advisory in the slash command body.
