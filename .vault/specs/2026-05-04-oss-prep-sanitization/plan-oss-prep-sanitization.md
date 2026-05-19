---
feature: oss-prep-sanitization
spec: "[[spec-oss-prep-sanitization]]"
created: 2026-05-04
---
# OSS-Prep — Sanitization Rule + Final Scrub — Plan

**For this spec:** `[[spec-oss-prep-sanitization]]`

## Approach

The work has one hard sequencing constraint: **the rule must exist before anything else is sanitized**. Translators, scrubbers, and reviewers all need a single source of truth to consult. So Phase 1 produces the audit report (the "what needs to change" list) but stops short of changes. Phase 2 ships the rule + constitution. Phase 3 migrates PT-BR vault files to EN in parallel batches. Phase 4 applies the scrub edits. Phase 5 runs a second-pass review by an isolated subagent. Phase 6 opens the PR.

The plan stays dynamic by design: the spec deliberately did not lock a file count for translation. Phase 1's audit report (`tmp/sanitization-audit.md`) is the input for Phases 3 and 4 — task batches there are sized from real findings, not pre-declared estimates. Translations are parallelizable via subagents because each file is independent (filenames and wikilinks stay frozen; only prose moves).

Execution model is subagent-driven: this plan has many small, isolated edits across many files, which is exactly the pattern subagents handle well. The main thread coordinates, dispatches one batch per area, reviews the resulting commits, and moves on.

## Architecture

```
Phase 1: AUDIT                           → tmp/sanitization-audit.md
  ├─ enumerate PT-BR vault files
  └─ enumerate forbidden-list violations (categories 1–11)

Phase 2: RULE + CONSTITUTION             → .vault/rules/sanitization.md (NEW)
  ├─ write sanitization rule              → .vault/constitution.md (MOD)
  ├─ add constitution Privacy section     → .vault/_index/rules.md (MOD)
  ├─ fix constitution context/ paths      → .vault/rules/integration-tokens-in-db-only.md (MOD)
  ├─ template-conform integration-tokens
  └─ MOC entry for new rule

Phase 3: VAULT EN MIGRATION              → .vault/* PT-BR files (MOD, batched)
  ├─ batch A: top-level (backlog, MOCs)
  ├─ batch B: rules + learnings
  ├─ batch C: specs batch 1 (active)
  └─ batch D: specs batch 2 (shipped)

Phase 4: WORKING-TREE SCRUB              → diffs across .vault/, apps/, packages/, agent/, infra/, profiles/default/*.example, top-level docs
  └─ apply substitutions from audit report

Phase 5: SECOND-PASS REVIEW              → subagent re-grep for violations
  └─ confirm zero matches against forbidden list

Phase 6: PR                              → branch chore/oss-prep already exists
  └─ /open-pr with audit summary in body
```

## File Structure

**Created:**
- `.vault/rules/sanitization.md` — new rule, template-conformant, lists 11 forbidden categories + canonical mapping table.
- `tmp/sanitization-audit.md` — gitignored paper trail; enumerates findings + chosen substitutes.

**Modified:**
- `.vault/constitution.md` — add `## Privacy & sanitization` section between Scope guardrails and Architecture principles; fix `context/...` paths to `.vault/...`; ensure full EN.
- `.vault/rules/integration-tokens-in-db-only.md` — template-conformant frontmatter; section headings renamed to EN per template; body translated to EN; wikilinks revalidated.
- `.vault/_index/rules.md` — add MOC entry for new sanitization rule; migrate body to EN if PT-BR.
- `.vault/backlog.md` — fix `context/...` paths; full EN.
- `.vault/_index/specs.md` — confirm EN; translate any remaining PT-BR.
- `.vault/learnings/*.md` — translate the PT-BR files identified in Phase 1.
- `.vault/specs/<each-PT-BR-spec>/*.md` — translate `spec-*.md`, `plan-*.md`, `tasks-*.md` files identified in Phase 1.
- Working-tree scrub diffs — wherever the audit found violations across `apps/`, `packages/`, `agent/`, `infra/`, `profiles/default/*.example`, top-level docs, and any vault file that contained a real identifier.

**Untouched (out of scope):**
- `tmp/`, `node_modules/`, `dist/`, `.turbo/`, `pnpm-lock.yaml`.
- Pre-PR commit messages.
- Files already in EN with no forbidden-list violations.

## Phase Ordering

| Phase | Depends on | Parallelism |
|---|---|---|
| 1 — Audit | nothing | sequential (single subagent produces single report) |
| 2 — Rule + Constitution | Phase 1 (uses audit findings to validate the rule covers them) | sequential |
| 3 — Vault EN migration | Phase 2 (rule must exist; translators reference it for placeholder names) | parallel within phase (one subagent per batch) |
| 4 — Working-tree scrub | Phase 2 + Phase 3 | parallel within phase (one subagent per area) |
| 5 — Second-pass review | Phases 2–4 | sequential (single isolated reviewer) |
| 6 — PR | Phase 5 approved | sequential |

## Risks / Open Decisions

- **Audit subagent might miss PT-BR matches** that the regex didn't catch (e.g., a single PT-BR sentence inside an otherwise-EN file). Mitigation: the audit grep uses a broad PT-BR signal set; spot-check 3 random files post-translation and re-run the grep guard `grep -rE '\b(você|porquê|nessa|também|então|usuário)\b' .vault/`.
- **Translator subagent paraphrases code-block strings** that look like prose. Mitigation: explicit prompt clause "do not edit content inside ``` fences"; spot-check.
- **Wikilink target rename**: a translator might mistakenly rename a `[[wiki/link]]` target. Mitigation: post-translation grep that every `[[...]]` resolves to a real file in the tree.
- **PR size makes review hard**. Mitigation: granular commits + audit report quoted in PR body. Operator + second-pass reviewer share burden.
- **Operator may object to specific shipped spec being touched**. Mitigation: Phase 3 surfaces the file list before translation begins, gives operator a chance to opt-out specific files.
