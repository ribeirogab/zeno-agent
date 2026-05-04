---
feature: oss-prep-community-files
plan: "[[plan]]"
spec: "[[spec]]"
created: 2026-05-04
---
# OSS-Prep — Community Files — Tasks

**For this plan:** `[[plan]]`

> **Execution model:** inline. Each file is small, self-contained, and sequenced in this single session. Branch `chore/oss-prep-community` is already created.

---

## Phase 1: Repo-root files

### Task 1.1: Add `LICENSE` (MIT)

**Files:**
- Create: `LICENSE`

- [ ] Step 1: Write the file with this exact content:

```
MIT License

Copyright (c) 2026 the maintainers of zeno-agent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] Step 2: Verify no real personal name appears in the file: `grep -nE 'Gabriel|ribeirogab|gblosr' LICENSE` returns zero matches.
- [ ] Step 3: Commit:

```bash
git add LICENSE
git commit -m "docs: add MIT license"
```

### Task 1.2: Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)

**Files:**
- Create: `CODE_OF_CONDUCT.md`

- [ ] Step 1: Fetch the verbatim Contributor Covenant 2.1 text from https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md (or copy from the canonical version embedded in this task — see Step 2).
- [ ] Step 2: Write the file with the verbatim Contributor Covenant 2.1 text. Replace ONLY the contact sentence in the Enforcement section. Specifically, the upstream text reads:

> Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the community leaders responsible for enforcement at [INSERT CONTACT METHOD]. All complaints will be reviewed and investigated promptly and fairly.

Replace it with:

> Instances of abusive, harassing, or otherwise unacceptable behaviour may be reported privately via GitHub's Security Advisories ("Report a vulnerability" button on the Security tab of this repository). All complaints will be reviewed and investigated promptly and fairly.

Every other line of the upstream text is preserved byte-for-byte (including the British/American spelling pattern of the upstream — do not Americanise).

- [ ] Step 3: Verify no email address survived: `grep -nE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b' CODE_OF_CONDUCT.md` returns zero matches.
- [ ] Step 4: Verify no real personal name survived: `grep -nE 'Gabriel|ribeirogab|gblosr' CODE_OF_CONDUCT.md` returns zero matches.
- [ ] Step 5: Commit:

```bash
git add CODE_OF_CONDUCT.md
git commit -m "docs: add Code of Conduct (Contributor Covenant 2.1)"
```

### Task 1.3: Add `CONTRIBUTING.md`

**Files:**
- Create: `CONTRIBUTING.md`

- [ ] Step 1: Write the file with this exact content:

```markdown
# Contributing to zeno-agent

Thank you for taking the time to look at the project. This document is the contract between contributors and the maintainers — please read it before opening issues or pull requests.

## Welcome

zeno-agent is a personal agent that operates across the apps you use, by composing the connectors you install. The codebase, conventions, and operating principles are documented in [`vault/`](./vault/). Contributions are welcome — issues, pull requests, and discussions all help.

## Before contributing

Two files set the contract for this repository. Please read both before any substantive change.

- [`vault/constitution.md`](./vault/constitution.md) — non-negotiable project principles. The connector-only capability model, the personal-scope guardrails, the OAuth-not-API-key choice, the privacy and sanitization rule, and the spec-driven workflow are all declared here.
- [`vault/rules/sanitization.md`](./vault/rules/sanitization.md) — the rule that nothing committed to this repository may contain real, private, or non-consented identifiers. The forbidden list (11 categories) and canonical placeholder mapping table are the single source of truth.

If a change affects code, set up the project per the [README](./README.md) and run `pnpm run quality-gate` to confirm lint, typecheck, and tests are green before pushing.

## Filing an issue

Issues live at https://github.com/ribeirogab/zeno-agent/issues. Choose the template that fits:

- **Bug report** — for a reproducible defect.
- **Feature request** — for a new capability or behaviour change.
- **Question** — for usage or behaviour questions. The issue chooser will route you to GitHub Discussions first; file an issue here only if the question cannot be answered there.

Blank issues are disabled. The templates exist to give the maintainer enough context to act on the report.

## Submitting a pull request

1. **Branch naming**: `<type>/<slug>` (e.g. `chore/oss-prep-community`, `fix/auth-token-refresh`, `feat/connector-trello`). Type prefixes follow the same vocabulary as Conventional Commits below.
2. **Conventional Commits**: every commit message follows the [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/) format — `type(scope): subject`. Subjects are imperative, ≤ 72 characters. Bodies explain *why*, not *what*.
3. **Link a spec or an issue** in the PR description. For non-trivial work, the spec under `vault/specs/<date>-<slug>/spec.md` is the source of truth; the PR exists to land it.
4. **Run `pnpm run quality-gate`** locally before pushing. The PR template asks for confirmation that it is green.
5. **Fill the PR template completely** — Summary, Spec / issue link, Test plan, Sanitization checkbox, Quality gate checkbox.

## Spec-driven workflow

For any change that cannot be described in one sentence, follow the spec flow:

1. Brainstorm the design (see [`vault/specs/_template/`](./vault/specs/_template/) for the template set).
2. Write `vault/specs/<date>-<slug>/spec.md` describing scope, problem, non-goals, constraints, acceptance criteria, and risks.
3. Write `plan.md` describing the implementation approach, file structure, and phase ordering.
4. Write `tasks.md` decomposing the plan into bite-sized tasks.
5. Implement against `tasks.md`.
6. Open the PR linking the spec.

Trivial changes (typo fixes, dependency bumps, single-line bug fixes) do not need a spec — open the PR directly.

## Sanitization

This repository is public. Nothing committed may contain real, private, or non-consented identifiers — names of the maintainer or third parties in prose, real emails, employer or client names, private repos, Slack/internal IDs, tokens, screenshots that reveal any of the above. Famous public OSS projects and public SaaS vendor names are fine as technical context.

The full forbidden list and the canonical placeholder mapping table live in [`vault/rules/sanitization.md`](./vault/rules/sanitization.md). Re-read your diff against that rule before every commit.
```

- [ ] Step 2: Verify EN-only: `grep -nE '\b(você|porquê|nessa|também|então|usuário|configura)\b' CONTRIBUTING.md` returns zero matches.
- [ ] Step 3: Verify links resolve:

```bash
for path in vault/constitution.md vault/rules/sanitization.md README.md vault/specs/_template; do
  test -e "$path" && echo "OK: $path" || echo "MISSING: $path"
done
```

Expected: every line is `OK`.

- [ ] Step 4: Commit:

```bash
git add CONTRIBUTING.md
git commit -m "docs: add CONTRIBUTING with spec-flow + sanitization guidance"
```

### Task 1.4: Add `SECURITY.md`

**Files:**
- Create: `SECURITY.md`

- [ ] Step 1: Write the file with this exact content:

```markdown
# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting feature: open the **Security** tab of this repository and click **Report a vulnerability**, or go directly to https://github.com/ribeirogab/zeno-agent/security/advisories/new.

Reports filed this way are encrypted at rest by GitHub and visible only to the maintainers and to you. Do not file security issues in the public issue tracker.

## Disclosure window

The maintainers acknowledge incoming reports within 7 days. The default coordinated-disclosure window is 90 days from acknowledgement. The window may be shortened (a fix is already shipped) or extended (the bug is hard to fix safely) by mutual agreement between you and the maintainers.

## Scope

In scope:

- Vulnerabilities in the code in this repository — `apps/`, `packages/`, `agent/`, `infra/`.

Out of scope:

- Vulnerabilities in third-party dependencies (npm packages, Docker base images, MCP servers shipped by other projects). Please report those upstream to the relevant project.
- Operator-side credential leaks (e.g. an operator committing a token to their own fork or a private profile). The operator is responsible for the credentials they install in their own deployment.
- Issues that require an attacker who already has full host access to the operator's machine.

## Acknowledgement

Public credit (in the eventual GitHub Security Advisory and any release notes) is offered on request. Reporters who prefer to remain anonymous are equally welcome.
```

- [ ] Step 2: Verify no email address: `grep -nE '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b' SECURITY.md` returns zero matches.
- [ ] Step 3: Commit:

```bash
git add SECURITY.md
git commit -m "docs: add SECURITY policy (GitHub Private Vulnerability Reporting)"
```

---

## Phase 2: `.github/` scaffolding

### Task 2.1: Create `.github/ISSUE_TEMPLATE/` directory and bug-report template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/bug-report.md`

- [ ] Step 1: Create the directory: `mkdir -p .github/ISSUE_TEMPLATE`.
- [ ] Step 2: Write `.github/ISSUE_TEMPLATE/bug-report.md` with this exact content:

```markdown
---
name: Bug report
about: Report a reproducible defect
labels: bug
---

## Description

A clear and concise description of what the bug is.

## Steps to reproduce

1.
2.
3.

## Expected behaviour

What did you expect to happen?

## Actual behaviour

What actually happened? Include error messages, stack traces, and log excerpts.

## Environment

- OS:
- Node version (`node --version`):
- Docker version (`docker --version`):
- Profile name (e.g. `default`):
- Connectors installed (output of the dashboard's connectors page):

## Additional context

Anything else that helps the maintainer reproduce or diagnose the bug.
```

- [ ] Step 3: Commit:

```bash
git add .github/ISSUE_TEMPLATE/bug-report.md
git commit -m "docs(github): add bug report issue template"
```

### Task 2.2: Add feature-request template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/feature-request.md`

- [ ] Step 1: Write the file with this exact content:

```markdown
---
name: Feature request
about: Propose a new capability or change
labels: enhancement
---

## Description

A clear and concise description of the feature you would like.

## Motivation / use case

What problem does this solve? What is the user-visible outcome you want?

## Alternatives considered

What other approaches did you think about, and why are they less suitable?

## Additional context

Mockups, links to related issues, or anything else that helps shape the design.
```

- [ ] Step 2: Commit:

```bash
git add .github/ISSUE_TEMPLATE/feature-request.md
git commit -m "docs(github): add feature request issue template"
```

### Task 2.3: Add question template

**Files:**
- Create: `.github/ISSUE_TEMPLATE/question.md`

- [ ] Step 1: Write the file with this exact content:

```markdown
---
name: Question
about: Ask about usage or behaviour (prefer Discussions)
labels: question
---

Most questions belong in Discussions: https://github.com/ribeirogab/zeno-agent/discussions. File an issue here only if your question cannot be answered there.

## Question

What are you trying to do, and what is unclear?

## What you have tried

What documentation have you already read? What did you try?
```

- [ ] Step 2: Commit:

```bash
git add .github/ISSUE_TEMPLATE/question.md
git commit -m "docs(github): add question issue template (redirects to Discussions)"
```

### Task 2.4: Add issue chooser config

**Files:**
- Create: `.github/ISSUE_TEMPLATE/config.yml`

- [ ] Step 1: Write the file with this exact content:

```yaml
blank_issues_enabled: false
contact_links:
  - name: Questions and discussions
    url: https://github.com/ribeirogab/zeno-agent/discussions
    about: Ask usage questions, share ideas, or chat with the community.
  - name: Security vulnerability
    url: https://github.com/ribeirogab/zeno-agent/security/advisories/new
    about: Report a security vulnerability privately. Do not open a public issue.
```

- [ ] Step 2: Commit:

```bash
git add .github/ISSUE_TEMPLATE/config.yml
git commit -m "docs(github): block blank issues + redirect questions/security"
```

### Task 2.5: Add pull request template

**Files:**
- Create: `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] Step 1: Write the file with this exact content:

```markdown
## Summary

<!-- 1–3 bullets describing what this PR changes and why. -->

-

## Spec / issue

<!-- Reference the spec under vault/specs/ that this PR lands, or the issue number it closes. Both is fine. -->

Spec: `vault/specs/<slug>/spec.md`
Closes: #

## Test plan

<!-- Bulleted markdown checklist of how to verify the change. -->

- [ ]
- [ ]

## Sanitization

- [ ] No real identifiers introduced in this diff (per [`vault/rules/sanitization.md`](../vault/rules/sanitization.md)).

## Quality gate

- [ ] `pnpm run quality-gate` is green locally.
```

- [ ] Step 2: Commit:

```bash
git add .github/PULL_REQUEST_TEMPLATE.md
git commit -m "docs(github): add pull request template"
```

---

## Phase 3: Quality gate

### Task 3.1: Confirm quality-gate is still green

- [ ] Step 1: Run:

```bash
pnpm run quality-gate
```

Expected: `Tasks: 28 successful, 28 total`. (No code changed; this is a smoke test that the new top-level files do not interfere with the workspace tooling.)

- [ ] Step 2: If quality-gate fails, diagnose. The new files are docs-only at the repo root and `.github/` — they should not interfere with `turbo`, `tsc`, `biome`, or `vitest`. The most likely failure mode is a Biome formatter rule applied to markdown — fix per Biome's auto-format and amend the most recent commit if needed.

---

## Phase 4: Pull request

### Task 4.1: Push branch and open the PR

- [ ] Step 1: Confirm branch state:

```bash
git status
git log --oneline main..HEAD
```

Expected: branch `chore/oss-prep-community`, commits cover Phases 1–2 (one commit per file).

- [ ] Step 2: Push the branch:

```bash
git push -u origin chore/oss-prep-community
```

- [ ] Step 3: Open the PR:

```bash
gh pr create --title "chore(oss-prep): add community files (LICENSE, CoC, CONTRIBUTING, SECURITY, templates)" --body "$(cat <<'EOF'
## Summary

Track B of the OSS-prep pipeline (`tmp/oss-prep-pipeline.txt`). Lands the standard OSS community files so outsiders can legally use, safely report, and unambiguously contribute to the repo.

Spec: [`vault/specs/2026-05-04-oss-prep-community-files/spec.md`](https://github.com/ribeirogab/zeno-agent/blob/chore/oss-prep-community/vault/specs/2026-05-04-oss-prep-community-files/spec.md)

## What changed

- `LICENSE` — MIT, with institutional copyright line (`the maintainers of zeno-agent`).
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 verbatim, with the enforcement contact line adapted to direct reports through GitHub Security Advisories (no email channel).
- `CONTRIBUTING.md` — six sections covering welcome, what to read first, issue flow, PR flow (branch naming + Conventional Commits + quality-gate + PR template), spec-driven workflow, and the sanitization reminder. Links into the vault for source-of-truth content rather than duplicating it.
- `SECURITY.md` — directs reporters to Private Vulnerability Reporting; 90-day disclosure window; explicit scope and acknowledgement.
- `.github/ISSUE_TEMPLATE/{bug-report,feature-request,question}.md` — three markdown templates with structured prompts.
- `.github/ISSUE_TEMPLATE/config.yml` — blank issues blocked; contact links redirect "questions" to Discussions and "security" to Security Advisories.
- `.github/PULL_REQUEST_TEMPLATE.md` — Summary, Spec/issue, Test plan, Sanitization checkbox, Quality gate checkbox.

## Manual operator actions (required before close)

These are GitHub repo settings that cannot be set via the PR. Both must be confirmed live before this PR is closed, otherwise links in `SECURITY.md` and `.github/ISSUE_TEMPLATE/config.yml` will 404.

- [ ] Enable **Private Vulnerability Reporting** at `Settings → Code security and analysis → Private vulnerability reporting`. Verify by visiting https://github.com/ribeirogab/zeno-agent/security/advisories/new and getting the report form (not 404).
- [ ] Enable **Discussions** at `Settings → General → Features → Discussions`. Verify by visiting https://github.com/ribeirogab/zeno-agent/discussions and getting a Discussions home page (not 404).

## Test plan

- [x] `pnpm run quality-gate` is green.
- [x] No new file contains a real personal name or email — `grep -rnE 'Gabriel|ribeirogab|gblosr' LICENSE CODE_OF_CONDUCT.md CONTRIBUTING.md SECURITY.md .github/` returns zero matches.
- [x] Every wikilink and relative link in `CONTRIBUTING.md` resolves.
- [ ] **Operator action** — confirm the two GitHub settings above are live.
EOF
)"
```

- [ ] Step 4: Wait for operator approval before merge. Do NOT merge without explicit consent. The two manual settings must be confirmed live first.
