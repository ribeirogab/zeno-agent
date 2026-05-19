---
tags:
  - learning
  - architecture
  - "#pivot"
related:
  - "[[../specs/2026-04-27-zeno-redefinition/spec-zeno-redefinition|spec 0049]]"
  - "[[../specs/2026-04-28-skills/spec-skills|spec 0052]]"
  - "[[../specs/2026-04-30-soul-skills-realign/spec-soul-skills-realign|spec 0060]]"
  - "[[../constitution|constitution]]"
  - "[[channel-vs-connector]]"
  - "[[how-to-read-pre-cleanup-specs]]"
created: 2026-04-27
updated: 2026-04-30
---
# Connectors-only pivot — why Zeno's capability surface collapsed to one layer

> **2026-04-30 update:** spec 0052 reintroduced skills as DB-managed markdown playbooks materialized to `~/.claude/skills/` and auto-discovered by the Claude Agent SDK; spec 0060 wired the SDK option correctly so the listing actually surfaces in the system prompt. The "Skills (deferred)" framing below is HISTORICAL — it describes the spec-0049 state. Skills are back; the connector / channel / backend / core hierarchy from this learning still holds, with skills as a fifth layer carrying *content only* (capabilities are gated globally via `/settings/agent-capabilities`).

Zeno was originally positioned as "a personal agent whose intelligence lives in the skills you author". In April 2026 the project pivoted to **connectors-only**: every external capability flows through a connector (an MCP server installed via the dashboard); the agent has no direct shell, filesystem, or web-fetch access at runtime. The channel (Slack today; others future) is the only non-connector I/O — and only because it *is* the channel, not a tool. Skills as a runtime concept were deferred from this iteration (and reintroduced in spec 0052 as content-only playbooks; see header note above).

## Context

The pivot was triggered by concrete operational problems with the original layered design. The original system had **two parallel power surfaces**: (a) Claude Code's built-in tools (Bash, Read, Write, Edit, Glob, Grep, WebFetch) backing skill files that prescribed shell commands; and (b) MCP tools exposed by connectors. The two surfaces overlapped — both could "do GitHub things" — and the skill layer drifted from runtime reality (e.g., a `acme` skill listed env vars for orgs that no longer had GitHub App installations; the agent confidently named those orgs as accessible while admitting the tokens weren't injected). A guardrails system on top (Haiku classifier + Slack approval flow + DB-managed approval rules) tried to police the shell side, adding complexity without solving the underlying duplication.

The user's framing of the new positioning landed in one sentence: *"Zeno's goal is to operate across the apps you use — open a PR, fix a Sentry bug, ship code — by composing the connectors you install."* Without connectors, Zeno is a talking statue. The previous "skills are the product" framing made the connector layer feel like plumbing; the new framing inverts it.

## The new layered model (in order of weight)

1. **Connectors** — every external capability. MCP tools the operator installs via the dashboard (`mcp__github-app-acme__merge_pull_request`, `mcp__sentry__list_issues`, etc.).
2. **Channel** — Slack today; Discord/Telegram/email as future adapters. The channel is the conversation, not a tool.
3. **Backend** — the reasoning engine (Claude Code today). Decides which connector tools to call.
4. **Core** — small wiring (channel ↔ backend ↔ connectors). Stable.
5. **Skills (deferred)** — domain knowledge that *informs* orchestration without granting power. Out of the runtime; may return later, possibly bundled with connectors.

Single rule for the agent's runtime: if it isn't an MCP tool from a connector and it isn't the channel, the agent doesn't have it. No Bash, no filesystem, no general web access.

## What stays / what goes

**Stays:** the connector model and dashboard (specs 0029-0048), the Channel/Backend/Core abstractions, profile isolation via Docker compose, the Spec-Driven workflow, the locked stack (Node/pnpm/vitest/biome/zod/pino/Slack Bolt/Claude Agent SDK), Reversibility-first / One-decision-at-a-time principles.

**Goes:** runtime skill loading (`agent/skills/`, `profiles/<name>/skills/`, the system-prompt skill block, the `read_only` skill registry), the Haiku classifier + Slack-approval policy chain (`apps/worker/src/guardrails/{approver,classifier,policies/{always-sensitive,always-allowed,classifier-gate,audit,read-only-skill},pipeline.ts,async-context.ts,slack-context.ts,skill-registry.ts,config.ts}`), the `apps/api/src/routes/approval-rules.ts` CRUD + `packages/storage/src/repos/approval-rules.ts` repo + dashboard "sensitive tools" settings section, the operator-picked `__GITHUB_ENV_VAR__` per-installation field + the M11 rename modal + the `renameInstallation()` worker method (operator-picked env vars only existed for shell-skill consumption), the rotate-PEM flow (uninstall+reinstall is acceptable for a rare event), the duplicate uninstall-app button in the App config card. The single guardrail that survives is `apps/worker/src/guardrails/policies/connector-permission.ts` — per-tool allow/deny driven by the dashboard toggle.

## How to apply

When designing new work for Zeno, the question is "which connector exposes the tool I need?". If the answer is "none", the next question is "should I install one (catalog), build one (custom MCP), or is this out of scope?". The answer is never "let the agent script around it via shell". Skills as a future concept may inform *how* the agent picks among existing tools, but they will not introduce a new way to *act*.

When reading specs and learnings dated before this pivot, treat their prescriptions as historical context. Files marked `status: superseded` in the frontmatter reflect the old "skills as the product" thesis; map "skill" to "domain knowledge that may return possibly bundled with connectors" mentally. See [[how-to-read-pre-cleanup-specs]] for the convention.

The cleanup arc that implements this pivot is sequenced as three PRs: spec 0049 (this redefinition; docs only), spec 0050 (skills runtime + Haiku/approval flow removal — code), spec 0051 (connector ergonomics: drop operator-picked envVar, remove rotate-PEM, fix uninstall UX).
