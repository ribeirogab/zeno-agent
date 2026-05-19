---
status: shipped
feature: oss-prep-sanitization
created: 2026-05-04
shipped: 2026-05-04
---
# OSS-Prep — Sanitization Rule + Final Scrub — Spec

**Status:** Shipped (PR #1, 2026-05-04)
**Scope:** Establish the constitutional contract that nothing committed to this public repo may contain real private/non-consented identifiers, codify it as a rule, and execute a single full-tree audit + EN migration so the repo enters its public life from a clean baseline.

## Context

This repository will live publicly at `https://github.com/ribeirogab/zeno-agent.git` (renamed from `zeno-agent-public.git` on 2026-05-04). Sanitization has been happening ad-hoc for the past ~12 commits (`8756371`, `4daf70f`, `fef9fca`, `4aff20e`, etc.), removing employer references, customer references, and the maintainer's name from prose. None of that work is anchored in a written contract — there is no rule that explains to a future agent (Claude, Codex, Cursor, etc.) **why** those substitutions happened or what to keep substituting.

Without a written contract:

- New specs / learnings / fixtures will silently reintroduce private identifiers as the maintainer authors them.
- Reviewers (human and AI) have no checklist to apply.
- The boundary between "real identifier" and "placeholder" is fuzzy — is the maintainer's GitHub username allowed in a fixture? Are employer names allowed? Are famous public OSS projects allowed?

This spec resolves that gap as the **first** of a multi-spec OSS-prep pipeline. Subsequent tracks (license + community files, README rewrite, fresh-clone smoke test, governance) depend on this one shipping first.

## Problem Statement

The repo lacks a written, agent-readable contract that declares which identifiers are forbidden in committed content and which placeholders to use instead. As a consequence:

1. Future contributions (by humans or agents) will drift toward leaking private identifiers.
2. The vault contains 43 files still written in PT-BR, which locks out non-Portuguese readers from the public surface.
3. There is no baseline audit confirming the working tree is currently clean against the contract that does not yet exist.

## Non-Goals

- **No CI gate, no pre-commit hook, no automated secret scanning gate.** Enforcement is editorial: every agent must read the constitution and the rule before substantive work.
- **No git history rewrite.** The repo has never been published; sanitization commits already cleaned what was reachable. Forward-only is sufficient.
- **No license / community files** (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue/PR templates) — that is OSS-prep track B, a separate spec.
- **No README rewrite for an outsider audience** — that is track D.
- **No fresh-clone onboarding smoke test** — that is track G.
- **No governance / release / versioning policy** — that is track F.
- **No migration of PT-BR commit messages** — they live in immutable history and are out of scope per "no rewrite" decision.

## Constraints

- **Vault language is English-only.** Any file committed under `.vault/` must be EN. Conversation between operator and agent stays PT-BR; the artifacts do not.
- **Strict-personal definition of "real":** owner's name in prose, employers, clients, third-party people, private repos, real emails, Slack/internal IDs, tokens. Famous public OSS (Anthropic SDK, vitest, pnpm, etc.) is fair game as technical context. Git authorship metadata is out of scope.
- **Templates are canonical.** New rule files start from `.vault/templates/rule.md`, never from a sibling rule as a model. Existing rules that diverge from the template are corrected only when this spec touches them.
- **The rule template is the single structural source.** `.vault/templates/rule.md` defines the canonical shape: H1 title, one-line imperative paragraph (no heading), `## Why`, `## How to Apply`, then optional extension sections. The new sanitization rule and the corrected `integration-tokens-in-db-only.md` follow that shape literally — no `## Rule` heading is introduced; the imperative one-liner sits as a paragraph beneath the H1.
- **Locked decisions** (recorded here so a planner does not relitigate them):
  - Translations of `status: shipped` specs are literal language swaps with no annotation. Frontmatter (`status`, `created`, `shipped`) is preserved unchanged. Only prose translates.
  - The maintainer-in-prose placeholder is `the maintainer` for institutional voice. Person-name placeholders (`Alice`, `Bob`, `Carol`) are reserved for examples that specifically need a person.
  - Any non-obvious learning generated during this work is captured per the project's after-completing-a-spec reflection step — not pre-declared here.
- **Single PR.** All changes ship in one PR to keep the constitutional update, the rule, the legacy rule rewrite, the EN migration, and the audit visible together.

## User Stories / Scenarios

1. **A future agent opens the repo for the first time.** It reads `CLAUDE.md`, which directs it to `.vault/constitution.md`. The Privacy & sanitization section tells it the rule exists and where the operational detail lives. The agent reads `.vault/rules/sanitization.md` and now knows the forbidden list, the canonical placeholders, and the pre-commit self-audit.
2. **The maintainer writes a new learning that needs to mention a real customer interaction.** Before committing, they self-audit the diff, find the real customer name, and replace it with `gizmo-corp` per the mapping table.
3. **A non-Portuguese contributor lands on the repo.** Every file under `.vault/` is in EN. They can navigate `_index/specs.md`, read shipped specs, follow learnings, and understand the project without translation.
4. **The maintainer drafts a fixture for a new test.** They reach for `alice@example.com` rather than a real email. The mapping table is the single source of truth for canonical placeholders.

## Acceptance Criteria

### Constitution

- [ ] `.vault/constitution.md` has a top-level `## Privacy & sanitization` section between `## Scope guardrails` and `## Architecture principles`, containing the five bullets: no real identifiers (with explicit list), examples are fictitious (linking the rule), public OSS is fair game, editorial enforcement (no CI / no hooks), when in doubt scrub.
- [ ] The Privacy section links to `[[rules/sanitization]]` for operational detail.
- [ ] The constitution file is fully in English.
- [ ] Every `context/...` path reference inside `.vault/constitution.md` is rewritten to `.vault/...` (currently present on lines 72, 79, 85–86 of the live file as stale references to the pre-rename directory). Verification: `grep -n 'context/' .vault/constitution.md` returns zero matches.

### New rule: `.vault/rules/sanitization.md`

- [ ] File exists with frontmatter exactly matching the `.vault/templates/rule.md` template: `tags: [rule, safety]`, `severity: critical`, `applies-to: [...]`, `created: 2026-05-04`.
- [ ] Body follows the rule template literally: H1 title, then a single-paragraph imperative statement (no heading), then `## Why`, then `## How to Apply`. The required extension sections come after, in this order: `## Forbidden list` (table covering all 11 categories) → `## Mapping table` (canonical placeholders for email, domain, owner, third-party people, employer/client, GitHub org, GitHub repo, Slack workspace/channel/user, token/OAuth) → `## Out of scope` (git authorship metadata, famous public OSS) → `## References` (constitution link + the historical scrub commits).
- [ ] `How to Apply` describes a three-step pre-commit self-audit: re-read the diff with the question "is this real or example?", swap any real identifier for the canonical placeholder, scrub when in doubt.
- [ ] All 11 forbidden categories from Q4 are listed: owner-name-in-prose, employer, client, private repos, real emails, Slack IDs, GitHub numeric IDs, tokens, screenshots with real names/avatars, internal URLs, third-party people.
- [ ] Mapping table uses RFC 2606 style for emails/domains and invented names for orgs/repos.
- [ ] File is in English.

### Existing rule corrections

- [ ] `.vault/rules/integration-tokens-in-db-only.md` has full template-conforming frontmatter (`tags: [rule, safety]`, `severity: critical`, `applies-to: [...]`, `created`).
- [ ] In `.vault/rules/integration-tokens-in-db-only.md`, the heading currently named `## Regra` is removed (its content becomes the imperative one-liner paragraph beneath the H1, per template), and the headings `## Por quê` and `## Como aplicar` are renamed to `## Why` and `## How to Apply` respectively. Existing extension sections (`## O que continua válido em .env`, `## O que muda quando essa regra é violada`, `## Referências`) are translated to EN headings (`## What still belongs in .env`, `## What breaks when this rule is violated`, `## References`).
- [ ] `.vault/rules/integration-tokens-in-db-only.md` body is fully in English. Wikilinks resolve to existing files (verified by grepping each `[[...]]` against the file tree).
- [ ] `.vault/_index/rules.md` includes a one-line entry for the new `sanitization.md` rule, written in English, consistent with the format of existing entries after the MOC itself is migrated to EN as part of the vault EN migration phase.

### Vault EN migration

- [ ] Phase 1 of the audit produces an exact list of vault files containing PT-BR prose (committed alongside `tmp/sanitization-audit.md`). The volume estimate at spec time is roughly 40–50 files; the planner sizes the work from the actual list, not this estimate.
- [ ] `.vault/constitution.md` — fully EN (covered by Constitution criteria above).
- [ ] `.vault/backlog.md` — fully EN; every `context/...` path reference is rewritten to `.vault/...` (currently present at lines 9 and 19 of the live file).
- [ ] `.vault/_index/specs.md` — fully EN. (Audit may confirm this file is already EN; if so, the criterion is satisfied with no diff.)
- [ ] Every PT-BR learning identified in Phase 1 of the audit is translated to EN. Wikilinks, code blocks, and frontmatter are preserved unchanged; only prose translates.
- [ ] Every PT-BR spec file identified in Phase 1 of the audit (active and shipped) is translated to EN. Wikilinks, code blocks, frontmatter (`status`, `created`, `shipped`) are preserved unchanged. Translation is literal — no annotation or `> _Translated from PT-BR_` note.
- [ ] `grep -rE '\b(você|porquê|nessa|também|então|usuário)\b' .vault/` returns zero matches across the committed tree.

### Final scrub audit (track E)

- [ ] An audit report exists at `tmp/sanitization-audit.md` (gitignored, not committed) listing every violation found in the working tree by category (1–11), file, line, and chosen substitute. The PR body links and quotes the report's summary table.
- [ ] After the audit's substitutions are applied, a second-pass review by an isolated reviewer (subagent or human) confirms zero remaining violations of categories 1–11 in the committed tree.
- [ ] Audit covers: `.vault/`, `apps/`, `packages/`, `agent/`, `infra/`, `profiles/default/*.example`, top-level docs (`README.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`), and commit messages of *new* commits in this PR.
- [ ] Audit explicitly excludes: `tmp/`, `node_modules/`, `dist/`, `.turbo/`, `pnpm-lock.yaml`, and pre-PR commit messages.

### PR hygiene

- [ ] PR is single-purpose: only sanitization rule + EN migration + scrub. No license/CI/community/README work bleeds in.
- [ ] PR description references this spec by path and summarizes the audit findings.
- [ ] Branch is `chore/oss-prep` (already created).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Diff is enormous (rule + dozens of translations + scrub diffs); review fatigue causes missed issues. The exact translation count is not locked at spec time — Phase 1 of the audit produces it. | Granular commits per area (rule → constitution → MOCs → rules → learnings → specs batch 1 → specs batch 2 → scrub batch). Audit report `tmp/sanitization-audit.md` quoted in PR body provides paper trail. Second-pass reviewer is mandatory. |
| Translation drift — translator agent paraphrases and changes meaning. | Translation prompt mandates: preserve semantics, keep structure, do not edit code blocks, do not change wikilinks, do not modify frontmatter except where it is itself prose. Spot-check 3 random translated files against originals before merging. |
| False positives in the scrub — placeholder strings (`acme-org`, `widget-co`) get further "scrubbed" in a later pass because reviewer mistakes them for real. | Mapping table in the rule is the canonical source. Any future scrub references the rule first. The audit report logs which strings were already placeholders. |
| Agent forgets the rule mid-session and writes a violation in a later commit. | Constitution principle is the first line of defense — agents are required to read constitution before substantive work (per existing `CLAUDE.md` instruction). The pre-commit self-audit is the second line. There is no third — this is the agreed trade for "no CI". |
| Some spec marked `status: shipped` is treated as immutable history and the operator does not want it touched. | Translation does not change semantics or `status` — it only swaps prose language. Frontmatter `shipped:` date is preserved. If operator objects to a specific shipped spec being touched, exclude it explicitly during review. |
| Wikilinks break during translation when an agent translates a target filename or anchor. | Filenames stay in their original kebab-case form (only prose inside files translates). Wikilink rewriter step in the plan: post-translation, run a script or grep pass that confirms every `[[...]]` resolves to an existing file. |
| Audit subagent loses context on what counts as "real" mid-task. | Each subagent's prompt includes the full forbidden list (1–11) and mapping table inline, plus the link to `.vault/rules/sanitization.md` once written. Subagents are given one area at a time, not the whole tree. |

## Open Questions

(None blocking. The three decisions previously held here — translation literalness for shipped specs, maintainer-in-prose placeholder, end-of-spec learning capture — have been promoted to the Constraints section as locked decisions.)
