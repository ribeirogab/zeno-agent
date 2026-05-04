# Contributing to zeno-agent

Thank you for taking the time to look at the project. This document is the contract between contributors and the maintainers — please read it before opening issues or pull requests.

## Welcome

zeno-agent is a personal agent that operates across the apps you use, by composing the connectors you install. The codebase, conventions, and operating principles are documented in [`vault/`](./vault/). Contributions are welcome — issues and pull requests both help.

## Before contributing

Two files set the contract for this repository. Please read both before any substantive change.

- [`vault/constitution.md`](./vault/constitution.md) — non-negotiable project principles. The connector-only capability model, the personal-scope guardrails, the OAuth-not-API-key choice, the privacy and sanitization rule, and the spec-driven workflow are all declared here.
- [`vault/rules/sanitization.md`](./vault/rules/sanitization.md) — the rule that nothing committed to this repository may contain real, private, or non-consented identifiers. The forbidden list (11 categories) and canonical placeholder mapping table are the single source of truth.

If a change affects code, set up the project per the [README](./README.md) and run `pnpm run quality-gate` to confirm lint, typecheck, and tests are green before pushing.

## Filing an issue

Issues live at https://github.com/ribeirogab/zeno-agent/issues. Choose the template that fits:

- **Bug report** — for a reproducible defect.
- **Feature request** — for a new capability or behaviour change.
- **Question** — for usage or behaviour questions. The maintainer is solo; expect best-effort responses.

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
