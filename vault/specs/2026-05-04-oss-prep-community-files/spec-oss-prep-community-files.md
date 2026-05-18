---
status: draft
feature: oss-prep-community-files
created: 2026-05-04
shipped: null
---
# OSS-Prep — Community Files (License + CoC + CONTRIBUTING + SECURITY + Templates) — Spec

**Status:** Draft
**Scope:** Add the standard OSS community files (LICENSE, CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, issue and PR templates) so outsiders can legally use, safely report, and unambiguously contribute to the repo. Enable the GitHub features the files reference (Private Vulnerability Reporting, Discussions). Single PR.

## Context

`vault/specs/2026-05-04-oss-prep-sanitization/` (Track A + E, shipped 2026-05-04 as PR #1) cleaned the committed content. The repo is now factually safe to publish — but a public repo with no LICENSE, no CoC, no CONTRIBUTING, and no SECURITY policy is still hostile to outsiders:

- **Without a LICENSE**, default copyright applies — nobody is legally permitted to use, copy, or fork the code.
- **Without a CoC**, there is no shared baseline for behaviour, and reports of bad-faith conduct have no anchor.
- **Without CONTRIBUTING**, every newcomer has to reverse-engineer the project's conventions (Conventional Commits, spec-driven workflow, `pnpm run quality-gate`, sanitization rule, branch naming) by reading commit history and CLAUDE.md.
- **Without SECURITY.md**, vulnerability reports either go to a public issue (worst case) or are never filed.
- **Without issue and PR templates**, the maintainer pays the triage tax of half-formed reports.

This spec is Track B of the OSS-prep pipeline (`tmp/oss-prep-pipeline.txt`), depending on Track A shipping first. Tracks D (README rewrite), G (fresh-clone smoke test), F (governance), and the conditionally-dropped Track C (secret-scan CI) follow as separate specs.

## Problem Statement

The repo is content-safe but contract-empty. Specifically:

1. There is no licence; no third party can legally adopt the code.
2. There is no behaviour expectation; there is no place to direct CoC violations or to enforce them.
3. There is no contribution contract; convention drift will accelerate as outsiders show up.
4. There is no vulnerability reporting channel; security reports either go public or vanish.
5. There are no issue and PR scaffolds; every interaction starts from a blank page.

## Non-Goals

- **No LICENSE alternative.** MIT only — chosen Q1, locked.
- **No CLA, no DCO sign-off.** Personal OSS, MIT covers the legal need.
- **No SUPPORT.md, no FUNDING.yml, no GOVERNANCE.md.** Reserved for later specs if demand appears.
- **No auto-labelling or issue-triage GitHub Actions.** Out of scope.
- **No README rewrite.** Track D, separate spec.
- **No fresh-clone smoke test.** Track G, separate spec.
- **No secret-scan or quality-gate CI workflow.** Track C; the operator already declared "no CI" during Track A brainstorm — this track honours that.
- **No translation of issue/PR templates to PT-BR.** Repo is public-facing; templates are EN per the vault language rule.

## Constraints

- **Vault language is English-only** (already locked by Track A). Spec, plan, tasks, and committed community files are all EN.
- **No real identifiers in the community files** (per `vault/rules/sanitization.md`). Specifically:
  - The LICENSE copyright line uses institutional voice: `Copyright (c) 2026 the maintainers of zeno-agent` — not the maintainer's real name.
  - The CoC enforcement contact is "report via GitHub Security Advisories" — not an email address.
  - The SECURITY.md reporting channel is GitHub's Private Vulnerability Reporting — not an email address.
- **MIT license boilerplate is verbatim** from https://opensource.org/license/mit. Contributor Covenant 2.1 is verbatim from https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md (with the enforcement contact line adapted as above).
- **Two GitHub repo settings require manual operator action** — they cannot be set via the PR. The PR body lists them as human-acceptance checkboxes.
- **Single PR.** All community files ship together so outsiders never see a partial state (e.g. SECURITY.md without Private Vulnerability Reporting enabled).

## User Stories / Scenarios

1. **An outsider lands on the repo for the first time.** They scan the file list, see `LICENSE`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, recognise the project as a real OSS project, and trust it enough to keep reading.
2. **An outsider finds a bug.** They click "New issue", choose "Bug report", fill the structured template, submit. The maintainer gets a useful report, not a one-line "it crashed".
3. **An outsider has a usage question.** They click "New issue", see `config.yml` redirected them to Discussions, ask there. Issues stay focused on bugs and features.
4. **A security researcher finds a vulnerability.** They open the Security tab, click "Report a vulnerability", file privately. The maintainer gets a notification with the report encrypted at rest by GitHub. No email channel exists, so no email channel can be misconfigured.
5. **An outsider opens a PR.** The PR template prompts them for a Summary, a spec/issue link, a Test plan, a Sanitization confirmation (no real identifiers in this diff), and a Quality gate confirmation. The maintainer reviews against a known checklist.
6. **A new contributor reads `CONTRIBUTING.md`.** They learn the branching convention, Conventional Commits expectation, that non-trivial work follows the spec-flow under `vault/specs/`, that `pnpm run quality-gate` must be green before push, and that the sanitization rule applies to every commit.

## Acceptance Criteria

### LICENSE

- [ ] `LICENSE` exists at the repo root, contains the verbatim MIT licence text from https://opensource.org/license/mit, with the copyright line `Copyright (c) 2026 the maintainers of zeno-agent`. No real personal name or email appears in the file.
- [ ] GitHub recognises the licence on the repo home page (the licence chip in the sidebar reads "MIT License"). Verifiable after merge by visiting `https://github.com/ribeirogab/zeno-agent`.

### CODE_OF_CONDUCT.md

- [ ] `CODE_OF_CONDUCT.md` exists at the repo root, contains the verbatim Contributor Covenant 2.1 text from https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md. Every section other than the Enforcement contact line is byte-for-byte identical to the upstream source — no paraphrasing, no rewording, no Americanisation of British spellings.
- [ ] The "Enforcement" section's contact line is the only deviation from upstream and reads exactly: `Instances of abusive, harassing, or otherwise unacceptable behaviour may be reported privately via GitHub's Security Advisories ("Report a vulnerability" button on the Security tab of this repository).` No email address, no real name.

### CONTRIBUTING.md

- [ ] `CONTRIBUTING.md` exists at the repo root with these sections, in this order: `Welcome`, `Before contributing`, `Filing an issue`, `Submitting a pull request`, `Spec-driven workflow`, `Sanitization`. Every section has at least one paragraph of substantive content (no empty headers, no single-sentence stubs).
- [ ] `Before contributing` links to `vault/constitution.md` and `vault/rules/sanitization.md` and instructs the reader to read both before substantive changes.
- [ ] `Filing an issue` directs the reader to the appropriate issue template (bug, feature, question), lists what each template is for, and notes that questions are routed to Discussions via the issue chooser.
- [ ] `Submitting a pull request` documents: branch naming `<type>/<slug>` (e.g. `chore/oss-prep-community`), Conventional Commits, link a spec or issue in the PR description, run `pnpm run quality-gate` and confirm green before push, fill the PR template completely.
- [ ] `Spec-driven workflow` describes the brainstorm → `spec.md` → `plan.md` → `tasks.md` flow under `vault/specs/<date>-<slug>/` and points to `vault/specs/_template/`.
- [ ] `Sanitization` summarises the rule in 1–3 sentences and links to `vault/rules/sanitization.md` for the full forbidden list and mapping table.
- [ ] File is fully in English. `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' CONTRIBUTING.md` returns zero matches.

### SECURITY.md

- [ ] `SECURITY.md` exists at the repo root with these sections: `Reporting a vulnerability`, `Disclosure window`, `Scope`, `Acknowledgement`.
- [ ] `Reporting a vulnerability` instructs the reader to use GitHub's Private Vulnerability Reporting via the Security tab, with a link to `https://github.com/ribeirogab/zeno-agent/security/advisories/new`. No email channel.
- [ ] `Disclosure window` states 90 days from acknowledgement to public disclosure, extendable by mutual agreement.
- [ ] `Scope` lists what is in scope (vulnerabilities in this repo's code) and what is out of scope (third-party dependency vulnerabilities — report upstream; operator credential leaks — operator's responsibility).
- [ ] `Acknowledgement` states public credit will be offered on request.

### Issue templates (`.github/ISSUE_TEMPLATE/`)

- [ ] `.github/ISSUE_TEMPLATE/bug-report.md` exists with frontmatter `name: Bug report`, `about: Report a reproducible defect`, `labels: bug`, and a body containing prompts for: description, reproduction steps, expected behaviour, actual behaviour, environment (OS, Node version, Docker version, profile name).
- [ ] `.github/ISSUE_TEMPLATE/feature-request.md` exists with frontmatter `name: Feature request`, `about: Propose a new capability or change`, `labels: enhancement`, and a body containing prompts for: description, motivation/use case, alternatives considered.
- [ ] `.github/ISSUE_TEMPLATE/question.md` exists with frontmatter `name: Question`, `about: Ask about usage or behaviour (prefer Discussions)`, `labels: question`. The body opens with a clear redirect: `Most questions belong in Discussions: https://github.com/ribeirogab/zeno-agent/discussions. File an issue here only if your question cannot be answered there.` (Discussions is enabled as a hard acceptance criterion in this spec, so the redirect is unconditional, not "if available".)
- [ ] `.github/ISSUE_TEMPLATE/config.yml` exists with `blank_issues_enabled: false` and `contact_links` containing two entries: a "Questions and discussions" link to `https://github.com/ribeirogab/zeno-agent/discussions`, and a "Security vulnerability" link to `https://github.com/ribeirogab/zeno-agent/security/advisories/new`.

### Pull request template

- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists with these sections: `Summary`, `Spec / issue`, `Test plan`, `Sanitization`, `Quality gate`.
- [ ] `Sanitization` is a single checkbox: `- [ ] No real identifiers introduced in this diff (per vault/rules/sanitization.md)`.
- [ ] `Quality gate` is a single checkbox: `- [ ] pnpm run quality-gate is green locally`.
- [ ] `Spec / issue` accepts either `Spec: vault/specs/<slug>/spec.md` or `Closes #<issue>` (or both).

### GitHub repo settings (manual operator actions, recorded in PR body)

- [ ] **Operator action**: enable Private Vulnerability Reporting at `Settings → Code security and analysis → Private vulnerability reporting → Enable`. Verifiable by clicking "Report a vulnerability" on the repo's Security tab returning the report form (not 404).
- [ ] **Operator action**: enable Discussions at `Settings → General → Features → Discussions → Enable`. Verifiable by `https://github.com/ribeirogab/zeno-agent/discussions` returning a Discussions home page (not 404).

### PR hygiene

- [ ] PR is single-purpose: only the community files + their dependencies. No license/CI/governance/README work bleeds in.
- [ ] PR description references this spec by path and lists the two manual operator actions as human-acceptance checkboxes.
- [ ] Branch is `chore/oss-prep-community` (already created).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Operator forgets to enable Private Vulnerability Reporting; the link in `SECURITY.md` 404s. | The PR body lists this as a human-acceptance checkbox; the spec marks the link as a verifiable acceptance criterion. The PR is not closed until the toggle is confirmed live. |
| Operator forgets to enable Discussions; `config.yml` redirects users to a 404. | Same mitigation — human-acceptance checkbox + explicit acceptance criterion. |
| Contributor Covenant text is verbatim and may include English that doesn't match the project tone. | Acceptable. The verbatim text is what reviewers and contributors recognise as a known CoC; rewriting would invite debate without value. |
| `CONTRIBUTING.md` duplicates rules that live in `CLAUDE.md` or the constitution and drifts out of sync over time. | Where possible, `CONTRIBUTING.md` links to the source-of-truth files (`vault/constitution.md`, `vault/rules/sanitization.md`, `vault/specs/_template/`) instead of duplicating their content. |
| Issue templates feel too rigid and discourage low-effort but valid bug reports. | Templates are markdown comments (prompts), not enforced fields. Operator can accept malformed reports manually. |
| The MIT licence's "as is" warranty disclaimer surprises non-OSS-savvy outsiders. | The MIT licence is the most adopted permissive licence in the JS/TS ecosystem; the surprise risk is minimal. The licence chip on the GitHub home page makes it visible at a glance. |
| Future additions (SUPPORT.md, FUNDING.yml, GOVERNANCE.md) bleed into this PR. | Listed as Non-Goals. Reviewer rejects PR additions outside the scope. |

## Open Questions

(None blocking. The seven brainstorm decisions Q1–Q7 are recorded in the Constraints and Acceptance Criteria sections above.)
