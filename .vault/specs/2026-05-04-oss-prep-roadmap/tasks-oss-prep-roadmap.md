---
feature: oss-prep-roadmap
plan: "[[plan-oss-prep-roadmap]]"
spec: "[[spec-oss-prep-roadmap]]"
created: 2026-05-04
---
# OSS-Prep — Roadmap Communication — Tasks

**For this plan:** `[[plan-oss-prep-roadmap]]`

> **Execution model:** inline. Branch `chore/oss-prep-roadmap` is already created from `main`.

---

## Phase 1: Label

### Task 1.1: Create the `roadmap` label

- [ ] Step 1: Confirm there are no open issues yet (eight slots #1–#8 will be claimed by the issues created in Phase 2):

```bash
gh issue list --state all --limit 5
```

Expected: empty list, or zero existing issues. If any issues exist, the issue numbers in Phase 2 will not start at #1; the implementer adapts the captured numbers without changing the spec.

- [ ] Step 2: Create the label:

```bash
gh label create roadmap \
  --color "0e8a16" \
  --description "Tracked on the public roadmap (ROADMAP.md)"
```

- [ ] Step 3: Verify:

```bash
gh label list | grep roadmap
```

Expected: a single line with `roadmap` and the green color hex.

---

## Phase 2: Eight roadmap issues

> Each `gh issue create` call below opens a real GitHub issue. Capture the returned URLs and parse the issue number for use in Phase 3. The implementer keeps a scratch file `tmp/roadmap-issues.txt` mapping each title to its `#N` for the duration of the implementation; the file is gitignored under `tmp/` and is not committed.

### Task 2.1: File issue — Zeno CLI

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(cli): add zeno CLI to replace daily docker compose" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Add a `zeno` command-line tool so the operator no longer has to run `docker compose` invocations by hand for daily operations (start, stop, logs, shell, setup-token). The CLI wraps the existing `pnpm run docker:*` scripts behind a single binary the operator can invoke from anywhere.

## Motivation / use case

Today the operator runs `pnpm run docker:up`, `pnpm run docker:logs`, `pnpm run docker:sh`, and `pnpm run docker:setup-token` repeatedly. The verbose form is cumbersome for a tool that runs every day. A `zeno` CLI shortens the surface (`zeno up`, `zeno logs`, `zeno sh`, `zeno setup-token`) and gives a single entry point that future commands can extend.

## Alternatives considered

- A shell alias — fast but per-machine, not shareable.
- Keep the `pnpm run` form — works but the verbosity adds friction every day.
- A standalone Go/Rust binary — overkill for a Node monorepo; staying inside the workspace tooling is simpler.

## Additional context

Roadmap: `Now`. No spec yet. The first move is to design the CLI surface (which subcommands, which flags, where the binary installs) before writing it.
EOF
)"
```

- [ ] Step 2: Capture the issue number from the URL the CLI prints; record it.

### Task 2.2: File issue — `apps/docs` minimal scaffold

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(docs): add apps/docs minimal scaffold" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Create a new workspace `apps/docs` containing the project's outsider-facing documentation site. Initial scope is a minimal scaffold (Fumadocs or similar, with `llms.txt`) that renders the existing `.vault/` content adapted for outsider readers — a navigable concept guide, connector reference, and operator playbook.

## Motivation / use case

The README is intentionally minimal (Track D, PR #3) and points at `.vault/` and `CLAUDE.md` as the interim source of truth. Both are maintainer-facing — outsiders deserve a real documentation surface. `apps/docs` is the canonical location.

## Alternatives considered

- Continue pointing at `.vault/` — works but the vault is not curated for outsiders and changes in real time.
- A separate `zeno-docs` repo — adds release coordination overhead; staying in the monorepo is simpler.
- A static `docs/` folder with a markdown reader — does not provide search, navigation, or `llms.txt`.

## Additional context

Roadmap: `Now`. The README's "Setup notes" section already mentions `apps/docs` as forthcoming.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.3: File issue — `apps/web` landing page

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(web): add apps/web landing page" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Create a new workspace `apps/web` containing the project's public landing page. Pitch + screenshots + social proof + links to the docs site and the repo. The visual identity matches the existing badge palette (LICENSE green, STATUS orange, BUILT BY blueviolet).

## Motivation / use case

The README is too narrow for sales-style content (screenshots, demo GIFs, comparison tables). A real landing page provides the first-impression surface that the README intentionally avoids.

## Alternatives considered

- Use a `gh-pages` branch — works but bypasses the monorepo; `apps/web` keeps everything in lockstep with `apps/docs`.
- A README-only landing — exactly what Track D rejected.
- An external service (Carrd, Framer) — splits the source of truth.

## Additional context

Roadmap: `Now`. The README's intentional minimalism (Track D, PR #3) was justified by `apps/web` being on the way.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.4: File issue — Multi-backend toggle (spec 0072)

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(agent): multi-backend toggle + Codex impl (spec 0072)" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Implement per-backend on/off toggle, drag-handle priority order, and a fallback chain on `auth_expired` / `rate_limited`. Includes a real Codex `AgentBackend` implementation (not a placeholder) — spawn, OAuth/key flow, env vars, tool-call protocol — so the second card actually serves traffic.

## Motivation / use case

Track F shipped the rolling-CalVer release model and the governance contract on a single backend (Claude). For the dashboard's "agent backend" card to be more than ornamental, the operator needs to be able to toggle backends, pick a priority order, and fall back when one provider is down. Spec 0072 is the existing internal scope for this work.

## Alternatives considered

- Stay single-backend — works but the dashboard already advertises multi-backend; the affordance is a lie until this ships.
- Wrap a generic API gateway — adds a layer; the SDK abstraction (`AgentBackend`) is the right boundary.

## Additional context

Roadmap: `Next`. Spec dependency: 0071 (backend auth via dashboard, shipped). Scoped in the maintainer's backlog as XL-sized.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.5: File issue — Channel inbound files (spec 0064)

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(channels): channel inbound files (spec 0064)" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Pass through file attachments uploaded by the operator in a channel (Slack today; Discord/Telegram in future) to the agent. The worker already downloads Slack attachments; what is missing is a standardised pass-through via the channel adapter so the agent receives the file content as part of its input.

## Motivation / use case

The operator currently pastes file contents inline or describes them. Real attachment support unblocks workflows like "review this PDF" or "edit this CSV".

## Alternatives considered

- Keep operator pasting content — works for tiny files, breaks for binaries.
- A separate "file upload" surface in the dashboard — works but loses the channel context.

## Additional context

Roadmap: `Next`. Spec dependency: 0058 (Slack channel cutover, shipped). Scoped in the maintainer's backlog as M-sized.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.6: File issue — Channel outbound files (spec 0065)

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(channels): channel outbound files (spec 0065)" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

The agent generates a file (HTML / JSON / image / PDF / etc.) and the channel adapter uploads it via the channel's native API (`files.upload` for Slack, attachments for Discord, etc.).

## Motivation / use case

Output today is text-only. Many useful agent outcomes (code-review reports, charts, formatted summaries) want a file artifact. This closes the loop opened by spec 0064 (inbound files).

## Alternatives considered

- Keep agent output as inline text — works for prose, fails for binaries and long structured outputs.
- A separate dashboard surface for downloads — adds another place to look.

## Additional context

Roadmap: `Next`. Spec dependencies: 0058 + 0064 (inbound). Scoped in the maintainer's backlog as M-sized.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.7: File issue — Audio in (spec 0068)

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(channels): audio in / Slack voice transcription (spec 0068)" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

Voice notes posted in a channel (Slack voice messages today) are transcribed and fed to the agent as text input. The transcription path is a connector or built-in MCP that the channel adapter calls before handing input to the agent.

## Motivation / use case

The operator can dictate a longer, less-structured request via voice while away from the keyboard. Transcription bridges that to the existing text-only agent pipeline.

## Alternatives considered

- Keep text-only — accepted today, but loses on-the-go ergonomics.
- A separate dictation tool the operator pastes from — works but adds a step.

## Additional context

Roadmap: `Later`. Spec dependency: 0064 (channel inbound files). Scoped in the maintainer's backlog as M-sized.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.8: File issue — Audio out (spec 0069)

- [ ] Step 1:

```bash
gh issue create \
  --title "feat(channels): audio out / TTS reply (spec 0069)" \
  --label roadmap,enhancement \
  --body "$(cat <<'EOF'
## Description

The agent generates a reply, the channel adapter passes it through TTS, and uploads the resulting audio file as the channel's response. Operator can listen instead of read.

## Motivation / use case

Counterpart of spec 0068 — closing the audio loop. Lets the operator interact eyes-free.

## Alternatives considered

- Stay text-only — accepted today.
- An external TTS the operator runs locally — works but loses the in-channel UX.

## Additional context

Roadmap: `Later`. Spec dependency: 0065 (channel outbound files). Scoped in the maintainer's backlog as M-sized.
EOF
)"
```

- [ ] Step 2: Record the issue number.

### Task 2.9: Capture all eight numbers

- [ ] Step 1: Confirm all eight issues are filed:

```bash
gh issue list --label roadmap --state open
```

Expected: eight rows, titles matching the eight tasks above. Number each row in mind: zeno CLI, apps/docs, apps/web, multi-backend, channel inbound, channel outbound, audio in, audio out.

- [ ] Step 2: Write the captured `#N` numbers into a scratch file at `tmp/roadmap-issues.txt` (gitignored under `tmp/`):

```
zeno CLI: #N1
apps/docs: #N2
apps/web: #N3
multi-backend: #N4
channel inbound: #N5
channel outbound: #N6
audio in: #N7
audio out: #N8
```

(The implementer replaces N1..N8 with the real numbers.)

---

## Phase 3: ROADMAP.md

### Task 3.1: Create `ROADMAP.md`

**Files:**
- Create: `ROADMAP.md`

- [ ] Step 1: Read the captured numbers from `tmp/roadmap-issues.txt`. Substitute them into the body below at every `#N1`..`#N8` occurrence.

- [ ] Step 2: Write `ROADMAP.md` with this content (with real numbers substituted):

```markdown
# Roadmap

This is the public roadmap for zeno-agent — a curated index of what is in flight, what is committed next, and what is on the radar without commitment. For each item the linked issue is the per-item conversation surface.

The maintainer also keeps a private scratch doc on local disk (`.vault/backlog.md`, gitignored) for raw ideas that have not yet hardened into commitments. Items move from the scratch doc into the issue tracker, and from the issue tracker into the relevant section below as they progress.

## Now (in flight)

- [ ] #N1 — feat(cli): add zeno CLI to replace daily docker compose
- [ ] #N2 — feat(docs): add apps/docs minimal scaffold
- [ ] #N3 — feat(web): add apps/web landing page

## Next (committed, soon)

- [ ] #N4 — feat(agent): multi-backend toggle + Codex impl (spec 0072)
- [ ] #N5 — feat(channels): channel inbound files (spec 0064)
- [ ] #N6 — feat(channels): channel outbound files (spec 0065)

## Later (no commitment)

- [ ] #N7 — feat(channels): audio in / Slack voice transcription (spec 0068)
- [ ] #N8 — feat(channels): audio out / TTS reply (spec 0069)

## Recently shipped

- [x] #1 — Track A: sanitization rule + final scrub + EN migration (PR #1)
- [x] #2 — Track B: license + community files (PR #2)
- [x] #3 — Track D: README rewrite for outsider (PR #3)
- [x] #4 — Track F: governance + release workflow (PR #4)
```

- [ ] Step 3: Verify the eight required sections (H1 + four H2 + intro paragraphs):

```bash
grep -nE '^(# Roadmap|## Now \(in flight\)|## Next \(committed, soon\)|## Later \(no commitment\)|## Recently shipped)' ROADMAP.md
```

Expected: five matches, in this order.

- [ ] Step 4: Verify EN-only and no real names:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' ROADMAP.md
grep -nE 'Gabriel|gblosr' ROADMAP.md
```

Both should return zero matches.

- [ ] Step 5: Verify line count is in the 30–100 range:

```bash
awk 'END {print NR}' ROADMAP.md
```

Expected: a number between 30 and 100.

- [ ] Step 6: Verify no `#TBD` or `#X` placeholders survive:

```bash
grep -E '#TBD|#X[^0-9]' ROADMAP.md
```

Expected: zero matches.

- [ ] Step 7: Commit:

```bash
git add ROADMAP.md
git commit -m "docs: add ROADMAP with Now / Next / Later sections"
```

---

## Phase 4: Privacy move — `.vault/backlog.md` gitignored

### Task 4.1: Add `.gitignore` entry

**Files:**
- Modify: `.gitignore`

- [ ] Step 1: Read `.gitignore` and locate the section that already gitignores per-profile files (`profiles/*/`, `infra/docker-compose.*.yml`). The new entry sits as a standalone line near the top of the file (or in a "Maintainer scratch" subsection if natural).

- [ ] Step 2: Add the line:

```
# Maintainer scratch — private brainstorming, never committed
.vault/backlog.md
```

- [ ] Step 3: Verify:

```bash
grep -n '.vault/backlog.md' .gitignore
```

Expected: one match.

### Task 4.2: Untrack `.vault/backlog.md`

- [ ] Step 1: Confirm the file is currently tracked:

```bash
git ls-files .vault/backlog.md
```

Expected: prints `.vault/backlog.md`.

- [ ] Step 2: Remove from index without deleting on disk:

```bash
git rm --cached .vault/backlog.md
```

- [ ] Step 3: Confirm the file is no longer tracked but still exists on disk:

```bash
git ls-files .vault/backlog.md   # expected: empty
test -f .vault/backlog.md && echo "still on disk"   # expected: still on disk
git status .vault/backlog.md     # expected: ignored
```

- [ ] Step 4: Commit:

```bash
git add .gitignore
git commit -m "chore: gitignore .vault/backlog.md (maintainer scratch, no longer committed)"
```

---

## Phase 5: README footer link

### Task 5.1: Add roadmap bullet to README footer

**Files:**
- Modify: `README.md`

- [ ] Step 1: Locate the `## Contributing, security, license` section (the last section of the README). It currently has four bullets: Issues+PRs, Security, Code of conduct, License.

- [ ] Step 2: Add a fifth bullet **as the first** entry of the section so the roadmap link sits at the top of the footer list (most-discovered position):

Old:
```markdown
## Contributing, security, license

- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
```

New:
```markdown
## Contributing, security, license

- Roadmap: see [ROADMAP.md](./ROADMAP.md).
- Issues and pull requests: see [CONTRIBUTING.md](./CONTRIBUTING.md).
```

- [ ] Step 3: Verify the footer now has five bullets and no other section was touched:

```bash
awk '/^## Contributing/,/^$/' README.md
```

Expected: five bullet lines starting with `- Roadmap`, `- Issues`, `- Vulnerability`, `- Code of conduct`, `- License`.

- [ ] Step 4: Verify no other section changed:

```bash
grep -nE '^(# zeno-agent|## What it does|## Quickstart|## What works today|## Setup notes|## Project layout|## Contributing, security, license)' README.md
```

Expected: seven matches (one H1 + six H2s) — no addition or removal.

- [ ] Step 5: Commit:

```bash
git add README.md
git commit -m "docs(readme): add ROADMAP link to footer"
```

---

## Phase 6: Slash commands

### Task 6.1: Create `.agents/commands/` directory

- [ ] Step 1:

```bash
mkdir -p .agents/commands
```

### Task 6.2: Create `.agents/commands/new-issue.md`

**Files:**
- Create: `.agents/commands/new-issue.md`

- [ ] Step 1: Write the slash command body:

```markdown
# New issue

Draft and file a GitHub issue against this repo, following the project's issue-template conventions.

## When to invoke

The user (or another agent) types `/new-issue` from Claude Code. Optional argument: a one-line title or description hint.

## Steps

1. **Pick the issue type.** Ask the user to pick one of:
   - `bug` — a reproducible defect.
   - `feature` — a proposal for a new capability or change.
   - `question` — a usage or behaviour question.

2. **Collect the title.** Ask the user for a short, imperative title. Suggest a Conventional Commits prefix matching the type:
   - `bug` → `fix(scope): ...`
   - `feature` → `feat(scope): ...`
   - `question` → `question: ...` (no Conventional Commits requirement; questions are not changes)

3. **Collect the body, mirroring the right template.** Use the `.github/ISSUE_TEMPLATE/` files literally:
   - `bug` (template `bug-report.md`): description, repro steps, expected, actual, environment, additional context.
   - `feature` (template `feature-request.md`): description, motivation / use case, alternatives considered, additional context.
   - `question` (template `question.md`): question, what you have tried.

4. **Roadmap label decision.** For `bug` and `feature` only (NOT `question`), ask the user: "Should this issue be tracked on the public roadmap (`ROADMAP.md`)?" If yes, the issue gets the `roadmap` label.

5. **File the issue.** Run:

   ```bash
   gh issue create \
     --title "<title>" \
     --label "<bug|enhancement|question>[,roadmap]" \
     --body "$(cat <<'EOF'
   <body assembled from step 3>
   EOF
   )"
   ```

   The `--template` flag is NOT used — the body is assembled inline because the user already filled the template fields in step 3. The label list always includes the type label (`bug`, `enhancement`, `question`) and conditionally `roadmap`.

6. **Report the issue number.** Capture the URL the CLI prints; report the number to the user.

7. **Roadmap update.** If the user chose to add the `roadmap` label in step 4, ask which section the new item belongs to (`Now`, `Next`, `Later`) and offer to draft an updated `ROADMAP.md` slotting the new issue in. The user reviews and accepts the diff; the agent commits the change with message `docs(roadmap): add #<N> <short-title>`.

## Sanitization

The issue body MUST NOT contain real personal identifiers (per `.vault/rules/sanitization.md`). If the user types one in step 3, gently flag it and suggest the canonical placeholder. If the user insists, abort the command — the rule applies even to issue bodies.

## Hard constraints

- Do not deviate from the chosen template's body fields.
- Do not auto-add the `roadmap` label without asking.
- Do not file the issue silently — always report the number.
```

- [ ] Step 2: Verify EN-only:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' .agents/commands/new-issue.md
```

Expected: zero matches.

### Task 6.3: Create `.agents/commands/new-pr.md`

**Files:**
- Create: `.agents/commands/new-pr.md`

- [ ] Step 1: Write the slash command body:

```markdown
# New PR

Draft and open a pull request against this repo, following the project's PR template, sanitization rule, and release flow.

## When to invoke

The user (or another agent) types `/new-pr` from Claude Code. Optional argument: a one-line PR title or summary hint.

## Steps

1. **Branch check.** Run `git branch --show-current`. Refuse to proceed if on `main` (the project's flow is "branch → PR → squash-merge into main"; opening a PR from main into main is incoherent). If on a feature branch, continue.

2. **Quality gate.** Run:

   ```bash
   pnpm run quality-gate
   ```

   Abort with the gate's error output if it fails. The user's job is to fix the issue and re-invoke `/new-pr`.

3. **Sanitization heuristic check.** Diff the branch against `main` and grep for known leak patterns (the maintainer's known real identifiers, common employer names, real-looking emails, GitHub installation IDs longer than `12345678`):

   ```bash
   git diff main...HEAD | grep -iE 'gabriel|gblosr|@gmail\.com|installation_id.*[0-9]{7,}'
   ```

   If there are matches, list them to the user and ask: "These look like they might violate the sanitization rule. Continue anyway?" If the user says yes, proceed. If no, abort.

4. **Push the branch** if not already pushed:

   ```bash
   if ! git ls-remote --heads origin "$(git branch --show-current)" | grep -q .; then
     git push -u origin "$(git branch --show-current)"
   fi
   ```

5. **Draft the PR title** in Conventional Commits format. Suggest one based on the most recent commits on the branch; let the user edit.

6. **Draft the PR body** matching `.github/PULL_REQUEST_TEMPLATE.md`'s shape:

   ```markdown
   ## Summary

   <1–3 bullets describing what changes and why>

   -

   ## Spec / issue

   <link to .vault/specs/<slug>/spec.md if applicable, or `Closes #<N>`>

   Spec: `.vault/specs/<slug>/spec.md`
   Closes: #

   ## Test plan

   <bulleted markdown checklist of how to verify>

   - [ ]

   ## Sanitization

   - [x] No real identifiers introduced in this diff (per [`.vault/rules/sanitization.md`](../.vault/rules/sanitization.md)).

   ## Quality gate

   - [x] `pnpm run quality-gate` is green locally.
   ```

   Both the Sanitization and Quality gate boxes are written as `- [x]` (already-checked) because steps 2 and 3 verified them.

7. **Open the PR.** Run:

   ```bash
   gh pr create --title "<title>" --body "$(cat <<'EOF'
   <body from step 6>
   EOF
   )"
   ```

8. **Report the PR URL** to the user.

9. **Roadmap reminder.** If the PR closes a `roadmap`-labeled issue, suggest the user update `ROADMAP.md` to move that item from `Now` / `Next` / `Later` into `Recently shipped`. Offer to draft the diff.

## Hard constraints

- Do not push to `main` directly.
- Do not open a PR if the quality gate is red.
- Do not silently include the maintainer's real identifiers in the PR title or body.
```

- [ ] Step 2: Verify EN-only:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' .agents/commands/new-pr.md
```

Expected: zero matches.

### Task 6.4: Create symlinks in `.claude/commands/`

- [ ] Step 1: Create the two symlinks:

```bash
cd .claude/commands
ln -s ../../.agents/commands/new-issue.md new-issue
ln -s ../../.agents/commands/new-pr.md new-pr
cd ../..
```

- [ ] Step 2: Verify:

```bash
readlink .claude/commands/new-issue
readlink .claude/commands/new-pr
```

Expected: each prints `../../.agents/commands/<name>.md`.

- [ ] Step 3: Confirm the existing `memex-*.md` files are untouched:

```bash
ls -la .claude/commands/
```

Expected: existing memex files appear as regular files (no symlink arrow); new `new-issue` and `new-pr` appear with `->` showing their symlink targets.

### Task 6.5: Commit Phase 6

- [ ] Step 1:

```bash
git add .agents/commands/new-issue.md .agents/commands/new-pr.md \
        .claude/commands/new-issue .claude/commands/new-pr
git commit -m "$(cat <<'EOF'
feat(commands): add /new-issue and /new-pr slash commands

Two repo-local Claude Code slash commands that draft and file issues and
PRs in the project's predefined shape (Conventional Commits titles, the
existing issue/PR templates, the roadmap label when applicable, sanitization
and quality-gate gates before push). Real files in .agents/commands/;
symlinks in .claude/commands/ following the same pattern as the skills.
EOF
)"
```

---

## Phase 7: Quality gate

### Task 7.1: Re-run quality-gate

- [ ] Step 1:

```bash
pnpm run quality-gate
```

Expected: `Tasks: 28 successful, 28 total` (cached or fresh). The work in this PR is docs + slash commands; no code touched.

---

## Phase 8: Pull request

### Task 8.1: Push branch and open the PR

- [ ] Step 1: Confirm branch state:

```bash
git status
git log --oneline main..HEAD
```

Expected: branch `chore/oss-prep-roadmap`, commits cover Phases 1–6.

- [ ] Step 2: Push:

```bash
git push -u origin chore/oss-prep-roadmap
```

- [ ] Step 3: Open the PR:

```bash
gh pr create --title "chore(oss-prep): public roadmap, slash commands, private backlog" --body "$(cat <<'EOF'
## Summary

OSS-prep Track Roadmap-communication. Lands the public roadmap surface so outsiders can see what is in flight, what is committed next, and what is on the radar.

Spec: [`.vault/specs/2026-05-04-oss-prep-roadmap/spec.md`](https://github.com/ribeirogab/zeno-agent/blob/chore/oss-prep-roadmap/.vault/specs/2026-05-04-oss-prep-roadmap/spec.md)

## What changed

- `ROADMAP.md` (new) — root file with Now / Next / Later / Recently shipped sections, eight live items linking real issues.
- `roadmap` label created at the repo level (color `#0e8a16`).
- Eight new issues opened, one per ROADMAP item (titles in Conventional Commits style, bodies via the `feature-request.md` shape).
- `.vault/backlog.md` is now gitignored — stays on the maintainer's disk as private scratch but is no longer tracked.
- `README.md` footer gains one new bullet: "Roadmap: see [ROADMAP.md](./ROADMAP.md)" — placed first in the footer list for discoverability.
- `.agents/commands/new-issue.md` and `.agents/commands/new-pr.md` (new) — Claude Code slash commands drafting and filing issues and PRs in the project's predefined shape.
- `.claude/commands/new-issue` and `.claude/commands/new-pr` (new symlinks → `.agents/commands/...`) following the same pattern as `.claude/skills/` (existing memex-* commands stay as regular files; legacy memex-open-pr.md is being deprecated separately).

## What did NOT change

- No GitHub Projects board, no Discussions, no milestones, no priority/area labels (all explicit non-goals).
- No new issue template — existing `feature-request.md` is reused with the `roadmap` label added.
- No migration of existing `memex-*.md` files to the symlink pattern.

## Created on GitHub (operator-side observations)

- New repo label: `roadmap` (green, `#0e8a16`).
- Eight new open issues — listed in the captured `tmp/roadmap-issues.txt` (gitignored).
- Resulting roadmap: see [`ROADMAP.md`](https://github.com/ribeirogab/zeno-agent/blob/chore/oss-prep-roadmap/ROADMAP.md).

## Test plan

- [x] `pnpm run quality-gate` is green (28/28 tasks).
- [x] `gh label list` shows the `roadmap` label.
- [x] `gh issue list --label roadmap` shows exactly eight open issues.
- [x] `git ls-files .vault/backlog.md` returns empty (file is gitignored).
- [x] `.vault/backlog.md` still exists on disk for the maintainer.
- [x] `readlink .claude/commands/new-issue` returns `../../.agents/commands/new-issue.md`.
- [x] `readlink .claude/commands/new-pr` returns `../../.agents/commands/new-pr.md`.
- [x] EN guard clean across all new/modified files.
- [x] Sanitization guard clean (only canonical-URL `ribeirogab` matches; allowed under the rule's out-of-scope clause shipped in PR #4).
EOF
)"
```

- [ ] Step 4: Wait for operator approval before merge.
