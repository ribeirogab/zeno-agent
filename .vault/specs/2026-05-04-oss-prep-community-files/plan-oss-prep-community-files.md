---
feature: oss-prep-community-files
spec: "[[spec-oss-prep-community-files]]"
created: 2026-05-04
---
# OSS-Prep — Community Files — Plan

**For this spec:** `[[spec-oss-prep-community-files]]`

## Approach

Mechanical scaffolding. The spec already locked every decision (Q1–Q7); the plan is just "create N files with this content, then ask the operator to flip two GitHub toggles". No subagents — each file is small and self-contained, and the work fits comfortably in one session.

The order matters only in two places: (1) `SECURITY.md` references a Private Vulnerability Reporting URL whose target only exists once Discussions is enabled, so the manual settings step is acceptance-checked after merge; (2) `.github/ISSUE_TEMPLATE/config.yml` references the Discussions URL — same dependency, same post-merge verification. Neither blocks file creation.

## Architecture

```
Phase 1: Repo-root files                 → LICENSE, CODE_OF_CONDUCT.md,
  ├─ LICENSE (MIT)                          CONTRIBUTING.md, SECURITY.md
  ├─ CODE_OF_CONDUCT.md (CC 2.1)
  ├─ CONTRIBUTING.md
  └─ SECURITY.md

Phase 2: .github/ scaffolding            → .github/ISSUE_TEMPLATE/{bug-report,
  ├─ ISSUE_TEMPLATE/bug-report.md           feature-request,question}.md,
  ├─ ISSUE_TEMPLATE/feature-request.md      ISSUE_TEMPLATE/config.yml,
  ├─ ISSUE_TEMPLATE/question.md             PULL_REQUEST_TEMPLATE.md
  ├─ ISSUE_TEMPLATE/config.yml
  └─ PULL_REQUEST_TEMPLATE.md

Phase 3: Quality gate                    → pnpm run quality-gate
  └─ confirm green (no code changed; check is a smoke test that nothing
     leaked into a workspace tsconfig include path)

Phase 4: PR                              → gh pr create
  ├─ branch chore/oss-prep-community already exists
  ├─ PR body lists the two manual operator actions as checkboxes
  └─ acceptance criterion verifies the two toggles are live before close
```

## File Structure

**Created (repo root):**
- `LICENSE` — verbatim MIT licence with institutional copyright line.
- `CODE_OF_CONDUCT.md` — verbatim Contributor Covenant 2.1, only the Enforcement contact line adapted to point at GitHub Security Advisories.
- `CONTRIBUTING.md` — six sections: Welcome, Before contributing, Filing an issue, Submitting a pull request, Spec-driven workflow, Sanitization. Links into the vault for source-of-truth content.
- `SECURITY.md` — four sections: Reporting a vulnerability, Disclosure window, Scope, Acknowledgement.

**Created (`.github/`):**
- `.github/ISSUE_TEMPLATE/bug-report.md` — markdown template, frontmatter `name/about/labels`, body with description/repro/expected/actual/environment.
- `.github/ISSUE_TEMPLATE/feature-request.md` — markdown template, body with description/motivation/alternatives.
- `.github/ISSUE_TEMPLATE/question.md` — markdown template, body opens with unconditional Discussions redirect.
- `.github/ISSUE_TEMPLATE/config.yml` — `blank_issues_enabled: false`, two `contact_links` (Discussions, Security Advisories).
- `.github/PULL_REQUEST_TEMPLATE.md` — five sections: Summary, Spec / issue, Test plan, Sanitization, Quality gate.

**Untouched:**
- Existing `infra/`, `apps/`, `packages/`, `.vault/` (other than the spec/plan/tasks docs themselves).
- No `.github/workflows/` files. (Track C is gone per "no CI" decision.)

## Phase Ordering

| Phase | Depends on | Parallelism |
|---|---|---|
| 1 — Root files | nothing | sequential, one file per commit |
| 2 — `.github/` scaffolding | nothing | sequential, batched per template family |
| 3 — Quality gate | Phases 1–2 done | single command |
| 4 — PR + manual operator actions | Phases 1–3 done | sequential; manual toggles done by operator at any time before close |

## Risks / Open Decisions

- **Operator latency on the two manual toggles** is the realistic blocker. PR body checkboxes make this explicit; PR is not closed until both toggles are confirmed.
- **Verbatim CoC drift** — if the implementer paraphrases the Contributor Covenant text, we lose the recognisability that justified picking it. Mitigation: spec criterion mandates byte-for-byte identity except for the enforcement contact line.
- **`SECURITY.md` URL is wrong if PVR isn't enabled before someone reads it** — short window between merge and toggle flip. Mitigation: PR body asks the operator to flip both toggles before announcing the repo publicly.
