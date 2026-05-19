---
feature: oss-prep-sanitization
plan: "[[plan-oss-prep-sanitization]]"
spec: "[[spec-oss-prep-sanitization]]"
created: 2026-05-04
---
# OSS-Prep — Sanitization Rule + Final Scrub — Tasks

**For this plan:** `[[plan-oss-prep-sanitization]]`

> **Execution model:** subagent-driven. Main thread dispatches one subagent per task, reviews the resulting diff, then moves to the next. Each subagent receives the full forbidden list (1–11) + mapping table inline, so context is self-contained.

> **Branch:** `chore/oss-prep` (already created and active).

---

## Phase 1: Audit

### Task 1.1: Produce the sanitization audit report

**Files:**
- Create: `tmp/sanitization-audit.md` (gitignored)

- [ ] Step 1: Dispatch a `general-purpose` subagent with the full forbidden list (1–11) + mapping table inline. Subagent walks the working tree (`.vault/`, `apps/`, `packages/`, `agent/`, `infra/`, `profiles/default/*.example`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`) and produces `tmp/sanitization-audit.md` with two sections:
  - **Section A: PT-BR files in .vault/** — every `.vault/**/*.md` containing PT-BR prose. For each, list: path, approximate share of file that is PT-BR (whole file vs. mixed), and whether wikilinks/code blocks need preservation.
  - **Section B: Forbidden-list violations** — every match against categories 1–11 across the audit scope. For each: `path:line`, category number, the exact violating string, and the chosen substitute from the mapping table.
- [ ] Step 2: Read the resulting `tmp/sanitization-audit.md`. Confirm both sections are populated. If Section B is empty, that means previous scrub commits already cleaned the tree — proceed anyway, since the report is the paper trail referenced by the PR body.
- [ ] Step 3: No commit (file is gitignored).

---

## Phase 2: Rule + Constitution

### Task 2.1: Write `.vault/rules/sanitization.md`

**Files:**
- Create: `.vault/rules/sanitization.md`

- [ ] Step 1: Read `.vault/templates/rule.md` to confirm the canonical structure: H1, imperative one-liner paragraph (no heading), `## Why`, `## How to Apply`, then optional extension sections. Match it literally.
- [ ] Step 2: Write `.vault/rules/sanitization.md` with the following content:

```markdown
---
tags:
  - rule
  - safety
severity: critical
applies-to:
  - .vault/
  - apps/
  - packages/
  - agent/
  - infra/
  - profiles/default/*.example
  - README.md
  - AGENTS.md
  - CLAUDE.md
  - DESIGN.md
  - commit messages
created: 2026-05-04
---
# Committed content must be fictitious

Nothing committed to this repository may contain real, private, or non-consented identifiers. Examples are always fictitious. The mapping table below is the single source of truth for canonical placeholders.

## Why

This repo is public. Everything committed reaches the world and stays in git history forever. Identity exposure is not reversible: a leaked customer name, a real email, an internal URL, or even the maintainer's own name in prose can be cached, indexed, and republished by anyone before a fix lands. The cost of a leak is permanent; the cost of a placeholder is zero.

Famous public OSS projects (the Anthropic SDK, vitest, pnpm, etc.) are public knowledge — they may be referenced as technical context. The bar this rule defends is private/non-consented identity, not all proper nouns.

## How to Apply

Before every commit, the author (human or agent) self-audits the diff:

1. **Re-read the diff with one question:** is each name, email, URL, slug, or ID real, or is it example? If unsure, treat it as real.
2. **Swap reals for placeholders.** Use the canonical placeholder from the Mapping table for the matching category. Do not invent new placeholders if a canonical one exists.
3. **When in doubt, scrub.** A false positive costs nothing; a leak costs everything.

## Forbidden list

| # | Category | Example of what NOT to commit |
|---|---|---|
| 1 | Maintainer's name in prose | a real first name in narrative voice → `the maintainer …` |
| 2 | Current/past employer | company names or slugs |
| 3 | Client / customer | any paying counterparty |
| 4 | Private or personal repos | `<owner-handle>/<x>`, `<company>/<x>` |
| 5 | Real emails | including the maintainer's personal address in prose |
| 6 | Slack workspace/channel/user IDs | `T0…`, `C0…`, `U0…` |
| 7 | Real GitHub numeric IDs | `installation_id`, `app_id`, `org_id` |
| 8 | Tokens / secrets / OAuth client IDs | any credential |
| 9 | Screenshots with real names/avatars | crop or redact before committing |
| 10 | Internal URLs | `jira.<company>.com`, private dashboards |
| 11 | Third-party people | colleagues, friends, family |

## Mapping table

| Type | Canonical placeholder |
|---|---|
| Email | `alice@example.com`, `bob@example.com` |
| Domain | `example.com`, `widget-co.example` |
| Maintainer (institutional voice) | `the maintainer` / `the operator` |
| Person (third party) | `Alice`, `Bob`, `Carol` |
| Employer / client | `widget-co`, `gizmo-corp` |
| GitHub org | `acme-org` |
| GitHub repo | `acme-org/foo-svc`, `acme-org/widget` |
| Slack workspace | `T00000000` |
| Slack channel | `C00000000` |
| Slack user | `U00000000` |
| Token / OAuth | `xoxb-EXAMPLE-TOKEN`, `EXAMPLE-OAUTH-CLIENT-ID` |
| GitHub numeric ID | `12345678` or `EXAMPLE-INSTALLATION-ID` |

## Out of scope

- **Git authorship metadata.** The author name and email on a commit are necessary attribution and out of this rule's scope. The repo's canonical remote URL (e.g. mentioned in onboarding prose) is treated the same way: it is the public address of the project, not a leaked identifier.
- **Famous public OSS projects** as technical context (`@anthropic-ai/sdk`, `vitest`, `pnpm`, etc.) and **public SaaS vendor names** when used as integration targets (Sentry, Linear, Klaviyo, Notion, Slack, GitHub, etc.).
- **Meta-references inside this rule and its spec.** This file's example column and the spec at `.vault/specs/2026-05-04-oss-prep-sanitization/` document the rule by quoting categories abstractly. They do not need to be re-scrubbed against themselves.

## References

- [`../constitution`](../constitution.md) §Privacy & sanitization
- Historical scrub commits (forward-only baseline): `8756371`, `4daf70f`, `fef9fca`, `4aff20e`.
```

- [ ] Step 3: Verify the file matches the template structure: H1, then a paragraph (no heading), then `## Why`, then `## How to Apply`, then the four extension sections.
- [ ] Step 4: Commit:

```bash
git add .vault/rules/sanitization.md
git commit -m "docs(vault): add sanitization rule (forbidden-list + mapping table)"
```

### Task 2.2: Add `## Privacy & sanitization` section to `.vault/constitution.md` and fix stale `context/` paths

**Files:**
- Modify: `.vault/constitution.md`

- [ ] Step 1: Read `.vault/constitution.md` end-to-end. Locate the boundary between `## Scope guardrails` and `## Architecture principles`.
- [ ] Step 2: Insert a new section directly between those two with this exact body:

```markdown
## Privacy & sanitization

This repository is public. Everything committed is a potential leak.

- **No real identifiers in committed content** — names, emails, employers, clients, private repos, Slack/internal IDs, tokens. Git authorship metadata is out of scope.
- **Examples are fictitious.** Use the placeholders in `[[rules/sanitization]]`.
- **Public OSS projects are fair game** as technical context (e.g. Anthropic SDK, vitest).
- **Editorial enforcement.** No CI, no hooks. Agents must read `[[rules/sanitization]]` and self-audit each diff.
- **When in doubt, scrub.**
```

- [ ] Step 3: Replace every occurrence of `context/` with `.vault/` in `.vault/constitution.md`. Verification command:

```bash
grep -n 'context/' .vault/constitution.md
```

Expected: zero matches.

- [ ] Step 4: Verify the file is fully in English. Run:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura|cara)\b' .vault/constitution.md
```

Expected: zero matches. If matches found, translate the offending lines preserving wikilinks and code blocks.

- [ ] Step 5: Commit:

```bash
git add .vault/constitution.md
git commit -m "docs(constitution): add Privacy & sanitization principle, fix stale context/ paths"
```

### Task 2.3: Template-conform `.vault/rules/integration-tokens-in-db-only.md` and translate to EN

**Files:**
- Modify: `.vault/rules/integration-tokens-in-db-only.md`

- [ ] Step 1: Read `.vault/rules/integration-tokens-in-db-only.md` end-to-end and `.vault/templates/rule.md` for the canonical shape.
- [ ] Step 2: Update the frontmatter to match the template exactly:

```yaml
---
tags:
  - rule
  - safety
severity: critical
applies-to:
  - apps/
  - packages/
  - profiles/*/.env
  - agent/connectors-catalog.json
created: 2026-04-26
---
```

- [ ] Step 3: Restructure the body so it matches the template literally. The existing `## Regra` heading is removed and its content becomes the imperative one-liner paragraph directly beneath the H1. Translate all headings to EN:

| Old heading (PT-BR) | New heading (EN) |
|---|---|
| `## Regra` | _(no heading; content moves to imperative one-liner under H1)_ |
| `## Por quê` | `## Why` |
| `## Como aplicar` | `## How to Apply` |
| `## O que continua válido em .env` | `## What still belongs in .env` |
| `## O que muda quando essa regra é violada` | `## What breaks when this rule is violated` |
| `## Referências` | `## References` |

- [ ] Step 4: Translate the body prose to EN. Preserve wikilinks (`[[...]]`), code blocks (` ``` ... ``` `), inline code (`` ` ` ``), and the existing `~~strikethrough~~` annotation about spec 0071 retiring the Claude OAuth exception.
- [ ] Step 5: Validate every wikilink resolves to an existing file:

```bash
grep -oE '\[\[[^\]]+\]\]' .vault/rules/integration-tokens-in-db-only.md | sort -u
```

For each wikilink, verify the target file exists in the tree.

- [ ] Step 6: Verify EN-only:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura|cara)\b' .vault/rules/integration-tokens-in-db-only.md
```

Expected: zero matches.

- [ ] Step 7: Commit:

```bash
git add .vault/rules/integration-tokens-in-db-only.md
git commit -m "docs(vault): align integration-tokens rule with template + translate to EN"
```

### Task 2.4: Update `.vault/_index/rules.md` MOC

**Files:**
- Modify: `.vault/_index/rules.md`

- [ ] Step 1: Read `.vault/_index/rules.md`. Determine if it is currently in PT-BR.
- [ ] Step 2: If PT-BR, translate the entire body to EN preserving wikilinks and frontmatter.
- [ ] Step 3: Add a new entry for the sanitization rule in the same format as existing entries:

```markdown
- [[../rules/sanitization|Sanitization]] — committed content must be fictitious; canonical mapping table for placeholders; editorial enforcement, no CI.
```

- [ ] Step 4: Verify EN-only via grep guard.
- [ ] Step 5: Commit:

```bash
git add .vault/_index/rules.md
git commit -m "docs(vault): add sanitization to rules MOC + EN migration"
```

---

## Phase 3: Vault EN migration

> **Source of truth for file list:** Section A of `tmp/sanitization-audit.md` produced in Task 1.1.

### Task 3.1: Translate `.vault/backlog.md` and fix stale `context/` paths

**Files:**
- Modify: `.vault/backlog.md`

- [ ] Step 1: Translate the entire file to EN. Preserve frontmatter (`status`, `created`, `updated`), wikilinks, table structure, and any code blocks.
- [ ] Step 2: Replace every `context/` with `.vault/` in this file. Verification:

```bash
grep -n 'context/' .vault/backlog.md
```

Expected: zero matches.

- [ ] Step 3: Verify EN-only via grep guard:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura|cara|deve\s|esse\s|essa\s|isso\s|pra\s|pode\s|não\s)\b' .vault/backlog.md
```

Expected: zero matches.

- [ ] Step 4: Commit:

```bash
git add .vault/backlog.md
git commit -m "docs(vault): translate backlog to EN + fix stale context/ paths"
```

### Task 3.2: Confirm or translate `.vault/_index/specs.md` to EN

**Files:**
- Modify: `.vault/_index/specs.md` (only if PT-BR found)

- [ ] Step 1: Run the grep guard:

```bash
grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' .vault/_index/specs.md
```

If zero matches, the file is already EN — skip to Step 4 (no commit needed).

- [ ] Step 2: Translate any PT-BR prose to EN. Spec-title labels in wikilinks (e.g. `[[../specs/.../spec-foo|0027 — Documentation Platform]]`) may remain in original form if the spec slug is preserved.
- [ ] Step 3: Re-run the grep guard. Expected: zero matches.
- [ ] Step 4: If file changed, commit:

```bash
git add .vault/_index/specs.md
git commit -m "docs(vault): translate specs MOC to EN"
```

If file did not change, no commit. Move on.

### Task 3.3: Translate PT-BR learnings (batch)

**Files:**
- Modify: each PT-BR learning identified in Section A of `tmp/sanitization-audit.md`. Likely set: `.vault/learnings/channel-vs-connector.md`, `.vault/learnings/dm-pairing-allowlist-security.md`, `.vault/learnings/lessons-for-zeno-from-openclaw-hermes.md`, `.vault/learnings/mcp-github-server-status.md`, `.vault/learnings/multi-agent-routing-channels-to-agents.md`, `.vault/learnings/sdk-mcp-server-type-not-exported.md`, `.vault/learnings/workspace-markdown-files-pattern.md`.

- [ ] Step 1: Dispatch one subagent (`general-purpose`) per file in parallel. Subagent prompt:
  - Translate the full body of `<file>` to EN.
  - Preserve frontmatter (`tags`, `created`, etc.) unchanged.
  - Preserve wikilinks (`[[...]]`) as-is — do not rename targets.
  - Preserve code blocks and inline code unchanged.
  - Preserve `> _[learning context]:_` blockquotes structurally; only translate prose.
  - Run `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' <file>` and confirm zero matches before exiting.
- [ ] Step 2: For each translated file, validate every wikilink resolves to an existing file in the tree.
- [ ] Step 3: Spot-check 3 randomly-chosen translated files against their original (use `git diff HEAD~N -- <file>`) to confirm no semantic drift.
- [ ] Step 4: Commit as a single batch:

```bash
git add .vault/learnings/
git commit -m "docs(vault): translate PT-BR learnings to EN"
```

### Task 3.4: Translate PT-BR specs — active batch

**Files:**
- Modify: every PT-BR file inside `.vault/specs/` whose parent spec has `status: draft` or `status: active`, per Section A of `tmp/sanitization-audit.md`.

- [ ] Step 1: Dispatch parallel subagents — one per spec directory. Each subagent translates `spec-*.md`, `plan-*.md`, `tasks-*.md` files within its assigned directory. Same translation contract as Task 3.3:
  - Frontmatter (`status`, `feature`, `created`, `shipped`, etc.) preserved unchanged.
  - Wikilinks frozen — targets not renamed.
  - Code blocks unchanged.
  - Tables preserved structurally; only cell prose translates.
- [ ] Step 2: For each translated file, validate wikilinks resolve.
- [ ] Step 3: Spot-check 3 random files; confirm `status: shipped` was not mistakenly altered.
- [ ] Step 4: Commit:

```bash
git add .vault/specs/
git commit -m "docs(vault): translate active PT-BR specs to EN"
```

### Task 3.5: Translate PT-BR specs — shipped batch

**Files:**
- Modify: every PT-BR file inside `.vault/specs/` whose parent spec has `status: shipped`, per Section A of `tmp/sanitization-audit.md`.

- [ ] Step 1: Before dispatching, surface the shipped spec list to the operator for an opt-out check (per Risks section of plan). If the operator excludes specific specs, drop them from the batch.
- [ ] Step 2: Dispatch parallel subagents — same contract as Task 3.4. Translation is literal, no `> _Translated from PT-BR_` annotation.
- [ ] Step 3: Validate wikilinks for each translated file.
- [ ] Step 4: Spot-check 3 random files; confirm `status: shipped` and `shipped:` date are unchanged.
- [ ] Step 5: Commit:

```bash
git add .vault/specs/
git commit -m "docs(vault): translate shipped PT-BR specs to EN"
```

### Task 3.6: Final EN guard across vault

- [ ] Step 1: Run the broad EN guard across the entire vault:

```bash
grep -rE '\b(você|porquê|nessa|também|então|usuário)\b' .vault/
```

Expected: zero matches.

- [ ] Step 2: Run a wider PT-BR signal grep as a sanity check:

```bash
grep -rE '\b(configura|cara|esse\s|essa\s|isso\s|pra\s|pode\s|não\s|está\s|são\s)' .vault/
```

Inspect any matches — many are false positives (English words like `configurable`, `care`, `pode` in code, etc. may appear). For each genuine PT-BR match, translate it inline and re-run the guard.

- [ ] Step 3: If any translations were made, commit:

```bash
git add .vault/
git commit -m "docs(vault): final EN sweep — patch missed strings"
```

If clean, no commit.

---

## Phase 4: Working-tree scrub

> **Source of truth for substitutions:** Section B of `tmp/sanitization-audit.md` produced in Task 1.1.

### Task 4.1: Apply substitutions inside `.vault/`

**Files:**
- Modify: every `.vault/**/*.md` flagged in Section B.

- [ ] Step 1: For each Section B entry whose path starts with `.vault/`, apply the substitution: replace the violating string at `path:line` with the chosen placeholder from the mapping table.
- [ ] Step 2: After all vault substitutions are applied, re-grep for the original violating strings to confirm none remain. Use a per-category grep, applying the executor's knowledge of the maintainer's real identifiers (sourced from the operator's local `USER.md` or provided to the subagent at dispatch time as `<owner-name>`, `<owner-handle>`, `<owner-email>` — not committed into this file). Expect zero matches except in commit-author metadata that lives outside the working tree.
- [ ] Step 3: Commit:

```bash
git add .vault/
git commit -m "chore(vault): apply sanitization audit substitutions"
```

### Task 4.2: Apply substitutions outside `.vault/`

**Files:**
- Modify: every non-vault path flagged in Section B (`apps/`, `packages/`, `agent/`, `infra/`, `profiles/default/*.example`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`).

- [ ] Step 1: Group Section B entries by top-level directory (one subagent per directory).
- [ ] Step 2: Dispatch parallel subagents to apply substitutions per group. Each subagent's prompt includes:
  - The forbidden list (1–11) and mapping table inline.
  - Only the Section B entries for its assigned directory.
  - An instruction to NOT make any change beyond the listed substitutions.
- [ ] Step 3: For each modified directory, run a per-category grep to confirm zero remaining matches of original violating strings.
- [ ] Step 4: Commit per directory or as a single batch (operator preference):

```bash
git add apps/ packages/ agent/ infra/ profiles/ README.md AGENTS.md CLAUDE.md DESIGN.md
git commit -m "chore: apply sanitization audit substitutions across working tree"
```

---

## Phase 5: Second-pass review

### Task 5.1: Isolated reviewer confirms zero remaining violations

**Files:** none modified — read-only review.

- [ ] Step 1: Dispatch a fresh `general-purpose` subagent with the forbidden list (1–11) and mapping table inline, plus instructions:
  - Walk the entire committed tree (everything tracked by git in this branch).
  - Search for each category 1–11 using category-specific patterns.
  - Specifically grep for the maintainer's known real identifiers — passed to this subagent at dispatch time as `<owner-name>`, `<owner-handle>`, `<owner-email>` so the literal values do not enter committed prose. Exclude any expected hits in commit-author metadata, the canonical remote URL (out of scope per the rule), and `.vault/` files where a literal mention is part of an example placeholder demonstration.
  - Report findings as a list of `path:line: category #N: <string>`.
- [ ] Step 2: If the reviewer finds any genuine violation, return to Phase 4 to fix it and re-dispatch this task.
- [ ] Step 3: If the reviewer finds zero genuine violations, document the result in `tmp/sanitization-audit.md` (append `## Final review: clean — <date>`).

### Task 5.2: Run final automated EN guard across vault

- [ ] Step 1: Run:

```bash
grep -rE '\b(você|porquê|nessa|também|então|usuário)\b' .vault/
```

Expected: zero matches. If any, return to Phase 3 Task 3.6 to fix.

---

## Phase 6: Pull request

### Task 6.1: Open the PR

- [ ] Step 1: Confirm branch state:

```bash
git status
git log --oneline main..HEAD | head -30
```

Expected: branch is `chore/oss-prep`, commits cover Phases 2–5.

- [ ] Step 2: Push the branch:

```bash
git push -u origin chore/oss-prep
```

- [ ] Step 3: Open the PR using the `/open-pr` skill (or `gh pr create` if the skill is unavailable). PR title: `chore(oss-prep): sanitization rule + final scrub + EN migration`. PR body must include:
  - Reference to the spec: `Spec: .vault/specs/2026-05-04-oss-prep-sanitization/spec.md`.
  - Quoted summary table from `tmp/sanitization-audit.md` (Section B counts per category).
  - Note that the audit report itself is not committed (gitignored).
  - Confirmation that Phase 5 second-pass review found zero remaining violations.
  - Note that this is OSS-prep track A+E; tracks B/C/D/F/G are tracked in `tmp/oss-prep-pipeline.txt` for follow-up specs.
- [ ] Step 4: Wait for operator approval before any merge. Do NOT merge without explicit consent.
