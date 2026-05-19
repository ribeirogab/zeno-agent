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
- **The maintainer's public GitHub handle** as attribution. The handle (`ribeirogab`) is the same kind of public identifier as the canonical remote URL and the git author metadata; it is allowed in attribution contexts (shields.io BUILT BY badges, the Maintainership section of `GOVERNANCE.md`, references to the project's solo operator). The maintainer's real first name in narrative prose remains forbidden under category 1.
- **Famous public OSS projects** as technical context (`@anthropic-ai/sdk`, `vitest`, `pnpm`, etc.) and **public SaaS vendor names** when used as integration targets (Sentry, Linear, Klaviyo, Notion, Slack, GitHub, etc.).
- **Meta-references inside this rule and its spec.** This file's example column and the spec at `.vault/specs/2026-05-04-oss-prep-sanitization/` document the rule by quoting categories abstractly. They do not need to be re-scrubbed against themselves.

## References

- [`../constitution`](../constitution.md) §Privacy & sanitization
- Historical scrub commits (forward-only baseline): `8756371`, `4daf70f`, `fef9fca`, `4aff20e`.
